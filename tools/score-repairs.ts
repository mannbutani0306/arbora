import { lex } from '../src/core/lexer.ts';
import { scoreRepair } from '../src/core/repairMetrics.ts';
import { parseArgs, readJsonl, requiredArg, writeText } from './_shared/cli.ts';

interface MetricTotals {
  count: number;
  verified: number;
  top1Exact: number;
  top3Exact: number;
  top1AstMatch: number;
  top3AstMatch: number;
}

const args = parseArgs(process.argv.slice(2));
const input = requiredArg(args, 'in');
const outputJson = args.get('out') ?? 'results/repair-scores.json';
const groups = new Map<string, MetricTotals>();
function bucketFor(source: string): string {
  const count = lex(source).tokens.filter((token) => token.type !== 'EOF').length;
  return count <= 80 ? 'small' : count <= 200 ? 'medium' : 'large';
}
function add(key: string, values: ReturnType<typeof scoreRepair>) {
  const totals = groups.get(key) ?? {
    count: 0, verified: 0, top1Exact: 0, top3Exact: 0, top1AstMatch: 0, top3AstMatch: 0,
  };
  totals.count++;
  totals.verified += values.verifiedRate;
  totals.top1Exact += Number(values.top1Exact);
  totals.top3Exact += Number(values.top3Exact);
  totals.top1AstMatch += Number(values.top1AstMatch);
  totals.top3AstMatch += Number(values.top3AstMatch);
  groups.set(key, totals);
}

for await (const record of readJsonl(input)) {
  if (typeof record.original !== 'string' || !Array.isArray(record.candidates)) {
    throw new Error(`Record ${String(record.id)} needs original and candidates fields.`);
  }
  const candidates = record.candidates.map((candidate) => {
    if (typeof candidate === 'string') return { repairedCode: candidate };
    if (candidate && typeof candidate === 'object') {
      const code = (candidate as Record<string, unknown>).repairedCode;
      if (typeof code === 'string') return { repairedCode: code };
    }
    throw new Error(`Record ${String(record.id)} contains an invalid candidate.`);
  });
  const metrics = scoreRepair(candidates, record.original);
  add('overall', metrics);
  add(`error_type:${typeof record.error_type === 'string' ? record.error_type : 'unknown'}`, metrics);
  add(`length_bucket:${bucketFor(record.original)}`, metrics);
}

const summarize = (totals: MetricTotals) => ({
  count: totals.count,
  verified_rate: totals.count ? totals.verified / totals.count : 0,
  top1_exact: totals.count ? totals.top1Exact / totals.count : 0,
  top3_exact: totals.count ? totals.top3Exact / totals.count : 0,
  top1_ast_match: totals.count ? totals.top1AstMatch / totals.count : 0,
  top3_ast_match: totals.count ? totals.top3AstMatch / totals.count : 0,
});
const result = Object.fromEntries([...groups.entries()].map(([key, totals]) => [key, summarize(totals)]));
const json = JSON.stringify(result, null, 2);
const markdown = [
  '# Repair evaluation',
  '',
  '| Group | Cases | Verified rate | Top-1 exact | Top-3 exact | Top-1 AST | Top-3 AST |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...[...groups.entries()].map(([key, totals]) => {
    const row = summarize(totals);
    const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
    return `| ${key} | ${row.count} | ${pct(row.verified_rate)} | ${pct(row.top1_exact)} | ${pct(row.top3_exact)} | ${pct(row.top1_ast_match)} | ${pct(row.top3_ast_match)} |`;
  }),
  '',
].join('\n');
await writeText(outputJson, json);
await writeText(outputJson.replace(/\.json$/i, '.md'), markdown);
