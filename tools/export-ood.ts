import { writeJsonl } from './_shared/cli.ts';
import { generateBenchmarkPrograms } from '../src/core/programGenerator.ts';
import { injectSingleTokenError, type ErrorInjectionType } from '../src/core/errorInjector.ts';
import { parse } from '../src/core/parser.ts';
import { listSamples } from '../src/lib/dataService.ts';
import { astToBracketedString } from '../src/core/astUtils.ts';

const output = process.argv[2] ?? 'ml/data/ood.jsonl';
const samples = await listSamples();
const validSamples = samples
  .filter((sample) => parse(sample.source_code).errors.length === 0)
  .slice(0, 12);
if (validSamples.length !== 12) {
  throw new Error(`Expected 12 valid Supabase samples, found ${validSamples.length}. Configure Supabase or supply the missing samples before OOD evaluation.`);
}
const sources = [
  ...validSamples.map((sample) => ({
    id: `supabase_${sample.id}`,
    code: sample.source_code,
    category: 'supabase',
  })),
  ...generateBenchmarkPrograms().map((program) => ({
    id: program.id,
    code: program.code,
    category: 'handwritten',
  })),
];
const types: ErrorInjectionType[] = ['delete', 'insert', 'swap', 'replace', 'natural'];
const records = [];
for (const [programIndex, program] of sources.entries()) {
  const ast = parse(program.code).ast;
  for (const [errorIndex, type] of types.entries()) {
    const injected = injectSingleTokenError(program.code, type, programIndex * 97 + errorIndex);
    records.push({
      id: `${program.id}_${type}`,
      program_id: program.id,
      dataset: program.category,
      original: program.code,
      corrupted: injected.mutated,
      error_type: type,
      token_index: injected.tokenIndex,
      ast_bracketed: astToBracketedString(ast),
    });
  }
}
await writeJsonl(output, records);
console.log(`Wrote ${records.length} OOD corrupted cases from 12 Supabase samples and 20 handwritten templates.`);
