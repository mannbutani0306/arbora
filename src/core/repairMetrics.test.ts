import { describe, expect, it } from 'vitest';
import { astEqual, scoreRepair, tokensEqual } from './repairMetrics';

describe('repair correctness metrics', () => {
  it('compares token streams without whitespace or comments', () => {
    expect(tokensEqual('int x=1;', 'int /* gap */ x = 1 ;')).toBe(true);
    expect(tokensEqual('int x=1;', 'int x=2;')).toBe(false);
  });

  it('compares AST structure without ids or source spans', () => {
    expect(astEqual('int run() { return 1; }', 'int run(){\n return 1;\n}')).toBe(true);
    expect(astEqual('int run() { return 1; }', 'int run() { return 2; }')).toBe(false);
  });

  it('separates parse validity from exact and AST correctness', () => {
    const score = scoreRepair(
      [
        { repairedCode: 'int run() { return 0; }', verified: true },
        { repairedCode: 'int run() { return 1; }', verified: true },
      ],
      'int run() { return 1; }'
    );
    expect(score).toEqual({
      verifiedRate: 1,
      top1Exact: false,
      top3Exact: true,
      top1AstMatch: false,
      top3AstMatch: true,
    });
  });

  it('does not count deleting the broken statement as correct just because it parses', () => {
    const groundTruth = 'int run() { int answer = 42; return answer; }';
    const deletedStatement = 'int run() { return 0; }';
    const score = scoreRepair([{ repairedCode: deletedStatement }], groundTruth);
    expect(score.verifiedRate).toBe(1);
    expect(score.top1Exact).toBe(false);
    expect(score.top1AstMatch).toBe(false);
  });
});
