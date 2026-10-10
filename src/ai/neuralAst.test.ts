import { describe, it, expect, vi } from 'vitest';
import {
  normalizeNeuralAST,
  RootASTZod,
  ASTNodeZod,
} from './neuralAst';

vi.mock('./gatewayClient', () => ({
  callGateway: vi.fn(),
}));

describe('Neural AST Zod Schema & Normalizer', () => {
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
});
