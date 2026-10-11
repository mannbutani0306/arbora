import { astToBracketedString } from '../src/core/astUtils.ts';
import { parse } from '../src/core/parser.ts';
import { parseArgs, readJsonl, requiredArg, writeJsonl } from './_shared/cli.ts';

const args = parseArgs(process.argv.slice(2));
const input = requiredArg(args, 'in');
const field = args.get('field') ?? 'code';
const output = requiredArg(args, 'out');

async function* records() {
  for await (const record of readJsonl(input)) {
    const code = record[field];
    if (typeof code !== 'string') throw new Error(`Record ${String(record.id)} has no string field '${field}'.`);
    const result = parse(code);
    yield {
      id: record.id,
      ok: result.errors.length === 0,
      error_count: result.errors.length,
      first_error: result.errors[0] ?? null,
      ast_bracketed: astToBracketedString(result.ast),
    };
  }
}

await writeJsonl(output, records());
