import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluationReportSchema } from './evaluationResultsSchema';

vi.mock('./supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

import { exportRowsAsCsv, loadEvaluationReports } from './evaluationResults';

const reportPath = fileURLToPath(
  new URL('../../public/results/evaluation_baselines.json', import.meta.url),
);

afterEach(() => vi.unstubAllGlobals());

describe('committed evaluation results', () => {
  it('validates the committed report against the runtime schema', async () => {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    expect(evaluationReportSchema.safeParse(report).success).toBe(true);
  });

  it('loads validated committed results when Supabase is not configured', async () => {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(report), { status: 200 })),
    );
    const loaded = await loadEvaluationReports();
    expect(loaded.source).toBe('committed');
    expect(loaded.reports).toHaveLength(1);
    expect(loaded.reports[0].n_test).toBe(report.n_test);
  });

  it('exports CSV headers and escaped content deterministically', () => {
    expect(
      exportRowsAsCsv([
        { model: 'Arbora, T5', score: 0.75, note: 'said "verified"' },
        { model: 'Parser', score: 1, note: null },
      ]),
    ).toBe('"model","score","note"\n"Arbora, T5","0.75","said ""verified"""\n"Parser","1",""');
  });
});
