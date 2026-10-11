import { createHash } from 'node:crypto';
import { parseArgs, readJsonl, requiredArg, writeJsonl } from './_shared/cli.ts';

const args = parseArgs(process.argv.slice(2));
const input = requiredArg(args, 'in');
const seed = args.get('seed') ?? '42';
const outDir = args.get('out-dir') ?? 'ml/data';
const programs = new Map<string, Record<string, unknown>[]>();
for await (const record of readJsonl(input)) {
  if (typeof record.id !== 'string') throw new Error('Every input record must have a string id.');
  const programId = record.program_id && typeof record.program_id === 'string'
    ? record.program_id
    : record.id;
  const group = programs.get(programId) ?? [];
  group.push(record);
  programs.set(programId, group);
}

const splits = { train: [] as Record<string, unknown>[], val: [] as Record<string, unknown>[], test: [] as Record<string, unknown>[] };
for (const [id, records] of programs) {
  const bucket = Number.parseInt(
    createHash('sha256').update(`${seed}:${id}`).digest('hex').slice(0, 8),
    16
  ) % 100;
  const split = bucket < 80 ? 'train' : bucket < 90 ? 'val' : 'test';
  splits[split].push(...records);
}
for (const split of ['train', 'val', 'test'] as const) {
  await writeJsonl(`${outDir}/${split}.jsonl`, splits[split]);
  console.log(`${split}: ${splits[split].length} records`);
}
