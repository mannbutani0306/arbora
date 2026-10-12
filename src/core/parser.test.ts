import { describe, it, expect } from 'vitest';
import { parse, Parser } from './parser';
import {
  astToBracketedString,
  astToDot,
  astToJSON,
  countNodes,
  getMaxDepth,
} from './astUtils';
import { getMiniCGrammar } from './grammar';
import {
  analyzeGrammar,
  exportGrammarAnalysisJSON,
} from './grammarAnalyzer';
import {
  AssignExprNode,
  BinaryExprNode,
  CallExprNode,
  ForStmtNode,
  FunctionDeclNode,
  IfStmtNode,
  IndexExprNode,
  UnaryExprNode,
  VarDeclNode,
} from '../types/ast';

describe('MiniC Recursive-Descent Parser & Grammar', () => {
  describe('1. Top-Level Program & Declarations', () => {
    it('parses multiple function declarations', () => {
      const code = `
        int add(int a, int b) { return a + b; }
        float sub(float x, float y) { return x - y; }
        void logMsg(string s) { return; }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      expect(result.ast.type).toBe('Program');
      expect(result.ast.declarations).toHaveLength(3);

      const fn1 = result.ast.declarations[0] as FunctionDeclNode;
      expect(fn1.type).toBe('FunctionDecl');
      expect(fn1.name).toBe('add');
      expect(fn1.returnType).toBe('int');
      expect(fn1.params).toHaveLength(2);
      expect(fn1.children).toHaveLength(3); // 2 params + 1 body
    });

    it('parses global variable declarations (uninitialized, initialized, arrays)', () => {
      const code = `
        int g1;
        float g2 = 3.14;
        bool flags[10];
        char buffer[];
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      expect(result.ast.declarations).toHaveLength(4);

      const v1 = result.ast.declarations[0] as VarDeclNode;
      expect(v1.name).toBe('g1');
      expect(v1.init).toBeUndefined();

      const v2 = result.ast.declarations[1] as VarDeclNode;
      expect(v2.name).toBe('g2');
      expect(v2.init).toBeDefined();

      const v3 = result.ast.declarations[2] as VarDeclNode;
      expect(v3.name).toBe('flags');
      expect(v3.isArray).toBe(true);
      expect(v3.arraySize).toBeDefined();

      const v4 = result.ast.declarations[3] as VarDeclNode;
      expect(v4.name).toBe('buffer');
      expect(v4.isArray).toBe(true);
      expect(v4.arraySize).toBeUndefined();
    });

    it('parses comma-separated variable declarations with include directives', () => {
      const code = `#include <stdio.h>
#include <ctype.h>

int main() {
    char ident[50];
    int flag = 1, i = 0;
    printf("Enter an identifier: ");
    scanf("%s", ident);
    if (!(isalpha(ident[0]) || ident[0] == '_')) {
        flag = 0;
    } else {
        for (i = 1; ident[i] != '\\0'; i++) {
            if (!(isalnum(ident[i]) || ident[i] == '_')) {
                flag = 0;
                break;
            }
        }
    }
    if (flag == 1)
        printf("Valid Identifier\\n");
    else
        printf("Not a Valid Identifier\\n");
    return 0;
}`;
      const result = parse(code);

      expect(result.errors).toEqual([]);
      const main = result.ast.declarations[0] as FunctionDeclNode;
      expect(main.body.statements.map((statement) => statement.type)).toEqual([
        'VarDecl',
        'VarDecl',
        'VarDecl',
        'ExprStmt',
        'ExprStmt',
        'IfStmt',
        'IfStmt',
        'ReturnStmt',
      ]);
      expect((main.body.statements[1] as VarDeclNode).name).toBe('flag');
      expect((main.body.statements[2] as VarDeclNode).name).toBe('i');
    });

    it('parses functions with array parameters', () => {
      const code = 'void sort(int arr[], int n) { return; }';
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      expect(fn.params[0].isArray).toBe(true);
      expect(fn.params[1].isArray).toBe(false);
    });
  });

  describe('2. Statements & Control Flow', () => {
    it('parses nested blocks and local variable declarations', () => {
      const code = `
        void test() {
          int x = 1;
          {
            int y = 2;
            {
              int z = 3;
            }
          }
        }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements).toHaveLength(2);
      expect(fn.body.statements[1].type).toBe('Block');
    });

    it('parses if statement without else', () => {
      const code = `
        void check(int x) {
          if (x > 0) {
            return;
          }
        }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const ifStmt = fn.body.statements[0] as IfStmtNode;
      expect(ifStmt.type).toBe('IfStmt');
      expect(ifStmt.condition).toBeDefined();
      expect(ifStmt.thenBranch).toBeDefined();
      expect(ifStmt.elseBranch).toBeUndefined();
    });

    it('parses if-else statement with dangling-else binding', () => {
      const code = `
        void test(int a, int b) {
          if (a > 0)
            if (b > 0) return;
            else return;
        }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const outerIf = fn.body.statements[0] as IfStmtNode;
      const innerIf = outerIf.thenBranch as IfStmtNode;
      expect(innerIf.type).toBe('IfStmt');
      expect(innerIf.elseBranch).toBeDefined(); // else correctly binds to inner if
    });

    it('parses while loop', () => {
      const code = `
        void loop() {
          int i = 0;
          while (i < 10) {
            i++;
          }
        }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements[1].type).toBe('WhileStmt');
    });

    it('parses do-while loop', () => {
      const code = `
        void test() {
          int count = 5;
          do {
            count--;
          } while (count > 0);
        }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements[1].type).toBe('DoWhileStmt');
    });

    it('parses for loop with var decl init, condition, and update', () => {
      const code = `
        void loop() {
          for (int i = 0; i < 10; i++) {
            break;
            continue;
          }
        }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const forStmt = fn.body.statements[0] as ForStmtNode;
      expect(forStmt.type).toBe('ForStmt');
      expect(forStmt.init?.type).toBe('VarDecl');
      expect(forStmt.condition?.type).toBe('BinaryExpr');
      expect(forStmt.update?.type).toBe('UnaryExpr');
    });

    it('parses infinite for loop with empty clauses', () => {
      const code = `
        void loop() {
          for (;;) {
            break;
          }
        }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const forStmt = fn.body.statements[0] as ForStmtNode;
      expect(forStmt.init).toBeUndefined();
      expect(forStmt.condition).toBeUndefined();
      expect(forStmt.update).toBeUndefined();
    });

    it('parses return statements with and without values', () => {
      const code = `
        int f1() { return 42; }
        void f2() { return; }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn1 = result.ast.declarations[0] as FunctionDeclNode;
      const fn2 = result.ast.declarations[1] as FunctionDeclNode;
      expect(fn1.body.statements[0].type).toBe('ReturnStmt');
      expect((fn1.body.statements[0] as any).value).toBeDefined();
      expect((fn2.body.statements[0] as any).value).toBeUndefined();
    });
  });

  describe('3. Operator Precedence & Associativity (Pratt Parsing)', () => {
    it('enforces multiplicative (*) precedence over additive (+)', () => {
      const code = 'void test() { int x = a + b * c; }';
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const varDecl = fn.body.statements[0] as VarDeclNode;
      const bin = varDecl.init as BinaryExprNode;

      expect(bin.type).toBe('BinaryExpr');
      expect(bin.operator).toBe('+');
      expect(bin.left.type).toBe('Identifier');
      expect(bin.right.type).toBe('BinaryExpr');
      expect((bin.right as BinaryExprNode).operator).toBe('*');
    });

    it('enforces parentheses override precedence: (a + b) * c', () => {
      const code = 'void test() { int x = (a + b) * c; }';
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const varDecl = fn.body.statements[0] as VarDeclNode;
      const bin = varDecl.init as BinaryExprNode;

      expect(bin.type).toBe('BinaryExpr');
      expect(bin.operator).toBe('*');
      expect(bin.left.type).toBe('BinaryExpr');
      expect((bin.left as BinaryExprNode).operator).toBe('+');
      expect(bin.right.type).toBe('Identifier');
    });

    it('enforces left-associativity of subtraction: a - b - c', () => {
      const code = 'void test() { int x = a - b - c; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const bin = (fn.body.statements[0] as VarDeclNode).init as BinaryExprNode;

      expect(bin.operator).toBe('-');
      expect(bin.left.type).toBe('BinaryExpr');
      expect((bin.left as BinaryExprNode).operator).toBe('-');
      expect(bin.right.type).toBe('Identifier');
    });

    it('enforces left-associativity of division: a / b / c', () => {
      const code = 'void test() { int x = a / b / c; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const bin = (fn.body.statements[0] as VarDeclNode).init as BinaryExprNode;

      expect(bin.operator).toBe('/');
      expect(bin.left.type).toBe('BinaryExpr');
      expect((bin.left as BinaryExprNode).operator).toBe('/');
    });

    it('enforces additive precedence over relational: a + b < c - d', () => {
      const code = 'void test() { bool x = a + b < c - d; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const bin = (fn.body.statements[0] as VarDeclNode).init as BinaryExprNode;

      expect(bin.operator).toBe('<');
      expect(bin.left.type).toBe('BinaryExpr');
      expect((bin.left as BinaryExprNode).operator).toBe('+');
      expect(bin.right.type).toBe('BinaryExpr');
      expect((bin.right as BinaryExprNode).operator).toBe('-');
    });

    it('enforces relational precedence over equality: a < b == c > d', () => {
      const code = 'void test() { bool x = a < b == c > d; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const bin = (fn.body.statements[0] as VarDeclNode).init as BinaryExprNode;

      expect(bin.operator).toBe('==');
      expect((bin.left as BinaryExprNode).operator).toBe('<');
      expect((bin.right as BinaryExprNode).operator).toBe('>');
    });

    it('enforces logical AND precedence over logical OR: a || b && c', () => {
      const code = 'void test() { bool x = a || b && c; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const bin = (fn.body.statements[0] as VarDeclNode).init as BinaryExprNode;

      expect(bin.operator).toBe('||');
      expect(bin.left.type).toBe('Identifier');
      expect(bin.right.type).toBe('BinaryExpr');
      expect((bin.right as BinaryExprNode).operator).toBe('&&');
    });

    it('enforces right-associativity of assignment: a = b = c', () => {
      const code = 'void test() { a = b = c; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const exprStmt = fn.body.statements[0] as any;
      const assign = exprStmt.expression as AssignExprNode;

      expect(assign.type).toBe('AssignExpr');
      expect(assign.operator).toBe('=');
      expect(assign.target.type).toBe('Identifier');
      expect(assign.value.type).toBe('AssignExpr'); // nested assignment on the right!
      const inner = assign.value as AssignExprNode;
      expect(inner.operator).toBe('=');
    });

    it('parses compound assignment operators: x += y *= z', () => {
      const code = 'void test() { x += y *= z; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const assign = (fn.body.statements[0] as any).expression as AssignExprNode;

      expect(assign.operator).toBe('+=');
      expect(assign.value.type).toBe('AssignExpr');
      expect((assign.value as AssignExprNode).operator).toBe('*=');
    });

    it('parses prefix unary operators: -x, !flag, ~mask, ++i, --j', () => {
      const code = `
        void test() {
          int a = -x;
          bool b = !flag;
          int c = ~mask;
          int d = ++i;
          int e = --j;
        }
      `;
      const result = parse(code);
      expect(result.success).toBe(true);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const u1 = (fn.body.statements[0] as VarDeclNode).init as UnaryExprNode;
      expect(u1.isPrefix).toBe(true);
      expect(u1.operator).toBe('-');

      const u2 = (fn.body.statements[1] as VarDeclNode).init as UnaryExprNode;
      expect(u2.isPrefix).toBe(true);
      expect(u2.operator).toBe('!');
    });

    it('parses postfix unary operators: i++, j--', () => {
      const code = 'void test() { i++; j--; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const p1 = (fn.body.statements[0] as any).expression as UnaryExprNode;
      expect(p1.isPrefix).toBe(false);
      expect(p1.operator).toBe('++');
    });

    it('enforces postfix precedence over prefix: -i++', () => {
      const code = 'void test() { int x = -i++; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const un = (fn.body.statements[0] as VarDeclNode).init as UnaryExprNode;

      expect(un.operator).toBe('-');
      expect(un.argument.type).toBe('UnaryExpr');
      expect((un.argument as UnaryExprNode).operator).toBe('++');
      expect((un.argument as UnaryExprNode).isPrefix).toBe(false);
    });

    it('parses function calls with arguments', () => {
      const code = 'void test() { calculate(1, a + b, foo()); }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const call = (fn.body.statements[0] as any).expression as CallExprNode;

      expect(call.type).toBe('CallExpr');
      expect(call.args).toHaveLength(3);
      expect(call.args[1].type).toBe('BinaryExpr');
      expect(call.args[2].type).toBe('CallExpr');
    });

    it('parses single and multi-dimensional array indexing', () => {
      const code = 'void test() { int val = matrix[row + 1][col * 2]; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const init = (fn.body.statements[0] as VarDeclNode).init as IndexExprNode;

      expect(init.type).toBe('IndexExpr');
      expect(init.target.type).toBe('IndexExpr');
      expect(init.index.type).toBe('BinaryExpr');
    });

    it('parses array literal initializers: int arr[3] = {1, 2, 3};', () => {
      const code = 'void test() { int arr[3] = {1, 2, 3}; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;
      const init = (fn.body.statements[0] as VarDeclNode).init as any;

      expect(init.type).toBe('ArrayLiteral');
      expect(init.elements).toHaveLength(3);
    });
  });

  describe('4. AST Spans & Children Arrays', () => {
    it('populates accurate ASTSpan and children on every node', () => {
      const code = 'int inc(int x) { return x + 1; }';
      const result = parse(code);
      const fn = result.ast.declarations[0] as FunctionDeclNode;

      expect(fn.span.startLine).toBe(1);
      expect(fn.span.startCol).toBe(1);
      expect(fn.children).toBeDefined();
      expect(Array.isArray(fn.children)).toBe(true);

      const ret = fn.body.statements[0];
      expect(ret.span).toBeDefined();
      expect(ret.children.length).toBeGreaterThan(0);
    });
  });

  describe('5. Parse Trace', () => {
    it('records parse trace with depth, rules applied, and lookahead', () => {
      const code = 'int main() { return 0; }';
      const result = parse(code);

      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.trace.every((step) => ['enter', 'consume', 'exit', 'error', 'recover'].includes(step.event))).toBe(true);
      const rules = result.trace.map((s) => s.ruleApplied);
      expect(rules).toContain('Enter Program');
      expect(rules).toContain('Enter FunctionDecl');
      expect(rules).toContain('Enter Block');

      const traceItem = result.trace.find((s) => s.ruleApplied === 'Enter FunctionDecl');
      expect(traceItem).toBeDefined();
      expect(traceItem?.depth).toBeGreaterThanOrEqual(1);
      expect(traceItem?.stack).toContain('Program');
      expect(result.trace.some((step) => step.event === 'consume' && step.tokenConsumed)).toBe(true);
      expect(result.trace.some((step) => step.event === 'exit')).toBe(true);
    });

    it('marks trace truncation and retains recovery events', () => {
      const longCode = `int main() {\n${Array.from({ length: 1_800 }, (_, index) => `  int value${index} = ${index};`).join('\n')}\n  return 0;\n}`;
      const result = parse(longCode);
      expect(result.trace).toHaveLength(5_000);
      expect(result.traceTruncated).toBe(true);

      const recovered = parse('int main() { int value = 1 return value; }');
      expect(recovered.trace.some((step) => step.event === 'error')).toBe(true);
      expect(recovered.trace.some((step) => step.event === 'recover')).toBe(true);
    });
  });

  describe('6. AST Utilities', () => {
    it('produces formatted bracketed S-expression string', () => {
      const code = 'int add(int a, int b) { return a + b; }';
      const result = parse(code);
      const bracketed = astToBracketedString(result.ast);

      expect(bracketed).toContain('(Program');
      expect(bracketed).toContain('(FunctionDecl int add');
      expect(bracketed).toContain('(Param int a)');
      expect(bracketed).toContain('(BinaryExpr + (Identifier a) (Identifier b))');
    });

    it('calculates node count and max tree depth', () => {
      const code = 'int solve(int x) { return x * 2 + 1; }';
      const result = parse(code);

      const count = countNodes(result.ast);
      expect(count).toBeGreaterThan(5);

      const depth = getMaxDepth(result.ast);
      expect(depth).toBeGreaterThanOrEqual(4);
    });

    it('exports AST to JSON string and Graphviz DOT', () => {
      const code = 'int answer() { return 42; }';
      const result = parse(code);

      const json = astToJSON(result.ast);
      expect(typeof json).toBe('string');
      const parsedJSON = JSON.parse(json);
      expect(parsedJSON.type).toBe('Program');

      const dot = astToDot(result.ast);
      expect(dot).toContain('digraph MiniCAST {');
      expect(dot).toContain('->');
      expect(dot).toContain('}');
    });
  });

  describe('7. CFG Grammar Analyzer', () => {
    it('analyzes grammar: computes nullable, FIRST, and FOLLOW sets', () => {
      const grammar = getMiniCGrammar();
      const analysis = analyzeGrammar(grammar);

      expect(analysis.nullable.length).toBeGreaterThan(0);
      expect(analysis.nullable).toContain('ParamListOpt');
      expect(analysis.nullable).toContain('StatementList');

      expect(analysis.firstSets['Type']).toEqual(
        expect.arrayContaining(['bool', 'char', 'float', 'int', 'string', 'void'])
      );

      expect(analysis.followSets['Program']).toContain('$');

      // Export JSON
      const json = exportGrammarAnalysisJSON(analysis);
      expect(json).toContain('"nullable"');
      expect(json).toContain('"firstSets"');
      expect(json).toContain('"followSets"');
    });
  });

  describe('8. Syntax Error Handling & Recovery (22 tests with broken inputs)', () => {
    it('1. Phrase-level recovery: inserts missing semicolon after return statement', () => {
      const code = `
        int test() {
          return 42
          int next = 10;
        }
      `;
      const res = parse(code);
      expect(res.errors.length).toBeGreaterThanOrEqual(1);
      const semiErr = res.errors.find((e) => e.code === 'ERR_MISSING_SEMICOLON');
      expect(semiErr).toBeDefined();
      expect(semiErr?.message).toBe("Expected ';' after return statement");
      expect(semiErr?.recoveryAction).toBe("Inserted virtual ';'");

      const fn = res.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements).toHaveLength(2);
      expect(fn.body.statements[1].type).toBe('VarDecl');
    });

    it('2. Phrase-level recovery: inserts missing semicolon after var decl before newline', () => {
      const code = `
        void test() {
          int a = 1
          int b = 2;
        }
      `;
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_SEMICOLON')).toBe(true);
      const fn = res.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements).toHaveLength(2);
      expect(fn.body.statements[0].type).toBe('VarDecl');
      expect(fn.body.statements[1].type).toBe('VarDecl');
    });

    it('3. Phrase-level recovery: inserts missing semicolon after expression statement before }', () => {
      const code = 'void test() { x = 10 }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_SEMICOLON')).toBe(true);
      const fn = res.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements).toHaveLength(1);
    });

    it('4. Phrase-level recovery: inserts missing closing parenthesis in if condition', () => {
      const code = 'void test() { if (x > 0 { return; } }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_PARENTHESIS')).toBe(true);
      const err = res.errors.find((e) => e.code === 'ERR_MISSING_PARENTHESIS')!;
      expect(err.message).toBe("Expected ')' after condition");
      expect(err.recoveryAction).toBe("Inserted virtual ')'");

      const fn = res.ast.declarations[0] as FunctionDeclNode;
      const ifStmt = fn.body.statements[0] as IfStmtNode;
      expect(ifStmt.type).toBe('IfStmt');
      expect(ifStmt.thenBranch.type).toBe('Block');
    });

    it('5. Phrase-level recovery: inserts missing closing parenthesis in while condition', () => {
      const code = 'void test() { while (running { work(); } }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_PARENTHESIS')).toBe(true);
      const fn = res.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements[0].type).toBe('WhileStmt');
    });

    it('6. Phrase-level recovery: inserts missing closing parenthesis in for clauses', () => {
      const code = 'void test() { for (int i = 0; i < 5; i++ { return; } }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_PARENTHESIS')).toBe(true);
      const fn = res.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements[0].type).toBe('ForStmt');
    });

    it('7. Phrase-level recovery: inserts missing closing parenthesis in function call', () => {
      const code = 'void test() { foo(1, 2; }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_PARENTHESIS')).toBe(true);
      const fn = res.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements[0].type).toBe('ExprStmt');
    });

    it('8. Phrase-level recovery: inserts missing closing parenthesis in function decl', () => {
      const code = 'int solve(int a, int b { return a + b; }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_PARENTHESIS')).toBe(true);
      const fn = res.ast.declarations[0] as FunctionDeclNode;
      expect(fn.name).toBe('solve');
      expect(fn.params).toHaveLength(2);
      expect(fn.body.statements).toHaveLength(1);
    });

    it('9. Phrase-level recovery: inserts missing closing brace in block at EOF', () => {
      const code = 'void test() { int x = 1;';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_BRACE')).toBe(true);
      const fn = res.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements).toHaveLength(1);
    });

    it('10. Unbalanced brackets recovery in array indexing: matrix[i = 0;', () => {
      const code = 'void test() { matrix[i = 0; }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_UNBALANCED_BRACKET')).toBe(true);
    });

    it('11. Missing operand recovery in binary expression: a + ;', () => {
      const code = 'void test() { int x = a + ; }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_OPERAND')).toBe(true);
      const err = res.errors.find((e) => e.code === 'ERR_MISSING_OPERAND')!;
      expect(err.message).toBe('Expected expression operand');
      expect(err.recoveryAction).toBe('Created ErrorNode operand');

      const fn = res.ast.declarations[0] as FunctionDeclNode;
      const bin = (fn.body.statements[0] as VarDeclNode).init as BinaryExprNode;
      expect(bin.right.type).toBe('ErrorNode');
    });

    it('12. Missing operand recovery in assignment: x = ;', () => {
      const code = 'void test() { x = ; }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_OPERAND')).toBe(true);
    });

    it('13. Missing operand in prefix unary operator: int x = - ;', () => {
      const code = 'void test() { int x = - ; }';
      const res = parse(code);
      expect(res.errors.some((e) => e.code === 'ERR_MISSING_OPERAND')).toBe(true);
    });

    it('14. Panic-mode recovery on bad keyword: skips to next statement sync token', () => {
      const code = `
        void test() {
          badkeyword garbage stuff ;
          int recovered = 100;
        }
      `;
      const res = parse(code);
      expect(res.errors.length).toBeGreaterThanOrEqual(1);
      const fn = res.ast.declarations[0] as FunctionDeclNode;
      const recovered = fn.body.statements.find((s) => s.type === 'VarDecl') as VarDeclNode;
      expect(recovered).toBeDefined();
      expect(recovered.name).toBe('recovered');
    });

    it('15. Recovery on unexpected token at top level', () => {
      const code = `
        @
        int valid() { return 1; }
      `;
      const res = parse(code);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.ast.declarations).toHaveLength(2);
      expect(res.ast.declarations[0].type).toBe('ErrorNode');
      expect(res.ast.declarations[1].type).toBe('FunctionDecl');
    });

    it('16. Lexical error (unterminated string literal) converted to structured error and ErrorNode', () => {
      const code = 'void test() { string s = "broken string; }';
      const res = parse(code);
      expect(res.errors.length).toBeGreaterThan(0);
      const lexErr = res.errors.find((e) => e.code === 'ERR_LEXICAL');
      expect(lexErr).toBeDefined();
      expect(lexErr?.message).toContain('Unterminated string literal');
    });

    it('17. Lexical error (unterminated char literal) captured safely', () => {
      const code = "void test() { char c = 'a; }";
      const res = parse(code);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.some((e) => e.message.includes('character literal'))).toBe(true);
    });

    it('18. Never crashes on pathological broken inputs (all punctuation)', () => {
      const pathological = '{{{ ;;; )] }';
      expect(() => {
        const res = parse(pathological);
        expect(res.ast).toBeDefined();
        expect(res.errors.length).toBeGreaterThan(0);
      }).not.toThrow();
    });

    it('19. Never crashes on completely empty input or pure whitespace', () => {
      expect(() => {
        const res = parse('');
        expect(res.ast.type).toBe('Program');
        expect(res.errors).toHaveLength(0);
      }).not.toThrow();
    });

    it('20. Multiple sequential errors in single function body recover gracefully', () => {
      const code = `
        void test() {
          int a = 1
          if (x > 0 { return; }
          int b = 2 + ;
          string s = "unclosed;
        }
      `;
      const res = parse(code);
      expect(res.errors.length).toBeGreaterThanOrEqual(4);
      const fn = res.ast.declarations[0] as FunctionDeclNode;
      expect(fn.body.statements.length).toBeGreaterThanOrEqual(2);
    });

    it('21. Validates Error object structure meets all requirements', () => {
      const code = 'void test() { int x = a + ; }';
      const res = parse(code);
      const err = res.errors[0];

      expect(err).toHaveProperty('code');
      expect(err).toHaveProperty('message');
      expect(err).toHaveProperty('line');
      expect(err).toHaveProperty('column');
      expect(err).toHaveProperty('expected');
      expect(err).toHaveProperty('found');
      expect(err).toHaveProperty('severity');
      expect(err).toHaveProperty('recoveryAction');

      expect(typeof err.code).toBe('string');
      expect(typeof err.message).toBe('string');
      expect(typeof err.line).toBe('number');
      expect(typeof err.column).toBe('number');
      expect(Array.isArray(err.expected)).toBe(true);
      expect(err.severity).toBe('error');
      expect(typeof err.recoveryAction).toBe('string');
    });

    it('22. Short human-readable messages on errors', () => {
      const code = 'int f() { return 10 }';
      const res = parse(code);
      const err = res.errors[0];
      expect(err.message).toBe("Expected ';' after return statement");
      expect(err.message.length).toBeLessThan(45);
    });
  });
});
