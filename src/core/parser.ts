/**
 * Resilient recursive-descent parser for MiniC with Pratt precedence-climbing
 * and robust error recovery:
 *
 * 1. Panic-mode recovery (sync tokens: ;, }, ) and statement-start keywords)
 * 2. Phrase-level recovery (inserting obviously missing ; or ))
 * 3. Never crashes: returns partial AST with ErrorNode placeholders and structured errors
 * 4. Error = { code, message, line, column, expected[], found, severity, recoveryAction }
 * 5. Short, human-readable error messages
 */

import {
  ArrayLiteralNode,
  AssignExprNode,
  ASTNode,
  ASTSpan,
  BinaryExprNode,
  BlockNode,
  BreakStmtNode,
  CallExprNode,
  ContinueStmtNode,
  DoWhileStmtNode,
  ErrorNode,
  ExprStmtNode,
  ForStmtNode,
  FunctionDeclNode,
  IdentifierNode,
  IfStmtNode,
  IndexExprNode,
  LiteralNode,
  LiteralType,
  ParamNode,
  ParseError,
  ParseResult,
  ParseTraceStep,
  ProgramNode,
  ReturnStmtNode,
  SyntaxDiagnostic,
  Token,
  TokenType,
  UnaryExprNode,
  VarDeclNode,
  WhileStmtNode,
} from '../types/ast';
import { lex } from './lexer';

enum Precedence {
  NONE = 0,
  ASSIGNMENT = 1, // = += -= *= /= %=
  OR = 2, // ||
  AND = 3, // &&
  EQUALITY = 4, // == !=
  RELATIONAL = 5, // < <= > >=
  ADDITIVE = 6, // + -
  MULTIPLICATIVE = 7, // * / %
  PREFIX = 8, // + - ! ~ ++ --
  POSTFIX = 9, // () [] ++ --
}

const TYPE_KEYWORDS = new Set<string>(['int', 'float', 'bool', 'string', 'char', 'void']);
const STATEMENT_START_KEYWORDS = new Set<string>([
  'int',
  'float',
  'bool',
  'string',
  'char',
  'void',
  'if',
  'while',
  'for',
  'do',
  'return',
  'break',
  'continue',
]);
const ASSIGN_OPERATORS = new Set<string>(['=', '+=', '-=', '*=', '/=', '%=']);

const MAX_ERRORS = 100;
const MAX_TRACE_STEPS = 5000;
const MAX_NESTING_DEPTH = 256;

export class Parser {
  private tokens: Token[] = [];
  private current: number = 0;
  private errors: ParseError[] = [];
  private diagnostics: SyntaxDiagnostic[] = [];
  private trace: ParseTraceStep[] = [];
  private ruleStack: string[] = [];
  private nextNodeId: number = 1;
  private traceTruncated = false;
  private lastNodeId: string | undefined;

  constructor(tokens: Token[] = []) {
    this.tokens = tokens;
  }

  public parse(sourceOrTokens: string | Token[]): ParseResult {
    this.reset();
    if (typeof sourceOrTokens === 'string') {
      const lexResult = lex(sourceOrTokens);
      this.tokens = lexResult.tokens;

      // Import any lexer errors into parser errors
      for (const lexErr of lexResult.errors) {
        this.recordError(
          'ERR_LEXICAL',
          lexErr.message || `Lexical error: ${lexErr.lexeme}`,
          lexErr.line,
          lexErr.column,
          [],
          lexErr.lexeme,
          'error',
          'Tokenized as ERROR token',
        );
      }
    } else {
      this.tokens = sourceOrTokens;
    }

    let ast: ProgramNode;
    const excessiveNesting = this.findExcessiveNesting();
    if (excessiveNesting) {
      this.recordError(
        'ERR_MAX_NESTING_DEPTH',
        `Maximum parser nesting depth of ${MAX_NESTING_DEPTH} exceeded`,
        excessiveNesting.line,
        excessiveNesting.column,
        [],
        excessiveNesting.lexeme,
        'error',
        'Parsing stopped before recursive descent',
      );
      ast = this.emptyProgram();
    } else {
      try {
        ast = this.parseProgram();
      } catch {
        // Safe fallback if unexpected exception occurs
        ast = this.emptyProgram();
      }
    }

    return {
      ast,
      tokens: this.tokens,
      errors: this.errors,
      diagnostics: this.diagnostics,
      trace: this.trace,
      traceTruncated: this.traceTruncated,
      success: this.errors.length === 0,
    };
  }

  private emptyProgram(): ProgramNode {
    const endTok = this.peek();
    return {
      id: 'prog_fallback',
      type: 'Program',
      declarations: [],
      body: [],
      children: [],
      span: {
        startLine: 1,
        startCol: 1,
        endLine: endTok ? endTok.line : 1,
        endCol: endTok ? endTok.column : 1,
      },
    };
  }

