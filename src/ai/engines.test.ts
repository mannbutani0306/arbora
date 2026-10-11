import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRepairEngines, clearRepairEngineCache, mergeEnsembleCandidates } from './engines';
import type { RepairCandidate, RepairResponse } from './repair';
import { verifyAndRankCandidates } from './repair';

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
  afterEach(() => clearRepairEngineCache());

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
});
