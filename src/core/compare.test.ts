import { describe, it, expect } from 'vitest';
import {
  calculateTreeEditDistance,
  calculateSimilarity,
  calculateTupleMetrics,
  checkExactStructuralMatch,
  findASTDifferences,
  compareASTs,
} from './compare';
import { ASTNode } from '../types/ast';
import { parse } from './parser';

// Helper to construct mock AST trees for testing
function makeNode(
  type: string,
  id: string,
  children: ASTNode[] = []
): ASTNode {
  return {
    id,
    type: type as any,
    span: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
    children,
  } as ASTNode;
}

describe('Zhang-Shasha Tree Edit Distance', () => {
  it('returns 0 for identical single-node trees', () => {
    const t1 = makeNode('Program', '1');
    const t2 = makeNode('Program', '2');
    expect(calculateTreeEditDistance(t1, t2)).toBe(0);
    expect(calculateSimilarity(0, 1, 1)).toBe(1.0);
  });

  it('returns 1 for single-node relabel', () => {
    const t1 = makeNode('Program', '1');
    const t2 = makeNode('FunctionDecl', '2');
    expect(calculateTreeEditDistance(t1, t2)).toBe(1);
    expect(calculateSimilarity(1, 1, 1)).toBe(0);
  });

  it('handles empty trees gracefully', () => {
    expect(calculateTreeEditDistance(null, null)).toBe(0);
    const t1 = makeNode('Program', '1');
    expect(calculateTreeEditDistance(t1, null)).toBe(1);
    expect(calculateTreeEditDistance(null, t1)).toBe(1);
  });

  it('computes TED for simple leaf insertion and deletion', () => {
    // T1: A -> B
    const t1 = makeNode('A', '1', [makeNode('B', '2')]);
    // T2: A (size 1)
    const t2 = makeNode('A', '3');

    // Deleting B costs 1
    expect(calculateTreeEditDistance(t1, t2)).toBe(1);
    // Inserting B costs 1
    expect(calculateTreeEditDistance(t2, t1)).toBe(1);
    expect(calculateSimilarity(1, 2, 1)).toBe(0.5);
  });

  it('computes TED on classic multi-branch example', () => {
    // Tree 1:
    //      f
    //    /   \
    //   d     e
    //  / \
    // a   b
    const t1 = makeNode('f', '1', [
      makeNode('d', '2', [makeNode('a', '3'), makeNode('b', '4')]),
      makeNode('e', '5'),
    ]);

    // Tree 2:
    //      f
    //    /   \
    //   c     e
    //  / \
    // a   b
    // (relabeled 'd' -> 'c')
    const t2 = makeNode('f', '6', [
      makeNode('c', '7', [makeNode('a', '8'), makeNode('b', '9')]),
      makeNode('e', '10'),
    ]);

    expect(calculateTreeEditDistance(t1, t2)).toBe(1);
    expect(calculateSimilarity(1, 5, 5)).toBe(0.8);
  });

  it('computes TED on identical parsed MiniC ASTs', () => {
    const code = 'int main() { return 0; }';
    const ast1 = parse(code).ast;
    const ast2 = parse(code).ast;

    const metrics = compareASTs(ast1, ast2, 5, 5);
    expect(metrics.treeEditDistance).toBe(0);
    expect(metrics.similarity).toBe(1.0);
    expect(metrics.isExactMatch).toBe(true);
    expect(metrics.precision).toBe(1.0);
    expect(metrics.recall).toBe(1.0);
    expect(metrics.f1).toBe(1.0);
    expect(metrics.differences).toHaveLength(0);
  });
});

describe('Node Tuple Metrics (Precision, Recall, F1)', () => {
  it('returns 1.0 for identical trees', () => {
    const t1 = makeNode('Program', '1', [makeNode('FunctionDecl', '2')]);
    const t2 = makeNode('Program', '3', [makeNode('FunctionDecl', '4')]);

    const { precision, recall, f1 } = calculateTupleMetrics(t1, t2);
    expect(precision).toBe(1.0);
    expect(recall).toBe(1.0);
    expect(f1).toBe(1.0);
  });

  it('correctly calculates precision and recall when nodes are missing', () => {
    // Ground truth A has 3 nodes
    const t1 = makeNode('Program', '1', [
      makeNode('FunctionDecl', '2'),
      makeNode('VarDecl', '3'),
    ]);
    // Predicted B only has 2 nodes (missing VarDecl)
    const t2 = makeNode('Program', '4', [
      makeNode('FunctionDecl', '5'),
    ]);

    const { precision, recall, f1 } = calculateTupleMetrics(t1, t2);
    // Predicted 2 nodes, both correct: precision = 2/2 = 1.0
    expect(precision).toBe(1.0);
    // Ground truth has 3 nodes, predicted 2: recall = 2/3 = 0.667
    expect(recall).toBe(0.667);
    expect(f1).toBeGreaterThan(0.7);
  });
});

describe('Exact Structural Match and Differences', () => {
  it('detects structural equality and mismatch', () => {
    const t1 = makeNode('Program', '1', [makeNode('FunctionDecl', '2')]);
    const t2 = makeNode('Program', '3', [makeNode('FunctionDecl', '4')]);
    const t3 = makeNode('Program', '5', [makeNode('VarDecl', '6')]);

    expect(checkExactStructuralMatch(t1, t2)).toBe(true);
    expect(checkExactStructuralMatch(t1, t3)).toBe(false);
  });

  it('produces structured differences list with path and kinds', () => {
    const t1 = makeNode('Program', '1', [
      makeNode('FunctionDecl', '2'),
      makeNode('VarDecl', '3'),
    ]);
    const t2 = makeNode('Program', '4', [
      makeNode('FunctionDecl', '5'),
      makeNode('Block', '6'), // mismatched with VarDecl
      makeNode('ExtraNode', '7'), // extra node in B
    ]);

    const diffs = findASTDifferences(t1, t2);
    expect(diffs.length).toBeGreaterThanOrEqual(2);

    const mismatch = diffs.find((d) => d.kind === 'mismatched');
    expect(mismatch).toBeDefined();
    expect(mismatch?.expected).toBe('VarDecl');
    expect(mismatch?.actual).toBe('Block');

    const extra = diffs.find((d) => d.kind === 'extra');
    expect(extra).toBeDefined();
    expect(extra?.actual).toBe('ExtraNode');
  });
});
