import { describe, it, expect } from 'vitest';
import { getMiniCGrammar } from './grammar';
import { analyzeGrammar, computeNullable, computeFirstSets, computeFollowSets, buildLL1Table } from './grammarAnalyzer';

describe('Grammar Analyzer', () => {
  const grammar = getMiniCGrammar();

  it('computes nullable non-terminals', () => {
    const nullable = computeNullable(grammar);
    expect(nullable.has('TopLevelList')).toBe(true);
    expect(nullable.has('ParamListOpt')).toBe(true);
    expect(nullable.has('StatementList')).toBe(true);
    expect(nullable.has('ElseOpt')).toBe(true);
  });

  it('computes FIRST sets for non-terminals', () => {
    const nullable = computeNullable(grammar);
    const firstSets = computeFirstSets(grammar, nullable);

    const typeFirst = firstSets.get('Type');
    expect(typeFirst).toBeDefined();
    expect(typeFirst?.has('int')).toBe(true);
    expect(typeFirst?.has('float')).toBe(true);
    expect(typeFirst?.has('bool')).toBe(true);
  });

  it('computes FOLLOW sets including EOF for start symbol', () => {
    const nullable = computeNullable(grammar);
    const firstSets = computeFirstSets(grammar, nullable);
    const followSets = computeFollowSets(grammar, nullable, firstSets);

    const progFollow = followSets.get('Program');
    expect(progFollow?.has('$')).toBe(true);
  });

  it('builds LL(1) parsing table and catalogs conflicts', () => {
    const analysis = analyzeGrammar(grammar);
    expect(analysis.nullable.length).toBeGreaterThan(0);
    expect(Object.keys(analysis.firstSets).length).toBeGreaterThan(0);
    expect(Object.keys(analysis.followSets).length).toBeGreaterThan(0);
    expect(Object.keys(analysis.table).length).toBeGreaterThan(0);
    expect(Array.isArray(analysis.conflicts)).toBe(true);
  });
});
