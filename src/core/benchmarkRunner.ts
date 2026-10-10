/**
 * Benchmark runner engine for MiniC compiler.
 * - Loads valid programs from Supabase samples (excluding 'broken'/'malformed') + 20 grammar-generated programs
 * - Injects single-token errors (delete, insert, swap)
 * - Throttles Gemini calls with concurrency 2-3
 * - Implements rate limit retry with exponential backoff
 * - Evaluates:
 *   - Classical: valid code success rate, avg parse ms
 *   - AI repair: top-1 & top-3 accuracy, verified rate, avg latency, accuracy by error type
 *   - Neural AST: avg TED, avg F1, exact-match rate, validity rate
 *   - Ablation: success rate without vs with AI repair
 */

import { parse } from './parser';
import { generateBenchmarkPrograms, GeneratedProgram } from './programGenerator';
import { injectSingleTokenError, ErrorInjectionType } from './errorInjector';
import { repairCode, RepairResponse } from '../ai/repair';
import { generateNeuralAst, NeuralAstResult } from '../ai/neuralAst';
import { compareASTs, ComparisonMetrics } from './compare';
import { listSamples } from '../lib/dataService';
import { SampleRecord } from '../lib/supabase';

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

  // Ablation: without AI repair (classical alone on mutated code)
  classicalWithoutAiSuccess: boolean;

  // AI Repair on mutated code
  aiRepairTop1Acc: boolean;
  aiRepairTop3Acc: boolean;
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
    top1Accuracy: number; // 0 - 100
    top3Accuracy: number; // 0 - 100
    verifiedRate: number; // 0 - 100
    avgLatencyMs: number;
    accuracyByErrorType: {
      delete: number; // 0 - 100
      insert: number; // 0 - 100
      swap: number; // 0 - 100
    };
  };
  neuralAst: {
    avgTed: number;
    avgF1: number; // 0.0 - 1.0
    exactMatchRate: number; // 0 - 100
    validityRate: number; // 0 - 100
  };
  ablation: {
    withoutAiSuccessRate: number; // 0 - 100
    withAiSuccessRate: number; // 0 - 100
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

  // 2. Add 20 grammar-generated programs
  const generated = generateBenchmarkPrograms();
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
    const errorTypeOrder: ErrorInjectionType[] = ['delete', 'insert', 'swap'];
    const chosenType = errorTypeOrder[index % errorTypeOrder.length];
    const injection = injectSingleTokenError(item.code, chosenType, index);

    // 3. Classical parse on mutated code (Ablation: without AI)
    const mutatedParse = parse(injection.mutatedCode);
    const withoutAiSuccess = mutatedParse.success && mutatedParse.errors.length === 0;

    // 4. AI Repair on mutated code (with retry on rate limits)
    let aiRepairTop1Acc = false;
    let aiRepairTop3Acc = false;
    let aiRepairVerified = false;
    let aiRepairLatencyMs = 0;
    let aiRepairCandidateCount = 0;

    try {
      const repairRes: RepairResponse = await retryOnRateLimit(() =>
        repairCode({
          sourceCode: injection.mutatedCode,
          tokens: mutatedParse.tokens,
          errors: mutatedParse.errors,
          userId,
        })
      );

      aiRepairLatencyMs = repairRes.latencyMs;
      aiRepairCandidateCount = repairRes.candidates.length;
      aiRepairVerified = Boolean(repairRes.verifiedCandidate);

      if (repairRes.candidates.length > 0) {
        aiRepairTop1Acc = Boolean(repairRes.candidates[0].verified);
        aiRepairTop3Acc = repairRes.candidates
          .slice(0, 3)
          .some((c) => Boolean(c.verified));
      }
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
      classicalWithoutAiSuccess: withoutAiSuccess,
      aiRepairTop1Acc,
      aiRepairTop3Acc,
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
  const top1Count = results.filter((r) => r.aiRepairTop1Acc).length;
  const top3Count = results.filter((r) => r.aiRepairTop3Acc).length;
  const verifiedCount = results.filter((r) => r.aiRepairVerified).length;
  const totalLatencyMs = results.reduce((acc, r) => acc + r.aiRepairLatencyMs, 0);

  const top1Accuracy = Math.round((top1Count / totalCount) * 100);
  const top3Accuracy = Math.round((top3Count / totalCount) * 100);
  const verifiedRate = Math.round((verifiedCount / totalCount) * 100);
  const avgLatencyMs = Math.round(totalLatencyMs / totalCount);

  // AI Accuracy by error type
  const deleteItems = results.filter((r) => r.errorType === 'delete');
  const insertItems = results.filter((r) => r.errorType === 'insert');
  const swapItems = results.filter((r) => r.errorType === 'swap');

  const accuracyByErrorType = {
    delete: deleteItems.length
      ? Math.round(
          (deleteItems.filter((r) => r.aiRepairVerified).length /
            deleteItems.length) *
            100
        )
      : 0,
    insert: insertItems.length
      ? Math.round(
          (insertItems.filter((r) => r.aiRepairVerified).length /
            insertItems.length) *
            100
        )
      : 0,
    swap: swapItems.length
      ? Math.round(
          (swapItems.filter((r) => r.aiRepairVerified).length /
            swapItems.length) *
            100
        )
      : 0,
  };

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
  const withoutAiSuccessCount = results.filter((r) => r.classicalWithoutAiSuccess).length;
  const withoutAiSuccessRate = Math.round((withoutAiSuccessCount / totalCount) * 100);
  const withAiSuccessRate = verifiedRate;

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
      top1Accuracy,
      top3Accuracy,
      verifiedRate,
      avgLatencyMs,
      accuracyByErrorType,
    },
    neuralAst: {
      avgTed,
      avgF1,
      exactMatchRate,
      validityRate,
    },
    ablation: {
      withoutAiSuccessRate,
      withAiSuccessRate,
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
    'Without AI Success',
    'AI Repair Top-1',
    'AI Repair Top-3',
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
    it.classicalWithoutAiSuccess ? 'YES' : 'NO',
    it.aiRepairTop1Acc ? 'YES' : 'NO',
    it.aiRepairTop3Acc ? 'YES' : 'NO',
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
