/**
 * AST Utilities:
 * - AST to JSON serialization
 * - AST to bracketed string (S-expression format e.g. (Program (FunctionDecl ...)))
 * - AST to Graphviz DOT diagram
 * - Node count calculation
 * - Tree max depth calculation
 */

import { ASTNode, ParseTraceStep } from '../types/ast';

export function findNodeAtPosition(
  ast: ASTNode,
  line: number,
  col: number
): ASTNode | null {
  let deepest: ASTNode | null = null;
  let deepestLevel = -1;
  function visit(node: ASTNode, level: number): void {
    const { span } = node;
    const afterStart =
      line > span.startLine || (line === span.startLine && col >= span.startCol);
    const beforeEnd =
      line < span.endLine || (line === span.endLine && col <= span.endCol);
    if (!afterStart || !beforeEnd) return;
    if (level > deepestLevel) {
      deepest = node;
      deepestLevel = level;
    }
    for (const child of node.children ?? []) visit(child, level + 1);
  }
  visit(ast, 0);
  return deepest;
}

export function buildTreeAtStep(
  ast: ASTNode,
  trace: ParseTraceStep[],
  stepIndex: number
): ASTNode {
  const entered = new Set<string>([ast.id]);
  const active: string[] = [];
  for (const step of trace.slice(0, Math.max(0, stepIndex + 1))) {
    if (!step.nodeId) continue;
    if (step.event === 'enter') {
      entered.add(step.nodeId);
      active.push(step.nodeId);
    } else if (step.event === 'exit') {
      const index = active.lastIndexOf(step.nodeId);
      if (index >= 0) active.splice(index, 1);
    }
  }
  const activeId = active.at(-1);
  const cloneVisible = (node: ASTNode): ASTNode | null => {
    if (!entered.has(node.id)) return null;
    const children = (node.children ?? [])
      .map(cloneVisible)
      .filter((child): child is ASTNode => child !== null);
    return { ...node, active: node.id === activeId, children } as ASTNode;
  };
  return cloneVisible(ast) ?? { ...ast, active: false, children: [] };
}

export function countNodes(node: ASTNode): number {
  if (!node) return 0;
  let count = 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

export function getMaxDepth(node: ASTNode): number {
  if (!node) return 0;
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(getMaxDepth));
}

export function astToJSON(node: ASTNode, pretty: boolean = true): string {
  return JSON.stringify(node, null, pretty ? 2 : 0);
}

export function astToBracketedString(node: ASTNode): string {
  if (!node) return '()';

  switch (node.type) {
    case 'Program': {
      const items = (node.children || []).map(astToBracketedString).join(' ');
      return items.length > 0 ? `(Program ${items})` : `(Program)`;
    }

    case 'FunctionDecl': {
      const params = node.params.map(astToBracketedString).join(' ');
      const body = astToBracketedString(node.body);
      const paramsPart = params ? ` (${params})` : '';
      return `(FunctionDecl ${node.returnType} ${node.name}${paramsPart} ${body})`;
    }

    case 'Param': {
      return `(Param ${node.paramType} ${node.name}${node.isArray ? '[]' : ''})`;
    }

    case 'VarDecl': {
      const initPart = node.init ? ` ${astToBracketedString(node.init)}` : '';
      const arrayPart = node.isArray
        ? node.arraySize
          ? ` [${astToBracketedString(node.arraySize)}]`
          : ' []'
        : '';
      return `(VarDecl ${node.varType} ${node.name}${arrayPart}${initPart})`;
    }

    case 'Block': {
      const stmts = node.statements.map(astToBracketedString).join(' ');
      return stmts.length > 0 ? `(Block ${stmts})` : `(Block)`;
    }

    case 'IfStmt': {
      const cond = astToBracketedString(node.condition);
      const thenB = astToBracketedString(node.thenBranch);
      const elseB = node.elseBranch ? ` ${astToBracketedString(node.elseBranch)}` : '';
      return `(IfStmt ${cond} ${thenB}${elseB})`;
    }

    case 'WhileStmt': {
      return `(WhileStmt ${astToBracketedString(node.condition)} ${astToBracketedString(node.body)})`;
    }

    case 'DoWhileStmt': {
      return `(DoWhileStmt ${astToBracketedString(node.body)} ${astToBracketedString(node.condition)})`;
    }

    case 'ForStmt': {
      const init = node.init ? astToBracketedString(node.init) : 'nil';
      const cond = node.condition ? astToBracketedString(node.condition) : 'nil';
      const upd = node.update ? astToBracketedString(node.update) : 'nil';
      const body = astToBracketedString(node.body);
      return `(ForStmt ${init} ${cond} ${upd} ${body})`;
    }

    case 'ReturnStmt': {
      return node.value ? `(ReturnStmt ${astToBracketedString(node.value)})` : `(ReturnStmt)`;
    }

    case 'BreakStmt':
      return '(BreakStmt)';

    case 'ContinueStmt':
      return '(ContinueStmt)';

    case 'ExprStmt':
      return `(ExprStmt ${astToBracketedString(node.expression)})`;

    case 'BinaryExpr': {
      return `(BinaryExpr ${node.operator} ${astToBracketedString(node.left)} ${astToBracketedString(node.right)})`;
    }

    case 'UnaryExpr': {
      const pos = node.isPrefix ? 'prefix' : 'postfix';
      return `(UnaryExpr ${node.operator} ${astToBracketedString(node.argument)} ${pos})`;
    }

    case 'AssignExpr': {
      return `(AssignExpr ${node.operator} ${astToBracketedString(node.target)} ${astToBracketedString(node.value)})`;
    }

    case 'CallExpr': {
      const args = node.args.map(astToBracketedString).join(' ');
      const argsPart = args ? ` ${args}` : '';
      return `(CallExpr ${astToBracketedString(node.callee)}${argsPart})`;
    }

    case 'IndexExpr': {
      return `(IndexExpr ${astToBracketedString(node.target)} ${astToBracketedString(node.index)})`;
    }

    case 'Identifier':
      return `(Identifier ${node.name})`;

    case 'Literal':
      return `(Literal ${JSON.stringify(node.value)})`;

    case 'ArrayLiteral': {
      const elems = node.elements.map(astToBracketedString).join(' ');
      return elems ? `(ArrayLiteral ${elems})` : `(ArrayLiteral)`;
    }

    case 'ErrorNode':
      return `(ErrorNode "${node.message}")`;

    default:
      return `(${(node as any).type})`;
  }
}

