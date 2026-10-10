import { lex } from './lexer';
import { parse } from './parser';
import type { ParseResult, Token } from '../types/ast';

export interface ClassicalRepairEdit {
  operation: 'insert' | 'delete' | 'replace';
  tokenIndex: number;
  text: string;
  originalText?: string;
}

export interface ClassicalRepairCandidate {
  edits: ClassicalRepairEdit[];
  repairedCode: string;
  editCost: number;
  verified: true;
}

export interface ClassicalRepairOptions {
  maxCandidates?: number;
  originalParseResult?: ParseResult;
}

const SYMBOL_POOL = [
  ';', ')', '}', '{', '(', ']', '[', ',', '=', '+', '-', '*', '/', '<', '>',
  '==', '!=', '&&', '||', '++', '--', 'return',
] as const;
const MAX_PAIR_PARSE_ATTEMPTS = 20_000;

interface RankedCandidate {
  candidate: ClassicalRepairCandidate;
  distance: number;
  poolPriority: number[];
}

function firstErrorTokenIndex(
  tokens: Token[],
  source: string,
  parseResult: ParseResult
): number {
  const firstError = parseResult.errors[0];
  if (!firstError) return -1;

  const lines = source.split('\n');
  let offset = 0;
  for (let line = 1; line < firstError.line; line++) {
    offset += (lines[line - 1] ?? '').length + 1;
  }
  offset += Math.max(0, firstError.column - 1);

  const index = tokens.findIndex((token) => token.end > offset || token.type === 'EOF');
  return index < 0 ? tokens.length - 1 : index;
}

function buildPool(tokens: Token[]): string[] {
  const identifiers = [...new Set(
    tokens
      .filter((token) => token.type === 'IDENTIFIER')
      .map((token) => token.lexeme)
  )].sort();
  return [...new Set([...SYMBOL_POOL, ...identifiers, '0', '1'])];
}

function renderCandidate(
  source: string,
  tokens: Token[],
  edits: ClassicalRepairEdit[]
): string {
  let result = source;
  const indexedEdits = edits.map((edit) => {
    const token = tokens[edit.tokenIndex];
    const atEnd = token?.type === 'EOF' || !token;
    return {
      edit,
      start: atEnd ? source.length : token.start,
      end: atEnd ? source.length : token.end,
    };
  }).sort((a, b) => b.start - a.start || b.end - a.end);

  for (const { edit, start, end } of indexedEdits) {
    if (edit.operation === 'delete') {
      result = result.slice(0, start) + result.slice(end);
    } else if (edit.operation === 'replace') {
      result = result.slice(0, start) + ` ${edit.text} ` + result.slice(end);
    } else {
      result = result.slice(0, start) + `${edit.text} ` + result.slice(start);
    }
  }
  return result;
}

function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  const length = Math.max(a.poolPriority.length, b.poolPriority.length);
  for (let index = 0; index < length; index++) {
    const difference = (a.poolPriority[index] ?? -1) - (b.poolPriority[index] ?? -1);
    if (difference !== 0) return difference;
  }
  if (a.candidate.repairedCode < b.candidate.repairedCode) return -1;
  if (a.candidate.repairedCode > b.candidate.repairedCode) return 1;
  return 0;
}

/**
 * Searches a bounded neighborhood of the first parser error using one-token edits,
 * then a capped two-edit search if no single edit produces a valid program.
 */
