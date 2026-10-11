// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const supabaseMock = vi.hoisted(() => ({
  isSupabaseConfigured: false,
  supabase: { from: vi.fn() },
}));

vi.mock('./supabase', () => supabaseMock);

import { OfflineResults } from '../pages/OfflineResults';
import { exportRowsAsCsv } from './evaluationResults';
import {
  baselineReportSchema,
  evaluationReportSchema,
  intervalSchema,
} from './evaluationResultsSchema';

const root = resolve(process.cwd());
const interval = { estimate: 0.4, lower: 0.2, upper: 0.6, n: 20 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  supabaseMock.isSupabaseConfigured = false;
  supabaseMock.supabase.from.mockReset();
});

describe('evaluation result schemas and display', () => {
  it('validates committed evaluation and baseline reports', () => {
    const evaluation = JSON.parse(
      readFileSync(resolve(root, 'ml/results/evaluation_baselines.json'), 'utf8')
    ) as unknown;
    const baseline = JSON.parse(
      readFileSync(resolve(root, 'ml/results/baselines.json'), 'utf8')
    ) as unknown;
    expect(() => evaluationReportSchema.parse(evaluation)).not.toThrow();
    expect(() => baselineReportSchema.parse(baseline)).not.toThrow();
    expect(() => evaluationReportSchema.parse({ task: 'repair' })).toThrow();
    expect(() => intervalSchema.parse({ estimate: 0.2, lower: 0.3, upper: 0.4, n: 2 })).toThrow();
  });

  it('renders committed results when the backend is not configured', async () => {
    const report = JSON.parse(
      readFileSync(resolve(root, 'ml/results/evaluation_baselines.json'), 'utf8')
    ) as unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }))
    );
    render(<OfflineResults />);
    expect(await screen.findByTestId('offline-results')).toBeTruthy();
    expect(screen.getByText(/committed result files/)).toBeTruthy();
    expect(screen.getByText('Model comparison')).toBeTruthy();
  });

  it('uses valid public backend results when available', async () => {
    supabaseMock.isSupabaseConfigured = true;
    supabaseMock.supabase.from.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        error: null,
        data: [
          {
            model_name: 'Published model',
            task: 'repair',
            dataset: 'Public holdout',
            n_test: 20,
            metrics: {
              top1_exact: interval,
              top3_exact: interval,
              top1_ast_match: interval,
              top3_ast_match: interval,
              verified: interval,
              latency_ms: { estimate: 12 },
            },
            by_error_type: { delete: { top1_exact: interval } },
            by_length_bucket: { small: { top1_exact: interval } },
            config: {},
            notes: 'test',
          },
        ],
      }),
    });
    render(<OfflineResults />);
    expect(await screen.findByText(/public Supabase results/)).toBeTruthy();
    expect(screen.getByText('Published model')).toBeTruthy();
  });

  it('falls back to committed results when the configured backend query fails', async () => {
    supabaseMock.isSupabaseConfigured = true;
    supabaseMock.supabase.from.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('offline') }),
    });
    const report = JSON.parse(
      readFileSync(resolve(root, 'ml/results/evaluation_baselines.json'), 'utf8')
    ) as unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }))
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<OfflineResults />);
    expect(await screen.findByText(/committed result files/)).toBeTruthy();
  });

  it('exports CSV with escaped values and deterministic headers', () => {
    expect(
      exportRowsAsCsv([
        { model: 'Model, one', score: 0.5 },
        { model: 'Model "two"', score: null },
      ])
    ).toBe('"model","score"\n"Model, one","0.5"\n"Model ""two""",""');
  });
});
