import { z } from 'npm:zod@4.6.5';
import {
  ArboraAstResponseSchema,
  ArboraRepairResponseSchema,
  ExplanationResponseSchema,
  GatewayRequestSchema,
  NeuralAstResponseSchema,
  RepairResponseSchema,
  type GatewayRequest,
} from '../_shared/schemas.ts';
import { AuthenticationError, getAuthenticatedUserId } from '../_shared/auth.ts';
import { getAllowedOrigins, getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { enforceRateLimit, RateLimitError } from '../_shared/rateLimit.ts';

const MAX_BODY_BYTES = 20 * 1024;
const MODEL_TIMEOUT_MS = 25_000;
const ARBORA_MODEL_TIMEOUT_MS = 20_000;

const REPAIR_SYSTEM = `You are an expert compiler engineer specializing in syntax error recovery for the MiniC language.
Your job is to repair broken source code with minimal, surgical edits.
Strict Rules:
1. Return ONLY valid MiniC source code that will parse with ZERO errors according to the provided MiniC grammar specification.
2. Produce up to 3 distinct valid repair candidates.
3. Every candidate MUST include:
   - description: 1-4 word concise summary of the fix.
   - edits: array of exact edits with line, column, operation ('insert'|'delete'|'replace'), and text.
   - repairedCode: the complete, fully repaired, valid MiniC source code.
   - confidence: float between 0.0 and 1.0 reflecting confidence that code is error-free.
   - rationale: concise 1-2 sentence technical explanation for why this fix is correct.`;

const MINIC_GRAMMAR = `
MiniC Language Grammar:
- Program: (FunctionDecl | GlobalVarDecl)*
- Types: int | float | char | bool | void
- FunctionDecl: Type IDENTIFIER '(' [Param (',' Param)*] ')' Block
- Param: Type IDENTIFIER ['[' ']']
- Block: '{' Statement* '}'
- Statement:
    VarDecl: Type IDENTIFIER ['[' INT_LITERAL ']'] ['=' Expr] ';'
  | ExprStmt: Expr ';'
  | IfStmt: 'if' '(' Expr ')' Statement ['else' Statement]
  | WhileStmt: 'while' '(' Expr ')' Statement
  | ForStmt: 'for' '(' (VarDecl | ExprStmt | ';') [Expr] ';' [Expr] ')' Statement
  | DoWhileStmt: 'do' Statement 'while' '(' Expr ')' ';'
  | ReturnStmt: 'return' [Expr] ';'
  | BreakStmt: 'break' ';'
  | ContinueStmt: 'continue' ';'
  | Block
- Expressions (precedence lowest to highest):
  1. Assignment: '=' '+=' '-=' '*=' '/=' '%='
  2. Logical OR: '||'
  3. Logical AND: '&&'
  4. Equality: '==' '!='
  5. Relational: '<' '<=' '>' '>='
  6. Additive: '+' '-'
  7. Multiplicative: '*' '/' '%'
  8. Unary: '!' '-' '+' '++' '--'
  9. Postfix: call '()', index '[]', '++' '--'
  10. Primary: IDENTIFIER, INT_LITERAL, FLOAT_LITERAL, CHAR_LITERAL, STRING_LITERAL, BOOL_LITERAL, '(' Expr ')'`;

const NEURAL_SYSTEM = `You are an expert compiler frontend engineer. Your task is to act as a deterministic neural parser for the MiniC programming language.
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

const EXPLAIN_SYSTEM = `You are an expert compiler educator and syntax analyzer for the MiniC programming language.
Explain the requested AST node or whole program for the target audience level: {level}.

Requirements:
- "explanation": Maximum 3 sentences. No filler words. Focus directly on the syntax and semantics.
- "rule": Exactly ONE grammar production rule that generated this construct (e.g. "FunctionDecl -> Type IDENTIFIER '(' ParamListOpt ')' Block" or "BinaryExpr -> Expression '+' Expression").
- "analogy": Exactly ONE sentence with an intuitive analogy.

Audience Level Nuances:
- Beginner: No compiler theory jargon. Clear, simple words.
- Intermediate: Standard programming language concepts (scope, type rules, call stack).
- Expert: Compiler frontend concepts (context-free grammar, AST hierarchy, operational semantics, precedence).

Return ONLY a valid JSON object matching:
{
  "explanation": "string (max 3 sentences)",
  "rule": "string (grammar production rule)",
  "analogy": "string (1 sentence)"
}`;

function jsonResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function readBody(request: Request): Promise<{ body: string; tooLarge: boolean }> {
  const reader = request.body?.getReader();
  if (!reader) return { body: '', tooLarge: false };

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return { body: '', tooLarge: true };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder().decode(bytes), tooLarge: false };
}

function getModelRequest(request: GatewayRequest) {
  if (request.task === 'repair_t5' || request.task === 'ast_t5') {
    throw new Error('Arbora-T5 requests are forwarded separately.');
  }
  if (request.task === 'repair') {
    const errorContext = request.payload.errors.length === 0
      ? 'No errors reported.'
      : request.payload.errors.map((error, index) => {
        const nearby = request.payload.tokens
          .filter((token) => Math.abs(token.line - error.line) <= 1)
          .map((token) => token.line === error.line && token.column === error.column
            ? `[ERROR->${token.lexeme}]`
            : token.lexeme)
          .join(' ');
        const sourceLine = request.payload.sourceCode.split('\n')[error.line - 1]?.trim() ?? '';
        return `Error ${index + 1}:\n- Position: Line ${error.line}, Column ${error.column}\n- Message: ${error.message}\n- Severity: ${error.severity ?? 'unknown'}\n- Expected: ${error.expected?.join(', ') || 'None'}\n- Found: '${error.found ?? ''}'\n- Source Line: "${sourceLine}"\n- Local Token Stream: ${nearby || 'None'}`;
      }).join('\n\n');
    const prompt = request.payload.retryCandidate
      ? `Previous attempt produced candidate code that still failed deterministic validation:
\`\`\`c
${request.payload.retryCandidate}
\`\`\`
Remaining deterministic compiler errors:
${request.payload.retryErrors ?? ''}

Please fix these remaining errors strictly so the repaired code parses with ZERO syntax errors according to MiniC grammar.`
      : `Grammar Reference:
${MINIC_GRAMMAR}

Original Broken Code:
\`\`\`c
${request.payload.sourceCode}
\`\`\`

Deterministic Parser Diagnostics:
${errorContext}

Provide up to 3 valid repair candidates in structured JSON.`;

    return {
      systemInstruction: REPAIR_SYSTEM,
      prompt,
      responseSchema: {
        type: 'OBJECT',
        properties: {
          candidates: {
            type: 'ARRAY',
            description: 'Up to 3 distinct valid repair candidates',
            items: {
              type: 'OBJECT',
              properties: {
                description: { type: 'STRING', description: 'Short 1-4 word description of the fix' },
                edits: {
                  type: 'ARRAY',
                  description: 'Exact edit operations',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      line: { type: 'INTEGER' },
                      column: { type: 'INTEGER' },
                      operation: { type: 'STRING', enum: ['insert', 'delete', 'replace'] },
                      text: { type: 'STRING' },
                    },
                    required: ['line', 'column', 'operation', 'text'],
                  },
                },
                repairedCode: { type: 'STRING', description: 'The complete, fully corrected MiniC source code' },
                confidence: { type: 'NUMBER', description: 'Confidence value between 0.0 and 1.0' },
                rationale: { type: 'STRING', description: 'Concise technical explanation for the repair' },
              },
              required: ['description', 'edits', 'repairedCode', 'confidence', 'rationale'],
            },
          },
        },
        required: ['candidates'],
      },
    };
  }

  if (request.task === 'neural_ast') {
    const prompt = `MiniC Source Code:
\`\`\`c
${request.payload.sourceCode}
\`\`\`

Generate the complete JSON Abstract Syntax Tree conforming strictly to the node schema.${request.payload.validationError
      ? `\n\nATTENTION: The previous attempt failed validation with error: ${request.payload.validationError}. Ensure the response is valid JSON with root type "Program", and every node has "id", "type", "span", and "children".`
      : ''}`;
    return { systemInstruction: NEURAL_SYSTEM, prompt };
  }

  const { node, fullCode, snippet, level } = request.payload;
  const nodeObject = node && node !== 'whole_program' ? node : null;
  const nodeRecord = nodeObject && typeof nodeObject === 'object' ? nodeObject : null;
  const nodeType = typeof nodeRecord?.type === 'string' ? nodeRecord.type : 'Program';
  const nodeName = typeof nodeRecord?.name === 'string' ? nodeRecord.name : undefined;
  const operator = typeof nodeRecord?.operator === 'string' ? nodeRecord.operator : undefined;
  const targetLabel = nodeObject ? `Node '${nodeType}'${nodeName ? ` (${nodeName})` : operator ? ` (${operator})` : ''}` : 'Whole Program';
  const details = nodeObject
    ? JSON.stringify({
      type: nodeType,
      span: nodeRecord?.span,
      details: {
        name: nodeRecord?.name,
        operator: nodeRecord?.operator,
        value: nodeRecord?.value,
      },
    })
    : 'Whole program root node';
  const systemInstruction = EXPLAIN_SYSTEM.replace('{level}', level);
  const prompt = `Grammar Reference:
${MINIC_GRAMMAR}

Source Code:
\`\`\`c
${fullCode}
\`\`\`

Target Construct:
Target: ${targetLabel}
Snippet:
\`\`\`c
${snippet}
\`\`\`
AST Node Details:
${details}

Audience: ${level}`;
  return {
    systemInstruction,
    prompt,
    responseSchema: {
      type: 'OBJECT',
      properties: {
        explanation: { type: 'STRING' },
        rule: { type: 'STRING' },
        analogy: { type: 'STRING' },
      },
      required: ['explanation', 'rule', 'analogy'],
    },
  };
}

