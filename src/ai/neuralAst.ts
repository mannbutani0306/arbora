/**
 * Neural AST generator for MiniC using the server-side AI gateway.
 * Produces an Abstract Syntax Tree in the exact node schema as the classical parser:
 * { id, type, span, children, ... }
 * Uses temperature 0, strict system prompt, JSON response schema, Zod validation,
 * automatic single retry on malformed output, and latency/validity recording.
 */

import { z } from 'zod';
import { ASTNode, ASTNodeType, ASTSpan } from '../types/ast';
import { callGateway } from './gatewayClient';

const MODEL_NAME = 'AI gateway';

// Zod schema for Source Span
export const ASTSpanZod = z.object({
  startLine: z.number().int().catch(1),
  startCol: z.number().int().catch(1),
  endLine: z.number().int().catch(1),
  endCol: z.number().int().catch(1),
});

// Recursive Zod schema for ASTNode
export type ValidatedNeuralNode = {
  id: string;
  type: string;
  span: ASTSpan;
  children: ValidatedNeuralNode[];
  [key: string]: any;
};

export const ASTNodeZod: z.ZodType<ValidatedNeuralNode> = z.lazy(() =>
  z
    .object({
      id: z.string().catch(() => `neural_${Math.random().toString(36).slice(2, 7)}`),
      type: z.string(),
      span: ASTSpanZod.catch({ startLine: 1, startCol: 1, endLine: 1, endCol: 1 }),
      children: z.array(ASTNodeZod).catch([]),
    })
    .passthrough()
);

export const RootASTZod = z.union([
  // Directly the Program node
  ASTNodeZod,
  // Or wrapped in { ast: ASTNode }
  z.object({ ast: ASTNodeZod }).transform((val) => val.ast),
  // Or wrapped in { program: ASTNode }
  z.object({ program: ASTNodeZod }).transform((val) => val.program),
]);

export interface NeuralAstResult {
  ast: ASTNode | null;
  isValid: boolean;
  validationError?: string;
  latencyMs: number;
  retried: boolean;
  model: string;
  rawResponse?: string;
}

/**
 * Normalizes AST node to guarantee all required fields and array structures exist.
 */
export function normalizeNeuralAST(rawNode: any, nextId = { current: 1 }): ASTNode {
  if (!rawNode || typeof rawNode !== 'object') {
    return {
      id: `node_${nextId.current++}`,
      type: 'ErrorNode',
      span: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
      children: [],
      message: 'Malformed node',
    } as any;
  }

  const id =
    typeof rawNode.id === 'string' && rawNode.id.trim()
      ? rawNode.id
      : `node_${nextId.current++}`;

  const type = (rawNode.type || 'ErrorNode') as ASTNodeType;

  const span: ASTSpan = {
    startLine: Number(rawNode.span?.startLine) || 1,
    startCol: Number(rawNode.span?.startCol) || 1,
    endLine: Number(rawNode.span?.endLine) || 1,
    endCol: Number(rawNode.span?.endCol) || 1,
  };

  // Determine children
  let rawChildren: any[] = [];
  if (Array.isArray(rawNode.children) && rawNode.children.length > 0) {
    rawChildren = rawNode.children;
  } else if (type === 'Program' && Array.isArray(rawNode.declarations)) {
    rawChildren = rawNode.declarations;
  } else if (type === 'Block' && Array.isArray(rawNode.statements)) {
    rawChildren = rawNode.statements;
  } else if (type === 'BinaryExpr') {
    if (rawNode.left) rawChildren.push(rawNode.left);
    if (rawNode.right) rawChildren.push(rawNode.right);
  } else if (type === 'UnaryExpr' && rawNode.argument) {
    rawChildren.push(rawNode.argument);
  } else if (type === 'AssignExpr') {
    if (rawNode.target) rawChildren.push(rawNode.target);
    if (rawNode.value) rawChildren.push(rawNode.value);
  } else if (type === 'ExprStmt' && rawNode.expression) {
    rawChildren.push(rawNode.expression);
  } else if (type === 'ReturnStmt' && rawNode.value) {
    rawChildren.push(rawNode.value);
  } else if (type === 'IfStmt') {
    if (rawNode.condition) rawChildren.push(rawNode.condition);
    if (rawNode.thenBranch) rawChildren.push(rawNode.thenBranch);
    if (rawNode.elseBranch) rawChildren.push(rawNode.elseBranch);
  } else if (type === 'WhileStmt') {
    if (rawNode.condition) rawChildren.push(rawNode.condition);
    if (rawNode.body) rawChildren.push(rawNode.body);
  } else if (type === 'FunctionDecl') {
    if (Array.isArray(rawNode.params)) rawChildren.push(...rawNode.params);
    if (rawNode.body) rawChildren.push(rawNode.body);
  }

  const normalizedChildren = rawChildren.map((c) =>
    normalizeNeuralAST(c, nextId)
  );

  const node: any = {
    ...rawNode,
    id,
    type,
    span,
    children: normalizedChildren,
  };

  if (type === 'Program') {
    node.declarations = normalizedChildren;
    node.body = normalizedChildren;
  } else if (type === 'Block') {
    node.statements = normalizedChildren;
  }

  return node as ASTNode;
}

/**
 * Validates parsed JSON with Zod and ensures root is Program.
 */
function validateASTWithZod(parsedJson: any): {
  success: boolean;
  ast?: ASTNode;
  error?: string;
} {
  try {
    const parseRes = RootASTZod.safeParse(parsedJson);
    if (!parseRes.success) {
      const issue = parseRes.error.issues[0];
      return {
        success: false,
        error: issue
          ? `Path ${issue.path.join('.')}: ${issue.message}`
          : 'Zod schema validation failed',
      };
    }

    const rawAst = parseRes.data;
    if (rawAst.type !== 'Program') {
      return {
        success: false,
        error: `Expected root type "Program", got "${rawAst.type}"`,
      };
    }

    const normalized = normalizeNeuralAST(rawAst);
    return { success: true, ast: normalized };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Validation exception',
    };
  }
}

/** Generates an AST through the AI gateway and retries once after schema validation fails. */
export async function generateNeuralAst(
  sourceCode: string,
  _apiKeyOverride?: string,
  signal?: AbortSignal
): Promise<NeuralAstResult> {
  const startTime = performance.now();
  let retried = false;
  let lastRawText = '';
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = await callGateway('neural_ast', {
        sourceCode,
        ...(attempt === 2 ? { validationError: lastError } : {}),
      }, { signal });
      lastRawText = JSON.stringify(parsed);

      // Validate with Zod
      const valResult = validateASTWithZod(parsed);
      if (valResult.success && valResult.ast) {
        const latencyMs = Math.round(performance.now() - startTime);
        return {
          ast: valResult.ast,
          isValid: true,
          latencyMs,
          retried,
          model: MODEL_NAME,
          rawResponse: lastRawText,
        };
      } else {
        lastError = valResult.error || 'Zod validation failed';
        if (attempt === 1) {
          retried = true;
          continue;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Model execution error';
      if (attempt === 1) {
        retried = true;
        continue;
      }
    }
  }

  const latencyMs = Math.round(performance.now() - startTime);
  return {
    ast: null,
    isValid: false,
    validationError: lastError,
    latencyMs,
    retried,
    model: MODEL_NAME,
    rawResponse: lastRawText,
  };
}
