import { findDataLeakage, type DataSplitName, type DataSplits } from '../src/core/dataLeak.ts';
import { parseArgs, readJsonl, requiredArg } from './_shared/cli.ts';

const args = parseArgs(process.argv.slice(2));
const paths: Record<DataSplitName, string> = {
  train: requiredArg(args, 'train'),
  validation: requiredArg(args, 'validation'),
  test: requiredArg(args, 'test'),
};
const splits: DataSplits = { train: [], validation: [], test: [] };

for (const split of Object.keys(paths) as DataSplitName[]) {
  for await (const record of readJsonl(paths[split])) {
    if (typeof record.id !== 'string') {
      throw new Error(`${split} rows must contain a string id.`);
    }
    splits[split].push({
      id: record.id,
      ...(typeof record.code === 'string' ? { code: record.code } : {}),
      ...(typeof record.original === 'string' ? { original: record.original } : {}),
      ...(typeof record.corrupted === 'string' ? { corrupted: record.corrupted } : {}),
    });
  }
}

const problems = findDataLeakage(splits);
if (problems.length > 0) {
  throw new Error(
    `Data leakage detected:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
  );
}
console.log('No data leakage found across train, validation, and test splits.');