function validateModelOutput(task: GatewayRequest['task'], value: unknown): boolean {
  if (task === 'repair_t5') return RepairResponseSchema.safeParse(value).success;
  if (task === 'ast_t5') return ArboraAstResponseSchema.safeParse(value).success;
  if (task === 'repair') return RepairResponseSchema.safeParse(value).success;
  if (task === 'neural_ast') return NeuralAstResponseSchema.safeParse(value).success;
  return ExplanationResponseSchema.safeParse(value).success;
}

async function generateModelJson(request: GatewayRequest): Promise<unknown> {
  if (request.task === 'repair_t5' || request.task === 'ast_t5') {
    return callArboraModel(request);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('AI model is not configured.');

  const model = Deno.env.get('GEMINI_MODEL')?.trim();
  if (!model) throw new Error('AI model is not configured.');
  const modelRequest = getModelRequest(request);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: modelRequest.systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: modelRequest.prompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
              ...(modelRequest.responseSchema ? { responseSchema: modelRequest.responseSchema } : {}),
            },
          }),
        },
      );
    } catch {
      if (controller.signal.aborted) throw new DOMException('Model request timed out.', 'TimeoutError');
      throw new Error('Model request failed.');
    } finally {
      clearTimeout(timeout);
    }

    async function callArboraModel(
      request: Extract<GatewayRequest, { task: 'repair_t5' | 'ast_t5' }>,
    ): Promise<unknown> {
      const baseUrl = Deno.env.get('ARBORA_MODEL_URL')?.trim().replace(/\/+$/, '');
      if (!baseUrl) throw new Error('Arbora-T5 model service is not configured.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ARBORA_MODEL_TIMEOUT_MS);
      try {
        const endpoint = request.task === 'repair_t5' ? '/repair' : '/ast';
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(Deno.env.get('ARBORA_MODEL_TOKEN')
              ? { Authorization: `Bearer ${Deno.env.get('ARBORA_MODEL_TOKEN')}` }
              : {}),
          },
          body: JSON.stringify(request.payload),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 503 || response.status === 504) {
            throw new DOMException('Model waking up.', 'ModelColdStartError');
          }
          throw new Error('Arbora-T5 model request failed.');
        }
        const body: unknown = await response.json();
        if (request.task === 'repair_t5') {
          const parsed = z.object({
            candidates: z.array(z.object({ code: z.string(), score: z.number() })).max(8),
          }).safeParse(body);
          if (!parsed.success) throw new Error('Arbora-T5 repair response did not match its schema.');
          const output = {
            candidates: parsed.data.candidates.map((candidate, index) => ({
              description: `Arbora-T5 proposal ${index + 1}`,
              edits: [],
              repairedCode: candidate.code,
              confidence: 0.5,
              rationale: `Model sequence score: ${candidate.score.toFixed(3)} (not calibrated confidence).`,
            })),
          };
          if (!ArboraRepairResponseSchema.safeParse(output).success) {
            throw new Error('Arbora-T5 repair response did not match the gateway schema.');
          }
          return output;
        }
        const parsed = ArboraAstResponseSchema.safeParse(body);
        if (!parsed.success) throw new Error('Arbora-T5 AST response did not match its schema.');
        return parsed.data;
      } catch (error) {
        if (controller.signal.aborted) {
          throw new DOMException('Model waking up.', 'ModelColdStartError');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    if (response.status >= 500 && attempt === 0) continue;
    if (!response.ok) throw new Error('Model request failed.');

    let responseJson: unknown;
    try {
      responseJson = await response.json();
    } catch {
      throw new Error('Model returned malformed JSON.');
    }
    if (!responseJson || typeof responseJson !== 'object') throw new Error('Model returned no response.');
    const candidateText = (responseJson as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }).candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
    if (!candidateText) throw new Error('Model returned an empty response.');

    let output: unknown;
    try {
      output = JSON.parse(candidateText.replace(/^```json\s*|```\s*$/g, '').trim());
    } catch {
      throw new Error('Model returned malformed JSON.');
    }
    if (!validateModelOutput(request.task, output)) throw new Error('Model response did not match its schema.');
    return output;
  }
  throw new Error('Model request failed.');
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));
  const corsHeaders = getCorsHeaders(origin, allowedOrigins);

  if (!isOriginAllowed(origin, allowedOrigins)) {
    return jsonResponse({ code: 'FORBIDDEN', message: 'Origin is not allowed.' }, 403, corsHeaders);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.endsWith('/health')) {
    const configured = Boolean(
      Deno.env.get('SUPABASE_URL')
        && Deno.env.get('SUPABASE_ANON_KEY')
        && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        && (
          (Deno.env.get('GEMINI_API_KEY') && Deno.env.get('GEMINI_MODEL'))
          || Deno.env.get('ARBORA_MODEL_URL')
        ),
    );
    return jsonResponse(
      configured ? { status: 'ok' } : { code: 'MODEL_ERROR', message: 'AI gateway is not configured.' },
      configured ? 200 : 503,
      corsHeaders,
    );
  }
  if (request.method !== 'POST') {
    return jsonResponse({ code: 'BAD_REQUEST', message: 'Use POST for AI requests.' }, 405, corsHeaders);
  }

  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ code: 'PAYLOAD_TOO_LARGE', message: 'Request payload exceeds 20 KB.' }, 413, corsHeaders);
  }

  let bodyText: string;
  try {
    const body = await readBody(request);
    if (body.tooLarge) {
      return jsonResponse({ code: 'PAYLOAD_TOO_LARGE', message: 'Request payload exceeds 20 KB.' }, 413, corsHeaders);
    }
    bodyText = body.body;
  } catch {
    return jsonResponse({ code: 'BAD_REQUEST', message: 'Unable to read request body.' }, 400, corsHeaders);
  }
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ code: 'PAYLOAD_TOO_LARGE', message: 'Request payload exceeds 20 KB.' }, 413, corsHeaders);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ code: 'BAD_REQUEST', message: 'Request body must be valid JSON.' }, 400, corsHeaders);
  }
  const parsedRequest = GatewayRequestSchema.safeParse(parsedBody);
  if (!parsedRequest.success) {
    return jsonResponse({ code: 'BAD_REQUEST', message: 'Request task or payload is invalid.' }, 400, corsHeaders);
  }

  let userId: string | null;
  try {
    userId = await getAuthenticatedUserId(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return jsonResponse({ code: 'UNAUTHORIZED', message: error.message }, 401, corsHeaders);
    }
    return jsonResponse({ code: 'MODEL_ERROR', message: 'Unable to verify authentication.' }, 500, corsHeaders);
  }

  try {
    await enforceRateLimit(request, userId);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return jsonResponse(
        { code: 'RATE_LIMITED', message: 'AI request limit reached. Try again later.' },
        429,
        { ...corsHeaders, 'Retry-After': String(error.retryAfterSeconds) },
      );
    }
    return jsonResponse({ code: 'MODEL_ERROR', message: 'Unable to apply request limit.' }, 500, corsHeaders);
  }

  const task = parsedRequest.data.task;
  const startedAt = Date.now();
  try {
    const output = await generateModelJson(parsedRequest.data);
    console.log(JSON.stringify({
      event: 'ai_gateway.model_request',
      task,
      outcome: 'success',
      status: 200,
      duration_ms: Date.now() - startedAt,
    }));
    return jsonResponse(output, 200, corsHeaders);
  } catch (error) {
    const coldStart = error instanceof DOMException
      && (error.name === 'ModelColdStartError' || error.name === 'TimeoutError');
    console.error(JSON.stringify({
      event: 'ai_gateway.model_request',
      task,
      outcome: 'failure',
      code: coldStart ? 'MODEL_COLD_START' : 'MODEL_ERROR',
      status: coldStart ? 503 : 502,
      duration_ms: Date.now() - startedAt,
    }));
    if (error instanceof DOMException && error.name === 'ModelColdStartError') {
      return jsonResponse(
        { code: 'MODEL_COLD_START', message: 'Model waking up, retry in 20 s.' },
        503,
        { ...corsHeaders, 'Retry-After': '20' },
      );
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return jsonResponse(
        { code: 'MODEL_COLD_START', message: 'Model waking up, retry in 20 s.' },
        503,
        { ...corsHeaders, 'Retry-After': '20' },
      );
    }
    return jsonResponse({ code: 'MODEL_ERROR', message: 'AI request failed.' }, 502, corsHeaders);
  }
});
