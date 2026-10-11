// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parse } from '../../core/parser';
import { lex } from '../../core/lexer';
import type { WorkerParseResponse } from '../../core/parserWorker';
import { usePipeline } from './usePipeline';

function createWorkerHarness() {
  const requests: Array<{ id: number; source: string }> = [];
  let listener: ((event: MessageEvent<WorkerParseResponse>) => void) | null = null;
  const worker = {
    onmessage: null as ((event: MessageEvent<WorkerParseResponse>) => void) | null,
    onerror: null,
    postMessage: (request: { id: number; source: string }) => requests.push(request),
    terminate: () => undefined,
  } as unknown as Worker;
  Object.defineProperty(worker, 'onmessage', {
    get: () => listener,
    set: (next: typeof listener) => {
      listener = next;
    },
  });
  return {
    worker,
    requests,
    reply(id: number, source: string) {
      listener?.({
        data: {
          id,
          parseResult: parse(source),
          tokens: lex(source).tokens,
          metrics: { durationMs: 1, tokenCount: 1, nodeCount: 1, maxDepth: 1, errorCount: 0 },
        },
      } as MessageEvent<WorkerParseResponse>);
    },
  };
}

describe('usePipeline', () => {
  it('ignores stale worker responses after a newer parse request', () => {
    const harness = createWorkerHarness();
    const { result } = renderHook(() =>
      usePipeline('', 'Strict', {
        workerFactory: () => harness.worker,
        debounceMs: 60_000,
      }),
    );

    act(() => {
      result.current.run('int oldValue;');
      result.current.run('int newValue;');
    });
    const [oldRequest, newRequest] = harness.requests;
    act(() => harness.reply(newRequest.id, newRequest.source));
    act(() => harness.reply(oldRequest.id, oldRequest.source));

    expect(result.current.tokens.some((token) => token.lexeme === 'newValue')).toBe(true);
    expect(result.current.tokens.some((token) => token.lexeme === 'oldValue')).toBe(false);
  });
});
