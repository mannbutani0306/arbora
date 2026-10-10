/**
 * AST comparison engine implementing:
 * - Zhang-Shasha Tree Edit Distance (TED) and tree similarity
 * - Node-level precision, recall, and F1 on (type, depth, parent-type) tuples
 * - Exact structural match detection
 * - Structural difference list (missing, extra, mismatched) with node paths
 * - Node comparison alignment tagging for visualization (match, mismatch, missing, extra)
 */

import { ASTNode, ASTSpan } from '../types/ast';

export type DiffKind = 'missing' | 'extra' | 'mismatched';

export interface ASTDiffItem {
  kind: DiffKind;
  path: string;
  expected?: string;
  actual?: string;
  nodeAId?: string;
  nodeBId?: string;
}

export type NodeMatchStatus = 'match' | 'mismatch' | 'missing' | 'extra';

export interface ComparisonMetrics {
  treeEditDistance: number;
  similarity: number; // 0.0 - 1.0
  sizeA: number;
  sizeB: number;
  precision: number; // 0.0 - 1.0
  recall: number; // 0.0 - 1.0
  f1: number; // 0.0 - 1.0
  isExactMatch: boolean;
  differences: ASTDiffItem[];
  latencyClassicalMs?: number;
  latencyNeuralMs?: number;
}

export interface FlattenedNode {
  id: string;
  type: string;
  span?: ASTSpan;
  children: ASTNode[];
  original: ASTNode;
}

/**
 * Traverses a tree in post-order and returns flattened array of nodes (1-indexed).
 */
export function getPostOrderNodes(root: ASTNode | null | undefined): FlattenedNode[] {
  if (!root) return [];
  const result: FlattenedNode[] = [];

  function traverse(node: ASTNode) {
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) traverse(child);
      }
    }
    result.push({
      id: node.id || `node_${result.length + 1}`,
      type: node.type,
      span: node.span,
      children: node.children || [],
      original: node,
    });
  }

  traverse(root);
  return result;
}

/**
 * Calculates Zhang-Shasha Tree Edit Distance between two AST trees.
 * Edit costs:
 * - Delete: 1
 * - Insert: 1
 * - Relabel: 0 if types match, 1 if types differ
 */
export function calculateTreeEditDistance(
  treeA: ASTNode | null | undefined,
  treeB: ASTNode | null | undefined
): number {
  if (!treeA && !treeB) return 0;
  if (!treeA) return countTreeNodes(treeB!);
  if (!treeB) return countTreeNodes(treeA);

  const nodesA = getPostOrderNodes(treeA);
  const nodesB = getPostOrderNodes(treeB);

  const sizeA = nodesA.length;
  const sizeB = nodesB.length;

  if (sizeA === 0) return sizeB;
  if (sizeB === 0) return sizeA;

  // 1-indexed helper arrays
  // leftmostLeaf[i] stores the 1-based post-order index of leftmost leaf descendant of node i
  const leftmostLeafA = new Array<number>(sizeA + 1);
  const leftmostLeafB = new Array<number>(sizeB + 1);

  // Compute leftmost leaf for tree A
  computeLeftmostLeaves(treeA, nodesA, leftmostLeafA);
  // Compute leftmost leaf for tree B
  computeLeftmostLeaves(treeB, nodesB, leftmostLeafB);

  // Keyroots: LR_keyroots(T) = { i | no j > i exists such that leftmostLeaf[j] == leftmostLeaf[i] }
  const keyrootsA = findKeyroots(sizeA, leftmostLeafA);
  const keyrootsB = findKeyroots(sizeB, leftmostLeafB);

  // 2D distance matrix: size (sizeA + 1) x (sizeB + 1)
  const treeDist: number[][] = Array.from({ length: sizeA + 1 }, () =>
    new Array<number>(sizeB + 1).fill(0)
  );

  for (const krA of keyrootsA) {
    for (const krB of keyrootsB) {
      computeForestDist(
        krA,
        krB,
        leftmostLeafA,
        leftmostLeafB,
        nodesA,
        nodesB,
        treeDist
      );
    }
  }

  return treeDist[sizeA][sizeB];
}

