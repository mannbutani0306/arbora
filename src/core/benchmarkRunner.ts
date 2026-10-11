/**
 * Benchmark runner engine for MiniC compiler.
 * - Loads valid programs from Supabase samples plus retained and seeded generated examples
 * - Injects seeded syntax errors across five mutation types
 * - Throttles AI gateway calls with concurrency 2-3
 * - Implements rate limit retry with exponential backoff
 * - Evaluates:
 *   - Classical: valid code success rate, avg parse ms
 *   - AI repair: top-1 & top-3 exact correctness, verified rate, avg latency, exact correctness by error type
 *   - Neural AST: avg TED, avg F1, exact-match rate, validity rate
 *   - Ablation: success rate without vs with AI repair
 */

import { parse } from './parser';
import { generateBenchmarkPrograms } from './programGenerator';
import { injectSingleTokenError, ErrorInjectionType } from './errorInjector';
import { generateUniquePrograms } from './programGenerator';
import { classicalRepair } from './classicalRepair';
import { repairCode, RepairResponse } from '../ai/repair';
import { generateNeuralAst, NeuralAstResult } from '../ai/neuralAst';
import { compareASTs, ComparisonMetrics } from './compare';
import { scoreRepair } from './repairMetrics';
import { listSamples } from '../lib/dataService';

export interface BenchmarkItemResult {
  id: string;
  name: string;
  category: string;
  sourceCode: string;
  // Classical on valid
  classicalValidSuccess: boolean;
  classicalValidParseMs: number;

  // Injected error
  mutatedCode: string;
  errorType: ErrorInjectionType;
  errorDescription: string;

  b0Exact: boolean;
  b1Top1Exact: boolean;
  aiRawTop3Exact: boolean;
  aiVerifiedTop3Exact: boolean;
  aiRepairTop1Exact: boolean;
  aiRepairTop3Exact: boolean;
  aiRepairVerified: boolean;
  aiRepairLatencyMs: number;
  aiRepairCandidateCount: number;

  // Neural AST
  neuralAstValid: boolean;
  neuralAstTed: number;
  neuralAstF1: number;
  neuralAstExactMatch: boolean;
  neuralAstLatencyMs: number;
}

export interface BenchmarkSuiteSummary {
  id: string;
  timestamp: number;
  durationMs: number;
  totalPrograms: number;
  classical: {
    validSuccessRate: number; // 0 - 100
    avgParseMs: number;
  };
  aiRepair: {
    top1ExactRate: number; // 0 - 100
    top3ExactRate: number; // 0 - 100
    verifiedRate: number; // 0 - 100
    avgLatencyMs: number;
    top1ExactRateByErrorType: {
      delete: number; // 0 - 100
      insert: number; // 0 - 100
      swap: number; // 0 - 100
      replace: number;
      natural: number;
    };
  };
  neuralAst: {
    avgTed: number;
    avgF1: number; // 0.0 - 1.0
    exactMatchRate: number; // 0 - 100
    validityRate: number; // 0 - 100
  };
  ablation: {
    b0NoneExactRate: number;
    b1ClassicalTop1ExactRate: number;
    aiRawTop3ExactRate: number;
    aiVerifiedTop3ExactRate: number;
  };
  items: BenchmarkItemResult[];
}

export interface BenchmarkProgress {
  completed: number;
  total: number;
  currentProgramName: string;
  stage: 'preparing' | 'parsing' | 'repairing' | 'neural' | 'finalizing';
  percent: number;
}

/**
 * Retries an async action on rate limits (429 or RESOURCE_EXHAUSTED) with exponential backoff.
 */
async function retryOnRateLimit<T>(
  action: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await action();
    } catch (err: any) {
      attempt++;
      const msg = String(err?.message || err || '').toLowerCase();
      const isRateLimit =
        msg.includes('429') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota') ||
        msg.includes('rate');

      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  return await action();
}

/**
 * Loads valid benchmark programs:
 * All Supabase samples EXCEPT category/difficulty 'broken' or 'malformed' + 20 generated programs.
 */
