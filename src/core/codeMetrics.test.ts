import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import {
  calculateCyclomaticComplexity,
  calculateMaxNestingDepth,
  calculateFunctionCount,
  calculateLoopCount,
  calculateUnusedVariables,
  computeAllMetrics,
} from './codeMetrics';

describe('Code & AST Metrics Calculation', () => {
  it('computes metrics for simple sequential program', () => {
    const code = `
      int main() {
        int x = 10;
        int y = x + 5;
        return y;
      }
    `;
    const { ast } = parse(code);
    const metrics = computeAllMetrics(ast);

    expect(metrics.cyclomaticComplexity).toBe(1);
    expect(metrics.functionCount).toBe(1);
    expect(metrics.loopCount).toBe(0);
    expect(metrics.unusedVariables).toHaveLength(0);
    expect(metrics.maxNestingDepth).toBe(1); // main block
    expect(metrics.nodeCount).toBeGreaterThan(5);
  });

  it('detects branching in cyclomatic complexity (if, while, logical operators)', () => {
    const code = `
      int test(int a, int b) {
        if (a > 0 && b < 10) {
          while (a > 0) {
            a--;
          }
        } else {
          for (int i = 0; i < 5; i++) {
            b++;
          }
        }
        return a;
      }
    `;
    const { ast } = parse(code);
    // Base 1 + 1 (if) + 1 (&&) + 1 (while) + 1 (for) = 5
    const cc = calculateCyclomaticComplexity(ast);
    expect(cc).toBe(5);

    const loops = calculateLoopCount(ast);
    expect(loops).toBe(2); // while + for
  });

  it('calculates maximum nesting depth accurately', () => {
    const code = `
      void nested() {
        if (x > 0) {
          while (y > 0) {
            {
              int z = 1;
            }
          }
        }
      }
    `;
    const { ast } = parse(code);
    const depth = calculateMaxNestingDepth(ast);
    // Block(fn) -> If -> Block(if) -> While -> Block(while) -> Block -> 6
    expect(depth).toBeGreaterThanOrEqual(4);
  });

  it('identifies unused variables', () => {
    const code = `
      int compute() {
        int used = 10;
        int unusedOne = 20;
        int unusedTwo = 30;
        return used * 2;
      }
    `;
    const { ast } = parse(code);
    const unused = calculateUnusedVariables(ast);
    expect(unused).toContain('unusedOne');
    expect(unused).toContain('unusedTwo');
    expect(unused).not.toContain('used');
  });

  it('counts functions accurately across multiple declarations', () => {
    const code = `
      int f1() { return 1; }
      int f2() { return 2; }
      void f3() { return; }
    `;
    const { ast } = parse(code);
    expect(calculateFunctionCount(ast)).toBe(3);
  });

  it('handles empty AST gracefully without errors', () => {
    const metrics = computeAllMetrics(null);
    expect(metrics.cyclomaticComplexity).toBe(1);
    expect(metrics.functionCount).toBe(0);
    expect(metrics.loopCount).toBe(0);
    expect(metrics.unusedVariables).toHaveLength(0);
    expect(metrics.nodeCount).toBe(0);
    expect(metrics.treeDepth).toBe(0);
  });
});
