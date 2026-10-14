// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LiveBenchmarks } from './LiveBenchmarks';
import type { BenchmarkItemResult, BenchmarkSuiteSummary } from '../core/benchmarkRunner';
import type { BenchmarkRunRecord } from '../lib/supabase';

const mocks = vi.hoisted(() => ({
  runBenchmarkSuite: vi.fn(),
  exportBenchmarkToCSV: vi.fn(),
  downloadCSV: vi.fn(),
  downloadJSON: vi.fn(),
  saveBenchmarkRun: vi.fn(),
  listBenchmarkRuns: vi.fn(),
  useAuth: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../core/benchmarkRunner', () => ({
  runBenchmarkSuite: mocks.runBenchmarkSuite,
  exportBenchmarkToCSV: mocks.exportBenchmarkToCSV,
  downloadCSV: mocks.downloadCSV,
  downloadJSON: mocks.downloadJSON,
}));
vi.mock('../lib/dataService', () => ({
  saveBenchmarkRun: mocks.saveBenchmarkRun,
  listBenchmarkRuns: mocks.listBenchmarkRuns,
}));
vi.mock('../lib/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../lib/toast', () => ({ useToast: () => mocks.toast }));

function item(
  id: string,
  errorType: BenchmarkItemResult['errorType'],
  classicalValidSuccess: boolean,
  aiRepairVerified: boolean,
): BenchmarkItemResult {
  return {
    id,
    name: `Program ${id}`,
    category: 'Functions',
    sourceCode: 'int main() { return 0; }',
    classicalValidSuccess,
    classicalValidParseMs: 2,
    mutatedCode: 'int main() { return 0 }',
    errorType,
    errorDescription: `Injected ${errorType}`,
    b0Exact: false,
    b1Top1Exact: false,
    aiRawTop3Exact: true,
    aiVerifiedTop3Exact: true,
    aiRepairTop1Exact: true,
    aiRepairTop3Exact: true,
    aiRepairVerified,
    aiRepairLatencyMs: 8,
    aiRepairCandidateCount: 1,
    neuralAstValid: true,
    neuralAstTed: 0,
    neuralAstF1: 1,
    neuralAstExactMatch: true,
    neuralAstLatencyMs: 5,
  };
}

function summary(): BenchmarkSuiteSummary {
  return {
    id: 'fixture',
    engine: 'classical',
    timestamp: 42,
    durationMs: 20,
    totalPrograms: 3,
    classical: { validSuccessRate: 67, avgParseMs: 2 },
    aiRepair: {
      top1ExactRate: 33,
      top3ExactRate: 67,
      verifiedRate: 67,
      avgLatencyMs: 8,
      top1ExactRateByErrorType: {
        delete: 100,
        insert: 50,
        swap: 0,
        replace: 0,
        natural: 0,
      },
    },
    neuralAst: { avgTed: 1, avgF1: 0.75, exactMatchRate: 67, validityRate: 100 },
    ablation: {
      b0NoneExactRate: 0,
      b1ClassicalTop1ExactRate: 33,
      aiRawTop3ExactRate: 67,
      aiVerifiedTop3ExactRate: 67,
    },
    items: [
      item('1', 'delete', true, true),
      item('2', 'insert', false, false),
      item('3', 'swap', true, true),
    ],
  };
}

function record(id: string, result: BenchmarkSuiteSummary): BenchmarkRunRecord {
  return {
    id,
    suite_name: 'Fixture suite',
    results: result,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LiveBenchmarks />
    </MemoryRouter>,
  );
}

function clickRunSuite() {
  const [button] = screen.getAllByRole('button', { name: 'Run suite' });
  if (!button) throw new Error('Run suite action was not rendered.');
  fireEvent.click(button);
}

describe('live benchmarks page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: null });
    mocks.listBenchmarkRuns.mockResolvedValue([]);
    mocks.runBenchmarkSuite.mockResolvedValue(summary());
    mocks.exportBenchmarkToCSV.mockReturnValue('report,csv');
    mocks.saveBenchmarkRun.mockResolvedValue(record('saved', summary()));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('runs a suite, filters results, and exports CSV and JSON', async () => {
    renderPage();

    expect(screen.getByText('No benchmark data')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Live benchmark engine' }), {
      target: { value: 'ensemble' },
    });
    clickRunSuite();

    expect(await screen.findByText(/Live sample · 3 programs/)).toBeTruthy();
    expect(mocks.runBenchmarkSuite).toHaveBeenCalledWith(expect.objectContaining({
      engine: 'ensemble',
      concurrency: 2,
    }));
    expect(mocks.saveBenchmarkRun).toHaveBeenCalledWith(
      'MiniC Live Sample',
      expect.objectContaining({ totalPrograms: 3 }),
      undefined,
    );
    expect(mocks.toast.success).toHaveBeenCalledWith('Run saved locally');

    fireEvent.click(screen.getByRole('button', { name: 'insert' }));
    expect(screen.getByText('Program 2')).toBeTruthy();
    expect(screen.queryByText('Program 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'all' }));
    expect(screen.getByText('Program 1')).toBeTruthy();
    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
    expect(screen.getByText('Unverified')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(mocks.exportBenchmarkToCSV).toHaveBeenCalledOnce();
    expect(mocks.downloadCSV).toHaveBeenCalledWith('minic_benchmark_42.csv', 'report,csv');
    expect(mocks.downloadJSON).toHaveBeenCalledWith('minic_benchmark_42.json', summary());
  }, 15_000);

  it('loads and charts benchmark history and displays errors from a failed run', async () => {
    const previous = summary();
    mocks.listBenchmarkRuns.mockResolvedValue([
      record('old', previous),
      record('older', previous),
    ]);

    renderPage();

    expect(await screen.findByText(/Live sample · 3 programs/)).toBeTruthy();
    expect(screen.getByText('2 recorded runs')).toBeTruthy();
    expect(screen.getByText('History across runs')).toBeTruthy();

    cleanup();
    mocks.listBenchmarkRuns.mockResolvedValue([]);
    mocks.runBenchmarkSuite.mockRejectedValueOnce(new Error('Benchmark suite unavailable'));
    renderPage();
    clickRunSuite();

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Benchmark suite error'));
    expect(screen.getByText('No benchmark data')).toBeTruthy();
  });

  it('allows cancellation and reports cancelled runs without saving them', async () => {
    let resolveRun!: (result: BenchmarkSuiteSummary) => void;
    mocks.runBenchmarkSuite.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRun = resolve;
      }),
    );

    renderPage();
    clickRunSuite();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(mocks.toast.info).toHaveBeenCalledWith('Cancelling suite...');
    resolveRun(summary());
    await waitFor(() => expect(mocks.saveBenchmarkRun).toHaveBeenCalledOnce());

    cleanup();
    mocks.saveBenchmarkRun.mockClear();
    mocks.runBenchmarkSuite.mockRejectedValueOnce(new Error('Benchmark cancelled by user'));
    renderPage();
    clickRunSuite();

    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalledWith('Benchmark cancelled'));
    expect(mocks.saveBenchmarkRun).not.toHaveBeenCalled();
  });

  it('reports a persistence error after a successful benchmark run', async () => {
    mocks.saveBenchmarkRun.mockRejectedValueOnce(new Error('storage unavailable'));

    renderPage();
    clickRunSuite();

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Failed to save run'));
    expect(screen.getByText(/Live sample · 3 programs/)).toBeTruthy();
  });
});
