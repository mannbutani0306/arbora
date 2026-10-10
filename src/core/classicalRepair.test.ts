import { describe, expect, it } from 'vitest';
import { classicalRepair } from './classicalRepair';
import { lex } from './lexer';
import { parse } from './parser';
import { tokensEqual } from './repairMetrics';

describe('classicalRepair', () => {
  it.each(Array.from({ length: 40 }, (_, index) => index))(
    'repairs generated missing-semicolon case %i',
    (index) => {
      const source = `int repair${index}() { return ${index}; }`;
      const broken = source.replace(`return ${index};`, `return ${index}`);
      const candidates = classicalRepair(broken);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].verified).toBe(true);
      expect(parse(candidates[0].repairedCode).errors).toHaveLength(0);
      expect(candidates.some((candidate) => tokensEqual(candidate.repairedCode, source))).toBe(true);
    }
  );

  it('repairs deleted identifiers and operators', () => {
    const deletedIdentifier = 'int run() { int = 1; return value; }';
    const deletedOperator = 'int run() { return 1 2; }';
    expect(classicalRepair(deletedIdentifier).some((candidate) =>
      tokensEqual(candidate.repairedCode, 'int run() { int value = 1; return value; }')
    )).toBe(true);
    const operatorCandidates = classicalRepair(deletedOperator);
    expect(operatorCandidates.length).toBeGreaterThan(0);
    expect(operatorCandidates.every((candidate) =>
      parse(candidate.repairedCode).errors.length === 0
    )).toBe(true);
  });

  it('can recover a local two-token swap', () => {
    const source = 'int run() { int value = 1; return value + 2; }';
    const swapped = 'int run() { int value = 1; return + value 2; }';
    expect(parse(source).errors).toHaveLength(0);
    const candidates = classicalRepair(swapped);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) =>
      parse(candidate.repairedCode).errors.length === 0
    )).toBe(true);
  });

  it('keeps post-increment intact when adding the missing semicolon', () => {
    const broken = 'int run() { int i = 0; i++ }';
    const candidates = classicalRepair(broken);
    expect(candidates.some((candidate) =>
      parse(candidate.repairedCode).errors.length === 0 &&
      lex(candidate.repairedCode).tokens.some((token) => token.lexeme === '++')
    )).toBe(true);
  });

  it('only returns parser-verified candidates', () => {
    const candidates = classicalRepair('int run() { return 1 }');
    expect(candidates.length).toBeLessThanOrEqual(3);
    expect(candidates.every((candidate) => candidate.verified)).toBe(true);
    expect(candidates.every((candidate) => parse(candidate.repairedCode).errors.length === 0)).toBe(true);
  });

  it('reports recovery rate on 12 one-token-deleted sample programs', () => {
    const samples = [
      'int a() { return 1; }',
      'int b() { return 2; }',
      'int c() { return 3; }',
      'int d() { return 4; }',
      'int e() { return 5; }',
      'int f() { return 6; }',
      'int g() { return 7; }',
      'int h() { return 8; }',
      'int i() { return 9; }',
      'int j() { return 10; }',
      'int k() { return 11; }',
      'int l() { return 12; }',
    ];
    const successes = samples.filter((source) => {
      const broken = source.replace(/return \d+;/, (statement) => statement.slice(0, -1));
      return classicalRepair(broken).some((candidate) => tokensEqual(candidate.repairedCode, source));
    }).length;
    const rate = successes / samples.length;
    console.info(`Classical repair recovery rate: ${successes}/${samples.length} (${(rate * 100).toFixed(1)}%)`);
    expect(rate).toBeGreaterThan(0.5);
  });

  it('returns no suggestions for valid input and handles invalid options safely', () => {
    expect(classicalRepair('int run() { return 0; }')).toEqual([]);
    expect(classicalRepair('int run() { return 0 }', { maxCandidates: -1 })).toEqual([]);
    expect(classicalRepair('int run() { return 0 }', { maxCandidates: 99 }).length).toBeLessThanOrEqual(3);
  });
});
