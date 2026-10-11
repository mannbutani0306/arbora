import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  exportRowsAsCsv,
  loadEvaluationReports,
  type EvaluationReportSource,
} from '../lib/evaluationResults';
import type { EvaluationReport, MetricInterval } from '../lib/evaluationResultsSchema';

const COLORS = ['#059669', '#6366F1', '#D97706', '#0F766E', '#7C3AED'];
const metricKeys = [
  ['top1_exact', 'Top-1 exact'],
  ['top3_exact', 'Top-3 exact'],
  ['top1_ast_match', 'Top-1 AST'],
  ['top3_ast_match', 'Top-3 AST'],
  ['verified', 'Verified'],
] as const;

type ExportRow = Record<string, string | number | null>;

function rate(model: EvaluationReport['models'][string], key: string): MetricInterval {
  return model.metrics[key] ?? { estimate: null, lower: null, upper: null, n: null };
}

function percent(value: number | null): string {
  return value === null ? 'Not reported' : `${(value * 100).toFixed(1)}%`;
}

function intervalLabel(value: MetricInterval): string {
  if (value.estimate === null) return 'Not reported';
  if (value.lower === null || value.upper === null) return percent(value.estimate);
  return `${percent(value.estimate)} (${percent(value.lower)}–${percent(value.upper)})`;
}

function metricExportRows(report: EvaluationReport): ExportRow[] {
  return Object.entries(report.models).map(([modelName, model]) => ({
    model: modelName,
    ...Object.fromEntries(
      metricKeys.flatMap(([key, label]) => {
        const metric = rate(model, key);
        return [
          [label, metric.estimate],
          [`${label} CI lower`, metric.lower],
          [`${label} CI upper`, metric.upper],
        ];
      }),
    ),
    latency_mean_ms: model.latency_ms.mean,
    latency_p95_ms: model.latency_ms.p95,
    parameters: model.parameter_count,
    n_test: report.n_test,
    dataset: report.dataset,
    seed: report.seed === undefined ? null : String(report.seed),
    git_sha: report.git_sha ?? null,
  }));
}

function triggerDownload(filename: string, contents: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExportButtons({ name, rows }: { name: string; rows: ExportRow[] }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => triggerDownload(`${name}.csv`, exportRowsAsCsv(rows), 'text/csv')}
        className="text-[11px] text-[#059669] hover:underline"
      >
        Export CSV
      </button>
      <button
        type="button"
        onClick={() =>
          triggerDownload(`${name}.json`, JSON.stringify(rows, null, 2), 'application/json')
        }
        className="text-[11px] text-[#059669] hover:underline"
      >
        Export JSON
      </button>
    </div>
  );
}

function ChartFooter({ report }: { report: EvaluationReport }) {
  return (
    <p className="mt-3 border-t border-[#E7E5E4] pt-2 text-[10px] text-[#78716C]">
      Dataset: {report.dataset} · n_test: {report.n_test} · seed: {report.seed ?? 'not recorded'} ·
      git SHA: {report.git_sha ?? 'not recorded'}
    </p>
  );
}

