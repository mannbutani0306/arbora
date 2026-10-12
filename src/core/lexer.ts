/**
 * Hand-written Lexer for the "MiniC" language.
 *
 * MiniC features:
 * - Types: int, float, bool, string, char, void
 * - Variables & control flow: if/else, while, for, do-while, break, continue, return
 * - Arithmetic, comparison, logical, compound assignment, increment/decrement operators
 * - Functions, parameters, calls, arrays (declaration, indexing)
 * - Single-line (//) and multi-line comments (/* ... *\/)
 * - String literals and character literals with escape sequences
 * - Never throws: Unknown characters, unterminated strings, and unclosed comments
 *   are emitted as ERROR tokens with descriptive messages.
 * - Longest-match multi-character operators with 1-based line/col & 0-based start/end indices.
 * - Records a full lexer trace (char range, state, token produced) for UI step visualization.
 */

import { LexerTraceStep, LexResult, Token, TokenType } from '../types/ast';

export const MINIC_KEYWORDS = new Set<string>([
  'int',
  'float',
  'bool',
  'string',
  'char',
  'void',
  'if',
  'else',
  'while',
  'for',
  'do',
  'break',
  'continue',
  'return',
  'true',
  'false',
  'null',
  'fn',
  'function',
]);

const DELIMITERS = new Set<string>(['(', ')', '{', '}', '[', ']', ';', ',', ':', '.']);

export class Lexer {
  private readonly source: string;
  private readonly length: number;
  private index: number = 0;
  private line: number = 1;
  private column: number = 1;

  private readonly tokens: Token[] = [];
  private readonly errors: Token[] = [];
  private readonly trace: LexerTraceStep[] = [];
  private stepCounter: number = 0;

  constructor(source: string) {
    this.source = source;
    this.length = source.length;
  }

  /**
   * Resets the lexer state to re-tokenize from the beginning.
   */
  public reset(): void {
    this.index = 0;
    this.line = 1;
    this.column = 1;
    this.tokens.length = 0;
    this.errors.length = 0;
    this.trace.length = 0;
    this.stepCounter = 0;
  }

  /**
   * Runs complete lexical analysis and returns tokens, errors, and animation trace.
   */
  public tokenize(): LexResult {
    this.reset();

    while (!this.isAtEnd()) {
      this.scanToken();
    }

    // Emit final EOF token
    const eofToken = this.createToken('EOF', '', this.index, this.index, this.line, this.column);
    this.tokens.push(eofToken);
    this.addTraceStep('EOF', 'Reached end of input', { start: this.index, end: this.index }, eofToken);

    return {
      tokens: [...this.tokens],
      errors: [...this.errors],
      trace: [...this.trace],
    };
  }

  /**
   * Tokenizes next single token.
   */
  public nextToken(): Token {
    const prevCount = this.tokens.length;
    while (!this.isAtEnd() && this.tokens.length === prevCount) {
      this.scanToken();
    }

    if (this.tokens.length > prevCount) {
      return this.tokens[this.tokens.length - 1];
    }

    const eofToken = this.createToken('EOF', '', this.index, this.index, this.line, this.column);
    this.tokens.push(eofToken);
    return eofToken;
  }

  public getTrace(): LexerTraceStep[] {
    return [...this.trace];
  }

  private isAtEnd(): boolean {
    return this.index >= this.length;
  }

  private peek(): string {
    return this.isAtEnd() ? '\0' : this.source[this.index];
  }

  private peekNext(): string {
    return this.index + 1 >= this.length ? '\0' : this.source[this.index + 1];
  }

