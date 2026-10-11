import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findBundleSecretMarkers } from './check-bundle-secrets';

let directory: string;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('built bundle secret scan', () => {
  it('finds forbidden API key and service-role markers recursively', async () => {
    directory = await mkdtemp(join(tmpdir(), 'arbora-bundle-'));
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets', 'bundle.js'), 'const key = "AIza"; service_role');
    expect(await findBundleSecretMarkers(directory)).toHaveLength(2);
  });

  it('accepts bundles without forbidden markers', async () => {
    directory = await mkdtemp(join(tmpdir(), 'arbora-bundle-'));
    await writeFile(join(directory, 'index.js'), 'export const app = "arbora";');
    expect(await findBundleSecretMarkers(directory)).toEqual([]);
  });
});