export async function loadBenchmarkDataset(): Promise<Array<{ id: string; name: string; category: string; code: string }>> {
  const result: Array<{ id: string; name: string; category: string; code: string }> = [];

  // 1. Fetch Supabase samples
  try {
    const samples = await listSamples();
    const validSamples = samples.filter((s) => {
      const cat = (s.category || '').toLowerCase();
      const diff = (s.difficulty || '').toLowerCase();
      return (
        cat !== 'broken' &&
        cat !== 'malformed' &&
        diff !== 'broken' &&
        diff !== 'malformed'
      );
    });

    for (const sample of validSamples) {
      result.push({
        id: sample.id,
        name: sample.title,
        category: sample.category || 'Samples',
        code: sample.source_code,
      });
    }
  } catch (err) {
    console.warn('Could not fetch Supabase samples for benchmark:', err);
  }

  // 2. Add the retained handwritten set and 100 seeded grammar-generated programs.
  const generated = [
    ...generateBenchmarkPrograms(),
    ...generateUniquePrograms(100, 20261011, {
      sizeClass: 'medium',
      maxDepth: 3,
    }),
  ];
  for (const prog of generated) {
    result.push({
      id: prog.id,
      name: prog.name,
      category: prog.category,
      code: prog.code,
    });
  }

  return result;
}

/**
 * Runs the benchmark suite with concurrency 2-3 and cancellation support.
 */
