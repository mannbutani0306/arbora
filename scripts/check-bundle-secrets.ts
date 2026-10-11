import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const forbidden = [/AIza/i, /GEMINI_API_KEY/i, /service_role/i];

export async function findBundleSecretMarkers(directory: string): Promise<string[]> {
  const failures: string[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        const content = await readFile(path, 'utf8');
        for (const pattern of forbidden) {
          if (pattern.test(content)) {
            failures.push(
              `${relative(directory, path)} contains forbidden marker ${pattern.source}.`,
            );
          }
        }
      }
    }
  }
  await visit(directory);
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const failures = await findBundleSecretMarkers(join(process.cwd(), 'dist'));
  if (failures.length) throw new Error(`Bundle secret scan failed:\n${failures.join('\n')}`);
  console.log('Bundle secret scan passed.');
}
