import type { ASTNode } from '../types/ast';

const INDENT = '  ';

function expression(node: ASTNode): string {
  switch (node.type) {
    case 'BinaryExpr':
      return `(${expression(node.left)} ${node.operator} ${expression(node.right)})`;
    case 'AssignExpr':
      return `(${expression(node.target)} ${node.operator} ${expression(node.value)})`;
    case 'UnaryExpr':
      return node.isPrefix
        ? `${node.operator}${expression(node.argument)}`
        : `${expression(node.argument)}${node.operator}`;
    case 'CallExpr':
      return `${expression(node.callee)}(${node.args.map(expression).join(', ')})`;
    case 'IndexExpr':
      return `${expression(node.target)}[${expression(node.index)}]`;
    case 'Identifier':
      return node.name;
    case 'Literal':
      return node.raw;
    case 'ArrayLiteral':
      return `{${node.elements.map(expression).join(', ')}}`;
    default:
      throw new Error(`Cannot print ${node.type} as an expression.`);
  }
}

function declaration(node: Extract<ASTNode, { type: 'VarDecl' }>): string {
  const arraySuffix = node.isArray ? `[${node.arraySize ? expression(node.arraySize) : ''}]` : '';
  const initializer = node.init ? ` = ${expression(node.init)}` : '';
  return `${node.varType} ${node.name}${arraySuffix}${initializer};`;
}

function block(statements: ASTNode[], depth: number): string {
  if (statements.length === 0) return '{}';
  const body = statements.map((statement) => printNode(statement, depth + 1)).join('\n');
  return `{\n${body}\n${INDENT.repeat(depth)}}`;
}

function branch(node: ASTNode, depth: number): string {
  if (node.type === 'Block') return block(node.statements, depth);
  return `\n${INDENT.repeat(depth + 1)}${printNode(node, depth + 1)}`;
}

function printNode(node: ASTNode, depth: number): string {
  const pad = INDENT.repeat(depth);
  switch (node.type) {
    case 'Program':
      return node.declarations.map((item) => printNode(item, depth)).join('\n\n');
    case 'FunctionDecl': {
      const params = node.params
        .map((param) => `${param.paramType} ${param.name}${param.isArray ? '[]' : ''}`)
        .join(', ');
      return `${pad}${node.returnType} ${node.name}(${params}) ${block(node.body.statements, depth)}`;
    }
    case 'Param':
      return `${pad}${node.paramType} ${node.name}${node.isArray ? '[]' : ''}`;
    case 'VarDecl':
      return `${pad}${declaration(node)}`;
    case 'Block':
      return `${pad}${block(node.statements, depth)}`;
    case 'IfStmt': {
      const thenBranch =
        node.thenBranch.type === 'Block'
          ? ` ${block(node.thenBranch.statements, depth)}`
          : branch(node.thenBranch, depth);
      const elseBranch = node.elseBranch
        ? ` else${
            node.elseBranch.type === 'Block'
              ? ` ${block(node.elseBranch.statements, depth)}`
              : branch(node.elseBranch, depth)
          }`
        : '';
      return `${pad}if (${expression(node.condition)})${thenBranch}${elseBranch}`;
    }
    case 'WhileStmt':
      return `${pad}while (${expression(node.condition)})${
        node.body.type === 'Block'
          ? ` ${block(node.body.statements, depth)}`
          : branch(node.body, depth)
      }`;
    case 'DoWhileStmt':
      return `${pad}do${
        node.body.type === 'Block'
          ? ` ${block(node.body.statements, depth)}`
          : branch(node.body, depth)
      } while (${expression(node.condition)});`;
    case 'ForStmt': {
      const init = node.init
        ? node.init.type === 'VarDecl'
          ? declaration(node.init).slice(0, -1)
          : expression(node.init)
        : '';
      const condition = node.condition ? expression(node.condition) : '';
      const update = node.update ? expression(node.update) : '';
      const body =
        node.body.type === 'Block'
          ? ` ${block(node.body.statements, depth)}`
          : branch(node.body, depth);
      return `${pad}for (${init}; ${condition}; ${update})${body}`;
    }
    case 'ReturnStmt':
      return `${pad}return${node.value ? ` ${expression(node.value)}` : ''};`;
    case 'BreakStmt':
      return `${pad}break;`;
    case 'ContinueStmt':
      return `${pad}continue;`;
    case 'ExprStmt':
      return `${pad}${expression(node.expression)};`;
    default:
      throw new Error(`Cannot print ${node.type} as a statement.`);
  }
}

/** Print a parser AST as consistently formatted, canonical MiniC source. */
export function unparse(ast: ASTNode): string {
  if (ast.type !== 'Program') throw new Error('unparse expects a Program AST node.');
  return printNode(ast, 0).trim();
}
