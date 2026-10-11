import { describe, it, expect } from 'vitest';
import { generateBenchmarkPrograms } from './programGenerator';
import { injectSingleTokenError } from './errorInjector';
import { parse } from './parser';
import { exportBenchmarkToCSV, BenchmarkSuiteSummary } from './benchmarkRunner';
import { createBaselines } from './baselines';
import { trainNgram } from './ngramRepair';

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
          top1ExactRate: 100,
          top3ExactRate: 100,
          verifiedRate: 100,
          avgLatencyMs: 300,
          top1ExactRateByErrorType: {
            delete: 100,
            insert: 100,
            swap: 100,
            replace: 100,
            natural: 100,
          },
        },
        neuralAst: {
          avgTed: 0,
          avgF1: 1.0,
          exactMatchRate: 100,
          validityRate: 100,
        },
        ablation: {
          b0NoneExactRate: 0,
          b1ClassicalTop1ExactRate: 0,
          aiRawTop3ExactRate: 100,
          aiVerifiedTop3ExactRate: 100,
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
            b0Exact: false,
            b1Top1Exact: true,
            aiRawTop3Exact: true,
            aiVerifiedTop3Exact: true,
            aiRepairTop1Exact: true,
            aiRepairTop3Exact: true,
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

    it('exposes B0, B1, and B2 through the same deterministic repair interface', () => {
      const model = trainNgram([['int', 'main', '(', ')', '{', 'return', '0', ';', '}']]);
      const [b0, b1, b2] = createBaselines(model);
      const broken = 'int main() { return 0 }';
      expect([b0.name, b1.name, b2.name]).toEqual(['B0', 'B1', 'B2']);
      expect(b0.repair(broken)).toEqual([]);
      expect(b1.repair(broken).length).toBeGreaterThan(0);
      expect(b2.repair(broken).every((candidate) => candidate.verified)).toBe(true);
    });
  });
});