export function getNodeLabel(node: ASTNode): string {
  switch (node.type) {
    case 'Program':
      return 'Program';
    case 'FunctionDecl':
      return `fn ${node.returnType} ${node.name}()`;
    case 'Param':
      return `${node.paramType} ${node.name}${node.isArray ? '[]' : ''}`;
    case 'VarDecl':
      return `${node.varType} ${node.name}`;
    case 'Block':
      return '{ ... }';
    case 'IfStmt':
      return 'if';
    case 'WhileStmt':
      return 'while';
    case 'DoWhileStmt':
      return 'do-while';
    case 'ForStmt':
      return 'for';
    case 'ReturnStmt':
      return 'return';
    case 'BreakStmt':
      return 'break';
    case 'ContinueStmt':
      return 'continue';
    case 'ExprStmt':
      return 'ExprStmt';
    case 'BinaryExpr':
      return `Binary (${node.operator})`;
    case 'UnaryExpr':
      return `Unary (${node.operator} ${node.isPrefix ? 'pre' : 'post'})`;
    case 'AssignExpr':
      return `Assign (${node.operator})`;
    case 'CallExpr':
      return 'Call';
    case 'IndexExpr':
      return 'Index []';
    case 'Identifier':
      return `id: ${node.name}`;
    case 'Literal':
      return `${node.literalType}: ${JSON.stringify(node.value)}`;
    case 'ArrayLiteral':
      return '{ array }';
    case 'ErrorNode':
      return `ERR: ${node.message}`;
    default:
      return 'Node';
  }
}

export function astToDot(root: ASTNode): string {
  const lines: string[] = [
    'digraph MiniCAST {',
    '  rankdir=TB;',
    '  node [shape=box, style="rounded,filled", fontname="Inter", fontsize=11, fillcolor="#FFFFFF", color="#E7E5E4"];',
    '  edge [color="#78716C", arrowhead=vee];',
  ];

  function traverse(node: ASTNode) {
    const rawLabel = getNodeLabel(node);
    const escaped = rawLabel.replace(/"/g, '\\"');
    let fillColor = '#FFFFFF';
    let borderColor = '#059669';

    if (node.type === 'ErrorNode') {
      fillColor = '#FFF1F2';
      borderColor = '#E11D48';
    } else if (node.type === 'BinaryExpr' || node.type === 'UnaryExpr' || node.type === 'AssignExpr') {
      borderColor = '#6366F1';
      fillColor = '#EEF2FF';
    } else if (node.type === 'FunctionDecl' || node.type === 'Program') {
      borderColor = '#059669';
      fillColor = '#ECFDF5';
    }

    lines.push(`  "${node.id}" [label="${escaped}", fillcolor="${fillColor}", color="${borderColor}"];`);

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) {
          lines.push(`  "${node.id}" -> "${child.id}";`);
          traverse(child);
        }
      }
    }
  }

  traverse(root);
  lines.push('}');
  return lines.join('\n');
}

export const exportToDot = astToDot;

export const SAMPLE_CODE_SNIPPETS = [
  {
    title: 'Euclidean distance',
    code: `float dist(float x, float y) {
  return x * x + y * y;
}`,
  },
  {
    title: 'Syntax error (missing delimiter)',
    code: `int solve(int x {
  return x * 2 + 1;
}`,
  },
  {
    title: 'Binary tree walk',
    code: `int root = 42;
int visit(int node) {
  return node * 2;
}`,
  },
];
