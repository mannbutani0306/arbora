import { useCallback, useEffect, useState } from 'react';
import { listSamples, saveAnalysis, setPublic, type SaveAnalysisInput } from '../../lib/dataService';
import type { AnalysisRecord, SampleRecord } from '../../lib/supabase';

export interface PlaygroundLoadState {
  code?: string;
  title?: string;
  id?: string;
  neuralAst?: unknown;
  comparison?: unknown;
  explanations?: unknown;
}

export function useAnalysisPersistence(fallbackSamples: SampleRecord[]) {
  const [samples, setSamples] = useState(fallbackSamples);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void listSamples().then((listed) => {
      if (!mounted || listed.length === 0) return;
      const known = new Set(listed.map(({ id }) => id));
      setSamples([...listed, ...fallbackSamples.filter(({ id }) => !known.has(id))]);
    }).catch((error: unknown) => {
      console.error('Unable to load Playground samples.', error);
    });
    return () => { mounted = false; };
  }, [fallbackSamples]);

  const save = useCallback(async (input: SaveAnalysisInput, userId: string) => {
    const result = await saveAnalysis(input, userId);
    setLastSavedId(result.id);
    return result;
  }, []);

  const share = useCallback(async (input: SaveAnalysisInput, userId: string) => {
    const saved = await saveAnalysis({ ...input, id: lastSavedId ?? undefined }, userId);
    setLastSavedId(saved.id);
    return setPublic(saved.id, true);
  }, [lastSavedId]);

  const load = useCallback((state?: PlaygroundLoadState) => {
    if (state?.id) setLastSavedId(state.id);
  }, []);

  return { samples, lastSavedId, save, share, load, setLastSavedId };
}

export function toPlaygroundLoadState(analysis: AnalysisRecord): PlaygroundLoadState {
  return {
    code: analysis.source_code,
    title: analysis.title,
    id: analysis.id,
    neuralAst: analysis.neural_ast ?? undefined,
    comparison: analysis.comparison ?? undefined,
    explanations: analysis.explanations ?? undefined,
  };
}
