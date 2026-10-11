import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { baselineReportSchema, evaluationReportSchema } from '../src/lib/evaluationResultsSchema';

const root = process.cwd();
const publicResults = resolve(root, 'public', 'results');
mkdirSync(publicResults, { recursive: true });

function syncJson(
  source: string,
  destinationName: string,
  schema: { parse: (value: unknown) => unknown },
) {
  const contents: unknown = JSON.parse(readFileSync(source, 'utf8'));
  schema.parse(contents);
  copyFileSync(source, resolve(publicResults, destinationName));
}

const mlResultsDir = resolve(root, 'ml', 'results');
const mlFiles = readdirSync(mlResultsDir).filter((file) => file.endsWith('.json'));
if (!mlFiles.includes('evaluation_baselines.json') || !mlFiles.includes('baselines.json')) {
  throw new Error('Expected ml/results/evaluation_baselines.json and ml/results/baselines.json.');
}

for (const file of mlFiles) {
  const schema =
    file === 'evaluation_baselines.json' ? evaluationReportSchema : baselineReportSchema;
  const destination = file === 'baselines.json' ? 'ml-baselines.json' : file;
  syncJson(resolve(mlResultsDir, file), destination, schema);
}

syncJson(resolve(root, 'results', 'baselines.json'), 'baselines.json', baselineReportSchema);
console.log(`Validated and synchronized ${mlFiles.length + 1} result files into public/results/.`);
