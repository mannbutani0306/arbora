import { injectSingleTokenError, type ErrorInjectionType } from '../src/core/errorInjector.ts';
import { parseArgs, readJsonl, requiredArg, writeJsonl } from './_shared/cli.ts';

const args = parseArgs(process.argv.slice(2));
const input = requiredArg(args, 'in');
const output = requiredArg(args, 'out');
const perProgram = Number(args.get('per-program') ?? '3');
if (!Number.isSafeInteger(perProgram) || perProgram < 1) throw new Error('--per-program must be a positive integer.');
const types: ErrorInjectionType[] = ['delete', 'insert', 'swap', 'replace', 'natural'];

async function* records() {
  let programIndex = 0;
  for await (const record of readJsonl(input)) {
    if (typeof record.id !== 'string' || typeof record.code !== 'string') {
      throw new Error('Input records must contain string id and code fields.');
    }
    for (let iteration = 0; iteration < perProgram; iteration++) {
      const type = types[(programIndex + iteration) % types.length];
      const injected = injectSingleTokenError(record.code, type, programIndex * 31 + iteration);
      yield {
        id: `${record.id}_corrupt_${iteration}`,
        original: record.code,
        corrupted: injected.mutated,
        error_type: injected.type,
        token_index: injected.tokenIndex,
      };
    }
    programIndex++;
  }
}

await writeJsonl(output, records());