function ChartCard({
  title,
  report,
  rows,
  children,
  testId,
}: {
  title: string;
  report: EvaluationReport;
  rows: ExportRow[];
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-xl border border-[#E7E5E4] bg-white p-4 shadow-2xs"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <ExportButtons name={title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')} rows={rows} />
      </div>
      <div className="h-64" role="img" aria-label={title}>
        {children}
      </div>
      <ChartFooter report={report} />
    </section>
  );
}

function ComparisonTable({ report }: { report: EvaluationReport }) {
  const rows = metricExportRows(report);
  return (
    <section className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E5E4] p-4">
        <div>
          <h2 className="text-sm font-semibold">Model comparison</h2>
          <p className="text-xs text-[#78716C]">
            Intervals are percentile bootstrap 95% CIs as stored in the report.
          </p>
        </div>
        <ExportButtons name="model-comparison" rows={rows} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-xs">
          <thead className="bg-stone-50 text-[#78716C]">
            <tr>
              <th className="p-3">Model</th>
              {metricKeys.map(([, label]) => (
                <th key={label} className="p-3">
                  {label}
                </th>
              ))}
              <th className="p-3">Mean CPU ms</th>
              <th className="p-3">Parameters</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(report.models).map(([name, model]) => (
              <tr key={name} className="border-t border-[#E7E5E4]">
                <th className="p-3 font-semibold">{name}</th>
                {metricKeys.map(([key]) => (
                  <td key={key} className="p-3 tabular-nums">
                    {intervalLabel(rate(model, key))}
                  </td>
                ))}
                <td className="p-3 tabular-nums">
                  {model.latency_ms.mean?.toFixed(2) ?? 'Not reported'}
                </td>
                <td className="p-3 tabular-nums">{model.parameter_count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[#E7E5E4] p-3 text-[10px] text-[#78716C]">
        Dataset: {report.dataset} · n_test: {report.n_test} · seed: {report.seed ?? 'not recorded'}{' '}
        · git SHA: {report.git_sha ?? 'not recorded'}
      </p>
    </section>
  );
}

function ReportCharts({ report }: { report: EvaluationReport }) {
  const modelRows = useMemo(
    () =>
      Object.entries(report.models).map(([name, model], index) => ({
        model: name,
        color: COLORS[index % COLORS.length],
        ...Object.fromEntries(
          metricKeys.map(([key]) => {
            const metric = rate(model, key);
            return [
              [`${key}_percent`, metric.estimate === null ? null : metric.estimate * 100],
              [
                `${key}_ci`,
                metric.lower === null || metric.upper === null || metric.estimate === null
                  ? [0, 0]
                  : [
                      (metric.estimate - metric.lower) * 100,
                      (metric.upper - metric.estimate) * 100,
                    ],
              ],
            ];
          }),
        ),
        latency: model.latency_ms.mean,
      })),
    [report],
  );

  const errorRows = useMemo(
    () =>
      Object.entries(report.models).flatMap(([modelName, model]) =>
        Object.entries(model.by_error_type).map(([error, metric]) => ({
          model: modelName,
          error,
          top1_exact_percent: metric.estimate === null ? null : metric.estimate * 100,
          top1_exact_ci:
            metric.lower === null || metric.upper === null || metric.estimate === null
              ? [0, 0]
              : [(metric.estimate - metric.lower) * 100, (metric.upper - metric.estimate) * 100],
        })),
      ),
    [report],
  );
  const sizeRows = useMemo(
    () =>
      Object.entries(report.models).flatMap(([modelName, model]) =>
        Object.entries(model.by_size_bucket).map(([size, metric]) => ({
          model: modelName,
          size,
          top1_exact_percent: metric.estimate === null ? null : metric.estimate * 100,
          top1_exact_ci:
            metric.lower === null || metric.upper === null || metric.estimate === null
              ? [0, 0]
              : [(metric.estimate - metric.lower) * 100, (metric.upper - metric.estimate) * 100],
        })),
      ),
    [report],
  );
  const errorChartData = useMemo(() => {
    const categories = Array.from(new Set(errorRows.map((row) => row.error)));
    return categories.map((error) => ({
      error,
      ...Object.fromEntries(
        errorRows
          .filter((row) => row.error === error)
          .flatMap((row) => [
            [row.model, row.top1_exact_percent],
            [`${row.model}_ci`, row.top1_exact_ci],
          ]),
      ),
    }));
  }, [errorRows]);
  const sizeChartData = useMemo(() => {
    const categories = Array.from(new Set(sizeRows.map((row) => row.size)));
    return categories.map((size) => ({
      size,
      ...Object.fromEntries(
        sizeRows
          .filter((row) => row.size === size)
          .flatMap((row) => [
            [row.model, row.top1_exact_percent],
            [`${row.model}_ci`, row.top1_exact_ci],
          ]),
      ),
    }));
  }, [sizeRows]);
  const modelNames = Object.keys(report.models);

  return (
    <>
      <ChartCard
        title="Exact and AST match by model"
        report={report}
        rows={metricExportRows(report)}
      >
        <ResponsiveContainer>
          <BarChart data={modelRows} margin={{ left: 0, right: 12, bottom: 10 }}>
            <CartesianGrid stroke="#E7E5E4" strokeDasharray="3 3" />
            <XAxis dataKey="model" />
            <YAxis domain={[0, 100]} unit="%" />
            <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
            {metricKeys.map(([key, label], index) => (
              <Bar key={key} dataKey={`${key}_percent`} name={label} fill={COLORS[index]}>
                <ErrorBar dataKey={`${key}_ci`} direction="y" width={4} strokeWidth={1} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Accuracy by error type"
        report={report}
        rows={errorRows.map((row) => ({
          model: row.model,
          error_type: row.error,
          top1_exact: row.top1_exact_percent,
        }))}
      >
        {errorRows.length ? (
          <ResponsiveContainer>
            <BarChart data={errorChartData}>
              <CartesianGrid stroke="#E7E5E4" strokeDasharray="3 3" />
              <XAxis dataKey="error" />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip
                formatter={(value) =>
                  value === null ? 'Not reported' : `${Number(value).toFixed(1)}%`
                }
              />
              {modelNames.map((name, index) => (
                <Bar key={name} dataKey={name} fill={COLORS[index % COLORS.length]}>
                  <ErrorBar dataKey={`${name}_ci`} direction="y" width={4} strokeWidth={1} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ChartCard>

      <ChartCard
        title="Accuracy by size bucket"
        report={report}
        rows={sizeRows.map((row) => ({
          model: row.model,
          size_bucket: row.size,
          top1_exact: row.top1_exact_percent,
        }))}
      >
        {sizeRows.length ? (
          <ResponsiveContainer>
            <BarChart data={sizeChartData}>
              <CartesianGrid stroke="#E7E5E4" strokeDasharray="3 3" />
              <XAxis dataKey="size" />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip
                formatter={(value) =>
                  value === null ? 'Not reported' : `${Number(value).toFixed(1)}%`
                }
              />
              {modelNames.map((name, index) => (
                <Bar key={name} dataKey={name} fill={COLORS[index % COLORS.length]}>
                  <ErrorBar dataKey={`${name}_ci`} direction="y" width={4} strokeWidth={1} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </ChartCard>

      <ChartCard
        title="Latency vs top-1 exact"
        report={report}
        rows={modelRows.map((row) => ({
          model: row.model,
          latency_mean_ms: row.latency,
          top1_exact: row.top1_exact_percent,
        }))}
      >
        <ResponsiveContainer>
          <ScatterChart>
            <CartesianGrid stroke="#E7E5E4" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="latency" name="Mean latency" unit=" ms" />
            <YAxis
              type="number"
              dataKey="top1_exact_percent"
              name="Top-1 exact"
              unit="%"
              domain={[0, 100]}
            />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter
              data={modelRows.filter(
                (row) => row.latency !== null && row.top1_exact_percent !== null,
              )}
            >
              {modelRows.map((row) => (
                <Cell key={row.model} fill={row.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="rounded-xl border border-[#E7E5E4] bg-white p-4">
        <h2 className="text-sm font-semibold">In-distribution vs out-of-distribution</h2>
        <p className="mt-1 text-xs text-[#78716C]">
          The committed report does not contain an out-of-distribution evaluation, so the
          generalization gap is not reported.
        </p>
        <p className="mt-3 border-t border-[#E7E5E4] pt-2 text-[10px] text-[#78716C]">
          Dataset: {report.dataset} · n_test: {report.n_test} · seed:{' '}
          {report.seed ?? 'not recorded'} · git SHA: {report.git_sha ?? 'not recorded'}
        </p>
      </section>
    </>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[#78716C]">
      Breakdown not reported in this artifact.
    </div>
  );
}

export function OfflineResults() {
  const [result, setResult] = useState<EvaluationReportSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState(0);

  useEffect(() => {
    let active = true;
    void loadEvaluationReports()
      .then((loaded) => {
        if (active) setResult(loaded);
      })
      .catch((loadError: unknown) => {
        if (active)
          setError(loadError instanceof Error ? loadError.message : 'Results could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, []);

  if (error)
    return (
      <p
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
      >
        {error}
      </p>
    );
  if (!result)
    return (
      <p className="rounded-xl border border-[#E7E5E4] bg-white p-4 text-sm text-[#78716C]">
        Loading offline results…
      </p>
    );
  if (result.reports.length === 0)
    return (
      <p className="rounded-xl border border-[#E7E5E4] bg-white p-4 text-sm text-[#78716C]">
        No published model results are available yet.
      </p>
    );

  const report = result.reports[Math.min(selectedReport, result.reports.length - 1)];
  return (
    <div className="space-y-4" data-testid="offline-results">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#78716C]">
          Source:{' '}
          {result.source === 'supabase' ? 'public Supabase results' : 'committed result files'}
        </p>
        {result.reports.length > 1 && (
          <label className="flex items-center gap-2 text-xs">
            Dataset
            <select
              aria-label="Choose evaluation dataset"
              value={selectedReport}
              onChange={(event) => setSelectedReport(Number(event.target.value))}
              className="rounded-lg border border-[#E7E5E4] bg-white px-2 py-1"
            >
              {result.reports.map((item, index) => (
                <option key={`${item.task}-${item.dataset}`} value={index}>
                  {item.dataset} · {item.task}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ComparisonTable report={report} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCharts report={report} />
      </div>
      <p className="text-xs text-[#78716C]">
        Validity means zero errors from the deterministic parser. Correctness means token-exact
        recovery or structural AST match; passing the parser alone is not correctness.
      </p>
    </div>
  );
}