export async function runBenchmarkSuite(params: {
  concurrency?: number;
  userId?: string | null;
  onProgress?: (progress: BenchmarkProgress) => void;
  checkCancelled?: () => boolean;
}): Promise<BenchmarkSuiteSummary> {
  const { concurrency = 2, userId, onProgress, checkCancelled } = params;
  const suiteStartTime = performance.now();

  onProgress?.({
    completed: 0,
    total: 1,
    currentProgramName: 'Loading dataset',
    stage: 'preparing',
    percent: 0,
  });

  const dataset = await loadBenchmarkDataset();
  const total = dataset.length;

  if (total === 0) {
    throw new Error('No benchmark programs available');
  }

  const results: BenchmarkItemResult[] = [];
  let completedCount = 0;

  // Process item helper
  async function processItem(
    item: { id: string; name: string; category: string; code: string },
    index: number
  ): Promise<BenchmarkItemResult> {
    if (checkCancelled?.()) {
      throw new Error('Benchmark cancelled');
    }

    // 1. Classical parse on valid code
    const t0 = performance.now();
    const validParse = parse(item.code);
    const validDuration = Math.round((performance.now() - t0) * 100) / 100;

    // 2. Inject single-token error (rotate between delete, insert, swap)
    const errorTypeOrder: ErrorInjectionType[] = ['delete', 'insert', 'swap', 'replace', 'natural'];
    const chosenType = errorTypeOrder[index % errorTypeOrder.length];
    const injection = injectSingleTokenError(item.code, chosenType, index);

    // 3. Classical parser-only baseline; syntax-corrupted input cannot exactly match truth.
    const mutatedParse = parse(injection.mutatedCode);
    const b1Candidates = classicalRepair(injection.mutatedCode);
    const b1Score = scoreRepair(b1Candidates, item.code);

    // 4. AI Repair on mutated code (with retry on rate limits)
    let aiRepairTop1Exact = false;
    let aiRepairTop3Exact = false;
    let aiRepairVerified = false;
    let aiRepairLatencyMs = 0;
    let aiRepairCandidateCount = 0;
    let aiRawTop3Exact = false;
    let aiVerifiedTop3Exact = false;

    try {
      const repairRes: RepairResponse = await retryOnRateLimit(() =>
        repairCode({
          sourceCode: injection.mutatedCode,
          tokens: mutatedParse.tokens,
          errors: mutatedParse.errors,
          userId,
          groundTruth: item.code,
          errorType: injection.errorType,
        })
      );

      aiRepairLatencyMs = repairRes.latencyMs;
      aiRepairCandidateCount = repairRes.candidates.length;
      const aiCandidates = repairRes.candidates.filter((candidate) => !candidate.isFallback);
      aiRepairVerified = aiCandidates.some((candidate) => candidate.verified);

      const repairScore = scoreRepair(aiCandidates, item.code);
      aiRepairTop1Exact = repairScore.top1Exact;
      aiRepairTop3Exact = repairScore.top3Exact;
      aiRawTop3Exact = repairScore.top3Exact;
      aiVerifiedTop3Exact = scoreRepair(
        aiCandidates.filter((candidate) => candidate.verified),
        item.code
      ).top3Exact;
    } catch {
      // In case of network / timeout, defaults remain false
    }

    // 5. Neural AST generation & comparison (throttled with retry)
    let neuralAstValid = false;
    let neuralAstTed = 0;
    let neuralAstF1 = 0;
    let neuralAstExactMatch = false;
    let neuralAstLatencyMs = 0;

    try {
      const neuralRes: NeuralAstResult = await retryOnRateLimit(() =>
        generateNeuralAst(item.code)
      );

      neuralAstValid = neuralRes.isValid;
      neuralAstLatencyMs = neuralRes.latencyMs;

      if (neuralRes.ast && validParse.ast) {
        const comp: ComparisonMetrics = compareASTs(validParse.ast, neuralRes.ast);
        neuralAstTed = comp.treeEditDistance;
        neuralAstF1 = Number(comp.f1.toFixed(3));
        neuralAstExactMatch = comp.isExactMatch;
      }
    } catch {
      // Offline / error defaults
    }

    return {
      id: `${item.id}_${index}`,
      name: item.name,
      category: item.category,
      sourceCode: item.code,
      classicalValidSuccess: validParse.success && validParse.errors.length === 0,
      classicalValidParseMs: validDuration,
      mutatedCode: injection.mutatedCode,
      errorType: injection.errorType,
      errorDescription: injection.description,
      b0Exact: false,
      b1Top1Exact: b1Score.top1Exact,
      aiRawTop3Exact,
      aiVerifiedTop3Exact,
      aiRepairTop1Exact,
      aiRepairTop3Exact,
      aiRepairVerified,
      aiRepairLatencyMs,
      aiRepairCandidateCount,
      neuralAstValid,
      neuralAstTed,
      neuralAstF1,
      neuralAstExactMatch,
      neuralAstLatencyMs,
    };
  }

  // Concurrency Pool Runner
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < total) {
      if (checkCancelled?.()) return;
      const current = nextIdx++;
      const item = dataset[current];

      onProgress?.({
        completed: completedCount,
        total,
        currentProgramName: item.name,
        stage: 'repairing',
        percent: Math.round((completedCount / total) * 100),
      });

      const res = await processItem(item, current);
      results.push(res);
      completedCount++;

      onProgress?.({
        completed: completedCount,
        total,
        currentProgramName: item.name,
        stage: 'neural',
        percent: Math.round((completedCount / total) * 100),
      });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  if (checkCancelled?.()) {
    throw new Error('Benchmark suite cancelled by user');
  }

  const durationMs = Math.round(performance.now() - suiteStartTime);

  // Compute Aggregates
  const totalCount = results.length || 1;

  // Classical
  const validSuccessCount = results.filter((r) => r.classicalValidSuccess).length;
  const validSuccessRate = Math.round((validSuccessCount / totalCount) * 100);
  const totalParseMs = results.reduce((acc, r) => acc + r.classicalValidParseMs, 0);
  const avgParseMs = Number((totalParseMs / totalCount).toFixed(2));

  // AI Repair
  const top1Count = results.filter((r) => r.aiRepairTop1Exact).length;
  const top3Count = results.filter((r) => r.aiRepairTop3Exact).length;
  const verifiedCount = results.filter((r) => r.aiRepairVerified).length;
  const totalLatencyMs = results.reduce((acc, r) => acc + r.aiRepairLatencyMs, 0);

  const top1ExactRate = Math.round((top1Count / totalCount) * 100);
  const top3ExactRate = Math.round((top3Count / totalCount) * 100);
  const verifiedRate = Math.round((verifiedCount / totalCount) * 100);
  const avgLatencyMs = Math.round(totalLatencyMs / totalCount);

  // Exact source correctness by error type; parser validity is reported separately.
  const errorTypes: ErrorInjectionType[] = ['delete', 'insert', 'swap', 'replace', 'natural'];
  const top1ExactRateByErrorType = Object.fromEntries(
    errorTypes.map((type) => {
      const matching = results.filter((item) => item.errorType === type);
      const exact = matching.filter((item) => item.aiRepairTop1Exact).length;
      return [type, matching.length ? Math.round((exact / matching.length) * 100) : 0];
    })
  ) as BenchmarkSuiteSummary['aiRepair']['top1ExactRateByErrorType'];

  // Neural AST
  const totalTed = results.reduce((acc, r) => acc + r.neuralAstTed, 0);
  const totalF1 = results.reduce((acc, r) => acc + r.neuralAstF1, 0);
  const exactMatchCount = results.filter((r) => r.neuralAstExactMatch).length;
  const validNeuralCount = results.filter((r) => r.neuralAstValid).length;

  const avgTed = Number((totalTed / totalCount).toFixed(1));
  const avgF1 = Number((totalF1 / totalCount).toFixed(3));
  const exactMatchRate = Math.round((exactMatchCount / totalCount) * 100);
  const validityRate = Math.round((validNeuralCount / totalCount) * 100);

  // Ablation
  const b1Top1ExactRate = Math.round((results.filter((r) => r.b1Top1Exact).length / totalCount) * 100);
  const aiRawTop3ExactRate = Math.round((results.filter((r) => r.aiRawTop3Exact).length / totalCount) * 100);
  const aiVerifiedTop3ExactRate = Math.round((results.filter((r) => r.aiVerifiedTop3Exact).length / totalCount) * 100);

  onProgress?.({
    completed: total,
    total,
    currentProgramName: 'Complete',
    stage: 'finalizing',
    percent: 100,
  });

  return {
    id: `bench_${Date.now()}`,
    timestamp: Date.now(),
    durationMs,
    totalPrograms: results.length,
    classical: {
      validSuccessRate,
      avgParseMs,
    },
    aiRepair: {
      top1ExactRate,
      top3ExactRate,
      verifiedRate,
      avgLatencyMs,
      top1ExactRateByErrorType,
    },
    neuralAst: {
      avgTed,
      avgF1,
      exactMatchRate,
      validityRate,
    },
    ablation: {
      b0NoneExactRate: 0,
      b1ClassicalTop1ExactRate: b1Top1ExactRate,
      aiRawTop3ExactRate,
      aiVerifiedTop3ExactRate,
    },
    items: results,
  };
}

