import { z } from 'zod';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type GatewayTask = 'repair' | 'neural_ast' | 'explain' | 'repair_t5' | 'ast_t5';
export type AppErrorCode =
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'TIMEOUT'
  | 'MODEL_ERROR'
  | 'MODEL_COLD_START'
  | 'OFFLINE';

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const RepairPayloadSchema = z.object({
  sourceCode: z.string(),
  errors: z.array(z.object({
    line: z.number().int(),
    column: z.number().int(),
    message: z.string(),
    severity: z.string().optional(),
    expected: z.array(z.string()).optional(),
    found: z.string().optional(),
  })),
  tokens: z.array(z.object({
    line: z.number().int(),
    column: z.number().int(),
    lexeme: z.string(),
  })),
  retryCandidate: z.string().optional(),
  retryErrors: z.string().optional(),
}).strict();

const NeuralAstPayloadSchema = z.object({
  sourceCode: z.string(),
  validationError: z.string().optional(),
}).strict();

const ExplainPayloadSchema = z.object({
  node: z.union([z.record(z.string(), z.json()), z.literal('whole_program'), z.null()]),
  fullCode: z.string(),
  snippet: z.string(),
  level: z.enum(['Beginner', 'Intermediate', 'Expert']),
}).strict();

const T5RepairPayloadSchema = z.object({
  code: z.string().min(1).max(8_192),
  num_beams: z.number().int().min(1).max(8).optional(),
  num_return: z.number().int().min(1).max(8).optional(),
}).strict();
const T5AstPayloadSchema = z.object({
  code: z.string().min(1).max(8_192),
}).strict();

const PayloadSchemas = {
  repair: RepairPayloadSchema,
  neural_ast: NeuralAstPayloadSchema,
  explain: ExplainPayloadSchema,
  repair_t5: T5RepairPayloadSchema,
  ast_t5: T5AstPayloadSchema,
};

const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
});
const RepairResponseSchema = z.object({ candidates: z.array(z.record(z.string(), z.json())) });
const JsonResponseSchema = z.json();
const ExplanationResponseSchema = z.object({
  explanation: z.string(),
  rule: z.string(),
  analogy: z.string(),
});
const ArboraAstResponseSchema = z.object({
  ast_bracketed: z.string(),
  is_valid: z.boolean(),
  model_id: z.string(),
  revision: z.string(),
  latency_ms: z.number(),
});
const T5RepairResponseSchema = z.object({
  candidates: z.array(z.object({
    description: z.string(),
    edits: z.array(z.record(z.string(), z.json())),
    repairedCode: z.string(),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  })).max(8),
});

const ResponseSchemas = {
  repair: RepairResponseSchema,
  neural_ast: JsonResponseSchema,
  explain: ExplanationResponseSchema,
  repair_t5: T5RepairResponseSchema,
  ast_t5: ArboraAstResponseSchema,
};

type PayloadFor<T extends GatewayTask> = z.infer<(typeof PayloadSchemas)[T]>;
type ResultFor<T extends GatewayTask> = z.infer<(typeof ResponseSchemas)[T]>;

let gatewayAvailable = false;
const availabilityListeners = new Set<(available: boolean) => void>();

function setGatewayAvailable(available: boolean) {
  gatewayAvailable = available;
  availabilityListeners.forEach((listener) => listener(available));
}

export function isAiAvailable(): boolean {
  return isSupabaseConfigured && gatewayAvailable;
}

export function subscribeAiAvailability(listener: (available: boolean) => void): () => void {
  availabilityListeners.add(listener);
  return () => availabilityListeners.delete(listener);
}

function getGatewayUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url || !isSupabaseConfigured) throw new AppError('OFFLINE', 'Supabase is not configured.');
  return `${url.replace(/\/+$/, '')}/functions/v1/ai-gateway`;
}

function mapErrorCode(code: string, status: number): AppErrorCode {
  if (code === 'MODEL_COLD_START') return 'MODEL_COLD_START';
  if (code === 'RATE_LIMITED' || status === 429) return 'RATE_LIMITED';
  if (code === 'UNAUTHORIZED' || status === 401) return 'UNAUTHORIZED';
  if (code === 'TIMEOUT' || status === 408 || status === 504) return 'TIMEOUT';
  if (status >= 500 || code === 'MODEL_ERROR') return 'MODEL_ERROR';
  return 'MODEL_ERROR';
}

export async function checkAiAvailability(signal?: AbortSignal): Promise<boolean> {
  if (!isSupabaseConfigured) {
    setGatewayAvailable(false);
    return false;
  }

  try {
    const url = getGatewayUrl();
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    };
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const response = await fetch(`${url}/health`, { headers, signal });
    const result: unknown = await response.json();
    const available = response.ok && z.object({ status: z.literal('ok') }).safeParse(result).success;
    setGatewayAvailable(available);
    return available;
  } catch {
    setGatewayAvailable(false);
    return false;
  }
}

export async function callGateway<T extends GatewayTask>(
  task: T,
  payload: PayloadFor<T>,
  options: { signal?: AbortSignal } = {}
): Promise<ResultFor<T>> {
  if (!isSupabaseConfigured) {
    throw new AppError('OFFLINE', 'Supabase is not configured.');
  }

  const validatedPayload = PayloadSchemas[task].safeParse(payload);
  if (!validatedPayload.success) {
    throw new AppError('MODEL_ERROR', 'AI request payload is invalid.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 25_000);
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) {
    abortFromCaller();
  } else {
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    const url = getGatewayUrl();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new AppError('OFFLINE', 'Unable to retrieve the Supabase session.');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          'Content-Type': 'application/json',
          ...(data.session?.access_token
            ? { Authorization: `Bearer ${data.session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ task, payload: validatedPayload.data }),
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new AppError('TIMEOUT', 'AI request timed out.');
      }
      throw new AppError('OFFLINE', 'AI gateway is unavailable.');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (timedOut) throw new AppError('TIMEOUT', 'AI request timed out.');
      throw new AppError('MODEL_ERROR', 'AI gateway returned malformed JSON.');
    }

    if (!response.ok) {
      const gatewayError = ErrorResponseSchema.safeParse(body);
      const code = gatewayError.success ? gatewayError.data.code : 'MODEL_ERROR';
      const message = gatewayError.success ? gatewayError.data.message : 'AI request failed.';
      throw new AppError(mapErrorCode(code, response.status), message);
    }

    const parsed = ResponseSchemas[task].safeParse(body);
    if (!parsed.success) {
      throw new AppError('MODEL_ERROR', 'AI gateway response did not match its schema.');
    }
    return parsed.data as ResultFor<T>;
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'OFFLINE' || error.code === 'TIMEOUT' || error.code === 'MODEL_ERROR') {
        setGatewayAvailable(false);
      }
      throw error;
    }
    throw new AppError('OFFLINE', 'AI gateway is unavailable.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
