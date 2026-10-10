import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, callGateway, checkAiAvailability, isAiAvailable } from './gatewayClient';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'user-jwt' } },
        error: null,
      }),
    },
  },
}));

describe('AI gateway client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.example');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns schema-validated explanation data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      explanation: 'A function is declared.',
      rule: 'FunctionDecl -> ...',
      analogy: 'A recipe.',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await callGateway('explain', {
      node: 'whole_program',
      fullCode: 'int main() { return 0; }',
      snippet: 'int main() { return 0; }',
      level: 'Beginner',
    });

    expect(result.explanation).toBe('A function is declared.');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.example/functions/v1/ai-gateway',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer user-jwt' }),
      })
    );
  });

  it('maps 429 responses to RATE_LIMITED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'RATE_LIMITED',
      message: 'Try later.',
    }), { status: 429 })));

    await expect(callGateway('neural_ast', { sourceCode: 'int main() {}' }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('maps request timeouts to TIMEOUT', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, options?: RequestInit) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    ));

    const request = callGateway('neural_ast', { sourceCode: 'int main() {}' });
    const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
  });

  it('rejects malformed success JSON as a model error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{bad json', { status: 200 })));

    await expect(callGateway('neural_ast', { sourceCode: 'int main() {}' }))
      .rejects.toMatchObject({ code: 'MODEL_ERROR' });
  });

  it('marks AI available only after a successful health ping', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 'MODEL_ERROR',
        message: 'AI gateway is not configured.',
      }), { status: 503 })));

    expect(isAiAvailable()).toBe(false);
    expect(await checkAiAvailability()).toBe(true);
    expect(isAiAvailable()).toBe(true);
    expect(await checkAiAvailability()).toBe(false);
    expect(isAiAvailable()).toBe(false);
  });

  it('exposes typed gateway errors', () => {
    const error = new AppError('OFFLINE', 'Offline');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('OFFLINE');
  });
});
