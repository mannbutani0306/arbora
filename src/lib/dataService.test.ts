// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteAnalysis,
  getPublicBySlug,
  listAnalyses,
  listBenchmarkRuns,
  listSamples,
  renameAnalysis,
  saveAnalysis,
  saveBenchmarkRun,
  setPublic,
} from './dataService';

vi.mock('./supabase', () => ({
  isSupabaseConfigured: false,
  generateShareSlug: () => 'share-fixture',
  supabase: {},
}));

describe('local data service', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('saves, updates, and filters local analyses', async () => {
    const initial = await saveAnalysis({
      title: '',
      source_code: 'int main() { return 0; }',
      ast: { type: 'Program' },
    }, 'user-a');

    expect(initial.title).toBe('Untitled AST');
    expect(initial.language).toBe('minic');
    expect(initial.mode).toBe('strict');
    expect(initial.user_id).toBe('user-a');
    expect(await listAnalyses('user-a')).toEqual([initial]);
    expect(await listAnalyses('user-b')).toEqual([]);

    const updated = await saveAnalysis({
      id: initial.id,
      title: 'Updated',
      source_code: 'int main() { return 1; }',
      ast: { type: 'Program', children: [] },
      is_public: true,
    });

    expect(updated).toMatchObject({
      id: initial.id,
      title: 'Updated',
      user_id: null,
      is_public: true,
    });
    expect(await listAnalyses()).toEqual([updated]);
  });

  it('renames, publishes, unpublishes, and deletes local analyses', async () => {
    const analysis = await saveAnalysis({
      title: 'Share me',
      source_code: 'int main() { return 0; }',
      ast: { type: 'Program' },
    });

    await renameAnalysis(analysis.id, 'Renamed');
    expect((await listAnalyses())[0].title).toBe('Renamed');

    expect(await setPublic(analysis.id, true)).toEqual({ share_slug: 'share-fixture' });
    expect(await getPublicBySlug('share-fixture')).toMatchObject({
      id: analysis.id,
      is_public: true,
      share_slug: 'share-fixture',
    });
    expect(await getPublicBySlug('missing')).toBeNull();

    expect(await setPublic(analysis.id, false)).toEqual({ share_slug: null });
    expect(await getPublicBySlug('share-fixture')).toBeNull();
    await renameAnalysis('missing', 'No-op');
    await deleteAnalysis('missing');
    await deleteAnalysis(analysis.id);
    expect(await listAnalyses()).toEqual([]);
  });

  it('returns built-in samples and filters malformed local storage safely', async () => {
    expect((await listSamples()).map(({ id }) => id)).toEqual([
      'sample_factorial',
      'sample_bubble',
      'sample_syntax_err',
    ]);

    localStorage.setItem('arbora_local_analyses', '{invalid');
    localStorage.setItem('arbora_local_benchmarks', '{invalid');
    expect(await listAnalyses()).toEqual([]);
    expect(await listBenchmarkRuns()).toEqual([]);
  });

  it('stores benchmark history locally and filters by user', async () => {
    const run = await saveBenchmarkRun('Fixture suite', { totalPrograms: 1 }, 'user-a');

    expect(run).toMatchObject({
      suite_name: 'Fixture suite',
      results: { totalPrograms: 1 },
      user_id: 'user-a',
    });
    expect(await listBenchmarkRuns('user-a')).toEqual([run]);
    expect(await listBenchmarkRuns('user-b')).toEqual([]);
    expect(await listBenchmarkRuns()).toEqual([run]);
  });
});
