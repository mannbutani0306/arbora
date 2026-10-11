import { z } from 'zod';

const count = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);

export const intervalSchema = z
  .object({
    estimate: rate.nullable(),
    lower: rate.nullable(),
    upper: rate.nullable(),
    n: count.nullable(),
  })
  .refine(
    ({ estimate, lower, upper }) =>
      estimate === null ||
      ((lower === null || lower <= estimate) && (upper === null || upper >= estimate)),
    'Confidence interval bounds must contain the estimate'
  );

const latencySchema = z.object({
  mean: z.number().nonnegative().nullable(),
  median: z.number().nonnegative().nullable(),
  p95: z.number().nonnegative().nullable(),
  measured_device: z.string().optional(),
});

const evaluationModelSchema = z.object({
  metrics: z.record(z.string(), intervalSchema),
  verified_candidate_rate: intervalSchema.optional(),
  candidate_counts: z.object({ verified: count, all: count }).optional(),
  by_error_type: z.record(z.string(), intervalSchema),
  by_size_bucket: z.record(z.string(), intervalSchema),
  by_error_position: z.record(z.string(), intervalSchema).optional(),
  latency_ms: latencySchema,
  parameter_count: count,
  n_cases: count,
});

export const evaluationReportSchema = z.object({
  task: z.string().min(1),
  dataset: z.string().min(1),
  n_test: count,
  n_test_programs: count.optional(),
  seed: z.union([z.string(), z.number()]).optional(),
  git_sha: z.string().optional(),
  models: z
    .record(z.string(), evaluationModelSchema)
    .refine((models) => Object.keys(models).length > 0, 'At least one model result is required'),
});

const baselineMetricSchema = z.object({
  cases: count,
  candidate_count: count,
  verified_candidate_count: count,
  top1_exact_count: count,
  top3_exact_count: count,
  top1_ast_match_count: count,
  top3_ast_match_count: count,
  verified_rate: rate.nullable(),
  top1_exact_rate: rate,
  top3_exact_rate: rate,
  top1_ast_match_rate: rate,
  top3_ast_match_rate: rate,
});

export const baselineReportSchema = z.object({
  split_seed: z.union([z.string(), z.number()]),
  train_programs: count,
  test_programs: count,
  test_cases: count.optional(),
  test_limit: count.optional(),
  corruptions_per_program: count.nullable().optional(),
  metrics: z.record(z.string(), baselineMetricSchema),
});

export type EvaluationReport = z.infer<typeof evaluationReportSchema>;
export type BaselineReport = z.infer<typeof baselineReportSchema>;
export type MetricInterval = z.infer<typeof intervalSchema>;
