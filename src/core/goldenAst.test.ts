import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
  generateShareSlug: vi.fn(),
}));
import { listSamples } from '../lib/dataService';
import { parse } from './parser';
import { handwritten } from './programGenerator';

function withoutSpansAndIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSpansAndIds);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'id' && key !== 'span')
      .map(([key, child]) => [key, withoutSpansAndIds(child)]),
  );
}

describe('MiniC AST goldens', () => {
  it('matches snapshots for every bundled sample and handwritten template', async () => {
    const samples = await listSamples();
    const programs = [
      ...samples.map((sample) => ({ id: sample.id, code: sample.source_code })),
      ...handwritten.map((program) => ({ id: program.id, code: program.code })),
    ];
    expect(programs.length).toBeGreaterThan(0);
    for (const program of programs) {
      expect(withoutSpansAndIds(parse(program.code).ast), program.id).toMatchSnapshot(program.id);
    }
  }, 30_000);
});
