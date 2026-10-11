import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  baselineReportSchema,
  evaluationReportSchema,
  type BaselineReport,
  type EvaluationReport,
} from '../lib/evaluationResultsSchema';

interface ResearchData {
  evaluation: EvaluationReport;
  split: BaselineReport;
}

function useResearchData() {
  const [data, setData] = useState<ResearchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch('/results/evaluation_baselines.json').then((response) => {
        if (!response.ok) throw new Error(`Evaluation results unavailable (${response.status}).`);
        return response.json().then((value: unknown) => evaluationReportSchema.parse(value));
      }),
      fetch('/results/ml-baselines.json').then((response) => {
        if (!response.ok) throw new Error(`Dataset metadata unavailable (${response.status}).`);
        return response.json().then((value: unknown) => baselineReportSchema.parse(value));
      }),
    ])
      .then(([evaluation, split]) => {
        if (active) setData({ evaluation, split });
      })
      .catch((loadError: unknown) => {
        if (active)
          setError(
            loadError instanceof Error ? loadError.message : 'Research data could not be loaded.'
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return { data, error };
}

function rateText(value: number | null, lower: number | null, upper: number | null) {
  if (value === null) return 'Not reported';
  const point = `${(value * 100).toFixed(1)}%`;
  return lower === null || upper === null
    ? point
    : `${point} (${(lower * 100).toFixed(1)}–${(upper * 100).toFixed(1)}%)`;
}

function exportResearchRows(
  format: 'csv' | 'json',
  rows: Array<Record<string, string | number | null>>
) {
  const contents =
    format === 'json'
      ? JSON.stringify(rows, null, 2)
      : [
          Object.keys(rows[0] ?? {})
            .map((key) => `"${key}"`)
            .join(','),
          ...rows.map((row) =>
            Object.values(row)
              .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
              .join(',')
          ),
        ].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([contents], {
      type: format === 'json' ? 'application/json' : 'text/csv',
    })
  );
  link.download = `research-models.${format}`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function Research() {
  const { data, error } = useResearchData();
  if (error)
    return (
      <main className="mx-auto w-full max-w-4xl p-6">
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      </main>
    );
  if (!data)
    return (
      <main className="mx-auto w-full max-w-4xl p-6 text-sm text-[#78716C]">
        Loading research results…
      </main>
    );

  const { evaluation, split } = data;
  const modelEntries = Object.entries(evaluation.models);
  const testCases = evaluation.n_test;
  const trainPrograms = split.train_programs;
  const testPrograms = evaluation.n_test_programs ?? split.test_programs;
  return (
    <main
      className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6"
      data-testid="research-page"
    >
      <header className="border-b border-[#E7E5E4] pb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[#059669]">Research</p>
        <h1 className="mt-1 text-2xl font-semibold">Evidence for MiniC repair</h1>
        <p className="mt-2 text-sm text-[#78716C]">
          A reproducible, parser-verified evaluation with clear limits.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-semibold">Problem</h2>
        <div className="mt-2 text-sm leading-6 text-[#57534E]">
          <p>Syntax-repair systems can return code that parses but is not the intended repair.</p>
          <p>This project evaluates parser validity separately from recovery correctness.</p>
          <p>The study targets syntax errors in the project’s MiniC subset.</p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Approach</h2>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-[#E7E5E4] bg-white p-4 text-center text-sm">
          <div className="rounded-lg bg-indigo-50 p-3 text-indigo-800">Model proposes</div>
          <span aria-hidden="true" className="text-[#78716C]">
            →
          </span>
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800">
            Deterministic parser verifies
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Dataset</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-lg border border-[#E7E5E4] bg-white p-3">
            <dt className="text-[#78716C]">Train programs</dt>
            <dd className="mt-1 font-mono">{trainPrograms.toLocaleString()}</dd>
          </div>
          <div className="rounded-lg border border-[#E7E5E4] bg-white p-3">
            <dt className="text-[#78716C]">Test programs</dt>
            <dd className="mt-1 font-mono">{testPrograms.toLocaleString()}</dd>
          </div>
          <div className="rounded-lg border border-[#E7E5E4] bg-white p-3">
            <dt className="text-[#78716C]">Test corruptions</dt>
            <dd className="mt-1 font-mono">{testCases.toLocaleString()}</dd>
          </div>
          <div className="rounded-lg border border-[#E7E5E4] bg-white p-3">
            <dt className="text-[#78716C]">Split seed</dt>
            <dd className="mt-1 font-mono">{split.split_seed}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-[#78716C]">
          Evaluation: {evaluation.dataset}; split is by whole program ID.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Models</h2>
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              onClick={() =>
                exportResearchRows(
                  'csv',
                  modelEntries.map(([name, model]) => ({
                    model: name,
                    parameters: model.parameter_count,
                    mean_cpu_latency_ms: model.latency_ms.mean,
                  }))
                )
              }
              className="text-[#059669] hover:underline"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() =>
                exportResearchRows(
                  'json',
                  modelEntries.map(([name, model]) => ({
                    model: name,
                    parameters: model.parameter_count,
                    mean_cpu_latency_ms: model.latency_ms.mean,
                  }))
                )
              }
              className="text-[#059669] hover:underline"
            >
              Export JSON
            </button>
          </div>
        </div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-[#E7E5E4] bg-white">
          <table className="w-full min-w-[460px] text-left text-xs">
            <thead className="bg-stone-50 text-[#78716C]">
              <tr>
                <th className="p-3">Model</th>
                <th className="p-3">Parameters</th>
                <th className="p-3">Mean CPU latency</th>
              </tr>
            </thead>
            <tbody>
              {modelEntries.map(([name, model]) => (
                <tr key={name} className="border-t border-[#E7E5E4]">
                  <th className="p-3 font-semibold">{name}</th>
                  <td className="p-3 font-mono">{model.parameter_count.toLocaleString()}</td>
                  <td className="p-3 font-mono">
                    {model.latency_ms.mean === null
                      ? 'Not reported'
                      : `${model.latency_ms.mean.toFixed(2)} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[#78716C]">
          The committed artifact includes parser-based baselines; no trained Arbora-T5 evaluation is
          reported here.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Results</h2>
          <Link to="/benchmarks" className="text-xs font-medium text-[#059669] hover:underline">
            Open Benchmarks
          </Link>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {modelEntries.map(([name, model]) => {
            const metric = model.metrics.top1_exact;
            return (
              <div key={name} className="rounded-xl border border-[#E7E5E4] bg-white p-3">
                <div className="text-xs text-[#78716C]">{name} · top-1 exact</div>
                <div className="mt-1 font-mono text-lg">
                  {rateText(metric.estimate, metric.lower, metric.upper)}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[#78716C]">
          Top-1 exact measures token recovery. Validity is parser acceptance and is not a
          correctness measure.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Limitations</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#57534E]">
          <li>The generator is synthetic and can bias the evaluated syntax distribution.</li>
          <li>
            Corruptions use a single injected syntax error; interacting errors are not measured.
          </li>
          <li>MiniC is a restricted language subset, not general C.</li>
          <li>Parser validity does not establish exact recovery or semantic equivalence.</li>
          <li>
            The committed evaluation has no out-of-distribution result or trained-model score.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Model cards</h2>
        <div className="mt-2 flex flex-wrap gap-4 text-xs">
          <a
            className="text-[#059669] hover:underline"
            href="https://github.com/mannbutani0306/arbora/blob/main/ml/MODEL_CARD.md"
          >
            Arbora model card
          </a>
          <a
            className="text-[#059669] hover:underline"
            href="https://huggingface.co/Salesforce/codet5-small"
            target="_blank"
            rel="noreferrer"
          >
            CodeT5 base checkpoint card
          </a>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Reproduce</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs text-[#57534E]">
          <li>
            <code className="rounded bg-stone-100 px-1.5 py-1">npm ci</code>
          </li>
          <li>
            <code className="rounded bg-stone-100 px-1.5 py-1">npm run bench:baselines</code>
          </li>
          <li>
            <code className="rounded bg-stone-100 px-1.5 py-1">
              npx tsx tools/score-repairs.ts --in predictions.jsonl
            </code>
          </li>
        </ol>
      </section>
    </main>
  );
}
