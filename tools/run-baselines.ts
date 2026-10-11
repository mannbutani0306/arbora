import { createHash } from 'node:crypto';
import { classicalRepair } from '../src/core/classicalRepair.ts';
import { injectSingleTokenError, type ErrorInjectionType } from '../src/core/errorInjector.ts';
import { lex } from '../src/core/lexer.ts';
import { parse } from '../src/core/parser.ts';
import { scoreRepair } from '../src/core/repairMetrics.ts';
import { rankByNgram, trainNgram } from '../src/core/ngramRepair.ts';
import { parseArgs, readJsonl, requiredArg, writeJsonl, writeText } from './_shared/cli.ts';

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
const splitSeed = args.get('seed') ?? '42';
const limit = args.has('limit') ? Number(args.get('limit')) : null;
const corruptedPath = args.get('corrupted');
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

const testRecords = [];
for await (const recordInput of readJsonl(testPath)) testRecords.push(recordInput);
if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1)) {
  throw new Error('--limit must be a positive integer when provided.');
}
const recordsById = new Map(testRecords.map((item) => [String(item.id), item]));
const testCases: Array<{
  record: Record<string, unknown>;
  id: string;
  type: ErrorInjectionType;
  mutated: string;
  tokenIndex: number;
}> = [];
if (corruptedPath) {
  for await (const damaged of readJsonl(corruptedPath)) {
    if (
      typeof damaged.id !== 'string' ||
      typeof damaged.original !== 'string' ||
      typeof damaged.corrupted !== 'string' ||
      typeof damaged.error_type !== 'string' ||
      typeof damaged.token_index !== 'number'
    ) {
      throw new Error('Corrupted test records require id, original, corrupted, error_type, and token_index.');
    }
    const programId = damaged.id.split('_corrupt_', 1)[0];
    const recordInput = recordsById.get(programId);
    if (!recordInput || recordInput.code !== damaged.original) {
      throw new Error(`Corruption ${damaged.id} does not match the supplied test split.`);
    }
    if (!types.includes(damaged.error_type as ErrorInjectionType)) {
      throw new Error(`Unknown error type in ${damaged.id}.`);
    }
    testCases.push({
      record: recordInput,
      id: damaged.id,
      type: damaged.error_type as ErrorInjectionType,
      mutated: damaged.corrupted,
      tokenIndex: damaged.token_index,
    });
  }
  testCases.sort((left, right) => {
    const leftHash = createHash('sha256').update(`${splitSeed}:${left.id}`).digest('hex');
    const rightHash = createHash('sha256').update(`${splitSeed}:${right.id}`).digest('hex');
    return leftHash.localeCompare(rightHash);
  });
  if (limit !== null) testCases.splice(limit);
} else {
  const selectedRecords = limit === null
    ? testRecords
    : [...testRecords]
      .sort((left, right) => {
        const leftHash = createHash('sha256').update(`${splitSeed}:${String(left.id)}`).digest('hex');
        const rightHash = createHash('sha256').update(`${splitSeed}:${String(right.id)}`).digest('hex');
        return leftHash.localeCompare(rightHash);
      })
      .slice(0, limit);
  for (const [programIndex, recordInput] of selectedRecords.entries()) {
    if (typeof recordInput.id !== 'string' || typeof recordInput.code !== 'string') {
      throw new Error('Test records must contain string id and code fields.');
    }
    if (parse(recordInput.code).errors.length > 0) {
      throw new Error(`Test program ${recordInput.id} is not parser-valid.`);
    }
    for (let iteration = 0; iteration < types.length; iteration++) {
      const type = types[(programIndex + iteration) % types.length];
      const injected = injectSingleTokenError(recordInput.code, type, programIndex * 37 + iteration);
      testCases.push({
        record: recordInput,
        id: `${recordInput.id}_generated_${type}`,
        type,
        mutated: injected.mutated,
        tokenIndex: injected.tokenIndex,
      });
    }
  }
}
const observations: Array<Record<string, unknown>> = [];
for (const testCase of testCases) {
  const recordInput = testCase.record;
  if (typeof recordInput.id !== 'string' || typeof recordInput.code !== 'string') {
    throw new Error('Test records must contain string id and code fields.');
  }
    const type = testCase.type;
    const injected = { mutated: testCase.mutated, tokenIndex: testCase.tokenIndex };
    const size = lex(recordInput.code).tokens.filter((token) => token.type !== 'EOF').length;
    const bucket = size <= 80 ? 'small' : size <= 200 ? 'medium' : 'large';
    const classicalCandidates = classicalRepair(injected.mutated);
    const baselineCandidates = [
      { name: 'B0', candidates: [] as ReturnType<typeof classicalRepair> },
      { name: 'B1', candidates: classicalCandidates },
      { name: 'B2', candidates: rankByNgram(classicalCandidates, ngramModel) },
    ];
    for (const baseline of baselineCandidates) {
      const started = performance.now();
      if (baseline.name === 'B0') parse(injected.mutated);
      const candidates = baseline.candidates;
      const metrics = scoreRepair(candidates, recordInput.code);
      const valid = candidates.filter((candidate) => parse(candidate.repairedCode).errors.length === 0).length;
      const latencyMs = performance.now() - started;
      const prefix = baseline.name;
      record(`${prefix}:overall`, valid, candidates.length, metrics);
      record(`${prefix}:error_type:${type}`, valid, candidates.length, metrics);
      record(`${prefix}:length_bucket:${bucket}`, valid, candidates.length, metrics);
      const tokenCount = lex(recordInput.code).tokens.filter((token) => token.type !== 'EOF').length;
      const errorPosition = injected.tokenIndex / Math.max(1, tokenCount);
      observations.push({
        id: testCase.id,
        program_id: String(recordInput.id),
        baseline: baseline.name,
        error_type: type,
        size_bucket: bucket,
        error_position: errorPosition < 1 / 3 ? 'start' : errorPosition < 2 / 3 ? 'middle' : 'end',
        verified_candidate_count: valid,
        candidate_count: candidates.length,
        top1_exact: metrics.top1Exact,
        top3_exact: metrics.top3Exact,
        top1_ast_match: metrics.top1AstMatch,
        top3_ast_match: metrics.top3AstMatch,
        latency_ms: latencyMs,
        device: 'cpu',
        params: 0,
      });
    }
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
  `Training programs: ${trainingTokens.length}; test programs: ${new Set(testCases.map((item) => String(item.record.id))).size}; evaluated corruptions: ${testCases.length}.`,
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
  split_seed: splitSeed,
  train_programs: trainingTokens.length,
  test_programs: new Set(testCases.map((item) => String(item.record.id))).size,
  test_cases: testCases.length,
  test_limit: limit,
  corrupted_input: corruptedPath ?? null,
  corruptions_per_program: corruptedPath ? null : types.length,
  metrics: result,
}, null, 2));
await writeJsonl(outputPath.replace(/\.json$/i, '.observations.jsonl'), observations);
await writeText(outputPath.replace(/\.json$/i, '.md'), markdown);
