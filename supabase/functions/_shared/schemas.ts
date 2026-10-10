import { z } from 'npm:zod@4.6.5';

const ErrorSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  message: z.string(),
  severity: z.string().optional(),
  expected: z.array(z.string()).optional(),
  found: z.string().optional(),
});

const TokenSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  lexeme: z.string(),
});

const NodeSchema = z.record(z.string(), z.json());

export const GatewayRequestSchema = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('repair'),
    payload: z.object({
      sourceCode: z.string().max(20_000),
      errors: z.array(ErrorSchema).max(500),
      tokens: z.array(TokenSchema).max(10_000),
      retryCandidate: z.string().max(20_000).optional(),
      retryErrors: z.string().max(20_000).optional(),
    }).strict(),
  }).strict(),
  z.object({
    task: z.literal('neural_ast'),
    payload: z.object({
      sourceCode: z.string().max(20_000),
      validationError: z.string().max(2_000).optional(),
    }).strict(),
  }).strict(),
  z.object({
    task: z.literal('explain'),
    payload: z.object({
      node: z.union([NodeSchema, z.literal('whole_program'), z.null()]),
      fullCode: z.string().max(20_000),
      snippet: z.string().max(20_000),
      level: z.enum(['Beginner', 'Intermediate', 'Expert']),
    }).strict(),
  }).strict(),
]);

export type GatewayRequest = z.infer<typeof GatewayRequestSchema>;

const EditSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  operation: z.enum(['insert', 'delete', 'replace']),
  text: z.string(),
});

export const RepairResponseSchema = z.object({
  candidates: z.array(z.object({
    description: z.string(),
    edits: z.array(EditSchema),
    repairedCode: z.string(),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  })).max(3),
});

const SpanSchema = z.object({
  startLine: z.number().int(),
  startCol: z.number().int(),
  endLine: z.number().int(),
  endCol: z.number().int(),
});

const AstNodeSchema: z.ZodType = z.lazy(() => z.object({
  id: z.string(),
  type: z.string(),
  span: SpanSchema,
  children: z.array(AstNodeSchema),
}).passthrough());

export const NeuralAstResponseSchema = z.union([
  AstNodeSchema,
  z.object({ ast: AstNodeSchema }),
  z.object({ program: AstNodeSchema }),
]);

export const ExplanationResponseSchema = z.object({
  explanation: z.string(),
  rule: z.string(),
  analogy: z.string(),
});

export function getRateLimitWindow(nowMs: number, windowMs = 60 * 60 * 1000) {
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000));
  return { windowStartMs, retryAfterSeconds };
}
