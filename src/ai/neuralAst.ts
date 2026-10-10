/**
 * Neural AST Generator for MiniC compiler using Gemini (@google/genai).
 * Produces an Abstract Syntax Tree in the exact node schema as the classical parser:
 * { id, type, span, children, ... }
 * Uses temperature 0, strict system prompt, JSON response schema, Zod validation,
 * automatic single retry on malformed output, and latency/validity recording.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { ASTNode, ASTNodeType, ASTSpan } from '../types/ast';

const MODEL_NAME = 'gemini-3.8-flash';

export function getGeminiApiKey(): string {
  return (
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    (typeof import.meta !== 'undefined' &&
      (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
    ''
  );
}

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

const SYSTEM_INSTRUCTION = `You are an expert compiler frontend engineer. Your task is to act as a deterministic neural parser for the MiniC programming language.
Given MiniC source code, construct the complete Abstract Syntax Tree (AST) in the EXACT node schema as the classical compiler parser.

AST Node Schema Specification:
Every node MUST be an object with the following base properties:
- id: string (unique identifier e.g. "prog_1", "fn_1", "block_1", "decl_1", "call_1", "id_1", "lit_1")
- type: string (must be one of the standard MiniC AST types: "Program", "FunctionDecl", "Param", "VarDecl", "Block", "IfStmt", "WhileStmt", "ForStmt", "DoWhileStmt", "ReturnStmt", "BreakStmt", "ContinueStmt", "ExprStmt", "BinaryExpr", "UnaryExpr", "AssignExpr", "CallExpr", "IndexExpr", "Identifier", "Literal", "ArrayLiteral", "ErrorNode")
- span: object { startLine: number, startCol: number, endLine: number, endCol: number } corresponding to source code location (1-indexed)
- children: array of child ASTNode objects in natural syntactic order

Node-specific additional fields:
- "Program": declarations (array of child nodes), children matches declarations.
- "FunctionDecl": returnType (string: int, void, float, etc.), name (string), params (array of Param nodes), body (Block node), children: [body] or [...params, body].
- "Param": paramType (string), name (string), isArray (boolean), children: [].
- "VarDecl": varType (string), name (string), init (optional ASTNode), isArray (optional boolean), children: init ? [init] : [].
- "Block": statements (array of ASTNode), children matches statements.
- "IfStmt": condition (ASTNode), thenBranch (ASTNode), elseBranch (optional ASTNode), children: [condition, thenBranch, ...(elseBranch ? [elseBranch] : [])].
- "WhileStmt": condition (ASTNode), body (ASTNode), children: [condition, body].
- "ForStmt": init (optional ASTNode), condition (optional ASTNode), update (optional ASTNode), body (ASTNode), children: [init, condition, update, body].filter(Boolean).
- "DoWhileStmt": body (ASTNode), condition (ASTNode), children: [body, condition].
- "ReturnStmt": value (optional ASTNode), children: value ? [value] : [].
- "BreakStmt", "ContinueStmt": children: [].
- "ExprStmt": expression (ASTNode), children: [expression].
- "BinaryExpr": operator (string), left (ASTNode), right (ASTNode), children: [left, right].
- "UnaryExpr": operator (string), argument (ASTNode), isPrefix (boolean), children: [argument].
- "AssignExpr": operator (string), target (ASTNode), value (ASTNode), children: [target, value].
- "CallExpr": callee (ASTNode), args (array of ASTNode), children: [callee, ...args].
- "IndexExpr": target (ASTNode), index (ASTNode), children: [target, index].
- "Identifier": name (string), children: [].
- "Literal": literalType ("int" | "float" | "string" | "char" | "bool"), value (string or number or boolean), raw (string), children: [].

Output Requirements:
1. The root node MUST be of type "Program".
2. The tree MUST be complete and properly nested.
3. Every single node MUST have "id", "type", "span", and "children" (array).
4. Return ONLY valid JSON conforming to the schema.`;

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

/**
 * Generates an AST using Gemini Flash at temperature 0.
 * Automatically retries once if output fails Zod validation.
 */
export async function generateNeuralAst(
  sourceCode: string,
  apiKeyOverride?: string
): Promise<NeuralAstResult> {
  const startTime = performance.now();
  const apiKey = apiKeyOverride || getGeminiApiKey();

  if (!apiKey) {
    return {
      ast: null,
      isValid: false,
      validationError: 'GEMINI_API_KEY is not configured.',
      latencyMs: 0,
      retried: false,
      model: MODEL_NAME,
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = `MiniC Source Code:
\`\`\`c
${sourceCode}
\`\`\`

Generate the complete JSON Abstract Syntax Tree conforming strictly to the node schema.`;

  let retried = false;
  let lastRawText = '';
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const currentPrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nATTENTION: The previous attempt failed validation with error: ${lastError}. Ensure the response is valid JSON with root type "Program", and every node has "id", "type", "span", and "children".`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: currentPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0,
          responseMimeType: 'application/json',
        },
      });

      lastRawText = response.text || '';
      if (!lastRawText.trim()) {
        throw new Error('Empty response from model');
      }

      // Parse JSON
      let parsed: any;
      try {
        parsed = JSON.parse(lastRawText);
      } catch (jsonErr: any) {
        throw new Error(`Invalid JSON syntax: ${jsonErr.message}`);
      }

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
          continue; // Retry once
        }
      }
    } catch (err: any) {
      lastError = err?.message || 'Model execution error';
      if (attempt === 1) {
        retried = true;
        continue; // Retry once
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
