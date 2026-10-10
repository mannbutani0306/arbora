/**
 * Single-token syntax error injector for compiler benchmarking.
 * Generates deterministic mutations:
 * - delete: removes a syntax-critical token (e.g. delimiter, keyword, identifier)
 * - insert: introduces an extraneous token into an illegal position
 * - swap: transposes two adjacent tokens violating production order
 *
 * Verifies that the mutated code produces syntax errors via the parser.
 */

import { lex } from './lexer';
import { parse } from './parser';
import { Token } from '../types/ast';

export type ErrorInjectionType = 'delete' | 'insert' | 'swap';

export interface InjectedErrorResult {
  originalCode: string;
  mutatedCode: string;
  errorType: ErrorInjectionType;
  description: string;
  targetLine: number;
  targetCol: number;
  affectedToken: string;
  replacementToken?: string;
}

const ROGUE_INSERT_TOKENS = [';', '{', '}', '+', 'return', 'int', '(', ')', '='];

/**
 * Injects a single-token error of the specified type into source code.
 * If injectionType is not provided, one is selected deterministically or randomly.
 */
export function injectSingleTokenError(
  sourceCode: string,
  preferredType?: ErrorInjectionType,
  seedIndex: number = 0
): InjectedErrorResult {
  const lexResult = lex(sourceCode);
  const meaningfulTokens = lexResult.tokens.filter(
    (t) => t.type !== 'EOF' && t.type !== 'COMMENT'
  );

  if (meaningfulTokens.length < 3) {
    // Trivial fallback
    return {
      originalCode: sourceCode,
      mutatedCode: sourceCode + ' @#$',
      errorType: 'insert',
      description: 'Inserted invalid token at EOF',
      targetLine: 1,
      targetCol: sourceCode.length,
      affectedToken: '@#$',
    };
  }

  const types: ErrorInjectionType[] = preferredType
    ? [preferredType]
    : ['delete', 'insert', 'swap'];

  // Try each error type
  for (const type of types) {
    if (type === 'delete') {
      // Find delimiters or keywords first as they always trigger errors
      const deleteCandidates = meaningfulTokens.filter(
        (t) =>
          t.lexeme === ';' ||
          t.lexeme === ')' ||
          t.lexeme === '}' ||
          t.lexeme === '(' ||
          t.lexeme === '{' ||
          t.type === 'KEYWORD' ||
          t.type === 'IDENTIFIER'
      );

      const pool = deleteCandidates.length > 0 ? deleteCandidates : meaningfulTokens;
      const tok = pool[seedIndex % pool.length];

      const mutated = removeTokenFromSource(sourceCode, tok);
      const testParse = parse(mutated);
      if (testParse.errors.length > 0) {
        return {
          originalCode: sourceCode,
          mutatedCode: mutated,
          errorType: 'delete',
          description: `Deleted token '${tok.lexeme}'`,
          targetLine: tok.line,
          targetCol: tok.column,
          affectedToken: tok.lexeme,
        };
      }
    } else if (type === 'swap') {
      // Find two adjacent tokens in same line
      for (let i = 0; i < meaningfulTokens.length - 1; i++) {
        const idx = (i + seedIndex) % (meaningfulTokens.length - 1);
        const t1 = meaningfulTokens[idx];
        const t2 = meaningfulTokens[idx + 1];

        if (t1.line === t2.line && t1.lexeme !== t2.lexeme) {
          const mutated = swapTokensInSource(sourceCode, t1, t2);
          const testParse = parse(mutated);
          if (testParse.errors.length > 0) {
            return {
              originalCode: sourceCode,
              mutatedCode: mutated,
              errorType: 'swap',
              description: `Swapped '${t1.lexeme}' with '${t2.lexeme}'`,
              targetLine: t1.line,
              targetCol: t1.column,
              affectedToken: `${t1.lexeme} <-> ${t2.lexeme}`,
            };
          }
        }
      }
    } else if (type === 'insert') {
      // Pick a random insertion point
      const tok = meaningfulTokens[(seedIndex * 2 + 1) % meaningfulTokens.length];
      const rogue = ROGUE_INSERT_TOKENS[seedIndex % ROGUE_INSERT_TOKENS.length];

      const mutated = insertTokenIntoSource(sourceCode, tok, rogue);
      const testParse = parse(mutated);
      if (testParse.errors.length > 0) {
        return {
          originalCode: sourceCode,
          mutatedCode: mutated,
          errorType: 'insert',
          description: `Inserted extraneous '${rogue}' near '${tok.lexeme}'`,
          targetLine: tok.line,
          targetCol: tok.column,
          affectedToken: tok.lexeme,
          replacementToken: rogue,
        };
      }
    }
  }

  // Guaranteed fallback: strip final semicolon or bracket
  const lastSemi = sourceCode.lastIndexOf(';');
  if (lastSemi >= 0) {
    const mutated = sourceCode.slice(0, lastSemi) + sourceCode.slice(lastSemi + 1);
    return {
      originalCode: sourceCode,
      mutatedCode: mutated,
      errorType: 'delete',
      description: "Deleted semicolon ';'",
      targetLine: 1,
      targetCol: 1,
      affectedToken: ';',
    };
  }

  return {
    originalCode: sourceCode,
    mutatedCode: sourceCode.replace(/\{/, ''),
    errorType: 'delete',
    description: "Deleted opening brace '{'",
    targetLine: 1,
    targetCol: 1,
    affectedToken: '{',
  };
}

function removeTokenFromSource(source: string, tok: Token): string {
  const lines = source.split('\n');
  const lineIdx = tok.line - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return source;

  const line = lines[lineIdx];
  const colIdx = tok.column - 1;
  const before = line.slice(0, colIdx);
  const after = line.slice(colIdx + tok.lexeme.length);

  lines[lineIdx] = before + after;
  return lines.join('\n');
}

function swapTokensInSource(source: string, t1: Token, t2: Token): string {
  const lines = source.split('\n');
  const lineIdx = t1.line - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return source;

  const line = lines[lineIdx];
  const c1 = t1.column - 1;
  const c2 = t2.column - 1;

  if (c1 < c2) {
    const before = line.slice(0, c1);
    const mid = line.slice(c1 + t1.lexeme.length, c2);
    const after = line.slice(c2 + t2.lexeme.length);
    lines[lineIdx] = before + t2.lexeme + mid + t1.lexeme + after;
  }
  return lines.join('\n');
}

function insertTokenIntoSource(source: string, tok: Token, insertStr: string): string {
  const lines = source.split('\n');
  const lineIdx = tok.line - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return source;

  const line = lines[lineIdx];
  const colIdx = tok.column - 1;
  const before = line.slice(0, colIdx);
  const after = line.slice(colIdx);

  lines[lineIdx] = before + ' ' + insertStr + ' ' + after;
  return lines.join('\n');
}
