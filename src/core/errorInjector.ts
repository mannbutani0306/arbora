import { lex } from './lexer';
import { parse } from './parser';
import type { Token } from '../types/ast';

export type ErrorInjectionType = 'delete' | 'insert' | 'swap' | 'replace' | 'natural';
export type StructuralErrorType = Exclude<ErrorInjectionType, 'natural'>;

export interface InjectedErrorResult {
  original: string;
  mutated: string;
  type: ErrorInjectionType;
  tokenIndex: number;
  firstErrorFound: boolean;
  originalCode: string;
  mutatedCode: string;
  errorType: ErrorInjectionType;
  description: string;
  targetLine: number;
  targetCol: number;
  affectedToken: string;
  replacementToken?: string;
}

const ROGUE_TOKENS = [';', '}', 'return', 'int', ')', '=', '+'] as const;
const KEYWORD_MISTAKES: Array<[string, string]> = [
  ['return', 'retun'],
  ['if', 'iff'],
  ['while', 'whlie'],
  ['int', 'innt'],
];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function replaceRange(source: string, start: number, end: number, text: string): string {
  return source.slice(0, start) + text + source.slice(end);
}

function removeToken(source: string, token: Token): string {
  return replaceRange(source, token.start, token.end, '');
}

function insertAt(source: string, offset: number, text: string): string {
  return replaceRange(source, offset, offset, ` ${text} `);
}

function mutationCandidates(
  source: string,
  tokens: Token[],
  random: () => number
): Array<{ type: StructuralErrorType; tokenIndex: number; mutated: string; description: string; affected: string; replacement?: string }> {
  const candidates: Array<{ type: StructuralErrorType; tokenIndex: number; mutated: string; description: string; affected: string; replacement?: string }> = [];
  const mutable = tokens.filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT');
  for (const [index, token] of mutable.entries()) {
    candidates.push({
      type: 'delete',
      tokenIndex: index,
      mutated: removeToken(source, token),
      description: `Deleted token '${token.lexeme}'`,
      affected: token.lexeme,
    });
    const rogue = ROGUE_TOKENS[(index + Math.floor(random() * ROGUE_TOKENS.length)) % ROGUE_TOKENS.length];
    candidates.push({
      type: 'insert',
      tokenIndex: index,
      mutated: insertAt(source, token.start, rogue),
      description: `Inserted '${rogue}' before '${token.lexeme}'`,
      affected: token.lexeme,
      replacement: rogue,
    });
    const replacement = token.lexeme === 'if' ? 'iff' : token.lexeme === ';' ? '}' : ';';
    candidates.push({
      type: 'replace',
      tokenIndex: index,
      mutated: replaceRange(source, token.start, token.end, replacement),
      description: `Replaced '${token.lexeme}' with '${replacement}'`,
      affected: token.lexeme,
      replacement,
    });
    if (index + 1 < mutable.length) {
      const next = mutable[index + 1];
      candidates.push({
        type: 'swap',
        tokenIndex: index,
        mutated: replaceRange(
          source,
          token.start,
          next.end,
          `${next.lexeme}${source.slice(token.end, next.start)}${token.lexeme}`
        ),
        description: `Swapped '${token.lexeme}' and '${next.lexeme}'`,
        affected: `${token.lexeme} <-> ${next.lexeme}`,
      });
    }
  }
  return candidates;
}

function naturalCandidates(source: string, tokens: Token[]): Array<{ tokenIndex: number; mutated: string; description: string; affected: string }> {
  const candidates: Array<{ tokenIndex: number; mutated: string; description: string; affected: string }> = [];
  const significant = tokens.filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT');
  const semicolon = [...significant].reverse().find((token) => token.lexeme === ';');
  if (semicolon) {
    candidates.push({
      tokenIndex: significant.indexOf(semicolon),
      mutated: removeToken(source, semicolon),
      description: 'Removed a statement-ending semicolon',
      affected: ';',
    });
  }
  const closeParen = [...significant].reverse().find((token) => token.lexeme === ')');
  if (closeParen) {
    candidates.push({
      tokenIndex: significant.indexOf(closeParen),
      mutated: removeToken(source, closeParen),
      description: 'Removed a closing parenthesis',
      affected: ')',
    });
  }
  const closeBrace = [...significant].reverse().find((token) => token.lexeme === '}');
  if (closeBrace) {
    candidates.push({
      tokenIndex: significant.indexOf(closeBrace),
      mutated: removeToken(source, closeBrace),
      description: 'Removed a closing brace',
      affected: '}',
    });
  }
  candidates.push({
    tokenIndex: significant.length,
    mutated: `${source}\n}`,
    description: 'Added an extra closing brace',
    affected: '}',
  });

  const conditionAssign = significant.findIndex(
    (token, index) => token.lexeme === '=' && significant[index - 1]?.type === 'IDENTIFIER'
  );
  if (conditionAssign >= 0) {
    const token = significant[conditionAssign];
    candidates.push({
      tokenIndex: conditionAssign,
      mutated: replaceRange(source, token.start, token.end, '=='),
      description: "Changed '=' to '=='",
      affected: '=',
    });
  } else {
    const equality = significant.find((token) => token.lexeme === '==');
    if (equality) {
      candidates.push({
        tokenIndex: significant.indexOf(equality),
        mutated: replaceRange(source, equality.start, equality.end, '='),
        description: "Changed '==' to '=' in a condition",
        affected: '==',
      });
    }
  }

  for (const [keyword, misspelling] of KEYWORD_MISTAKES) {
    const token = significant.find((item) => item.lexeme === keyword);
    if (token) {
      candidates.push({
        tokenIndex: significant.indexOf(token),
        mutated: replaceRange(source, token.start, token.end, misspelling),
        description: `Misspelled '${keyword}'`,
        affected: keyword,
      });
    }
  }
  return candidates;
}

/**
 * Deterministically samples syntax-breaking edits and accepts only parser errors.
 * A maximum of 20 candidate mutations are parsed for each request.
 */
export function injectSingleTokenError(
  source: string,
  preferredType?: ErrorInjectionType,
  seed = 0
): InjectedErrorResult {
  const originalParse = parse(source);
  if (originalParse.errors.length > 0) {
    throw new Error('Error injection requires valid original MiniC source.');
  }
  const tokens = lex(source).tokens;
  const random = mulberry32(seed);
  const candidates = preferredType === 'natural' || !preferredType
    ? naturalCandidates(source, tokens).map((candidate) => ({ ...candidate, type: 'natural' as const }))
    : mutationCandidates(source, tokens, random).filter((candidate) => candidate.type === preferredType);
  for (let attempt = 0; attempt < 20 && candidates.length > 0; attempt++) {
    const index = Math.floor(random() * candidates.length);
    const [candidate] = candidates.splice(index, 1);
    if (candidate.mutated === source) continue;
    if (parse(candidate.mutated).errors.length === 0) continue;
    const token = tokens.filter((item) => item.type !== 'EOF' && item.type !== 'COMMENT')[candidate.tokenIndex];
    return {
      original: source,
      mutated: candidate.mutated,
      type: candidate.type,
      tokenIndex: candidate.tokenIndex,
      firstErrorFound: true,
      originalCode: source,
      mutatedCode: candidate.mutated,
      errorType: candidate.type,
      description: candidate.description,
      targetLine: token?.line ?? 1,
      targetCol: token?.column ?? 1,
      affectedToken: candidate.affected,
      replacementToken: 'replacement' in candidate ? candidate.replacement : undefined,
    };
  }
  throw new Error(`Unable to produce a parse-invalid '${preferredType ?? 'natural'}' mutation in 20 attempts.`);
}
