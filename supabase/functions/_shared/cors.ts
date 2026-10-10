const LOCAL_ORIGIN = 'http://localhost:3000';

export function getAllowedOrigins(envValue: string | undefined): Set<string> {
  return new Set([LOCAL_ORIGIN, ...(envValue ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)]);
}

export function isOriginAllowed(origin: string | null, allowedOrigins: Set<string>): boolean {
  return origin !== null && allowedOrigins.has(origin);
}

export function getCorsHeaders(origin: string | null, allowedOrigins: Set<string>): HeadersInit {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