function computeLeftmostLeaves(
  root: ASTNode,
  postOrder: FlattenedNode[],
  leftmostLeaf: number[]
) {
  // Map from ASTNode original reference to post-order index (1-based)
  const nodeToIndex = new Map<ASTNode, number>();
  for (let i = 0; i < postOrder.length; i++) {
    nodeToIndex.set(postOrder[i].original, i + 1);
  }

  function getLeftmost(node: ASTNode): number {
    if (!node.children || node.children.length === 0) {
      const idx = nodeToIndex.get(node) || 1;
      leftmostLeaf[idx] = idx;
      return idx;
    }

    // Traverse children
    let firstChildLeaf: number | null = null;
    for (let c = 0; c < node.children.length; c++) {
      const child = node.children[c];
      const childLeaf = getLeftmost(child);
      if (c === 0) {
        firstChildLeaf = childLeaf;
      }
    }

    const myIdx = nodeToIndex.get(node) || 1;
    const leaf = firstChildLeaf !== null ? firstChildLeaf : myIdx;
    leftmostLeaf[myIdx] = leaf;
    return leaf;
  }

  getLeftmost(root);
}

function findKeyroots(size: number, leftmostLeaf: number[]): number[] {
  // Among all nodes with the same leftmostLeaf, pick the one with max post-order index
  const maxIdxMap = new Map<number, number>();
  for (let i = 1; i <= size; i++) {
    const leaf = leftmostLeaf[i];
    const prev = maxIdxMap.get(leaf);
    if (prev === undefined || i > prev) {
      maxIdxMap.set(leaf, i);
    }
  }

  const keyroots = Array.from(maxIdxMap.values());
  keyroots.sort((a, b) => a - b);
  return keyroots;
}

function computeForestDist(
  i: number,
  j: number,
  leftmostA: number[],
  leftmostB: number[],
  nodesA: FlattenedNode[],
  nodesB: FlattenedNode[],
  treeDist: number[][]
) {
  const lA = leftmostA[i];
  const lB = leftmostB[j];

  const m = i - lA + 2;
  const n = j - lB + 2;

  // fd[r][c] corresponds to forest A[lA .. p] and forest B[lB .. q]
  const fd: number[][] = Array.from({ length: m }, () =>
    new Array<number>(n).fill(0)
  );

  fd[0][0] = 0;

  for (let p = lA; p <= i; p++) {
    const r = p - lA + 1;
    fd[r][0] = fd[r - 1][0] + 1; // deletion cost
  }

  for (let q = lB; q <= j; q++) {
    const c = q - lB + 1;
    fd[0][c] = fd[0][c - 1] + 1; // insertion cost
  }

  for (let p = lA; p <= i; p++) {
    const r = p - lA + 1;
    for (let q = lB; q <= j; q++) {
      const c = q - lB + 1;

      const costDel = fd[r - 1][c] + 1;
      const costIns = fd[r][c - 1] + 1;

      if (leftmostA[p] === lA && leftmostB[q] === lB) {
        // Node labels: index 1-based maps to index (p-1) in nodes array
        const labelA = nodesA[p - 1].type;
        const labelB = nodesB[q - 1].type;
        const costRelabel = labelA === labelB ? 0 : 1;

        const costMatch = fd[r - 1][c - 1] + costRelabel;
        fd[r][c] = Math.min(costDel, costIns, costMatch);
        treeDist[p][q] = fd[r][c];
      } else {
        const costSubtree =
          fd[leftmostA[p] - lA][leftmostB[q] - lB] + treeDist[p][q];
        fd[r][c] = Math.min(costDel, costIns, costSubtree);
      }
    }
  }
}

export function countTreeNodes(root: ASTNode): number {
  if (!root) return 0;
  let count = 1;
  if (root.children && Array.isArray(root.children)) {
    for (const child of root.children) {
      if (child) count += countTreeNodes(child);
    }
  }
  return count;
}

