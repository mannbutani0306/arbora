import { createClient } from 'npm:@supabase/supabase-js@2';

export class AuthenticationError extends Error {}

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw new AuthenticationError('Invalid authorization header.');

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('Supabase authentication is not configured.');

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) throw new AuthenticationError('Invalid or expired access token.');
  return data.user.id;
}
