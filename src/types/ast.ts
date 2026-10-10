export type TokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'INT_LITERAL'
  | 'FLOAT_LITERAL'
  | 'STRING_LITERAL'
  | 'CHAR_LITERAL'
  | 'OPERATOR'
  | 'DELIMITER'
  | 'EOF'
  | 'ERROR'
  | 'NUMBER'
  | 'STRING'
  | 'PUNCTUATION'
  | 'COMMENT'
  | 'UNKNOWN';

export interface SourceLocation {
  line: number;
  column: number;
}

export interface SourceSpan {
  start: SourceLocation;
  end: SourceLocation;
}

export interface ASTSpan {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface Token {
  type: TokenType;
  lexeme: string;
  line: number;
  column: number;
  start: number;
  end: number;
  message?: string;
  value: string;
  span: SourceSpan;
}

export interface LexerTraceStep {
  stepIndex: number;
  charRange: { start: number; end: number };
  state: string;
  action: string;
  token?: Token;
  line: number;
  column: number;
}

export interface LexResult {
  tokens: Token[];
  errors: Token[];
  trace: LexerTraceStep[];
}

export type ASTNodeType =
  | 'Program'
  | 'FunctionDecl'
  | 'Param'
  | 'VarDecl'
  | 'Block'
  | 'IfStmt'
  | 'WhileStmt'
  | 'ForStmt'
  | 'DoWhileStmt'
  | 'ReturnStmt'
  | 'BreakStmt'
  | 'ContinueStmt'
  | 'ExprStmt'
  | 'BinaryExpr'
  | 'UnaryExpr'
  | 'AssignExpr'
  | 'CallExpr'
  | 'IndexExpr'
  | 'Identifier'
  | 'Literal'
  | 'ArrayLiteral'
  | 'ErrorNode';

export interface BaseASTNode {
  id: string;
  type: ASTNodeType;
  span: ASTSpan;
  children: ASTNode[];
  repaired?: boolean;
}

export interface ProgramNode extends BaseASTNode {
  type: 'Program';
  declarations: ASTNode[];
  body?: ASTNode[]; // Backward compatibility alias
}

export interface FunctionDeclNode extends BaseASTNode {
  type: 'FunctionDecl';
  returnType: string;
  name: string;
  params: ParamNode[];
  body: BlockNode;
}

export interface ParamNode extends BaseASTNode {
  type: 'Param';
  paramType: string;
  name: string;
  isArray: boolean;
}

export interface VarDeclNode extends BaseASTNode {
  type: 'VarDecl';
  varType: string;
  name: string;
  init?: ASTNode;
  isArray?: boolean;
  arraySize?: ASTNode;
}

export interface BlockNode extends BaseASTNode {
  type: 'Block';
  statements: ASTNode[];
}

export interface IfStmtNode extends BaseASTNode {
  type: 'IfStmt';
  condition: ASTNode;
  thenBranch: ASTNode;
  elseBranch?: ASTNode;
}

export interface WhileStmtNode extends BaseASTNode {
  type: 'WhileStmt';
  condition: ASTNode;
  body: ASTNode;
}

export interface ForStmtNode extends BaseASTNode {
  type: 'ForStmt';
  init?: ASTNode;
  condition?: ASTNode;
  update?: ASTNode;
  body: ASTNode;
}

export interface DoWhileStmtNode extends BaseASTNode {
  type: 'DoWhileStmt';
  body: ASTNode;
  condition: ASTNode;
}

export interface ReturnStmtNode extends BaseASTNode {
  type: 'ReturnStmt';
  value?: ASTNode;
  argument?: ASTNode; // Backward compatibility alias
}

export interface BreakStmtNode extends BaseASTNode {
  type: 'BreakStmt';
}

export interface ContinueStmtNode extends BaseASTNode {
  type: 'ContinueStmt';
}

export interface ExprStmtNode extends BaseASTNode {
  type: 'ExprStmt';
  expression: ASTNode;
}

export interface BinaryExprNode extends BaseASTNode {
  type: 'BinaryExpr';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryExprNode extends BaseASTNode {
  type: 'UnaryExpr';
  operator: string;
  argument: ASTNode;
  isPrefix: boolean;
}

export interface AssignExprNode extends BaseASTNode {
  type: 'AssignExpr';
  operator: string;
  target: ASTNode;
  value: ASTNode;
}

export interface CallExprNode extends BaseASTNode {
  type: 'CallExpr';
  callee: ASTNode;
  args: ASTNode[];
}

export interface IndexExprNode extends BaseASTNode {
  type: 'IndexExpr';
  target: ASTNode;
  index: ASTNode;
}

export interface IdentifierNode extends BaseASTNode {
  type: 'Identifier';
  name: string;
}

export type LiteralType = 'int' | 'float' | 'string' | 'char' | 'bool' | 'null';

export interface LiteralNode extends BaseASTNode {
  type: 'Literal';
  literalType: LiteralType;
  value: any;
  raw: string;
}

export interface ArrayLiteralNode extends BaseASTNode {
  type: 'ArrayLiteral';
  elements: ASTNode[];
}

export interface ErrorNode extends BaseASTNode {
  type: 'ErrorNode';
  message: string;
  unexpectedToken?: string;
}

export type ASTNode =
  | ProgramNode
  | FunctionDeclNode
  | ParamNode
  | VarDeclNode
  | BlockNode
  | IfStmtNode
  | WhileStmtNode
  | ForStmtNode
  | DoWhileStmtNode
  | ReturnStmtNode
  | BreakStmtNode
  | ContinueStmtNode
  | ExprStmtNode
  | BinaryExprNode
  | UnaryExprNode
  | AssignExprNode
  | CallExprNode
  | IndexExprNode
  | IdentifierNode
  | LiteralNode
  | ArrayLiteralNode
  | ErrorNode;

export interface ParseError {
  code: string;
  message: string;
  line: number;
  column: number;
  expected: string[];
  found: string;
  severity: 'error' | 'warning' | 'info';
  recoveryAction: string;
}

export interface SyntaxDiagnostic {
  message: string;
  span: ASTSpan;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface ParseTraceStep {
  stepIndex: number;
  ruleApplied: string;
  tokenConsumed?: string;
  depth: number;
  stack: string[];
  lookahead: string;
}

export interface ParseResult {
  ast: ProgramNode;
  tokens: Token[];
  errors: ParseError[];
  diagnostics: SyntaxDiagnostic[];
  trace: ParseTraceStep[];
  success: boolean;
  isRepaired?: boolean;
}
