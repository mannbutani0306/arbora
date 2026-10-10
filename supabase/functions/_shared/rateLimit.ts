import { createClient } from 'npm:@supabase/supabase-js@2';
import { getRateLimitWindow } from './schemas.ts';

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Rate limit exceeded.');
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? 'unknown';
}

export async function enforceRateLimit(request: Request, userId: string | null): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) throw new Error('Supabase service role is not configured.');

  const principalType = userId ? 'user' : 'guest';
  const principalKey = userId ?? await sha256Hex(
    `${getClientIp(request)}:${Deno.env.get('AI_RATE_LIMIT_SALT') ?? serviceRoleKey}`,
  );
  const limit = userId ? 60 : 15;
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc('consume_ai_usage', {
    p_principal_type: principalType,
    p_principal_key: principalKey,
    p_limit: limit,
  });
  if (error) throw new Error('Unable to apply AI rate limit.');

  const result = Array.isArray(data) ? data[0] : null;
  if (result?.allowed !== true) {
    const window = getRateLimitWindow(Date.now());
    throw new RateLimitError(Number(result?.retry_after) || window.retryAfterSeconds);
  }
}
