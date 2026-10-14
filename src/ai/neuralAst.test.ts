import { describe, it, expect, vi } from 'vitest';
import {
  generateNeuralAst,
  normalizeNeuralAST,
  RootASTZod,
  ASTNodeZod,
} from './neuralAst';

const { callGatewayMock } = vi.hoisted(() => ({
  callGatewayMock: vi.fn(),
}));

vi.mock('./gatewayClient', () => ({
  callGateway: callGatewayMock,
}));

import { callGateway } from './gatewayClient';

describe('Neural AST Zod Schema & Normalizer', () => {
  it('normalizes wrapped program roots and type-specific child fields', () => {
    const wrapped = {
      program: {
        type: 'Program',
        declarations: [
          {
            type: 'FunctionDecl',
            params: [{ type: 'Param', name: 'x' }],
            body: {
              type: 'Block',
              statements: [
                { type: 'IfStmt', condition: { type: 'Identifier', name: 'x' }, thenBranch: { type: 'ReturnStmt' } },
                { type: 'WhileStmt', condition: { type: 'Identifier', name: 'x' }, body: { type: 'Block' } },
                { type: 'AssignExpr', target: { type: 'Identifier', name: 'x' }, value: { type: 'Literal', value: 1 } },
                { type: 'UnaryExpr', argument: { type: 'Identifier', name: 'x' } },
                { type: 'ExprStmt', expression: { type: 'Identifier', name: 'x' } },
              ],
            },
          },
        ],
      },
    };

    const parsed = RootASTZod.safeParse(wrapped);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    const normalized = normalizeNeuralAST(parsed.data);
    const body = normalized.children[0].children[1];
    expect(body.children).toHaveLength(5);
    expect(body.children[0].children).toHaveLength(2);
    expect(body.children[1].children).toHaveLength(2);
    expect(body.children[2].children).toHaveLength(2);
    expect(body.children[3].children).toHaveLength(1);
    expect(body.children[4].children).toHaveLength(1);
  });

  it('replaces malformed fields and nodes with schema defaults', () => {
    const parsed = ASTNodeZod.parse({
      type: 'Program',
      span: { startLine: 'bad' },
      children: [null],
    });

    expect(parsed.id).toMatch(/^neural_/);
    expect(parsed.span).toEqual({ startLine: 1, startCol: 1, endLine: 1, endCol: 1 });
    expect(parsed.children).toEqual([]);
    expect(normalizeNeuralAST(null).type).toBe('ErrorNode');
    expect(normalizeNeuralAST({ type: 'IfStmt' }).children).toEqual([]);
  });

  it('validates a standard Program node', () => {
    const raw = {
      id: 'prog_1',
      type: 'Program',
      span: { startLine: 1, startCol: 1, endLine: 5, endCol: 2 },
      children: [
        {
          id: 'fn_1',
          type: 'FunctionDecl',
          name: 'main',
          returnType: 'int',
          span: { startLine: 1, startCol: 1, endLine: 5, endCol: 2 },
          children: [],
        },
      ],
    };

    const res = RootASTZod.safeParse(raw);
    expect(res.success).toBe(true);

    const normalized = normalizeNeuralAST(raw);
    expect(normalized.type).toBe('Program');
    expect(normalized.children).toHaveLength(1);
    expect(normalized.children[0].type).toBe('FunctionDecl');
  });

  it('normalizes missing children from type-specific fields like BinaryExpr', () => {
    const raw = {
      id: 'bin_1',
      type: 'BinaryExpr',
      operator: '+',
      span: { startLine: 2, startCol: 5, endLine: 2, endCol: 10 },
      left: {
        id: 'id_1',
        type: 'Identifier',
        name: 'x',
        span: { startLine: 2, startCol: 5, endLine: 2, endCol: 6 },
      },
      right: {
        id: 'lit_1',
        type: 'Literal',
        value: 10,
        span: { startLine: 2, startCol: 9, endLine: 2, endCol: 10 },
      },
    };

    const normalized = normalizeNeuralAST(raw);
    expect(normalized.children).toHaveLength(2);
    expect(normalized.children[0].type).toBe('Identifier');
    expect(normalized.children[1].type).toBe('Literal');
  });

  it('handles wrapped { ast: ... } structures', () => {
    const wrapped = {
      ast: {
        id: 'prog_wrapped',
        type: 'Program',
        span: { startLine: 1, startCol: 1, endLine: 2, endCol: 1 },
        children: [],
      },
    };

    const res = RootASTZod.safeParse(wrapped);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.id).toBe('prog_wrapped');
    }
  });

  it('returns a validated AST from the gateway without retrying', async () => {
    callGatewayMock.mockResolvedValueOnce({
      ast: {
        id: 'program',
        type: 'Program',
        span: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
        children: [],
      },
    });

    const result = await generateNeuralAst('int main() { return 0; }');

    expect(result.isValid).toBe(true);
    expect(result.retried).toBe(false);
    expect(result.ast?.type).toBe('Program');
    expect(result.model).toBe('AI gateway');
    expect(result.rawResponse).toContain('"Program"');
    expect(callGateway).toHaveBeenCalledWith(
      'neural_ast',
      { sourceCode: 'int main() { return 0; }' },
      { signal: undefined },
    );
  });

  it('retries invalid gateway output with validation feedback', async () => {
    callGatewayMock
      .mockResolvedValueOnce({ type: 'FunctionDecl' })
      .mockResolvedValueOnce({
        type: 'Program',
        span: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
        children: [],
      });

    const result = await generateNeuralAst('int main() { return 0; }');

    expect(result.isValid).toBe(true);
    expect(result.retried).toBe(true);
    expect(callGatewayMock).toHaveBeenCalledTimes(2);
    expect(callGatewayMock.mock.calls[1][1]).toMatchObject({
      sourceCode: 'int main() { return 0; }',
      validationError: 'Expected root type "Program", got "FunctionDecl"',
    });
  });

  it('returns the final validation error after both gateway responses fail', async () => {
    callGatewayMock
      .mockResolvedValueOnce({ type: 'Block' })
      .mockResolvedValueOnce({ type: 'VarDecl' });

    const result = await generateNeuralAst('int value;');

    expect(result.isValid).toBe(false);
    expect(result.ast).toBeNull();
    expect(result.retried).toBe(true);
    expect(result.validationError).toBe('Expected root type "Program", got "VarDecl"');
    expect(result.rawResponse).toContain('VarDecl');
  });

  it('retries gateway exceptions and returns an explicit failure if the retry also throws', async () => {
    callGatewayMock
      .mockRejectedValueOnce(new Error('gateway timeout'))
      .mockRejectedValueOnce('offline');

    const result = await generateNeuralAst('int main() { return 0; }');

    expect(result.isValid).toBe(false);
    expect(result.retried).toBe(true);
    expect(result.validationError).toBe('Model execution error');
    expect(result.rawResponse).toBe('');
  });
});
