import { classicalRepair } from '../src/core/classicalRepair.ts';
import { injectSingleTokenError, type ErrorInjectionType } from '../src/core/errorInjector.ts';
import { lex } from '../src/core/lexer.ts';
import { parse } from '../src/core/parser.ts';
import { scoreRepair } from '../src/core/repairMetrics.ts';
import { rankByNgram, trainNgram } from '../src/core/ngramRepair.ts';
import { parseArgs, readJsonl, requiredArg, writeText } from './_shared/cli.ts';

interface Totals {
  count: number;
  validCandidates: number;
  candidateCount: number;
  top1Exact: number;
  top3Exact: number;
  top1Ast: number;
  top3Ast: number;
}
const args = parseArgs(process.argv.slice(2));
const testPath = requiredArg(args, 'test');
const outputPath = args.get('out') ?? 'results/baselines.json';
const trainPath = args.get('train') ?? 'ml/data/train.jsonl';
const trainingTokens: string[][] = [];
for await (const record of readJsonl(trainPath)) {
  const tokenList = Array.isArray(record.tokens)
    ? record.tokens.filter((token): token is string => typeof token === 'string')
    : typeof record.code === 'string'
      ? lex(record.code).tokens.filter((token) => token.type !== 'EOF').map((token) => token.lexeme)
      : null;
  if (!tokenList) throw new Error(`Training record ${String(record.id)} has no tokens or code.`);
  trainingTokens.push(tokenList);
}
if (trainingTokens.length === 0) throw new Error('Training split is empty.');
const ngramModel = trainNgram(trainingTokens);
const types: ErrorInjectionType[] = ['delete', 'insert', 'swap', 'replace', 'natural'];
const totals = new Map<string, Totals>();
function record(
  key: string,
  verified: number,
  candidates: number,
  metrics: ReturnType<typeof scoreRepair>
) {
  const aggregate = totals.get(key) ?? {
    count: 0,
    validCandidates: 0,
    candidateCount: 0,
    top1Exact: 0,
    top3Exact: 0,
    top1Ast: 0,
    top3Ast: 0,
  };
  aggregate.count++;
  aggregate.validCandidates += verified;
  aggregate.candidateCount += candidates;
  aggregate.top1Exact += Number(metrics.top1Exact);
  aggregate.top3Exact += Number(metrics.top3Exact);
  aggregate.top1Ast += Number(metrics.top1AstMatch);
  aggregate.top3Ast += Number(metrics.top3AstMatch);
  totals.set(key, aggregate);
}

let programIndex = 0;
for await (const recordInput of readJsonl(testPath)) {
  if (typeof recordInput.id !== 'string' || typeof recordInput.code !== 'string') {
    throw new Error('Test records must contain string id and code fields.');
  }
  if (parse(recordInput.code).errors.length > 0) throw new Error(`Test program ${recordInput.id} is not parser-valid.`);
  for (let iteration = 0; iteration < types.length; iteration++) {
    const type = types[(programIndex + iteration) % types.length];
    const injected = injectSingleTokenError(recordInput.code, type, programIndex * 37 + iteration);
    const size = lex(recordInput.code).tokens.filter((token) => token.type !== 'EOF').length;
    const bucket = size <= 80 ? 'small' : size <= 200 ? 'medium' : 'large';
    const classicalCandidates = classicalRepair(injected.mutated);
    const baselineCandidates = [
      { name: 'B0', candidates: [] },
      { name: 'B1', candidates: classicalCandidates },
      { name: 'B2', candidates: rankByNgram(classicalCandidates, ngramModel) },
    ];
    for (const baseline of baselineCandidates) {
      const candidates = baseline.candidates;
      const metrics = scoreRepair(candidates, recordInput.code);
      const valid = candidates.filter((candidate) => parse(candidate.repairedCode).errors.length === 0).length;
      const prefix = baseline.name;
      record(`${prefix}:overall`, valid, candidates.length, metrics);
      record(`${prefix}:error_type:${type}`, valid, candidates.length, metrics);
      record(`${prefix}:length_bucket:${bucket}`, valid, candidates.length, metrics);
    }
  }
  programIndex++;
}

const result = Object.fromEntries([...totals.entries()].map(([key, value]) => [key, {
  cases: value.count,
  candidate_count: value.candidateCount,
  verified_candidate_count: value.validCandidates,
  top1_exact_count: value.top1Exact,
  top3_exact_count: value.top3Exact,
  top1_ast_match_count: value.top1Ast,
  top3_ast_match_count: value.top3Ast,
  verified_rate: value.candidateCount ? value.validCandidates / value.candidateCount : null,
  top1_exact_rate: value.count ? value.top1Exact / value.count : 0,
  top3_exact_rate: value.count ? value.top3Exact / value.count : 0,
  top1_ast_match_rate: value.count ? value.top1Ast / value.count : 0,
  top3_ast_match_rate: value.count ? value.top3Ast / value.count : 0,
}]));
const markdown = [
  '# Baseline evaluation',
  '',
  `Training programs: ${trainingTokens.length}; test programs: ${programIndex}; corruptions per program: ${types.length}.`,
  '',
  '| Baseline / group | Cases | Verified | Top-1 exact | Top-3 exact | Top-1 AST | Top-3 AST |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...Object.entries(result).map(([key, value]) => {
    const pct = (number: number | null) => number === null ? 'N/A' : `${(number * 100).toFixed(2)}%`;
    return `| ${key} | ${value.cases} | ${pct(value.verified_rate)} | ${pct(value.top1_exact_rate)} | ${pct(value.top3_exact_rate)} | ${pct(value.top1_ast_match_rate)} | ${pct(value.top3_ast_match_rate)} |`;
  }),
  '',
].join('\n');
await writeText(outputPath, JSON.stringify({
  split_seed: args.get('seed') ?? '42',
  train_programs: trainingTokens.length,
  test_programs: programIndex,
  corruptions_per_program: types.length,
  metrics: result,
}, null, 2));
await writeText(outputPath.replace(/\.json$/i, '.md'), markdown);
