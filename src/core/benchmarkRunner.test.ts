import { describe, it, expect } from 'vitest';
import { generateBenchmarkPrograms } from './programGenerator';
import { injectSingleTokenError } from './errorInjector';
import { parse } from './parser';
import { exportBenchmarkToCSV, BenchmarkSuiteSummary } from './benchmarkRunner';

describe('Benchmark Suite & Generators', () => {
  it('generates 20 valid MiniC programs that all parse without errors', () => {
    const progs = generateBenchmarkPrograms();
    expect(progs).toHaveLength(20);

    for (const p of progs) {
      const res = parse(p.code);
      expect(res.success).toBe(true);
      expect(res.errors).toHaveLength(0);
    }
  });

  describe('Error Injector', () => {
    const sampleCode = `int main() {
  int x = 42;
  return x;
}`;

    it('injects single-token delete error that triggers parse error', () => {
      const res = injectSingleTokenError(sampleCode, 'delete', 0);
      expect(res.errorType).toBe('delete');
      const parseRes = parse(res.mutatedCode);
      expect(parseRes.errors.length).toBeGreaterThan(0);
    });

    it('injects single-token insert error that triggers parse error', () => {
      const res = injectSingleTokenError(sampleCode, 'insert', 1);
      expect(res.errorType).toBe('insert');
      const parseRes = parse(res.mutatedCode);
      expect(parseRes.errors.length).toBeGreaterThan(0);
    });

    it('injects single-token swap error that triggers parse error', () => {
      const res = injectSingleTokenError(sampleCode, 'swap', 2);
      expect(res.errorType).toBe('swap');
      const parseRes = parse(res.mutatedCode);
      expect(parseRes.errors.length).toBeGreaterThan(0);
    });
  });

  describe('CSV Export', () => {
    it('produces valid CSV headers and rows', () => {
      const mockSummary: BenchmarkSuiteSummary = {
        id: 'bench_123',
        timestamp: Date.now(),
        durationMs: 120,
        totalPrograms: 1,
        classical: { validSuccessRate: 100, avgParseMs: 1.5 },
        aiRepair: {
          top1Accuracy: 100,
          top3Accuracy: 100,
          verifiedRate: 100,
          avgLatencyMs: 300,
          accuracyByErrorType: { delete: 100, insert: 100, swap: 100 },
        },
        neuralAst: {
          avgTed: 0,
          avgF1: 1.0,
          exactMatchRate: 100,
          validityRate: 100,
        },
        ablation: {
          withoutAiSuccessRate: 0,
          withAiSuccessRate: 100,
        },
        items: [
          {
            id: 'item_1',
            name: 'Test Prog',
            category: 'Functions',
            sourceCode: 'int main() { return 0; }',
            classicalValidSuccess: true,
            classicalValidParseMs: 1.5,
            mutatedCode: 'int main() { return 0 }',
            errorType: 'delete',
            errorDescription: 'Deleted semicolon',
            classicalWithoutAiSuccess: false,
            aiRepairTop1Acc: true,
            aiRepairTop3Acc: true,
            aiRepairVerified: true,
            aiRepairLatencyMs: 250,
            aiRepairCandidateCount: 2,
            neuralAstValid: true,
            neuralAstTed: 0,
            neuralAstF1: 1.0,
            neuralAstExactMatch: true,
            neuralAstLatencyMs: 300,
          },
        ],
      };

      const csv = exportBenchmarkToCSV(mockSummary);
      expect(csv).toContain('Program Name');
      expect(csv).toContain('"Test Prog"');
      expect(csv).toContain('YES');
    });
  });
});