/**
 * Computes tree similarity based on TED:
 * similarity = 1 - TED / max(sizeA, sizeB)
 */
export function calculateSimilarity(
  ted: number,
  sizeA: number,
  sizeB: number
): number {
  const maxSize = Math.max(sizeA, sizeB);
  if (maxSize === 0) return 1.0;
  return Math.max(0, Math.min(1, 1 - ted / maxSize));
}

export interface NodeTuple {
  type: string;
  depth: number;
  parentType: string;
}

/**
 * Extracts (type, depth, parent-type) tuples from an AST.
 */
export function extractNodeTuples(root: ASTNode | null | undefined): NodeTuple[] {
  if (!root) return [];
  const tuples: NodeTuple[] = [];

  function traverse(node: ASTNode, depth: number, parentType: string) {
    tuples.push({
      type: node.type,
      depth,
      parentType,
    });

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) traverse(child, depth + 1, node.type);
      }
    }
  }

  traverse(root, 0, 'ROOT');
  return tuples;
}

/**
 * Calculates node-level precision, recall, and F1 on (type, depth, parent-type) tuples.
 * Treats tree A as ground truth (classical) and tree B as candidate (neural).
 */
export function calculateTupleMetrics(
  treeA: ASTNode | null | undefined,
  treeB: ASTNode | null | undefined
): { precision: number; recall: number; f1: number } {
  const tuplesA = extractNodeTuples(treeA);
  const tuplesB = extractNodeTuples(treeB);

  if (tuplesA.length === 0 && tuplesB.length === 0) {
    return { precision: 1.0, recall: 1.0, f1: 1.0 };
  }
  if (tuplesA.length === 0 || tuplesB.length === 0) {
    return { precision: 0.0, recall: 0.0, f1: 0.0 };
  }

  // Count frequencies
  const countsA = new Map<string, number>();
  for (const t of tuplesA) {
    const key = `${t.type}#${t.depth}#${t.parentType}`;
    countsA.set(key, (countsA.get(key) || 0) + 1);
  }

  const countsB = new Map<string, number>();
  for (const t of tuplesB) {
    const key = `${t.type}#${t.depth}#${t.parentType}`;
    countsB.set(key, (countsB.get(key) || 0) + 1);
  }

  // True Positives = sum of min(countA, countB) across all distinct tuple keys
  let tp = 0;
  for (const [key, countInB] of countsB.entries()) {
    const countInA = countsA.get(key) || 0;
    tp += Math.min(countInA, countInB);
  }

  const precision = tuplesB.length > 0 ? tp / tuplesB.length : 0;
  const recall = tuplesA.length > 0 ? tp / tuplesA.length : 0;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1: Math.round(f1 * 1000) / 1000,
  };
}

/**
 * Checks for exact structural match between two trees:
 * Same structure and matching node types at every position.
 */