  private advance(): string {
    const ch = this.source[this.index];
    this.index++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd() || this.source[this.index] !== expected) {
      return false;
    }
    this.advance();
    return true;
  }

  private addTraceStep(
    state: string,
    action: string,
    charRange: { start: number; end: number },
    token?: Token,
    line: number = this.line,
    column: number = this.column
  ): void {
    this.trace.push({
      stepIndex: this.stepCounter++,
      charRange,
      state,
      action,
      token,
      line,
      column,
    });
  }

  private createToken(
    type: TokenType,
    lexeme: string,
    start: number,
    end: number,
    line: number,
    column: number,
    message?: string
  ): Token {
    return {
      type,
      lexeme,
      line,
      column,
      start,
      end,
      message,
      // Compatibility fields for AST parser
      value: lexeme,
      span: {
        start: { line, column },
        end: {
          line: this.line,
          column: this.column,
        },
      },
    };
  }

  private emitToken(
    type: TokenType,
    lexeme: string,
    start: number,
    end: number,
    line: number,
    column: number,
    message?: string
  ): Token {
    const token = this.createToken(type, lexeme, start, end, line, column, message);
    this.tokens.push(token);

    if (type === 'ERROR') {
      this.errors.push(token);
      this.addTraceStep('ERROR', message || `Lexical error: ${lexeme}`, { start, end }, token, line, column);
    } else {
      this.addTraceStep(type, `Emitted ${type} '${lexeme}'`, { start, end }, token, line, column);
    }

    return token;
  }

  private scanToken(): void {
    const start = this.index;
    const startLine = this.line;
    const startColumn = this.column;
    const ch = this.peek();

    // 1. Whitespace handling
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      this.advance();
      // Group contiguous whitespace
      while (
        !this.isAtEnd() &&
        (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\r' || this.peek() === '\n')
      ) {
        this.advance();
      }
      this.addTraceStep('WHITESPACE', 'Skipped whitespace', { start, end: this.index }, undefined, startLine, startColumn);
      return;
    }

    if (ch === '#') {
      const lineStart = this.source.lastIndexOf('\n', this.index - 1) + 1;
      const linePrefix = this.source.slice(lineStart, this.index);
      const directive = this.source.slice(this.index);
      if (/^[ \t]*$/.test(linePrefix) && /^#[ \t]*include(?:[ \t<"])/.test(directive)) {
        while (!this.isAtEnd() && this.peek() !== '\n') this.advance();
        this.addTraceStep(
          'PREPROCESSOR',
          'Skipped #include directive',
          { start, end: this.index },
          undefined,
          startLine,
          startColumn
        );
        return;
      }
    }

    // 2. Comments or Division Operator
    if (ch === '/') {
      if (this.peekNext() === '/') {
        // Single-line comment: // ...
        this.advance(); // consume '/'
        this.advance(); // consume '/'
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
        this.addTraceStep(
          'COMMENT',
          'Skipped single-line comment',
          { start, end: this.index },
          undefined,
          startLine,
          startColumn
        );
        return;
      }

      if (this.peekNext() === '*') {
        // Multi-line comment: /* ... */
        this.advance(); // consume '/'
        this.advance(); // consume '*'

        while (!this.isAtEnd()) {
          if (this.peek() === '*' && this.peekNext() === '/') {
            this.advance(); // consume '*'
            this.advance(); // consume '/'
            this.addTraceStep(
              'COMMENT',
              'Skipped multi-line comment',
              { start, end: this.index },
              undefined,
              startLine,
              startColumn
            );
            return;
          }
          this.advance();
        }

        // Unterminated multi-line comment reaching EOF
        const raw = this.source.slice(start, this.index);
        this.emitToken(
          'ERROR',
          raw,
          start,
          this.index,
          startLine,
          startColumn,
          'Unterminated multi-line comment'
        );
        return;
      }

      // Compound assignment /=
      this.advance();
      if (this.match('=')) {
        this.emitToken('OPERATOR', '/=', start, this.index, startLine, startColumn);
        return;
      }
      // Simple /
      this.emitToken('OPERATOR', '/', start, this.index, startLine, startColumn);
      return;
    }

    // 3. String Literals ("...")
    if (ch === '"') {
      this.scanStringLiteral(start, startLine, startColumn);
      return;
    }

    // 4. Character Literals ('...')
    if (ch === "'") {
      this.scanCharLiteral(start, startLine, startColumn);
      return;
    }

    // 5. Number Literals (Integer or Float, including .5 if starting with dot and followed by digit)
    if (this.isDigit(ch) || (ch === '.' && this.isDigit(this.peekNext()))) {
      this.scanNumber(start, startLine, startColumn);
      return;
    }

    // 6. Delimiters
    if (DELIMITERS.has(ch)) {
      this.advance();
      this.emitToken('DELIMITER', ch, start, this.index, startLine, startColumn);
      return;
    }

    // 7. Identifiers and Keywords
    if (this.isAlphaOrUnderscore(ch)) {
      this.scanIdentifier(start, startLine, startColumn);
      return;
    }

    // 8. Operators with Longest Match
    if (this.scanOperator(start, startLine, startColumn)) {
      return;
    }

    // 9. Unknown character -> ERROR token, advance by 1
    const unknownChar = this.advance();
    this.emitToken(
      'ERROR',
      unknownChar,
      start,
      this.index,
      startLine,
      startColumn,
      `Unexpected character '${unknownChar}'`
    );
  }

  private scanStringLiteral(start: number, startLine: number, startColumn: number): void {
    this.advance(); // consume opening quote

    while (!this.isAtEnd()) {
      const ch = this.peek();

      // Unterminated string on unescaped newline
      if (ch === '\n') {
        const raw = this.source.slice(start, this.index);
        this.emitToken('ERROR', raw, start, this.index, startLine, startColumn, 'Unterminated string literal');
        return;
      }

      // Closing quote
      if (ch === '"') {
        this.advance();
        const raw = this.source.slice(start, this.index);
        this.emitToken('STRING_LITERAL', raw, start, this.index, startLine, startColumn);
        return;
      }

      // Escape sequence
      if (ch === '\\') {
        this.advance(); // consume '\'
        if (!this.isAtEnd()) {
          this.advance(); // consume escaped char
        }
        continue;
      }

      this.advance();
    }

    // Reached EOF without closing quote
    const raw = this.source.slice(start, this.index);
    this.emitToken('ERROR', raw, start, this.index, startLine, startColumn, 'Unterminated string literal');
  }

  private scanCharLiteral(start: number, startLine: number, startColumn: number): void {
    this.advance(); // consume opening single quote

    // Empty character literal ''
    if (this.peek() === "'") {
      this.advance();
      this.emitToken('ERROR', "''", start, this.index, startLine, startColumn, 'Empty character literal');
      return;
    }

    // Unterminated on newline or EOF
    if (this.isAtEnd() || this.peek() === '\n') {
      const raw = this.source.slice(start, this.index);
      this.emitToken('ERROR', raw, start, this.index, startLine, startColumn, 'Unterminated character literal');
      return;
    }

    // Scan char content (single character or escape sequence)
    if (this.peek() === '\\') {
      this.advance(); // consume '\'
      if (!this.isAtEnd() && this.peek() !== '\n') {
        this.advance(); // consume escaped char
      }
    } else {
      this.advance();
    }

    // Check if properly closed
    if (this.peek() === "'") {
      this.advance(); // consume closing quote
      const raw = this.source.slice(start, this.index);
      this.emitToken('CHAR_LITERAL', raw, start, this.index, startLine, startColumn);
      return;
    }

    // Check for multi-character literal like 'abc'
    while (!this.isAtEnd() && this.peek() !== "'" && this.peek() !== '\n') {
      this.advance();
    }

    if (this.peek() === "'") {
      this.advance(); // consume closing quote
      const raw = this.source.slice(start, this.index);
      this.emitToken(
        'ERROR',
        raw,
        start,
        this.index,
        startLine,
        startColumn,
        'Character literal must contain exactly one character'
      );
      return;
    }

    const raw = this.source.slice(start, this.index);
    this.emitToken('ERROR', raw, start, this.index, startLine, startColumn, 'Unterminated character literal');
  }

  private scanNumber(start: number, startLine: number, startColumn: number): void {
    let isFloat = false;

    // Check for Hexadecimal: 0x... or 0X...
    if (this.peek() === '0' && (this.peekNext() === 'x' || this.peekNext() === 'X')) {
      this.advance(); // consume '0'
      this.advance(); // consume 'x' or 'X'
      let hexDigitsCount = 0;
      while (!this.isAtEnd() && this.isHexDigit(this.peek())) {
        this.advance();
        hexDigitsCount++;
      }

      if (hexDigitsCount === 0) {
        const raw = this.source.slice(start, this.index);
        this.emitToken(
          'ERROR',
          raw,
          start,
          this.index,
          startLine,
          startColumn,
          'Hexadecimal literal requires at least one hex digit'
        );
        return;
      }

      const raw = this.source.slice(start, this.index);
      this.emitToken('INT_LITERAL', raw, start, this.index, startLine, startColumn);
      return;
    }

    // Digits before dot
    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      this.advance();
    }

    // Fractional dot: e.g. 3.14 or .5
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      isFloat = true;
      this.advance(); // consume '.'
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        this.advance();
      }
    } else if (this.peek() === '.' && (this.peekNext() === 'e' || this.peekNext() === 'E')) {
      isFloat = true;
      this.advance(); // consume '.'
    }

    // Scientific notation: e.g. 1e10, 3.14e-5
    if (this.peek() === 'e' || this.peek() === 'E') {
      isFloat = true;
      this.advance(); // consume 'e' or 'E'

      if (this.peek() === '+' || this.peek() === '-') {
        this.advance();
      }

      let expDigits = 0;
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        this.advance();
        expDigits++;
      }

      if (expDigits === 0) {
        const raw = this.source.slice(start, this.index);
        this.emitToken(
          'ERROR',
          raw,
          start,
          this.index,
          startLine,
          startColumn,
          'Scientific notation exponent requires digits'
        );
        return;
      }
    }

    // Optional float literal suffix: 'f' or 'F' (e.g., 3.14f, 10f)
    if (this.peek() === 'f' || this.peek() === 'F') {
      isFloat = true;
      this.advance();
    }

    const raw = this.source.slice(start, this.index);
    const tokenType: TokenType = isFloat ? 'FLOAT_LITERAL' : 'INT_LITERAL';
    this.emitToken(tokenType, raw, start, this.index, startLine, startColumn);
  }

  private scanIdentifier(start: number, startLine: number, startColumn: number): void {
    while (!this.isAtEnd() && this.isAlphaNumericOrUnderscore(this.peek())) {
      this.advance();
    }

    const lexeme = this.source.slice(start, this.index);
    const isKeyword = MINIC_KEYWORDS.has(lexeme);
    const type: TokenType = isKeyword ? 'KEYWORD' : 'IDENTIFIER';

    this.emitToken(type, lexeme, start, this.index, startLine, startColumn);
  }

  /**
   * Scans operators using greedy longest-match.
   */
  private scanOperator(start: number, startLine: number, startColumn: number): boolean {
    const ch = this.peek();

    switch (ch) {
      case '+': {
        this.advance();
        if (this.match('+')) {
          this.emitToken('OPERATOR', '++', start, this.index, startLine, startColumn);
        } else if (this.match('=')) {
          this.emitToken('OPERATOR', '+=', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '+', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '-': {
        this.advance();
        if (this.match('-')) {
          this.emitToken('OPERATOR', '--', start, this.index, startLine, startColumn);
        } else if (this.match('=')) {
          this.emitToken('OPERATOR', '-=', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '-', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '*': {
        this.advance();
        if (this.match('=')) {
          this.emitToken('OPERATOR', '*=', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '*', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '%': {
        this.advance();
        if (this.match('=')) {
          this.emitToken('OPERATOR', '%=', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '%', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '=': {
        this.advance();
        if (this.match('=')) {
          this.emitToken('OPERATOR', '==', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '=', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '!': {
        this.advance();
        if (this.match('=')) {
          this.emitToken('OPERATOR', '!=', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '!', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '<': {
        this.advance();
        if (this.match('=')) {
          this.emitToken('OPERATOR', '<=', start, this.index, startLine, startColumn);
        } else if (this.match('<')) {
          this.emitToken('OPERATOR', '<<', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '<', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '>': {
        this.advance();
        if (this.match('=')) {
          this.emitToken('OPERATOR', '>=', start, this.index, startLine, startColumn);
        } else if (this.match('>')) {
          this.emitToken('OPERATOR', '>>', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '>', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '&': {
        this.advance();
        if (this.match('&')) {
          this.emitToken('OPERATOR', '&&', start, this.index, startLine, startColumn);
        } else if (this.match('=')) {
          this.emitToken('OPERATOR', '&=', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '&', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '|': {
        this.advance();
        if (this.match('|')) {
          this.emitToken('OPERATOR', '||', start, this.index, startLine, startColumn);
        } else if (this.match('=')) {
          this.emitToken('OPERATOR', '|=', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '|', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '^': {
        this.advance();
        if (this.match('=')) {
          this.emitToken('OPERATOR', '^=', start, this.index, startLine, startColumn);
        } else {
          this.emitToken('OPERATOR', '^', start, this.index, startLine, startColumn);
        }
        return true;
      }
      case '~': {
        this.advance();
        this.emitToken('OPERATOR', '~', start, this.index, startLine, startColumn);
        return true;
      }
      default:
        return false;
    }
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isHexDigit(ch: string): boolean {
    return (
      (ch >= '0' && ch <= '9') ||
      (ch >= 'a' && ch <= 'f') ||
      (ch >= 'A' && ch <= 'F')
    );
  }

  private isAlphaOrUnderscore(ch: string): boolean {
    return (
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      ch === '_'
    );
  }

  private isAlphaNumericOrUnderscore(ch: string): boolean {
    return this.isAlphaOrUnderscore(ch) || this.isDigit(ch);
  }
}

/**
 * Convenience function for full lexical analysis of MiniC source code.
 */
export function lex(source: string): LexResult {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}

/**
 * Returns tokens array (compatible with both AST parser and direct lexer consumers).
 */
export function tokenize(source: string): Token[] {
  return lex(source).tokens;
}
