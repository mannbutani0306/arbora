import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { generateProgram, generateUniquePrograms } from './programGenerator';
import { lex } from './lexer';

describe('probabilistic MiniC program generation', () => {
  it('produces deterministic output for a seed and options', () => {
    expect(generateProgram(42, { sizeClass: 'small' }))
      .toEqual(generateProgram(42, { sizeClass: 'small' }));
  });

  it.each([
    ['small', 80],
    ['medium', 200],
    ['large', 400],
  ] as const)('respects the %s token limit', (sizeClass, limit) => {
    for (let seed = 1; seed <= 100; seed++) {
      const generated = generateProgram(seed, { sizeClass });
      expect(generated.tokenCount).toBeLessThanOrEqual(limit);
      expect(lex(generated.code).tokens.filter((token) => token.type !== 'EOF')).toHaveLength(generated.tokenCount);
      expect(parse(generated.code).errors).toHaveLength(0);
      expect(generated.code.split('\n').length).toBeGreaterThan(2);
    }
  });

  it('generates 2,000 independently seeded parser-valid programs', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const generated = generateProgram(seed, {
        sizeClass: (['small', 'medium', 'large'] as const)[seed % 3],
      });
      expect(parse(generated.code).errors, `seed ${seed}`).toHaveLength(0);
    }
  });

  it('never uses a variable inside its own declaration initializer', () => {
    for (let seed = 0; seed < 500; seed++) {
      const generated = generateProgram(seed, {
        sizeClass: (['small', 'medium', 'large'] as const)[seed % 3],
      });
      const declarations = generated.code.matchAll(
        /\b(?:int|float|bool|char|string)\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/g
      );
      for (const [, name, initializer] of declarations) {
        expect(initializer, `seed ${seed}, declaration ${name}`).not.toMatch(
          new RegExp(`\\b${name}\\b`)
        );
      }
    }
  });

  it('has no normalized token duplicates in the first 1,000 programs', () => {
    const generated = generateUniquePrograms(1000, 1234, { sizeClass: 'small' });
    const normalized = generated.map((program) =>
      lex(program.code).tokens
        .filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT')
        .map((token) => `${token.type}:${token.lexeme}`)
        .join('\u0000')
    );
    expect(new Set(normalized).size).toBe(1000);
  });
});
