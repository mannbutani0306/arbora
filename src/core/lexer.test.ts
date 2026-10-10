import { describe, it, expect } from 'vitest';
import { Lexer, lex, tokenize, MINIC_KEYWORDS } from './lexer';
import { Token } from '../types/ast';

describe('MiniC Lexer', () => {
  // Helper to extract token types and lexemes
  const simplify = (tokens: Token[]) =>
    tokens
      .filter((t) => t.type !== 'EOF')
      .map((t) => ({ type: t.type, lexeme: t.lexeme }));

  describe('1. Valid MiniC Language Constructs', () => {
    it('tokenizes all MiniC primitive types and variable declarations', () => {
      const code = `
        int count = 10;
        float pi = 3.14;
        bool active = true;
        string msg = "hello";
        char flag = 'c';
        void noop;
      `;
      const res = lex(code);
      expect(res.errors).toHaveLength(0);

      const types = simplify(res.tokens);
      expect(types[0]).toEqual({ type: 'KEYWORD', lexeme: 'int' });
      expect(types[1]).toEqual({ type: 'IDENTIFIER', lexeme: 'count' });
      expect(types[2]).toEqual({ type: 'OPERATOR', lexeme: '=' });
      expect(types[3]).toEqual({ type: 'INT_LITERAL', lexeme: '10' });
      expect(types[4]).toEqual({ type: 'DELIMITER', lexeme: ';' });

      expect(types[5]).toEqual({ type: 'KEYWORD', lexeme: 'float' });
      expect(types[8]).toEqual({ type: 'FLOAT_LITERAL', lexeme: '3.14' });

      expect(types[10]).toEqual({ type: 'KEYWORD', lexeme: 'bool' });
      expect(types[13]).toEqual({ type: 'KEYWORD', lexeme: 'true' });

      expect(types[15]).toEqual({ type: 'KEYWORD', lexeme: 'string' });
      expect(types[18]).toEqual({ type: 'STRING_LITERAL', lexeme: '"hello"' });

      expect(types[20]).toEqual({ type: 'KEYWORD', lexeme: 'char' });
      expect(types[23]).toEqual({ type: 'CHAR_LITERAL', lexeme: "'c'" });

      expect(types[25]).toEqual({ type: 'KEYWORD', lexeme: 'void' });
    });

    it('tokenizes functions with parameters and return statements', () => {
      const code = 'int add(int a, float b) { return a + b; }';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);

      const expected = [
        { type: 'KEYWORD', lexeme: 'int' },
        { type: 'IDENTIFIER', lexeme: 'add' },
        { type: 'DELIMITER', lexeme: '(' },
        { type: 'KEYWORD', lexeme: 'int' },
        { type: 'IDENTIFIER', lexeme: 'a' },
        { type: 'DELIMITER', lexeme: ',' },
        { type: 'KEYWORD', lexeme: 'float' },
        { type: 'IDENTIFIER', lexeme: 'b' },
        { type: 'DELIMITER', lexeme: ')' },
        { type: 'DELIMITER', lexeme: '{' },
        { type: 'KEYWORD', lexeme: 'return' },
        { type: 'IDENTIFIER', lexeme: 'a' },
        { type: 'OPERATOR', lexeme: '+' },
        { type: 'IDENTIFIER', lexeme: 'b' },
        { type: 'DELIMITER', lexeme: ';' },
        { type: 'DELIMITER', lexeme: '}' },
      ];
      expect(simplify(res.tokens)).toEqual(expected);
    });

    it('tokenizes if, else, while, do-while, and for control flow', () => {
      const code = `
        if (x > 0) {
          x--;
        } else {
          x++;
        }
        while (x < 10) { x += 1; }
        do { x--; } while (x > 0);
        for (int i = 0; i < 5; i++) { break; continue; }
      `;
      const res = lex(code);
      expect(res.errors).toHaveLength(0);

      const keywords = res.tokens
        .filter((t) => t.type === 'KEYWORD')
        .map((t) => t.lexeme);
      expect(keywords).toEqual(
        expect.arrayContaining(['if', 'else', 'while', 'do', 'while', 'for', 'break', 'continue'])
      );
    });

    it('tokenizes array declaration and element indexing', () => {
      const code = 'int numbers[10]; numbers[0] = 42; numbers[i + 1] = numbers[i];';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);

      const brackets = res.tokens.filter(
        (t) => t.type === 'DELIMITER' && (t.lexeme === '[' || t.lexeme === ']')
      );
      expect(brackets).toHaveLength(8);
    });

    it('tokenizes multi-dimensional array access', () => {
      const code = 'matrix[row][col] = 100;';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      expect(simplify(res.tokens)).toEqual([
        { type: 'IDENTIFIER', lexeme: 'matrix' },
        { type: 'DELIMITER', lexeme: '[' },
        { type: 'IDENTIFIER', lexeme: 'row' },
        { type: 'DELIMITER', lexeme: ']' },
        { type: 'DELIMITER', lexeme: '[' },
        { type: 'IDENTIFIER', lexeme: 'col' },
        { type: 'DELIMITER', lexeme: ']' },
        { type: 'OPERATOR', lexeme: '=' },
        { type: 'INT_LITERAL', lexeme: '100' },
        { type: 'DELIMITER', lexeme: ';' },
      ]);
    });

    it('tokenizes arithmetic operators (+, -, *, /, %)', () => {
      const code = 'a + b - c * d / e % f;';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const ops = res.tokens.filter((t) => t.type === 'OPERATOR').map((t) => t.lexeme);
      expect(ops).toEqual(['+', '-', '*', '/', '%']);
    });

    it('tokenizes increment and decrement operators (++, --)', () => {
      const code = '++x; x++; --y; y--;';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const ops = res.tokens.filter((t) => t.type === 'OPERATOR').map((t) => t.lexeme);
      expect(ops).toEqual(['++', '++', '--', '--']);
    });

    it('tokenizes compound assignment operators (+=, -=, *=, /=, %=)', () => {
      const code = 'a += 1; b -= 2; c *= 3; d /= 4; e %= 5;';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const ops = res.tokens.filter((t) => t.type === 'OPERATOR').map((t) => t.lexeme);
      expect(ops).toEqual(['+=', '-=', '*=', '/=', '%=']);
    });

    it('tokenizes relational and equality operators (==, !=, <, <=, >, >=)', () => {
      const code = 'a == b; c != d; e < f; g <= h; i > j; k >= l;';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const ops = res.tokens.filter((t) => t.type === 'OPERATOR').map((t) => t.lexeme);
      expect(ops).toEqual(['==', '!=', '<', '<=', '>', '>=']);
    });

    it('tokenizes logical and bitwise operators (&&, ||, !, &, |, ^, ~, <<, >>)', () => {
      const code = 'a && b || !c; d & e | f ^ ~g; x << 2; y >> 3;';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const ops = res.tokens.filter((t) => t.type === 'OPERATOR').map((t) => t.lexeme);
      expect(ops).toEqual(['&&', '||', '!', '&', '|', '^', '~', '<<', '>>']);
    });

    it('tokenizes strings with escape sequences', () => {
      const code = '"line1\\nline2\\t\\"escaped\\""';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      expect(res.tokens[0].type).toBe('STRING_LITERAL');
      expect(res.tokens[0].lexeme).toBe('"line1\\nline2\\t\\"escaped\\""');
    });

    it('tokenizes character literals with escape characters', () => {
      const code = "'\\n' '\\t' '\\\\' '\\'' '0'";
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const chars = res.tokens.filter((t) => t.type === 'CHAR_LITERAL').map((t) => t.lexeme);
      expect(chars).toEqual(["'\\n'", "'\\t'", "'\\\\'", "'\\''", "'0'"]);
    });

    it('tokenizes float literals in various notations', () => {
      const code = '3.14 0.001 .5 1e10 2.5e-3 4.2E+2 10.0f';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const floats = res.tokens.filter((t) => t.type === 'FLOAT_LITERAL').map((t) => t.lexeme);
      expect(floats).toEqual(['3.14', '0.001', '.5', '1e10', '2.5e-3', '4.2E+2', '10.0f']);
    });

    it('tokenizes hexadecimal integer literals', () => {
      const code = '0x0 0x1A 0xFF 0xDEADBEEF 0X12';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const hex = res.tokens.filter((t) => t.type === 'INT_LITERAL').map((t) => t.lexeme);
      expect(hex).toEqual(['0x0', '0x1A', '0xFF', '0xDEADBEEF', '0X12']);
    });

    it('skips single-line comments without altering adjacent tokens', () => {
      const code = `
        int x = 1; // this is a single line comment
        int y = 2;
      `;
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      expect(simplify(res.tokens)).toEqual([
        { type: 'KEYWORD', lexeme: 'int' },
        { type: 'IDENTIFIER', lexeme: 'x' },
        { type: 'OPERATOR', lexeme: '=' },
        { type: 'INT_LITERAL', lexeme: '1' },
        { type: 'DELIMITER', lexeme: ';' },
        { type: 'KEYWORD', lexeme: 'int' },
        { type: 'IDENTIFIER', lexeme: 'y' },
        { type: 'OPERATOR', lexeme: '=' },
        { type: 'INT_LITERAL', lexeme: '2' },
        { type: 'DELIMITER', lexeme: ';' },
      ]);
    });

    it('skips multi-line comments spanning multiple lines', () => {
      const code = `
        int a = 5;
        /* Block comment
           second line
           third line */
        int b = 10;
      `;
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const idents = res.tokens.filter((t) => t.type === 'IDENTIFIER').map((t) => t.lexeme);
      expect(idents).toEqual(['a', 'b']);
      // Check that b has accurate line number (line 6)
      const tokenB = res.tokens.find((t) => t.lexeme === 'b');
      expect(tokenB?.line).toBe(6);
    });
  });

  describe('2. Longest-Match Operator & Identifier Rules', () => {
    it('applies longest-match for a+++b', () => {
      const res = lex('a+++b');
      expect(simplify(res.tokens)).toEqual([
        { type: 'IDENTIFIER', lexeme: 'a' },
        { type: 'OPERATOR', lexeme: '++' },
        { type: 'OPERATOR', lexeme: '+' },
        { type: 'IDENTIFIER', lexeme: 'b' },
      ]);
    });

    it('applies longest-match for a---b', () => {
      const res = lex('a---b');
      expect(simplify(res.tokens)).toEqual([
        { type: 'IDENTIFIER', lexeme: 'a' },
        { type: 'OPERATOR', lexeme: '--' },
        { type: 'OPERATOR', lexeme: '-' },
        { type: 'IDENTIFIER', lexeme: 'b' },
      ]);
    });

    it('applies longest-match for +=, -=, ==, !=, <=, >=, <<, >>', () => {
      const res = lex('a+=b-=c==d!=e<=f>=g<<h>>i');
      const ops = res.tokens.filter((t) => t.type === 'OPERATOR').map((t) => t.lexeme);
      expect(ops).toEqual(['+=', '-=', '==', '!=', '<=', '>=', '<<', '>>']);
    });

    it('distinguishes keywords from identifiers with keyword prefixes', () => {
      const code = 'int integer float floating bool boolean for forever while awhile';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);

      const items = simplify(res.tokens);
      expect(items[0]).toEqual({ type: 'KEYWORD', lexeme: 'int' });
      expect(items[1]).toEqual({ type: 'IDENTIFIER', lexeme: 'integer' });
      expect(items[2]).toEqual({ type: 'KEYWORD', lexeme: 'float' });
      expect(items[3]).toEqual({ type: 'IDENTIFIER', lexeme: 'floating' });
      expect(items[4]).toEqual({ type: 'KEYWORD', lexeme: 'bool' });
      expect(items[5]).toEqual({ type: 'IDENTIFIER', lexeme: 'boolean' });
      expect(items[6]).toEqual({ type: 'KEYWORD', lexeme: 'for' });
      expect(items[7]).toEqual({ type: 'IDENTIFIER', lexeme: 'forever' });
      expect(items[8]).toEqual({ type: 'KEYWORD', lexeme: 'while' });
      expect(items[9]).toEqual({ type: 'IDENTIFIER', lexeme: 'awhile' });
    });

    it('handles identifiers with leading underscores and digits', () => {
      const code = '_privateVar __internal _0123 node_42';
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      const idents = res.tokens.filter((t) => t.type === 'IDENTIFIER').map((t) => t.lexeme);
      expect(idents).toEqual(['_privateVar', '__internal', '_0123', 'node_42']);
    });
  });

  describe('3. Line, Column, and Position Tracking', () => {
    it('produces accurate 1-based line/column and 0-based start/end indices', () => {
      const source = 'int  val\n  = 42;';
      const res = lex(source);

      // 'int': line 1, col 1, start 0, end 3
      const tInt = res.tokens[0];
      expect(tInt.lexeme).toBe('int');
      expect(tInt.line).toBe(1);
      expect(tInt.column).toBe(1);
      expect(tInt.start).toBe(0);
      expect(tInt.end).toBe(3);

      // 'val': line 1, col 6, start 5, end 8
      const tVal = res.tokens[1];
      expect(tVal.lexeme).toBe('val');
      expect(tVal.line).toBe(1);
      expect(tVal.column).toBe(6);
      expect(tVal.start).toBe(5);
      expect(tVal.end).toBe(8);

      // '=': line 2, col 3, start 11, end 12
      const tEq = res.tokens[2];
      expect(tEq.lexeme).toBe('=');
      expect(tEq.line).toBe(2);
      expect(tEq.column).toBe(3);
      expect(tEq.start).toBe(11);
      expect(tEq.end).toBe(12);

      // '42': line 2, col 5, start 13, end 15
      const tNum = res.tokens[3];
      expect(tNum.lexeme).toBe('42');
      expect(tNum.line).toBe(2);
      expect(tNum.column).toBe(5);
      expect(tNum.start).toBe(13);
      expect(tNum.end).toBe(15);
    });

    it('handles empty string cleanly by emitting single EOF token', () => {
      const res = lex('');
      expect(res.tokens).toHaveLength(1);
      expect(res.tokens[0]).toEqual(
        expect.objectContaining({
          type: 'EOF',
          lexeme: '',
          line: 1,
          column: 1,
          start: 0,
          end: 0,
        })
      );
      expect(res.errors).toHaveLength(0);
    });

    it('handles pure whitespace and newlines cleanly', () => {
      const res = lex('   \n\t  \n   ');
      expect(res.tokens).toHaveLength(1);
      expect(res.tokens[0].type).toBe('EOF');
      expect(res.tokens[0].line).toBe(3);
    });
  });

  describe('4. Lexer Animation Trace', () => {
    it('returns trace steps recording char range, state, and emitted tokens', () => {
      const code = 'int x = 5;';
      const res = lex(code);

      expect(res.trace.length).toBeGreaterThan(0);
      // First trace step corresponds to emitting KEYWORD
      const keywordStep = res.trace.find((s) => s.state === 'KEYWORD');
      expect(keywordStep).toBeDefined();
      expect(keywordStep?.charRange).toEqual({ start: 0, end: 3 });
      expect(keywordStep?.token?.lexeme).toBe('int');

      // Check whitespace step recorded
      const wsStep = res.trace.find((s) => s.state === 'WHITESPACE');
      expect(wsStep).toBeDefined();

      // Check EOF step is final trace
      const lastStep = res.trace[res.trace.length - 1];
      expect(lastStep.state).toBe('EOF');
    });

    it('supports Lexer class instantiation and reset', () => {
      const lexer = new Lexer('float x;');
      const run1 = lexer.tokenize();
      expect(run1.tokens.length).toBe(4); // float, x, ;, EOF

      lexer.reset();
      const t1 = lexer.nextToken();
      expect(t1.lexeme).toBe('float');
      const t2 = lexer.nextToken();
      expect(t2.lexeme).toBe('x');
    });
  });

  describe('5. Error Recovery & Malformed Input (Never Throws)', () => {
    it('never throws on unterminated string literal at EOF and emits ERROR token', () => {
      expect(() => {
        const res = lex('string s = "unclosed string');
        expect(res.errors).toHaveLength(1);
        expect(res.errors[0].type).toBe('ERROR');
        expect(res.errors[0].message).toBe('Unterminated string literal');
        expect(res.errors[0].lexeme).toBe('"unclosed string');
      }).not.toThrow();
    });

    it('emits ERROR on unterminated string on newline and recovers on next line', () => {
      const code = 'string a = "broken\nint valid = 10;';
      const res = lex(code);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].message).toBe('Unterminated string literal');

      // Second line should still tokenize cleanly
      const validToken = res.tokens.find((t) => t.lexeme === 'valid');
      expect(validToken).toBeDefined();
      expect(validToken?.type).toBe('IDENTIFIER');
    });

    it('emits ERROR for empty character literal', () => {
      const res = lex("char empty = '';");
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].message).toBe('Empty character literal');
      expect(res.errors[0].lexeme).toBe("''");
    });

    it('emits ERROR for unterminated character literal', () => {
      const res = lex("char c = 'a;");
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].message).toBe('Unterminated character literal');
    });

    it('emits ERROR for multi-character char literal', () => {
      const res = lex("char c = 'toolong';");
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].message).toBe('Character literal must contain exactly one character');
      expect(res.errors[0].lexeme).toBe("'toolong'");
    });

    it('emits ERROR on unterminated multi-line comment at EOF', () => {
      const code = '/* unclosed comment that runs until end of file';
      const res = lex(code);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].type).toBe('ERROR');
      expect(res.errors[0].message).toBe('Unterminated multi-line comment');
    });

    it('emits ERROR on unknown characters without stopping lexical scan', () => {
      const code = 'int @ x = $ 10 # ;';
      const res = lex(code);
      expect(res.errors).toHaveLength(3);
      expect(res.errors[0].lexeme).toBe('@');
      expect(res.errors[1].lexeme).toBe('$');
      expect(res.errors[2].lexeme).toBe('#');

      // Valid tokens surrounding errors are still emitted
      const validNames = res.tokens
        .filter((t) => t.type !== 'ERROR' && t.type !== 'EOF')
        .map((t) => t.lexeme);
      expect(validNames).toEqual(['int', 'x', '=', '10', ';']);
    });

    it('emits ERROR for malformed scientific float with missing exponent digits', () => {
      const res = lex('float bad = 1e;');
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].message).toBe('Scientific notation exponent requires digits');
    });

    it('emits ERROR for malformed hex literal missing hex digits', () => {
      const res = lex('int hex = 0x;');
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].message).toBe('Hexadecimal literal requires at least one hex digit');
    });

    it('handles multiple errors across a malformed program smoothly', () => {
      const code = `
        int #a = 10;
        string s = "forgot closing quote;
        char c = '';
        float f = 0x;
        /* unclosed block
      `;
      const res = lex(code);
      expect(res.errors.length).toBeGreaterThanOrEqual(5);
      // Check that EOF is still appended at the end
      expect(res.tokens[res.tokens.length - 1].type).toBe('EOF');
    });
  });

  describe('6. Full Programs & Integration', () => {
    it('tokenizes a complete MiniC factorial program correctly', () => {
      const code = `
        // Recursive factorial implementation in MiniC
        int factorial(int n) {
          if (n <= 1) {
            return 1;
          }
          return n * factorial(n - 1);
        }

        int main() {
          int result = factorial(5);
          return 0;
        }
      `;
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      expect(res.tokens.length).toBeGreaterThan(30);

      const fnNames = res.tokens
        .filter((t) => t.type === 'IDENTIFIER')
        .map((t) => t.lexeme);
      expect(fnNames).toContain('factorial');
      expect(fnNames).toContain('main');
    });

    it('tokenizes a complete MiniC bubble sort with arrays', () => {
      const code = `
        void bubbleSort(int arr[], int n) {
          for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
              if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
              }
            }
          }
        }
      `;
      const res = lex(code);
      expect(res.errors).toHaveLength(0);
      expect(res.tokens.filter((t) => t.lexeme === 'bubbleSort')).toHaveLength(1);
    });

    it('supports tokenize helper returning Token array', () => {
      const tokens = tokenize('int answer = 42;');
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.map((t) => t.lexeme)).toEqual(['int', 'answer', '=', '42', ';', '']);
    });
  });
});
