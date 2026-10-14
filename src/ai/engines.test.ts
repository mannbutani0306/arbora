import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  astEngines,
  createRepairEngines,
  clearRepairEngineCache,
  mergeEnsembleCandidates,
} from './engines';
import type { RepairCandidate, RepairResponse } from './repair';
import { verifyAndRankCandidates } from './repair';

const { callGatewayMock } = vi.hoisted(() => ({
  callGatewayMock: vi.fn(),
}));

vi.mock('./gatewayClient', () => ({ callGateway: callGatewayMock }));

import { callGateway } from './gatewayClient';

function candidate(
  id: string,
  code: string,
  engineId: RepairCandidate['engineId'],
  verified: boolean,
  confidence: number
): RepairCandidate {
  return {
    id,
    description: 'test',
    edits: [],
    repairedCode: code,
    confidence,
    rationale: '',
    verified,
    editDistance: 1,
    remainingErrors: [],
    engineId,
    agreedBy: [engineId],
  };
}

describe('repair engine orchestration helpers', () => {
  afterEach(() => {
    clearRepairEngineCache();
    vi.clearAllMocks();
  });

  it('deduplicates normalized code and ranks verified consensus before confidence', () => {
    const shared = candidate('one', 'int main() { return 0; }', 'classical', true, 0.2);
    const agreed = candidate('two', 'int main(){return 0;}//same', 'arbora-t5', true, 0.3);
    const unverified = candidate('three', 'int main() { return }', 'gemini', false, 0.99);
    const merged = mergeEnsembleCandidates([[shared, unverified], [agreed]]);

    expect(merged).toHaveLength(2);
    expect(merged[0].agreedBy).toEqual(['classical', 'arbora-t5']);
    expect(merged[1].verified).toBe(false);
  });

  it('caches each successful response by source and selected engine', async () => {
    const executor = vi.fn(async (engine): Promise<RepairResponse> => ({
      candidates: [candidate('cached', 'int main() { return 0; }', engine as 'classical', true, 0.5)],
      verifiedCandidate: null,
      bestCandidate: null,
      fellBackToClassical: false,
      latencyMs: 12,
      model: engine,
    }));
    const registry = createRepairEngines(executor);
    const first = await registry.classical.repair('broken', [], []);
    const second = await registry.classical.repair('broken', [], []);
    await registry.ngram.repair('broken', [], []);

    expect(executor).toHaveBeenCalledTimes(2);
    expect(first.latencyMs).toBe(12);
    expect(second.latencyMs).toBe(0);
  });

  it('never verifies an invalid candidate from a model engine', () => {
    const result = verifyAndRankCandidates(
      [{ repairedCode: 'int main() { return }', confidence: 1 }],
      'broken',
      'arbora-t5'
    );
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(false);
    expect(result[0].engineId).toBe('arbora-t5');
  });

  it('parses and caches a valid Arbora-T5 bracketed AST', async () => {
    callGatewayMock.mockResolvedValue({
      ast_bracketed: '(Program (FunctionDecl (Block (ReturnStmt))))',
      is_valid: true,
      latency_ms: 18,
      model_id: 'fixture/ast',
    });

    const first = await astEngines['arbora-t5'].generate('int main() { return 0; }');
    const second = await astEngines['arbora-t5'].generate('int main() { return 0; }');

    expect(first.ast?.type).toBe('Program');
    expect(first.ast?.children[0].id).toMatch(/^arbora_/);
    expect(first.astBracketed).toContain('(Program');
    expect(first.isValid).toBe(true);
    expect(first.model).toBe('fixture/ast');
    expect(second.latencyMs).toBe(0);
    expect(callGateway).toHaveBeenCalledTimes(1);
  });

  it('does not accept malformed or non-Program bracketed AST roots', async () => {
    callGatewayMock
      .mockResolvedValueOnce({
        ast_bracketed: '(Program (FunctionDecl)',
        is_valid: true,
        latency_ms: 0,
        model_id: 'fixture/ast',
      })
      .mockResolvedValueOnce({
        ast_bracketed: '(FunctionDecl)',
        is_valid: true,
        latency_ms: 0,
        model_id: 'fixture/ast',
      });

    const malformed = await astEngines['arbora-t5'].generate('malformed');
    const wrongRoot = await astEngines['arbora-t5'].generate('wrong-root');

    expect(malformed).toMatchObject({ ast: null, isValid: false });
    expect(wrongRoot).toMatchObject({ ast: null, isValid: false });
    expect(callGatewayMock).toHaveBeenCalledTimes(2);
  });

  it('caches valid Gemini ASTs, but not invalid or aborted results', async () => {
    const valid = {
      type: 'Program',
      span: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
      children: [],
    };
    callGatewayMock
      .mockResolvedValueOnce(valid)
      .mockResolvedValueOnce({ type: 'FunctionDecl' })
      .mockResolvedValueOnce({ type: 'FunctionDecl' })
      .mockResolvedValueOnce(valid)
      .mockResolvedValueOnce(valid);

    const first = await astEngines.gemini.generate('valid');
    const cached = await astEngines.gemini.generate('valid');
    const invalid = await astEngines.gemini.generate('invalid');
    const controller = new AbortController();
    controller.abort();
    const uncached = await astEngines.gemini.generate('aborted', { signal: controller.signal });
    await astEngines.gemini.generate('aborted', { signal: controller.signal });

    expect(first.isValid).toBe(true);
    expect(first.astBracketed).toBe('(Program)');
    expect(cached.latencyMs).toBe(0);
    expect(invalid).toMatchObject({ ast: null, isValid: false, astBracketed: null });
    expect(uncached.isValid).toBe(true);
    expect(callGatewayMock).toHaveBeenCalledTimes(5);
  });
});