export function checkExactStructuralMatch(
  treeA: ASTNode | null | undefined,
  treeB: ASTNode | null | undefined
): boolean {
  if (!treeA && !treeB) return true;
  if (!treeA || !treeB) return false;

  if (treeA.type !== treeB.type) return false;

  const childrenA = treeA.children || [];
  const childrenB = treeB.children || [];

  if (childrenA.length !== childrenB.length) return false;

  for (let i = 0; i < childrenA.length; i++) {
    if (!checkExactStructuralMatch(childrenA[i], childrenB[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Generates difference list: missing, extra, mismatched, each with node path.
 */
export function findASTDifferences(
  treeA: ASTNode | null | undefined,
  treeB: ASTNode | null | undefined
): ASTDiffItem[] {
  const differences: ASTDiffItem[] = [];

  function compareRecursive(
    nodeA: ASTNode | null | undefined,
    nodeB: ASTNode | null | undefined,
    path: string
  ) {
    if (nodeA && !nodeB) {
      differences.push({
        kind: 'missing',
        path,
        expected: nodeA.type,
        nodeAId: nodeA.id,
      });
      return;
    }

    if (!nodeA && nodeB) {
      differences.push({
        kind: 'extra',
        path,
        actual: nodeB.type,
        nodeBId: nodeB.id,
      });
      return;
    }

    if (!nodeA || !nodeB) return;

    if (nodeA.type !== nodeB.type) {
      differences.push({
        kind: 'mismatched',
        path,
        expected: nodeA.type,
        actual: nodeB.type,
        nodeAId: nodeA.id,
        nodeBId: nodeB.id,
      });
    }

    const childrenA = nodeA.children || [];
    const childrenB = nodeB.children || [];
    const maxLen = Math.max(childrenA.length, childrenB.length);

    for (let i = 0; i < maxLen; i++) {
      const childA = childrenA[i];
      const childB = childrenB[i];
      const childType = (childA || childB)?.type || 'Node';
      const childPath = `${path}/${childType}[${i}]`;

      compareRecursive(childA, childB, childPath);
    }
  }

  compareRecursive(treeA, treeB, treeA?.type || treeB?.type || 'Root');
  return differences;
}

/**
 * Maps each node in treeA and treeB to its alignment status (match, mismatch, missing, extra).
 * Used for visual coloring in side-by-side Compare view.
 */
export function annotateNodeStatuses(
  treeA: ASTNode | null | undefined,
  treeB: ASTNode | null | undefined
): {
  statusMapA: Map<string, NodeMatchStatus>;
  statusMapB: Map<string, NodeMatchStatus>;
} {
  const statusMapA = new Map<string, NodeMatchStatus>();
  const statusMapB = new Map<string, NodeMatchStatus>();

  function align(
    nodeA: ASTNode | null | undefined,
    nodeB: ASTNode | null | undefined
  ) {
    if (nodeA && !nodeB) {
      if (nodeA.id) statusMapA.set(nodeA.id, 'missing');
      if (nodeA.children) {
        for (const child of nodeA.children) align(child, null);
      }
      return;
    }

    if (!nodeA && nodeB) {
      if (nodeB.id) statusMapB.set(nodeB.id, 'extra');
      if (nodeB.children) {
        for (const child of nodeB.children) align(null, child);
      }
      return;
    }

    if (!nodeA || !nodeB) return;

    const isMatch = nodeA.type === nodeB.type;
    const status: NodeMatchStatus = isMatch ? 'match' : 'mismatch';

    if (nodeA.id) statusMapA.set(nodeA.id, status);
    if (nodeB.id) statusMapB.set(nodeB.id, status);

    const childrenA = nodeA.children || [];
    const childrenB = nodeB.children || [];
    const maxLen = Math.max(childrenA.length, childrenB.length);

    for (let i = 0; i < maxLen; i++) {
      align(childrenA[i], childrenB[i]);
    }
  }

  align(treeA, treeB);
  return { statusMapA, statusMapB };
}

/**
 * Comprehensive AST comparison:
 * Combines TED, similarity, precision, recall, F1, exact match, and diff list.
 */
export function compareASTs(
  treeA: ASTNode | null | undefined,
  treeB: ASTNode | null | undefined,
  latencyClassicalMs?: number,
  latencyNeuralMs?: number
): ComparisonMetrics {
  const sizeA = treeA ? countTreeNodes(treeA) : 0;
  const sizeB = treeB ? countTreeNodes(treeB) : 0;

  const treeEditDistance = calculateTreeEditDistance(treeA, treeB);
  const similarity = calculateSimilarity(treeEditDistance, sizeA, sizeB);
  const { precision, recall, f1 } = calculateTupleMetrics(treeA, treeB);
  const isExactMatch = checkExactStructuralMatch(treeA, treeB);
  const differences = findASTDifferences(treeA, treeB);

  return {
    treeEditDistance,
    similarity: Math.round(similarity * 1000) / 1000,
    sizeA,
    sizeB,
    precision,
    recall,
    f1,
    isExactMatch,
    differences,
    latencyClassicalMs,
    latencyNeuralMs,
  };
}
