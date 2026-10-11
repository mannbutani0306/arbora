import { lex } from './lexer';

export interface LeakageRecord {
  id: string;
  code?: string;
  original?: string;
  corrupted?: string;
}

export type DataSplitName = 'train' | 'validation' | 'test';
export type DataSplits = Record<DataSplitName, LeakageRecord[]>;

function normalizedCode(source: string): string {
  return lex(source)
    .tokens.filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT')
    .map((token) => `${token.type}:${token.lexeme}`)
    .join('\u0000');
}

function baseId(id: string): string {
  return id.replace(/_corrupt_\d+$/, '');
}

export function findDataLeakage(splits: DataSplits): string[] {
  const problems: string[] = [];
  const seenIds = new Map<string, DataSplitName>();
  const seenPrograms = new Map<string, DataSplitName>();

  for (const split of ['train', 'validation', 'test'] as const) {
    for (const record of splits[split]) {
      const id = baseId(record.id);
      const previousIdSplit = seenIds.get(id);
      if (previousIdSplit && previousIdSplit !== split) {
        problems.push(`Program id ${id} appears in ${previousIdSplit} and ${split}.`);
      } else {
        seenIds.set(id, split);
      }

      const source = record.original ?? record.code;
      if (source !== undefined) {
        const normalized = normalizedCode(source);
        const previousCodeSplit = seenPrograms.get(normalized);
        if (previousCodeSplit && previousCodeSplit !== split) {
          problems.push(`Normalized original code appears in ${previousCodeSplit} and ${split}.`);
        } else {
          seenPrograms.set(normalized, split);
        }
      }
    }
  }

  const trainingCode = new Set(
    splits.train.flatMap((record) => {
      const source = record.original ?? record.code;
      return source === undefined ? [] : [normalizedCode(source)];
    }),
  );
  for (const split of ['validation', 'test'] as const) {
    for (const record of splits[split]) {
      if (record.corrupted && trainingCode.has(normalizedCode(record.corrupted))) {
        problems.push(`Corrupted ${split} example ${record.id} exactly matches training code.`);
      }
    }
  }
  return problems;
}
