import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

export function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`Unexpected argument: ${item}`);
    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    index++;
  }
  return args;
}

export async function* readJsonl(path: string): AsyncGenerator<Record<string, unknown>> {
  const lines = createInterface({ input: createReadStream(resolve(path)), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const record: unknown = JSON.parse(line);
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`Expected a JSON object in ${path}.`);
    }
    yield record as Record<string, unknown>;
  }
}

export async function writeJsonl(path: string, records: AsyncIterable<unknown> | Iterable<unknown>): Promise<void> {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  const output = createWriteStream(target, { encoding: 'utf8' });
  try {
    for await (const record of records) {
      if (!output.write(`${JSON.stringify(record)}\n`)) await once(output, 'drain');
    }
  } finally {
    output.end();
    await once(output, 'finish');
  }
}

export function requiredArg(args: Map<string, string>, key: string): string {
  const value = args.get(key);
  if (!value) throw new Error(`Required argument --${key} was not provided.`);
  return value;
}

export async function writeText(path: string, content: string): Promise<void> {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  const output = createWriteStream(target, { encoding: 'utf8' });
  output.end(content);
  await once(output, 'finish');
}
