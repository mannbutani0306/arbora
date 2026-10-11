import { classicalRepair, type ClassicalRepairCandidate } from './classicalRepair';
import { lex } from './lexer';

const BOS = '<BOS>';
const EOS = '<EOS>';

export interface NgramModel {
  order: 3;
  smoothing: number;
  vocabulary: string[];
  unigramCounts: Record<string, number>;
  bigramCounts: Record<string, number>;
  trigramCounts: Record<string, number>;
  contextCounts: Record<string, number>;
  totalTokens: number;
}

export interface NgramRepairCandidate extends ClassicalRepairCandidate {
  languageModelScore: number;
}

function key(...parts: string[]): string {
  return JSON.stringify(parts);
}

export function trainNgram(
  tokensList: string[][],
  smoothing = 0.1
): NgramModel {
  if (!Number.isFinite(smoothing) || smoothing <= 0) {
    throw new Error('Add-k smoothing must be a positive finite number.');
  }
  const unigrams: Record<string, number> = {};
  const bigrams: Record<string, number> = {};
  const trigrams: Record<string, number> = {};
  const contexts: Record<string, number> = {};
  const vocabulary = new Set([EOS, BOS]);
  let totalTokens = 0;
  for (const sequence of tokensList) {
    const tokens = [BOS, BOS, ...sequence, EOS];
    for (const token of sequence) vocabulary.add(token);
    for (let index = 2; index < tokens.length; index++) {
      const current = tokens[index];
      const previous = tokens[index - 1];
      const previousPrevious = tokens[index - 2];
      const bigramContext = key(previousPrevious, previous);
      const trigram = key(previousPrevious, previous, current);
      unigrams[current] = (unigrams[current] ?? 0) + 1;
      bigrams[key(previous, current)] = (bigrams[key(previous, current)] ?? 0) + 1;
      trigrams[trigram] = (trigrams[trigram] ?? 0) + 1;
      contexts[bigramContext] = (contexts[bigramContext] ?? 0) + 1;
      totalTokens++;
    }
  }
  return {
    order: 3,
    smoothing,
    vocabulary: [...vocabulary].sort(),
    unigramCounts: unigrams,
    bigramCounts: bigrams,
    trigramCounts: trigrams,
    contextCounts: contexts,
    totalTokens,
  };
}

export function ngramLogProbability(model: NgramModel, tokens: string[]): number {
  const sequence = [BOS, BOS, ...tokens, EOS];
  const vocabularySize = Math.max(1, model.vocabulary.length);
  let score = 0;
  for (let index = 2; index < sequence.length; index++) {
    const previousPrevious = sequence[index - 2];
    const previous = sequence[index - 1];
    const current = sequence[index];
    const context = key(previousPrevious, previous);
    const count = model.trigramCounts[key(previousPrevious, previous, current)] ?? 0;
    const denominator = model.contextCounts[context] ?? 0;
    score += Math.log((count + model.smoothing) / (denominator + model.smoothing * vocabularySize));
  }
  return score;
}

export function rankByNgram(
  candidates: ClassicalRepairCandidate[],
  model: NgramModel
): NgramRepairCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    languageModelScore: ngramLogProbability(
      model,
      lex(candidate.repairedCode).tokens
        .filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT')
        .map((token) => token.lexeme)
    ),
  })).sort((a, b) =>
    b.languageModelScore - a.languageModelScore ||
    (a.repairedCode < b.repairedCode ? -1 : a.repairedCode > b.repairedCode ? 1 : 0)
  );
}

export function ngramRepair(code: string, model: NgramModel): NgramRepairCandidate[] {
  return rankByNgram(classicalRepair(code), model);
}
