/**
 * Pure TypeScript AST metrics calculation for MiniC programs.
 * Computes:
 * - Cyclomatic Complexity (McCabe metric)
 * - Max Nesting Depth
 * - Function Count
 * - Loop Count
 * - Unused Variables Analysis
 * - Node Count
 * - Tree Max Depth
 */

import { ASTNode } from '../types/ast';
import { countNodes, getMaxDepth } from './astUtils';

export interface CodeMetricsResult {
  cyclomaticComplexity: number;
  maxNestingDepth: number;
  functionCount: number;
  loopCount: number;
  unusedVariables: string[];
  unusedVariableCount: number;
  nodeCount: number;
  treeDepth: number;
}

/**
 * Calculates McCabe Cyclomatic Complexity:
 * V(G) = 1 + number of branching decision points.
 * Decision points in MiniC:
 * - IfStmt (+1)
 * - WhileStmt, ForStmt, DoWhileStmt (+1 each)
 * - Binary operators '&&' and '||' (+1 each)
 */
export function calculateCyclomaticComplexity(root: ASTNode | null | undefined): number {
  if (!root) return 1;

  let decisionPoints = 0;

  function traverse(node: ASTNode) {
    if (!node) return;

    switch (node.type) {
      case 'IfStmt':
      case 'WhileStmt':
      case 'ForStmt':
      case 'DoWhileStmt':
        decisionPoints++;
        break;

      case 'BinaryExpr': {
        const op = (node as any).operator;
        if (op === '&&' || op === '||') {
          decisionPoints++;
        }
        break;
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) traverse(child);
      }
    }
  }

  traverse(root);
  return 1 + decisionPoints;
}

/**
 * Calculates Maximum Nesting Depth of control flow structures:
 * Counts levels of nested blocks and control statements (IfStmt, WhileStmt, ForStmt, DoWhileStmt, Block).
 */
export function calculateMaxNestingDepth(root: ASTNode | null | undefined): number {
  if (!root) return 0;

  let maxDepth = 0;

  function traverse(node: ASTNode, currentDepth: number) {
    if (!node) return;

    let isNestingNode = false;
    // Don't count top-level Program
    if (node.type !== 'Program') {
      if (
        node.type === 'Block' ||
        node.type === 'IfStmt' ||
        node.type === 'WhileStmt' ||
        node.type === 'ForStmt' ||
        node.type === 'DoWhileStmt'
      ) {
        isNestingNode = true;
      }
    }

    const nextDepth = isNestingNode ? currentDepth + 1 : currentDepth;
    if (nextDepth > maxDepth) {
      maxDepth = nextDepth;
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) traverse(child, nextDepth);
      }
    }
  }

  traverse(root, 0);
  return maxDepth;
}

/**
 * Calculates total number of Function declarations in the program.
 */
export function calculateFunctionCount(root: ASTNode | null | undefined): number {
  if (!root) return 0;
  let count = 0;

  function traverse(node: ASTNode) {
    if (!node) return;
    if (node.type === 'FunctionDecl') {
      count++;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) traverse(child);
      }
    }
  }

  traverse(root);
  return count;
}

/**
 * Calculates total number of loop statements (while, for, do-while).
 */
export function calculateLoopCount(root: ASTNode | null | undefined): number {
  if (!root) return 0;
  let count = 0;

  function traverse(node: ASTNode) {
    if (!node) return;
    if (
      node.type === 'WhileStmt' ||
      node.type === 'ForStmt' ||
      node.type === 'DoWhileStmt'
    ) {
      count++;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) traverse(child);
      }
    }
  }

  traverse(root);
  return count;
}

/**
 * Identifies variables that are declared in VarDecl nodes but never referenced
 * elsewhere as an Identifier.
 */
export function calculateUnusedVariables(root: ASTNode | null | undefined): string[] {
  if (!root) return [];

  const declaredVars: Array<{ id: string; name: string }> = [];
  const referencedNames = new Set<string>();

  function traverse(node: ASTNode) {
    if (!node) return;

    if (node.type === 'VarDecl') {
      const varName = (node as any).name;
      if (varName && typeof varName === 'string') {
        declaredVars.push({ id: node.id, name: varName });
      }
      // Continue traversing init or arraySize
      if ((node as any).init) traverse((node as any).init);
      if ((node as any).arraySize) traverse((node as any).arraySize);
      return;
    }

    if (node.type === 'Identifier') {
      const idName = (node as any).name;
      if (idName && typeof idName === 'string') {
        referencedNames.add(idName);
      }
      return;
    }

    if (node.type === 'FunctionDecl') {
      // Function names themselves are not variables, but parameters could be considered.
      // Traverse params and body
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (child) traverse(child);
        }
      }
      return;
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) traverse(child);
      }
    }
  }

  traverse(root);

  // Unused = declared in VarDecl whose name is not in referencedNames
  const unusedList: string[] = [];
  const seen = new Set<string>();

  for (const decl of declaredVars) {
    if (!referencedNames.has(decl.name) && !seen.has(decl.name)) {
      seen.add(decl.name);
      unusedList.push(decl.name);
    }
  }

  return unusedList;
}

/**
 * Computes all 7 metrics in one pass.
 */
export function computeAllMetrics(root: ASTNode | null | undefined): CodeMetricsResult {
  if (!root) {
    return {
      cyclomaticComplexity: 1,
      maxNestingDepth: 0,
      functionCount: 0,
      loopCount: 0,
      unusedVariables: [],
      unusedVariableCount: 0,
      nodeCount: 0,
      treeDepth: 0,
    };
  }

  const unused = calculateUnusedVariables(root);

  return {
    cyclomaticComplexity: calculateCyclomaticComplexity(root),
    maxNestingDepth: calculateMaxNestingDepth(root),
    functionCount: calculateFunctionCount(root),
    loopCount: calculateLoopCount(root),
    unusedVariables: unused,
    unusedVariableCount: unused.length,
    nodeCount: countNodes(root),
    treeDepth: getMaxDepth(root),
  };
}