export function classicalRepair(
  source: string,
  { maxCandidates = 3, originalParseResult }: ClassicalRepairOptions = {}
): ClassicalRepairCandidate[] {
  try {
    const parsed = originalParseResult ?? parse(source);
    if (parsed.errors.length === 0) return [];

    const tokens = lex(source).tokens;
    const errorIndex = firstErrorTokenIndex(tokens, source, parsed);
    if (errorIndex < 0) return [];

    const pool = buildPool(tokens);
    const poolPriority = new Map(pool.map((item, index) => [item, index]));
    const first = Math.max(0, errorIndex - 6);
    const last = Math.min(tokens.length - 1, errorIndex + 3);
    const seen = new Set<string>();
    const ranked: RankedCandidate[] = [];
    const evaluate = (edits: ClassicalRepairEdit[]) => {
      const repairedCode = renderCandidate(source, tokens, edits);
      if (seen.has(repairedCode)) return;
      seen.add(repairedCode);
      const result = parse(repairedCode);
      if (result.errors.length !== 0) return;

      ranked.push({
        candidate: { edits, repairedCode, editCost: edits.length, verified: true },
        distance: edits.reduce(
          (sum, edit) => sum + Math.abs(edit.tokenIndex - errorIndex),
          0
        ),
        poolPriority: edits.map((edit) =>
          edit.operation === 'delete'
            ? pool.length + 1
            : poolPriority.get(edit.text) ?? pool.length
        ),
      });
    };

    for (let index = first; index <= last; index++) {
      const token = tokens[index];
      if (!token || token.type === 'EOF') continue;
      evaluate([{
        operation: 'delete',
        tokenIndex: index,
        text: '',
        originalText: token.lexeme,
      }]);
      for (const symbol of pool) {
        evaluate([{
          operation: 'insert',
          tokenIndex: index,
          text: symbol,
        }]);
        if (token.lexeme !== symbol) {
          evaluate([{
            operation: 'replace',
            tokenIndex: index,
            text: symbol,
            originalText: token.lexeme,
          }]);
        }
      }
    }
    if (last === tokens.length - 1) {
      for (const symbol of pool) {
        evaluate([{ operation: 'insert', tokenIndex: last, text: symbol }]);
      }
    }

    if (ranked.length === 0) {
      const pairFirst = Math.max(0, errorIndex - 3);
      const pairLast = Math.min(tokens.length - 1, errorIndex + 2);
      const pairEdits: ClassicalRepairEdit[] = [];
      for (let index = pairFirst; index <= pairLast; index++) {
        const token = tokens[index];
        if (!token || token.type === 'EOF') continue;
        pairEdits.push({
          operation: 'delete',
          tokenIndex: index,
          text: '',
          originalText: token.lexeme,
        });
        for (const symbol of pool) {
          pairEdits.push({ operation: 'insert', tokenIndex: index, text: symbol });
          if (token.lexeme !== symbol) {
            pairEdits.push({
              operation: 'replace',
              tokenIndex: index,
              text: symbol,
              originalText: token.lexeme,
            });
          }
        }
      }
      if (pairLast === tokens.length - 1) {
        for (const symbol of pool) {
          pairEdits.push({ operation: 'insert', tokenIndex: pairLast, text: symbol });
        }
      }

      pairEdits.sort((a, b) => {
        const distance = Math.abs(a.tokenIndex - errorIndex) - Math.abs(b.tokenIndex - errorIndex);
        if (distance !== 0) return distance;
        const priority = (poolPriority.get(a.text) ?? pool.length) - (poolPriority.get(b.text) ?? pool.length);
        if (priority !== 0) return priority;
        return a.tokenIndex - b.tokenIndex;
      });
      const editsByToken = new Map<number, ClassicalRepairEdit[]>();
      for (const edit of pairEdits) {
        const edits = editsByToken.get(edit.tokenIndex) ?? [];
        edits.push(edit);
        editsByToken.set(edit.tokenIndex, edits);
      }
      const tokenGroups = [...editsByToken.entries()].sort(
        ([indexA], [indexB]) =>
          Math.abs(indexA - errorIndex) - Math.abs(indexB - errorIndex) || indexA - indexB
      );
      let attempts = 0;
      for (let firstGroup = 0; firstGroup < tokenGroups.length; firstGroup++) {
        for (let secondGroup = firstGroup + 1; secondGroup < tokenGroups.length; secondGroup++) {
          const firstEdits = tokenGroups[firstGroup][1];
          const secondEdits = tokenGroups[secondGroup][1];
          for (const firstEdit of firstEdits) {
            for (const secondEdit of secondEdits) {
              if (attempts >= MAX_PAIR_PARSE_ATTEMPTS) break;
              attempts++;
              evaluate([firstEdit, secondEdit]);
            }
            if (attempts >= MAX_PAIR_PARSE_ATTEMPTS) break;
          }
          if (attempts >= MAX_PAIR_PARSE_ATTEMPTS) break;
        }
        if (attempts >= MAX_PAIR_PARSE_ATTEMPTS) break;
      }
    }

    const limit = Math.max(0, Math.min(3, Math.floor(maxCandidates)));
    return ranked.sort(compareRanked).slice(0, limit).map(({ candidate }) => candidate);
  } catch {
    return [];
  }
}
