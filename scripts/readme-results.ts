import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const MetricSchema = z.object({
  estimate: z.number().nullable(),
  lower: z.number().nullable(),
  upper: z.number().nullable(),
  n: z.number().int().nonnegative(),
});

const ModelSchema = z.object({
  metrics: z.object({
    top1_exact: MetricSchema,
    top3_exact: MetricSchema,
    top1_ast_match: MetricSchema,
    top3_ast_match: MetricSchema,
    verified: MetricSchema,
  }),
});

const EvaluationSchema = z.object({
  task: z.string(),
  dataset: z.string(),
  n_test: z.number().int().nonnegative(),
  n_test_programs: z.number().int().nonnegative(),
  models: z.record(z.string(), ModelSchema),
});

const BaselineSchema = z.object({
  split_seed: z.string(),
  train_programs: z.number().int().nonnegative(),
  test_programs: z.number().int().nonnegative(),
  corruptions_per_program: z.number().int().positive(),
  metrics: z.record(
    z.string(),
    z.object({
      cases: z.number().int().nonnegative(),
      top1_exact_count: z.number().int().nonnegative(),
      top1_exact_rate: z.number().min(0).max(1),
      top3_exact_count: z.number().int().nonnegative(),
      top3_exact_rate: z.number().min(0).max(1),
      top1_ast_match_count: z.number().int().nonnegative(),
      top1_ast_match_rate: z.number().min(0).max(1),
      top3_ast_match_count: z.number().int().nonnegative(),
      top3_ast_match_rate: z.number().min(0).max(1),
      verified_candidate_count: z.number().int().nonnegative(),
      candidate_count: z.number().int().nonnegative(),
    }),
  ),
});

function percent(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

function estimate(metric: z.infer<typeof MetricSchema>): string {
  if (metric.estimate === null) return 'N/A';
  const ci =
    metric.lower === null || metric.upper === null
      ? ''
      : ` (${percent(metric.lower)}–${percent(metric.upper)})`;
  return `${percent(metric.estimate)}${ci}`;
}

export function generateResultsSection(evaluationInput: unknown, baselineInput: unknown): string {
  const evaluation = EvaluationSchema.parse(evaluationInput);
  const baseline = BaselineSchema.parse(baselineInput);

  const quickRows = [
    '| Model | Top-1 exact | Top-3 exact | Top-1 AST match | Top-3 AST match | Verified test-case rate |',
    '|---|---:|---:|---:|---:|---:|',
  ];
  for (const modelName of ['B0', 'B1', 'B2']) {
    const model = evaluation.models[modelName];
    if (!model) throw new Error(`Missing ${modelName} in the evaluation report.`);
    const metrics = model.metrics;
    quickRows.push(
      `| ${modelName} | ${estimate(metrics.top1_exact)} | ${estimate(metrics.top3_exact)} | ${estimate(metrics.top1_ast_match)} | ${estimate(metrics.top3_ast_match)} | ${estimate(metrics.verified)} |`,
    );
  }

  const fullMetrics = ['B0', 'B1', 'B2'].map((name) => {
    const metric = baseline.metrics[`${name}:overall`];
    if (!metric) throw new Error(`Missing ${name}:overall in the baseline report.`);
    return { name, metric };
  });
  const fullRows = [
    '| Model | Top-1 exact | Top-3 exact | Top-1 AST match | Top-3 AST match | Verified candidates |',
    '|---|---:|---:|---:|---:|---:|',
    ...fullMetrics.map(
      ({ name, metric }) =>
        `| ${name} | ${percent(metric.top1_exact_rate)} (${metric.top1_exact_count}/${metric.cases}) | ${percent(metric.top3_exact_rate)} (${metric.top3_exact_count}/${metric.cases}) | ${percent(metric.top1_ast_match_rate)} (${metric.top1_ast_match_count}/${metric.cases}) | ${percent(metric.top3_ast_match_rate)} (${metric.top3_ast_match_count}/${metric.cases}) | ${metric.verified_candidate_count}/${metric.candidate_count} |`,
    ),
  ];

  return [
    `Quick report: **${evaluation.task}**, dataset “${evaluation.dataset}”; ${evaluation.n_test} corrupted test cases from ${evaluation.n_test_programs} source programs. Values are estimates with 95% bootstrap intervals in parentheses.`,
    '',
    ...quickRows,
    '',
    `Larger local baseline: seed ${baseline.split_seed}, ${baseline.train_programs} train programs, ${baseline.test_programs} test programs, ${baseline.test_programs * baseline.corruptions_per_program} generated corruption cases. This artifact does not contain confidence intervals; do not interpret this table as the quick report above.`,
    '',
    ...fullRows,
    '',
    'All figures above are read from `ml/results/evaluation_baselines.json` and `results/baselines.json`. No neural model result is inferred from a baseline.',
  ].join('\n');
}

export function replaceGeneratedResults(readme: string, generated: string): string {
  const start = '<!-- BEGIN GENERATED RESULTS -->';
  const end = '<!-- END GENERATED RESULTS -->';
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error('README results marker pair is missing or malformed.');
  }
  return `${readme.slice(0, startIndex + start.length)}\n${generated}\n${readme.slice(endIndex)}`;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const readmePath = resolve(root, 'README.md');
  const evaluationPath = resolve(root, 'ml/results/evaluation_baselines.json');
  const baselinePath = resolve(root, 'results/baselines.json');
  const [readme, evaluationText, baselineText] = await Promise.all([
    readFile(readmePath, 'utf8'),
    readFile(evaluationPath, 'utf8'),
    readFile(baselinePath, 'utf8'),
  ]);
  const generated = generateResultsSection(JSON.parse(evaluationText), JSON.parse(baselineText));
  const output = replaceGeneratedResults(readme, generated);
  await writeFile(readmePath, output);
  console.log('Updated README results from validated JSON artifacts.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
