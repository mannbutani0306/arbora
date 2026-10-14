// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from './parser';
import {
  downloadCSV,
  downloadJSON,
  loadBenchmarkDataset,
  runBenchmarkSuite,
} from './benchmarkRunner';
import { injectSingleTokenError } from './errorInjector';
import { generateBenchmarkPrograms, generateUniquePrograms } from './programGenerator';
import { classicalRepair } from './classicalRepair';
import { repairCode } from '../ai/repair';
import { generateNeuralAst } from '../ai/neuralAst';
import { listSamples } from '../lib/dataService';
import type { RepairCandidate, RepairResponse } from '../ai/repair';

const mocks = vi.hoisted(() => ({
  injectSingleTokenError: vi.fn(),
  generateBenchmarkPrograms: vi.fn(),
  generateUniquePrograms: vi.fn(),
  classicalRepair: vi.fn(),
  repairCode: vi.fn(),
  generateNeuralAst: vi.fn(),
  listSamples: vi.fn(),
}));

vi.mock('./errorInjector', () => ({ injectSingleTokenError: mocks.injectSingleTokenError }));
vi.mock('./programGenerator', () => ({
  generateBenchmarkPrograms: mocks.generateBenchmarkPrograms,
  generateUniquePrograms: mocks.generateUniquePrograms,
}));
vi.mock('./classicalRepair', () => ({ classicalRepair: mocks.classicalRepair }));
vi.mock('../ai/repair', () => ({ repairCode: mocks.repairCode }));
vi.mock('../ai/neuralAst', () => ({ generateNeuralAst: mocks.generateNeuralAst }));
vi.mock('../lib/dataService', () => ({ listSamples: mocks.listSamples }));

const sourceCode = 'int main() { return 0; }';
const brokenCode = 'int main() { return 0 }';

function candidate(repairedCode: string): RepairCandidate {
  return {
    id: 'candidate',
    description: 'fixture',
    edits: [],
    repairedCode,
    confidence: 1,
    rationale: 'fixture',
    verified: true,
    editDistance: 1,
    remainingErrors: [],
    engineId: 'classical',
  };
}

function response(candidates: RepairCandidate[]): RepairResponse {
  return {
    candidates,
    verifiedCandidate: candidates[0] ?? null,
    bestCandidate: candidates[0] ?? null,
    fellBackToClassical: false,
    latencyMs: 7,
    model: 'Classical',
  };
}

describe('benchmark runner integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listSamples).mockResolvedValue([
      {
        id: 'sample',
        title: 'Sample',
        category: 'Basics',
        source_code: sourceCode,
        difficulty: 'Easy',
      },
      {
        id: 'broken',
        title: 'Broken sample',
        category: 'malformed',
        source_code: brokenCode,
        difficulty: 'Easy',
      },
    ]);
    vi.mocked(generateBenchmarkPrograms).mockReturnValue([]);
    vi.mocked(generateUniquePrograms).mockReturnValue([]);
    vi.mocked(injectSingleTokenError).mockImplementation((code, errorType) => ({
      original: code,
      mutated: brokenCode,
      type: errorType ?? 'delete',
      tokenIndex: 1,
      firstErrorFound: true,
      originalCode: code,
      mutatedCode: brokenCode,
      errorType: errorType ?? 'delete',
      description: `Injected ${errorType}`,
      targetLine: 1,
      targetCol: 1,
      affectedToken: ';',
    }));
    vi.mocked(classicalRepair).mockReturnValue([
      { edits: [], repairedCode: sourceCode, editCost: 1, verified: true },
    ]);
    vi.mocked(repairCode).mockResolvedValue(response([candidate(sourceCode)]));
    vi.mocked(generateNeuralAst).mockResolvedValue({
      ast: parse(sourceCode).ast,
      isValid: true,
      latencyMs: 9,
      retried: false,
      model: 'fixture',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters malformed samples and adds both generated program sets', async () => {
    vi.mocked(generateBenchmarkPrograms).mockReturnValue([
      { id: 'retained', name: 'Retained', category: 'Functions', code: sourceCode },
    ]);
    vi.mocked(generateUniquePrograms).mockReturnValue([
      {
        id: 'generated',
        name: 'Generated',
        category: 'Functions',
        code: sourceCode,
        seed: 42,
        sizeClass: 'small',
        tokenCount: 5,
      },
    ]);

    const dataset = await loadBenchmarkDataset();

    expect(dataset.map(({ id }) => id)).toEqual(['sample', 'retained', 'generated']);
    expect(generateUniquePrograms).toHaveBeenCalledWith(100, 20261011, {
      sizeClass: 'medium',
      maxDepth: 3,
    });
  });

  it('runs one program through repair and neural comparison and reports progress', async () => {
    const progress = vi.fn();
    const summary = await runBenchmarkSuite({
      engine: 'classical',
      concurrency: 1,
      onProgress: progress,
    });

    expect(summary.totalPrograms).toBe(1);
    expect(summary.items[0]).toMatchObject({
      name: 'Sample',
      errorType: 'delete',
      classicalValidSuccess: true,
      aiRepairTop1Exact: true,
      aiRepairVerified: true,
      neuralAstValid: true,
      neuralAstExactMatch: true,
    });
    expect(summary.classical.validSuccessRate).toBe(100);
    expect(summary.aiRepair.top1ExactRate).toBe(100);
    expect(summary.aiRepair.top1ExactRateByErrorType.delete).toBe(100);
    expect(summary.neuralAst.validityRate).toBe(100);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'preparing' }));
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'finalizing' }));
  });

  it('reports unavailable sources, network failures, and explicit cancellation', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(listSamples).mockRejectedValueOnce(new Error('offline'));
    expect(await loadBenchmarkDataset()).toHaveLength(0);

    vi.mocked(listSamples).mockResolvedValueOnce([
      {
        id: 'sample',
        title: 'Sample',
        category: 'Basics',
        source_code: sourceCode,
        difficulty: 'Easy',
      },
    ]);
    vi.mocked(repairCode).mockRejectedValueOnce(new Error('network unavailable'));
    const summary = await runBenchmarkSuite({ concurrency: 1 });
    expect(summary.items[0].aiRepairCandidateCount).toBe(0);
    expect(summary.items[0].aiRepairVerified).toBe(false);

    await expect(runBenchmarkSuite({ checkCancelled: () => true }))
      .rejects.toThrow('Benchmark suite cancelled by user');
  });

  it('fails clearly when there are no programs or cancellation occurs mid-item', async () => {
    vi.mocked(listSamples).mockResolvedValue([]);
    await expect(runBenchmarkSuite({})).rejects.toThrow('No benchmark programs available');

    vi.mocked(listSamples).mockResolvedValue([
      {
        id: 'sample',
        title: 'Sample',
        category: 'Basics',
        source_code: sourceCode,
        difficulty: 'Easy',
      },
    ]);
    let checks = 0;
    await expect(runBenchmarkSuite({
      checkCancelled: () => {
        checks += 1;
        return checks === 2;
      },
    })).rejects.toThrow('Benchmark cancelled');
  });

  it('downloads benchmark data as CSV and JSON', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:benchmark');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadCSV('report.csv', 'name,value');
    downloadJSON('report.json', { programs: 1 });

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
  });
});
