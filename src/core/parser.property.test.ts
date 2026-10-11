import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classicalRepair } from './classicalRepair';
import { generateUniquePrograms, handwritten } from './programGenerator';
import { lex } from './lexer';
import { Parser, parse } from './parser';
import { unparse } from './unparse';
import type { ASTNode } from '../types/ast';

function withoutSpansAndIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSpansAndIds);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'id' && key !== 'span')
      .map(([key, item]) => [key, withoutSpansAndIds(item)]),
  );
}

describe('parser and lexer properties', () => {
  it('round-trips generated programs through the canonical source printer', () => {
    const programs = generateUniquePrograms(120, 74021, { sizeClass: 'small', maxDepth: 2 });
    for (const program of programs) {
      const original = parse(program.code);
      expect(original.errors, program.id).toHaveLength(0);
      const printed = unparse(original.ast);
      const reparsed = parse(printed);
      expect(reparsed.errors, `${program.id}: ${printed}`).toHaveLength(0);
      expect(withoutSpansAndIds(reparsed.ast), program.id).toEqual(
        withoutSpansAndIds(original.ast),
      );
      expect(unparse(reparsed.ast), program.id).toBe(printed);
    }
  }, 30_000);

  it('never throws while parsing arbitrary strings within the per-input budget', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1500 }), (source) => {
        const started = performance.now();
        const result = parse(source);
        expect(performance.now() - started).toBeLessThan(250);
        expect(result.ast.type).toBe('Program');
        expect(Array.isArray(result.errors)).toBe(true);
      }),
      { numRuns: 600, seed: 20261011, endOnFailure: true },
    );
  });

  it('never throws for token-shuffled generated programs', () => {
    const programs = generateUniquePrograms(80, 38421, { sizeClass: 'small', maxDepth: 2 });
    for (const program of programs) {
      const tokens = lex(program.code).tokens.filter((token) => token.type !== 'EOF');
      const shuffled = [...tokens].sort((left, right) => {
        const leftKey = (left.start * 1103515245 + 12345) % 2147483647;
        const rightKey = (right.start * 1103515245 + 12345) % 2147483647;
        return leftKey - rightKey;
      });
      shuffled.push(
        tokens[tokens.length - 1] &&
          ({
            ...tokens[tokens.length - 1],
            type: 'EOF',
            lexeme: '',
          } as (typeof tokens)[number]),
      );
      const started = performance.now();
      const result = new Parser().parse(shuffled);
      expect(performance.now() - started).toBeLessThan(250);
      expect(result.ast.type).toBe('Program');
      expect(Array.isArray(result.errors)).toBe(true);
    }
  });

  it('rejects extreme delimiter nesting with a clear error and a Program AST', () => {
    const nestedParens = `${'('.repeat(10_000)}0${')'.repeat(10_000)}`;
    const nestedBraces = `int main() ${'{'.repeat(10_000)}${'}'.repeat(10_000)}`;
    for (const source of [nestedParens, nestedBraces]) {
      const started = performance.now();
      const result = parse(source);
      expect(performance.now() - started).toBeLessThan(1000);
      expect(result.ast.type).toBe('Program');
      expect(result.errors[0]?.code).toBe('ERR_MAX_NESTING_DEPTH');
    }
  });

  it('never returns unverified classical repair candidates', () => {
    fc.assert(
      fc.property(fc.constantFrom(...handwritten), (program) => {
        const candidates = classicalRepair(`${program.code}\n)`);
        for (const candidate of candidates) {
          expect(parse(candidate.repairedCode).errors).toHaveLength(0);
          expect(candidate.verified).toBe(true);
        }
      }),
      { numRuns: handwritten.length, seed: 19823 },
    );
  }, 30_000);

  it('source printer rejects a non-Program root instead of emitting misleading source', () => {
    expect(() => unparse({ type: 'Identifier' } as ASTNode)).toThrow('unparse expects a Program');
  });
});
