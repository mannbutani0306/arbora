import { createHash } from 'node:crypto';
import { parse } from '../src/core/parser.ts';
import { lex } from '../src/core/lexer.ts';
import { astToBracketedString } from '../src/core/astUtils.ts';
import { generateProgram, type ProgramSizeClass } from '../src/core/programGenerator.ts';
import { parseArgs, requiredArg, writeJsonl } from './_shared/cli.ts';

const args = parseArgs(process.argv.slice(2));
const count = Number(args.get('n') ?? '50000');
const startSeed = Number(args.get('seed') ?? '42');
const outputPath = requiredArg(args, 'out');
if (!Number.isSafeInteger(count) || count < 1) throw new Error('--n must be a positive integer.');
if (!Number.isSafeInteger(startSeed)) throw new Error('--seed must be an integer.');

const sizeFor = (index: number): ProgramSizeClass =>
  (['small', 'medium', 'large'] as const)[index % 3];
const hashes = new Set<string>();
async function* records() {
  for (let index = 0; index < count; index++) {
    const seed = startSeed + index;
    const program = generateProgram(seed, { sizeClass: sizeFor(index) });
    const parsed = parse(program.code);
    if (parsed.errors.length > 0) throw new Error(`Generator/parser mismatch at seed ${seed}.`);
    const normalized = lex(program.code).tokens
      .filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT')
      .map((token) => `${token.type}:${token.lexeme}`)
      .join('\u0000');
    const tokenHash = createHash('sha256').update(normalized).digest('hex');
    if (hashes.has(tokenHash)) continue;
    hashes.add(tokenHash);
    const astJson = JSON.stringify(parsed.ast);
    yield {
      id: `program_${seed}`,
      seed,
      size_class: program.sizeClass,
      code: program.code,
      tokens: parsed.tokens.filter((token) => token.type !== 'EOF').map((token) => token.lexeme),
      ast_bracketed: astToBracketedString(parsed.ast),
      ast_json_hash: createHash('sha256').update(astJson).digest('hex'),
    };
  }
}

await writeJsonl(outputPath, records());
console.log(`Wrote ${hashes.size} unique parser-verified programs to ${outputPath}.`);
