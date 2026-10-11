import { z } from 'zod';
import { isSupabaseConfigured, supabase } from './supabase';
import {
  evaluationReportSchema,
  intervalSchema,
  type EvaluationReport,
  type MetricInterval,
} from './evaluationResultsSchema';

const publishedRowSchema = z.object({
  model_name: z.string().min(1),
  task: z.string().min(1),
  dataset: z.string().min(1),
  n_test: z.number().int().nonnegative(),
  metrics: z.record(z.string(), z.unknown()),
  by_error_type: z.record(z.string(), z.unknown()).default({}),
  by_length_bucket: z.record(z.string(), z.unknown()).default({}),
  seed: z.union([z.string(), z.number()]).nullable().optional(),
  git_sha: z.string().nullable().optional(),
  config: z.unknown().optional(),
  notes: z.string().optional(),
});

export interface EvaluationReportSource {
  reports: EvaluationReport[];
  source: 'supabase' | 'committed';
}

function metricFromUnknown(value: unknown): MetricInterval | null {
  const interval = intervalSchema.safeParse(value);
  if (interval.success) return interval.data;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { estimate: value, lower: null, upper: null, n: null };
  }
  return null;
}

function metricMapFromUnknown(value: unknown): Record<string, MetricInterval> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, metric]) => {
      const normalized = metricFromUnknown(metric);
      return normalized ? [[key, normalized]] : [];
    }),
  );
}

function nestedMetricMap(value: unknown): Record<string, Record<string, MetricInterval>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, metrics]) => [key, metricMapFromUnknown(metrics)]),
  );
}

function normalizePublishedRows(rows: unknown): EvaluationReport[] {
  const parsedRows = z.array(publishedRowSchema).parse(rows);
  const groups = new Map<string, typeof parsedRows>();
  for (const row of parsedRows) {
    const key = `${row.task}\u0000${row.dataset}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.values(), (group) => {
    const first = group[0];
    const models = Object.fromEntries(
      group.map((row) => {
        const metrics = metricMapFromUnknown(row.metrics);
        const errorMetrics = nestedMetricMap(row.by_error_type);
        const lengthMetrics = nestedMetricMap(row.by_length_bucket);
        const fallbackInterval: MetricInterval = {
          estimate: null,
          lower: null,
          upper: null,
          n: row.n_test,
        };
        return [
          row.model_name,
          {
            metrics: {
              top1_exact: metrics.top1_exact ?? fallbackInterval,
              top3_exact: metrics.top3_exact ?? fallbackInterval,
              top1_ast_match: metrics.top1_ast_match ?? fallbackInterval,
              top3_ast_match: metrics.top3_ast_match ?? fallbackInterval,
              verified: metrics.verified ?? fallbackInterval,
            },
            by_error_type: Object.fromEntries(
              Object.entries(errorMetrics).map(([key, values]) => [
                key,
                values.top1_exact ?? fallbackInterval,
              ]),
            ),
            by_size_bucket: Object.fromEntries(
              Object.entries(lengthMetrics).map(([key, values]) => [
                key,
                values.top1_exact ?? fallbackInterval,
              ]),
            ),
            latency_ms: {
              mean: metrics.latency_ms?.estimate ?? null,
              median: metrics.latency_median_ms?.estimate ?? null,
              p95: metrics.latency_p95_ms?.estimate ?? null,
            },
            parameter_count: 0,
            n_cases: row.n_test,
          },
        ];
      }),
    );
    return evaluationReportSchema.parse({
      task: first.task,
      dataset: first.dataset,
      n_test: Math.max(...group.map((row) => row.n_test)),
      ...(first.seed === null || first.seed === undefined ? {} : { seed: first.seed }),
      ...(first.git_sha ? { git_sha: first.git_sha } : {}),
      models,
    });
  });
}

async function readCommittedReports(): Promise<EvaluationReport[]> {
  const response = await fetch('/results/evaluation_baselines.json');
  if (!response.ok) {
    throw new Error(`Committed evaluation results could not be loaded (${response.status}).`);
  }
  const report = evaluationReportSchema.parse(await response.json());
  return [report];
}

export async function loadEvaluationReports(): Promise<EvaluationReportSource> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('model_evaluations')
        .select(
          'model_name,task,dataset,n_test,metrics,by_error_type,by_length_bucket,config,notes,seed,git_sha',
        );
      if (error) throw error;
      if (data && data.length > 0) {
        return { reports: normalizePublishedRows(data), source: 'supabase' };
      }
    } catch (error) {
      console.warn('Public model evaluation query failed; using committed results.', error);
    }
  }
  return { reports: await readCommittedReports(), source: 'committed' };
}

export function exportRowsAsCsv(rows: Array<Record<string, string | number | null>>): string {
  if (rows.length === 0) return '';
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: string | number | null | undefined) =>
    `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    headers.map(escape).join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}