/**
 * Converts benchmark run results into CSV format.
 */
export function exportBenchmarkToCSV(summary: BenchmarkSuiteSummary): string {
  const headers = [
    'Program Name',
    'Category',
    'Error Type',
    'Error Description',
    'Classical Parse (ms)',
    'Classical Valid',
    'B0 Exact',
    'B1 Top-1 Exact',
    'AI Raw Top-3 Exact',
    'AI Verified Top-3 Exact',
    'AI Repair Verified',
    'AI Latency (ms)',
    'Neural Valid',
    'Neural TED',
    'Neural F1',
    'Neural Exact Match',
  ];

  const rows = summary.items.map((it) => [
    `"${it.name.replace(/"/g, '""')}"`,
    `"${it.category}"`,
    it.errorType,
    `"${it.errorDescription.replace(/"/g, '""')}"`,
    it.classicalValidParseMs,
    it.classicalValidSuccess ? 'YES' : 'NO',
    it.b0Exact ? 'YES' : 'NO',
    it.b1Top1Exact ? 'YES' : 'NO',
    it.aiRawTop3Exact ? 'YES' : 'NO',
    it.aiVerifiedTop3Exact ? 'YES' : 'NO',
    it.aiRepairVerified ? 'YES' : 'NO',
    it.aiRepairLatencyMs,
    it.neuralAstValid ? 'YES' : 'NO',
    it.neuralAstTed,
    it.neuralAstF1,
    it.neuralAstExactMatch ? 'YES' : 'NO',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Triggers a browser file download of CSV content.
 */
export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Triggers a browser file download of JSON content.
 */
export function downloadJSON(filename: string, data: any): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