  private findExcessiveNesting(): Token | undefined {
    let depth = 0;
    for (const token of this.tokens) {
      if (token.type !== 'DELIMITER') continue;
      if (token.lexeme === '(' || token.lexeme === '{' || token.lexeme === '[') {
        depth += 1;
        if (depth > MAX_NESTING_DEPTH) return token;
      } else if (
        (token.lexeme === ')' || token.lexeme === '}' || token.lexeme === ']') &&
        depth > 0
      ) {
        depth -= 1;
      }
    }
    return undefined;
  }

  private reset(): void {
    this.current = 0;
    this.errors = [];
    this.diagnostics = [];
    this.trace = [];
    this.ruleStack = [];
    this.nextNodeId = 1;
    this.traceTruncated = false;
    this.lastNodeId = undefined;
  }

  private genId(prefix: string): string {
    const id = `${prefix}_${this.nextNodeId++}`;
    this.lastNodeId = id;
    this.recordTrace(`Create ${prefix} node`, undefined, 'enter', id);
    return id;
  }

  private peek(): Token {
    return this.tokens[this.current] || this.tokens[this.tokens.length - 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1] || this.tokens[0];
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length || this.peek().type === 'EOF';
  }

  private check(type: TokenType, value?: string): boolean {
    if (this.isAtEnd()) return false;
    const tok = this.peek();
    if (tok.type !== type) return false;
    if (value !== undefined && tok.lexeme !== value) return false;
    return true;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
      const consumed = this.previous();
      this.recordTrace(`Consume '${consumed.lexeme}'`, consumed.lexeme, 'consume', this.lastNodeId);
    }
    return this.previous();
  }

  private match(type: TokenType, value?: string): boolean {
    if (this.check(type, value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private recordError(
    code: string,
    message: string,
    line: number,
    column: number,
    expected: string[],
    found: string,
    severity: 'error' | 'warning',
    recoveryAction: string,
  ): ParseError {
    const errorObj: ParseError = {
      code,
      message,
      line,
      column,
      expected,
      found,
      severity,
      recoveryAction,
    };

    if (this.errors.length < MAX_ERRORS) {
      this.errors.push(errorObj);
      this.diagnostics.push({
        message,
        span: {
          startLine: line,
          startCol: column,
          endLine: line,
          endCol: column + (found ? found.length : 1),
        },
        severity,
        suggestion: expected.length > 0 ? `Expected '${expected.join("' or '")}'` : undefined,
      });
    }
    this.recordTrace(message, found, 'error', this.lastNodeId);
    this.recordTrace(recoveryAction, undefined, 'recover', this.lastNodeId);

    return errorObj;
  }

  /**
   * Phrase-level recovery: checks if semicolon is missing and can be virtually inserted.
   */
  private matchOrInsertSemicolon(context: string): boolean {
    if (this.match('DELIMITER', ';')) {
      return true;
    }

    const prev = this.previous();
    const curr = this.peek();

    const isNextLine = curr.line > prev.line;
    const isClosingBrace = curr.type === 'DELIMITER' && curr.lexeme === '}';
    const isStmtStart = curr.type === 'KEYWORD' && STATEMENT_START_KEYWORDS.has(curr.lexeme);
    const isEOF = curr.type === 'EOF';

    if (isNextLine || isClosingBrace || isStmtStart || isEOF) {
      this.recordError(
        'ERR_MISSING_SEMICOLON',
        `Expected ';' after ${context}`,
        prev.line,
        prev.column + (prev.lexeme ? prev.lexeme.length : 1),
        [';'],
        curr.lexeme || 'EOF',
        'error',
        "Inserted virtual ';'",
      );
      return true;
    }

    // Panic recovery to next semicolon or statement boundary
    this.recordError(
      'ERR_MISSING_SEMICOLON',
      `Expected ';' after ${context}`,
      curr.line,
      curr.column,
      [';'],
      curr.lexeme || 'EOF',
      'error',
      'Skipped tokens to statement synchronization boundary',
    );
    this.synchronizeStatement();
    return false;
  }

  /**
   * Phrase-level recovery for closing parenthesis ')'.
   */
  private matchOrInsertClosingParen(context: string): boolean {
    if (this.match('DELIMITER', ')')) {
      return true;
    }

    const curr = this.peek();
    const prev = this.previous();

    const isBlockStart = curr.type === 'DELIMITER' && curr.lexeme === '{';
    const isSemi = curr.type === 'DELIMITER' && curr.lexeme === ';';
    const isStmtStart = curr.type === 'KEYWORD' && STATEMENT_START_KEYWORDS.has(curr.lexeme);

    if (isBlockStart || isSemi || isStmtStart || this.isAtEnd()) {
      this.recordError(
        'ERR_MISSING_PARENTHESIS',
        `Expected ')' after ${context}`,
        prev.line,
        prev.column + (prev.lexeme ? prev.lexeme.length : 1),
        [')'],
        curr.lexeme || 'EOF',
        'error',
        "Inserted virtual ')'",
      );
      return true;
    }

    this.recordError(
      'ERR_MISSING_PARENTHESIS',
      `Expected ')' after ${context}`,
      curr.line,
      curr.column,
      [')'],
      curr.lexeme || 'EOF',
      'error',
      "Skipped token looking for ')'",
    );
    if (!this.isAtEnd() && curr.lexeme !== '{' && curr.lexeme !== ';') {
      this.advance();
    }
    return false;
  }

  /**
   * Panic-mode synchronization:
   * Advances past the faulty token, then skips until encountering a sync token (; or })
   * or a statement-start keyword.
   */
  private synchronizeStatement(): void {
    if (!this.isAtEnd()) {
      this.advance();
    }

    while (!this.isAtEnd()) {
      if (this.previous().type === 'DELIMITER' && this.previous().lexeme === ';') {
        return;
      }

      const tok = this.peek();

      if (tok.type === 'DELIMITER' && tok.lexeme === ';') {
        this.advance();
        return;
      }

      if (tok.type === 'DELIMITER' && tok.lexeme === '}') {
        return;
      }

      if (tok.type === 'KEYWORD' && STATEMENT_START_KEYWORDS.has(tok.lexeme)) {
        return;
      }

      this.advance();
    }
  }

  private recordTrace(
    ruleApplied: string,
    tokenConsumed?: string,
    event: ParseTraceStep['event'] = 'consume',
    nodeId?: string,
  ): void {
    if (this.trace.length >= MAX_TRACE_STEPS) {
      this.traceTruncated = true;
      return;
    }
    const lookahead = this.peek();
    this.trace.push({
      stepIndex: this.trace.length,
      ruleApplied,
      tokenConsumed,
      depth: this.ruleStack.length,
      stack: [...this.ruleStack],
      lookahead: lookahead ? `${lookahead.type}(${lookahead.lexeme})` : 'EOF',
      nodeId,
      event,
    });
  }

  private enterRule(rule: string): void {
    this.ruleStack.push(rule);
    this.recordTrace(`Enter ${rule}`, undefined, 'enter', this.lastNodeId);
  }

  private exitRule(): void {
    const popped = this.ruleStack.pop();
    if (popped) {
      this.recordTrace(`Exit ${popped}`, undefined, 'exit', this.lastNodeId);
    }
  }

  private makeSpan(startTok: Token, endTok: Token = startTok): ASTSpan {
    return {
      startLine: startTok.line,
      startCol: startTok.column,
      endLine: endTok.line,
      endCol: endTok.column + (endTok.lexeme ? endTok.lexeme.length : 0),
    };
  }

  // ==========================================
  // Grammar Parsing Methods with Error Recovery
  // ==========================================

  public parseProgram(): ProgramNode {
    this.enterRule('Program');
    const programId = this.genId('prog');
    const startTok = this.peek();
    const declarations: ASTNode[] = [];

    while (!this.isAtEnd()) {
      const prevPos = this.current;
      try {
        const decl = this.parseTopLevelItem();
        if (decl) {
          declarations.push(decl);
        }
      } catch {
        this.synchronizeStatement();
      }

      if (this.current === prevPos && !this.isAtEnd()) {
        this.advance();
      }
    }

    const endTok = this.previous();
    const span = this.makeSpan(startTok, endTok);
    this.exitRule();

    return {
      id: programId,
      type: 'Program',
      declarations,
      body: declarations,
      children: [...declarations],
      span,
    };
  }

  private parseTopLevelItem(): ASTNode | null {
    const tok = this.peek();

    if (tok.type === 'KEYWORD' && TYPE_KEYWORDS.has(tok.lexeme)) {
      const typeTok = this.advance();

      if (!this.check('IDENTIFIER')) {
        this.recordError(
          'ERR_EXPECTED_IDENTIFIER',
          `Expected identifier after type '${typeTok.lexeme}'`,
          this.peek().line,
          this.peek().column,
          ['IDENTIFIER'],
          this.peek().lexeme || 'EOF',
          'error',
          'Created ErrorNode and skipped to sync boundary',
        );
        this.synchronizeStatement();
        return {
          id: this.genId('err'),
          type: 'ErrorNode',
          message: `Expected identifier after type '${typeTok.lexeme}'`,
          unexpectedToken: this.peek().lexeme,
          children: [],
          span: this.makeSpan(typeTok, this.peek()),
        };
      }

      const idTok = this.advance();

      if (this.check('DELIMITER', '(')) {
        return this.parseFunctionDecl(typeTok, idTok);
      } else {
        return this.parseVarDeclTail(typeTok, idTok);
      }
    }

    this.enterRule('TopLevelError');
    const errTok = this.advance();
    this.recordError(
      'ERR_UNEXPECTED_TOKEN',
      `Unexpected token '${errTok.lexeme}' at top level`,
      errTok.line,
      errTok.column,
      ['Type declaration', 'Function definition'],
      errTok.lexeme,
      'error',
      'Created ErrorNode and continuing',
    );
    this.exitRule();

    return {
      id: this.genId('err'),
      type: 'ErrorNode',
      message: `Unexpected token '${errTok.lexeme}' at top level`,
      unexpectedToken: errTok.lexeme,
      children: [],
      span: this.makeSpan(errTok),
    };
  }

  private parseFunctionDecl(typeTok: Token, idTok: Token): FunctionDeclNode {
    this.enterRule('FunctionDecl');
    this.advance(); // consume '('

    const params: ParamNode[] = [];
    if (!this.check('DELIMITER', ')')) {
      do {
        const prev = this.current;
        if (this.check('KEYWORD') && TYPE_KEYWORDS.has(this.peek().lexeme)) {
          params.push(this.parseParam());
        } else {
          if (this.check('DELIMITER', ')') || this.check('DELIMITER', '{')) {
            break;
          }
          const errTok = this.advance();
          this.recordError(
            'ERR_MALFORMED_PARAM',
            'Expected parameter type in function signature',
            errTok.line,
            errTok.column,
            ['Type'],
            errTok.lexeme,
            'error',
            'Skipped invalid parameter token',
          );
        }
        if (this.current === prev && !this.isAtEnd()) {
          this.advance();
        }
      } while (this.match('DELIMITER', ','));
    }

    this.matchOrInsertClosingParen('parameters');
    const body = this.parseBlock();
    const span = this.makeSpan(typeTok, this.previous());
    this.exitRule();

    return {
      id: this.genId('fn'),
      type: 'FunctionDecl',
      returnType: typeTok.lexeme,
      name: idTok.lexeme,
      params,
      body,
      children: [...params, body],
      span,
    };
  }

  private parseParam(): ParamNode {
    this.enterRule('Param');
    const typeTok = this.advance();
    let name = 'anon';

    if (this.check('IDENTIFIER')) {
      name = this.advance().lexeme;
    } else {
      this.recordError(
        'ERR_EXPECTED_IDENTIFIER',
        `Expected parameter name after type '${typeTok.lexeme}'`,
        this.peek().line,
        this.peek().column,
        ['IDENTIFIER'],
        this.peek().lexeme || 'EOF',
        'error',
        "Assigned placeholder name 'anon'",
      );
    }

    let isArray = false;
    if (this.match('DELIMITER', '[')) {
      this.match('INT_LITERAL');
      if (!this.match('DELIMITER', ']')) {
        this.recordError(
          'ERR_UNBALANCED_BRACKET',
          "Expected ']' in array parameter declaration",
          this.peek().line,
          this.peek().column,
          [']'],
          this.peek().lexeme,
          'error',
          "Inserted virtual ']'",
        );
      }
      isArray = true;
    }

    const span = this.makeSpan(typeTok, this.previous());
    this.exitRule();

    return {
      id: this.genId('param'),
      type: 'Param',
      paramType: typeTok.lexeme,
      name,
      isArray,
      children: [],
      span,
    };
  }

  private parseVarDeclTail(typeTok: Token, idTok: Token): VarDeclNode {
    this.enterRule('VarDecl');
    let isArray = false;
    let arraySize: ASTNode | undefined;
    let init: ASTNode | undefined;

    if (this.match('DELIMITER', '[')) {
      isArray = true;
      if (!this.check('DELIMITER', ']')) {
        arraySize = this.parseExpression();
      }
      if (!this.match('DELIMITER', ']')) {
        this.recordError(
          'ERR_UNBALANCED_BRACKET',
          "Expected ']' in array declaration",
          this.peek().line,
          this.peek().column,
          [']'],
          this.peek().lexeme,
          'error',
          "Inserted virtual ']'",
        );
      }
    }

    if (this.match('OPERATOR', '=')) {
      init = this.parseExpression();
    }

    this.matchOrInsertSemicolon('variable declaration');
    const span = this.makeSpan(typeTok, this.previous());
    this.exitRule();

    const children: ASTNode[] = [];
    if (arraySize) children.push(arraySize);
    if (init) children.push(init);

    return {
      id: this.genId('var'),
      type: 'VarDecl',
      varType: typeTok.lexeme,
      name: idTok.lexeme,
      init,
      isArray,
      arraySize,
      children,
      span,
    };
  }

  private parseBlock(): BlockNode {
    this.enterRule('Block');
    let startTok = this.peek();

    if (this.match('DELIMITER', '{')) {
      startTok = this.previous();
    } else {
      this.recordError(
        'ERR_MISSING_BRACE',
        "Expected '{' to start block",
        startTok.line,
        startTok.column,
        ['{'],
        startTok.lexeme,
        'error',
        "Inserted virtual '{'",
      );
    }

    const statements: ASTNode[] = [];

    while (!this.check('DELIMITER', '}') && !this.isAtEnd()) {
      const prevPos = this.current;
      try {
        const stmt = this.parseStatement();
        if (stmt) {
          statements.push(stmt);
        }
      } catch {
        this.synchronizeStatement();
      }

      if (this.current === prevPos && !this.isAtEnd()) {
        this.advance();
      }
    }

    if (!this.match('DELIMITER', '}')) {
      this.recordError(
        'ERR_MISSING_BRACE',
        "Expected '}' to close block",
        this.peek().line,
        this.peek().column,
        ['}'],
        this.peek().lexeme || 'EOF',
        'error',
        "Inserted virtual '}'",
      );
    }

    const endTok = this.previous();
    const span = this.makeSpan(startTok, endTok);
    this.exitRule();

    return {
      id: this.genId('block'),
      type: 'Block',
      statements,
      children: [...statements],
      span,
    };
  }

  private parseStatement(): ASTNode {
    const tok = this.peek();

    if (tok.type === 'DELIMITER' && tok.lexeme === '{') {
      return this.parseBlock();
    }

    if (tok.type === 'KEYWORD') {
      if (TYPE_KEYWORDS.has(tok.lexeme)) {
        const typeTok = this.advance();
        if (!this.check('IDENTIFIER')) {
          this.recordError(
            'ERR_EXPECTED_IDENTIFIER',
            `Expected variable name after '${typeTok.lexeme}'`,
            this.peek().line,
            this.peek().column,
            ['IDENTIFIER'],
            this.peek().lexeme,
            'error',
            'Created ErrorNode and skipped to sync boundary',
          );
          this.synchronizeStatement();
          return {
            id: this.genId('err'),
            type: 'ErrorNode',
            message: `Expected variable name after '${typeTok.lexeme}'`,
            children: [],
            span: this.makeSpan(typeTok, this.peek()),
          };
        }
        const idTok = this.advance();
        return this.parseVarDeclTail(typeTok, idTok);
      }

      switch (tok.lexeme) {
        case 'if':
          return this.parseIfStmt();
        case 'while':
          return this.parseWhileStmt();
        case 'do':
          return this.parseDoWhileStmt();
        case 'for':
          return this.parseForStmt();
        case 'return':
          return this.parseReturnStmt();
        case 'break':
          return this.parseBreakStmt();
        case 'continue':
          return this.parseContinueStmt();
      }
    }

    if (tok.type === 'DELIMITER' && tok.lexeme === '}') {
      return this.parseBlock();
    }

    return this.parseExprStmt();
  }

  private parseIfStmt(): IfStmtNode {
    this.enterRule('IfStmt');
    const ifTok = this.advance();

    if (!this.match('DELIMITER', '(')) {
      this.recordError(
        'ERR_MISSING_PARENTHESIS',
        "Expected '(' after 'if'",
        this.peek().line,
        this.peek().column,
        ['('],
        this.peek().lexeme,
        'error',
        "Inserted virtual '('",
      );
    }

    const condition = this.parseExpression();
    this.matchOrInsertClosingParen('condition');

    const thenBranch = this.parseStatement();
    let elseBranch: ASTNode | undefined;

    if (this.match('KEYWORD', 'else')) {
      elseBranch = this.parseStatement();
    }

    const span = this.makeSpan(ifTok, this.previous());
    this.exitRule();

    const children: ASTNode[] = [condition, thenBranch];
    if (elseBranch) children.push(elseBranch);

    return {
      id: this.genId('if'),
      type: 'IfStmt',
      condition,
      thenBranch,
      elseBranch,
      children,
      span,
    };
  }

  private parseWhileStmt(): WhileStmtNode {
    this.enterRule('WhileStmt');
    const whileTok = this.advance();

    if (!this.match('DELIMITER', '(')) {
      this.recordError(
        'ERR_MISSING_PARENTHESIS',
        "Expected '(' after 'while'",
        this.peek().line,
        this.peek().column,
        ['('],
        this.peek().lexeme,
        'error',
        "Inserted virtual '('",
      );
    }

    const condition = this.parseExpression();
    this.matchOrInsertClosingParen('condition');

    const body = this.parseStatement();
    const span = this.makeSpan(whileTok, this.previous());
    this.exitRule();

    return {
      id: this.genId('while'),
      type: 'WhileStmt',
      condition,
      body,
      children: [condition, body],
      span,
    };
  }

  private parseDoWhileStmt(): DoWhileStmtNode {
    this.enterRule('DoWhileStmt');
    const doTok = this.advance();
    const body = this.parseStatement();

    if (!this.match('KEYWORD', 'while')) {
      this.recordError(
        'ERR_MISSING_KEYWORD',
        "Expected 'while' after 'do' body",
        this.peek().line,
        this.peek().column,
        ['while'],
        this.peek().lexeme,
        'error',
        "Inserted virtual 'while'",
      );
    }

    if (!this.match('DELIMITER', '(')) {
      this.recordError(
        'ERR_MISSING_PARENTHESIS',
        "Expected '(' after 'while'",
        this.peek().line,
        this.peek().column,
        ['('],
        this.peek().lexeme,
        'error',
        "Inserted virtual '('",
      );
    }

    const condition = this.parseExpression();
    this.matchOrInsertClosingParen('condition');
    this.matchOrInsertSemicolon('do-while statement');

    const span = this.makeSpan(doTok, this.previous());
    this.exitRule();

    return {
      id: this.genId('dowhile'),
      type: 'DoWhileStmt',
      body,
      condition,
      children: [body, condition],
      span,
    };
  }

  private parseForStmt(): ForStmtNode {
    this.enterRule('ForStmt');
    const forTok = this.advance();

    if (!this.match('DELIMITER', '(')) {
      this.recordError(
        'ERR_MISSING_PARENTHESIS',
        "Expected '(' after 'for'",
        this.peek().line,
        this.peek().column,
        ['('],
        this.peek().lexeme,
        'error',
        "Inserted virtual '('",
      );
    }

    let init: ASTNode | undefined;
    if (!this.check('DELIMITER', ';')) {
      if (this.peek().type === 'KEYWORD' && TYPE_KEYWORDS.has(this.peek().lexeme)) {
        const typeTok = this.advance();
        const idTok = this.advance();
        init = this.parseVarDeclTailNoSemi(typeTok, idTok);
      } else {
        init = this.parseExpression();
      }
    }
    this.matchOrInsertSemicolon('for init clause');

    let condition: ASTNode | undefined;
    if (!this.check('DELIMITER', ';')) {
      condition = this.parseExpression();
    }
    this.matchOrInsertSemicolon('for condition clause');

    let update: ASTNode | undefined;
    if (!this.check('DELIMITER', ')')) {
      update = this.parseExpression();
    }
    this.matchOrInsertClosingParen('for clauses');

    const body = this.parseStatement();
    const span = this.makeSpan(forTok, this.previous());
    this.exitRule();

    const children: ASTNode[] = [];
    if (init) children.push(init);
    if (condition) children.push(condition);
    if (update) children.push(update);
    children.push(body);

    return {
      id: this.genId('for'),
      type: 'ForStmt',
      init,
      condition,
      update,
      body,
      children,
      span,
    };
  }

  private parseVarDeclTailNoSemi(typeTok: Token, idTok: Token): VarDeclNode {
    this.enterRule('VarDeclNoSemi');
    let isArray = false;
    let arraySize: ASTNode | undefined;
    let init: ASTNode | undefined;

    if (this.match('DELIMITER', '[')) {
      isArray = true;
      if (!this.check('DELIMITER', ']')) {
        arraySize = this.parseExpression();
      }
      this.match('DELIMITER', ']');
    }

    if (this.match('OPERATOR', '=')) {
      init = this.parseExpression();
    }

    const span = this.makeSpan(typeTok, this.previous());
    this.exitRule();

    const children: ASTNode[] = [];
    if (arraySize) children.push(arraySize);
    if (init) children.push(init);

    return {
      id: this.genId('var'),
      type: 'VarDecl',
      varType: typeTok.lexeme,
      name: idTok.lexeme,
      init,
      isArray,
      arraySize,
      children,
      span,
    };
  }

  private parseReturnStmt(): ReturnStmtNode {
    this.enterRule('ReturnStmt');
    const retTok = this.advance();
    let value: ASTNode | undefined;

    if (!this.check('DELIMITER', ';')) {
      value = this.parseExpression();
    }

    this.matchOrInsertSemicolon('return statement');
    const span = this.makeSpan(retTok, this.previous());
    this.exitRule();

    return {
      id: this.genId('ret'),
      type: 'ReturnStmt',
      value,
      argument: value,
      children: value ? [value] : [],
      span,
    };
  }

  private parseBreakStmt(): BreakStmtNode {
    this.enterRule('BreakStmt');
    const tok = this.advance();
    this.matchOrInsertSemicolon('break statement');
    const span = this.makeSpan(tok, this.previous());
    this.exitRule();

    return {
      id: this.genId('break'),
      type: 'BreakStmt',
      children: [],
      span,
    };
  }

  private parseContinueStmt(): ContinueStmtNode {
    this.enterRule('ContinueStmt');
    const tok = this.advance();
    this.matchOrInsertSemicolon('continue statement');
    const span = this.makeSpan(tok, this.previous());
    this.exitRule();

    return {
      id: this.genId('continue'),
      type: 'ContinueStmt',
      children: [],
      span,
    };
  }

  private parseExprStmt(): ExprStmtNode {
    this.enterRule('ExprStmt');
    const expr = this.parseExpression();
    this.matchOrInsertSemicolon('expression statement');
    const span = { ...expr.span };
    this.exitRule();

    return {
      id: this.genId('exprstmt'),
      type: 'ExprStmt',
      expression: expr,
      children: [expr],
      span,
    };
  }

  // ==========================================
  // Pratt Expression Parser with Resilient Recovery
  // ==========================================

  public parseExpression(minPrec: Precedence = Precedence.NONE): ASTNode {
    this.enterRule('Expression');
    let left = this.parsePrefix();

    while (true) {
      const prec = this.getInfixPrecedence();
      if (prec === Precedence.NONE || prec < minPrec) break;

      left = this.parseInfix(left, prec);
    }

    this.exitRule();
    return left;
  }

  private parsePrefix(): ASTNode {
    const tok = this.peek();

    // Check for missing operand right away (e.g. semicolon, closing brace/paren, or comma)
    if (
      tok.type === 'DELIMITER' &&
      (tok.lexeme === ';' || tok.lexeme === '}' || tok.lexeme === ')' || tok.lexeme === ',')
    ) {
      this.recordError(
        'ERR_MISSING_OPERAND',
        'Expected expression operand',
        tok.line,
        tok.column,
        ['expression'],
        tok.lexeme,
        'error',
        'Created ErrorNode operand',
      );
      return {
        id: this.genId('err'),
        type: 'ErrorNode',
        message: 'Missing expression operand',
        unexpectedToken: tok.lexeme,
        children: [],
        span: this.makeSpan(tok),
      };
    }

    // Prefix unary operators: + - ! ~ ++ --
    if (tok.type === 'OPERATOR') {
      const isUnary = ['+', '-', '!', '~', '++', '--'].includes(tok.lexeme);
      if (isUnary) {
        this.enterRule('UnaryExpr');
        const opTok = this.advance();
        const argument = this.parseExpression(Precedence.PREFIX);
        const span = this.makeSpan(opTok, this.previous());
        this.exitRule();

        return {
          id: this.genId('unary'),
          type: 'UnaryExpr',
          operator: opTok.lexeme,
          argument,
          isPrefix: true,
          children: [argument],
          span,
        };
      }
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    const tok = this.peek();

    // Lexical error token recovery
    if (tok.type === 'ERROR') {
      const errTok = this.advance();
      return {
        id: this.genId('err_lex'),
        type: 'ErrorNode',
        message: errTok.message || `Lexical error: ${errTok.lexeme}`,
        unexpectedToken: errTok.lexeme,
        children: [],
        span: this.makeSpan(errTok),
      };
    }

    // 1. Identifiers
    if (this.match('IDENTIFIER')) {
      const prev = this.previous();
      return {
        id: this.genId('id'),
        type: 'Identifier',
        name: prev.lexeme,
        children: [],
        span: this.makeSpan(prev),
      };
    }

    // 2. Integer Literals
    if (this.match('INT_LITERAL')) {
      const prev = this.previous();
      const val =
        prev.lexeme.startsWith('0x') || prev.lexeme.startsWith('0X')
          ? parseInt(prev.lexeme, 16)
          : parseInt(prev.lexeme, 10);
      return this.createLiteralNode('int', val, prev.lexeme, prev);
    }

    // 3. Float Literals
    if (this.match('FLOAT_LITERAL')) {
      const prev = this.previous();
      const cleanLexeme = prev.lexeme.replace(/[fF]$/, '');
      return this.createLiteralNode('float', parseFloat(cleanLexeme), prev.lexeme, prev);
    }

    // 4. String Literals
    if (this.match('STRING_LITERAL')) {
      const prev = this.previous();
      const strVal = prev.lexeme.slice(1, -1);
      return this.createLiteralNode('string', strVal, prev.lexeme, prev);
    }

    // 5. Character Literals
    if (this.match('CHAR_LITERAL')) {
      const prev = this.previous();
      const chVal = prev.lexeme.slice(1, -1);
      return this.createLiteralNode('char', chVal, prev.lexeme, prev);
    }

    // 6. Boolean Literals
    if (this.match('KEYWORD', 'true')) {
      return this.createLiteralNode('bool', true, 'true', this.previous());
    }
    if (this.match('KEYWORD', 'false')) {
      return this.createLiteralNode('bool', false, 'false', this.previous());
    }

    // 7. Null Literal
    if (this.match('KEYWORD', 'null')) {
      return this.createLiteralNode('null', null, 'null', this.previous());
    }

    // 8. Grouped Expressions: ( expr )
    if (this.match('DELIMITER', '(')) {
      const expr = this.parseExpression(Precedence.NONE);
      this.matchOrInsertClosingParen('grouped expression');
      return expr;
    }

    // 9. Array Literal: { e1, e2, ... }
    if (this.match('DELIMITER', '{')) {
      const startTok = this.previous();
      const elements: ASTNode[] = [];
      if (!this.check('DELIMITER', '}')) {
        do {
          elements.push(this.parseExpression(Precedence.NONE));
        } while (this.match('DELIMITER', ','));
      }
      if (!this.match('DELIMITER', '}')) {
        this.recordError(
          'ERR_MISSING_BRACE',
          "Expected '}' in array literal",
          this.peek().line,
          this.peek().column,
          ['}'],
          this.peek().lexeme,
          'error',
          "Inserted virtual '}'",
        );
      }
      const span = this.makeSpan(startTok, this.previous());

      return {
        id: this.genId('arr_lit'),
        type: 'ArrayLiteral',
        elements,
        children: [...elements],
        span,
      };
    }

    // Fallback for unexpected token in primary expression
    const errTok = this.advance();
    this.recordError(
      'ERR_UNEXPECTED_TOKEN',
      `Unexpected token '${errTok.lexeme}' in expression`,
      errTok.line,
      errTok.column,
      ['literal', 'identifier', '('],
      errTok.lexeme,
      'error',
      'Created ErrorNode and continuing',
    );

    return {
      id: this.genId('err'),
      type: 'ErrorNode',
      message: `Unexpected token '${errTok.lexeme}' in expression`,
      unexpectedToken: errTok.lexeme,
      children: [],
      span: this.makeSpan(errTok),
    };
  }

  private createLiteralNode(
    literalType: LiteralType,
    value: any,
    raw: string,
    tok: Token,
  ): LiteralNode {
    return {
      id: this.genId('lit'),
      type: 'Literal',
      literalType,
      value,
      raw,
      children: [],
      span: this.makeSpan(tok),
    };
  }

  private getInfixPrecedence(): Precedence {
    const tok = this.peek();

    if (tok.type === 'OPERATOR') {
      if (ASSIGN_OPERATORS.has(tok.lexeme)) return Precedence.ASSIGNMENT;
      if (tok.lexeme === '||') return Precedence.OR;
      if (tok.lexeme === '&&') return Precedence.AND;
      if (tok.lexeme === '==' || tok.lexeme === '!=') return Precedence.EQUALITY;
      if (['<', '<=', '>', '>='].includes(tok.lexeme)) return Precedence.RELATIONAL;
      if (tok.lexeme === '+' || tok.lexeme === '-') return Precedence.ADDITIVE;
      if (tok.lexeme === '*' || tok.lexeme === '/' || tok.lexeme === '%')
        return Precedence.MULTIPLICATIVE;
      if (tok.lexeme === '++' || tok.lexeme === '--') return Precedence.POSTFIX;
    }

    if (tok.type === 'DELIMITER') {
      if (tok.lexeme === '(' || tok.lexeme === '[') return Precedence.POSTFIX;
    }

    return Precedence.NONE;
  }

  private parseInfix(left: ASTNode, prec: Precedence): ASTNode {
    const tok = this.peek();

    // 1. Postfix Function Call: left(arg1, arg2)
    if (tok.type === 'DELIMITER' && tok.lexeme === '(') {
      this.advance();
      const args: ASTNode[] = [];
      if (!this.check('DELIMITER', ')')) {
        do {
          args.push(this.parseExpression(Precedence.NONE));
        } while (this.match('DELIMITER', ','));
      }
      this.matchOrInsertClosingParen('call arguments');
      const span: ASTSpan = {
        startLine: left.span.startLine,
        startCol: left.span.startCol,
        endLine: this.previous().line,
        endCol: this.previous().column + this.previous().lexeme.length,
      };

      return {
        id: this.genId('call'),
        type: 'CallExpr',
        callee: left,
        args,
        children: [left, ...args],
        span,
      };
    }

    // 2. Postfix Array Indexing: left[index]
    if (tok.type === 'DELIMITER' && tok.lexeme === '[') {
      this.advance();
      const index = this.parseExpression(Precedence.NONE);
      if (!this.match('DELIMITER', ']')) {
        this.recordError(
          'ERR_UNBALANCED_BRACKET',
          "Expected ']' after index expression",
          this.peek().line,
          this.peek().column,
          [']'],
          this.peek().lexeme,
          'error',
          "Inserted virtual ']'",
        );
      }
      const span: ASTSpan = {
        startLine: left.span.startLine,
        startCol: left.span.startCol,
        endLine: this.previous().line,
        endCol: this.previous().column + this.previous().lexeme.length,
      };

      return {
        id: this.genId('index'),
        type: 'IndexExpr',
        target: left,
        index,
        children: [left, index],
        span,
      };
    }

    // 3. Postfix Increment / Decrement: left++ or left--
    if (tok.type === 'OPERATOR' && (tok.lexeme === '++' || tok.lexeme === '--')) {
      const opTok = this.advance();
      const span: ASTSpan = {
        startLine: left.span.startLine,
        startCol: left.span.startCol,
        endLine: opTok.line,
        endCol: opTok.column + opTok.lexeme.length,
      };

      return {
        id: this.genId('unary_post'),
        type: 'UnaryExpr',
        operator: opTok.lexeme,
        argument: left,
        isPrefix: false,
        children: [left],
        span,
      };
    }

    // 4. Assignment: left = right, left += right, etc. (Right-associative)
    if (tok.type === 'OPERATOR' && ASSIGN_OPERATORS.has(tok.lexeme)) {
      const opTok = this.advance();
      const value = this.parseExpression(Precedence.ASSIGNMENT);
      const span: ASTSpan = {
        startLine: left.span.startLine,
        startCol: left.span.startCol,
        endLine: value.span.endLine,
        endCol: value.span.endCol,
      };

      return {
        id: this.genId('assign'),
        type: 'AssignExpr',
        operator: opTok.lexeme,
        target: left,
        value,
        children: [left, value],
        span,
      };
    }

    // 5. Binary Operators: left-associative -> right parsed at prec + 1
    const opTok = this.advance();
    const right = this.parseExpression(prec + 1);
    const span: ASTSpan = {
      startLine: left.span.startLine,
      startCol: left.span.startCol,
      endLine: right.span.endLine,
      endCol: right.span.endCol,
    };

    return {
      id: this.genId('bin'),
      type: 'BinaryExpr',
      operator: opTok.lexeme,
      left,
      right,
      children: [left, right],
      span,
    };
  }
}

/**
 * Convenience parse entry point.
 */
export function parse(source: string): ParseResult {
  const parser = new Parser();
  return parser.parse(source);
}
