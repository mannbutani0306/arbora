import {
  supabase,
  isSupabaseConfigured,
  AnalysisRecord,
  BenchmarkRunRecord,
  SampleRecord,
  generateShareSlug,
} from './supabase';

export interface SaveAnalysisInput {
  id?: string;
  title: string;
  source_code: string;
  language?: string;
  mode?: string;
  tokens?: any;
  ast: any;
  errors?: any;
  repaired_code?: string | null;
  neural_ast?: any;
  comparison?: any;
  explanations?: any;
  metrics?: any;
  is_public?: boolean;
}

// Local mock storage for guest offline use when Supabase credentials are not set
const LOCAL_ANALYSES_KEY = 'arbora_local_analyses';
const LOCAL_BENCHMARKS_KEY = 'arbora_local_benchmarks';

function getLocalAnalyses(): AnalysisRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_ANALYSES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalAnalyses(items: AnalysisRecord[]) {
  try {
    localStorage.setItem(LOCAL_ANALYSES_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors
  }
}

function getLocalBenchmarks(): BenchmarkRunRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_BENCHMARKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalBenchmarks(items: BenchmarkRunRecord[]) {
  try {
    localStorage.setItem(LOCAL_BENCHMARKS_KEY, JSON.stringify(items));
  } catch {
    // Ignore
  }
}

/**
 * Save or update an analysis record
 */
export async function saveAnalysis(
  input: SaveAnalysisInput,
  userId?: string | null,
): Promise<AnalysisRecord> {
  const payload = {
    title: input.title || 'Untitled AST',
    source_code: input.source_code,
    language: input.language || 'minic',
    mode: input.mode || 'strict',
    tokens: input.tokens || null,
    ast: input.ast,
    errors: input.errors || null,
    repaired_code: input.repaired_code || null,
    neural_ast: input.neural_ast || null,
    comparison: input.comparison || null,
    explanations: input.explanations || null,
    metrics: input.metrics || null,
    is_public: input.is_public ?? false,
    updated_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    const local = getLocalAnalyses();
    if (input.id) {
      const idx = local.findIndex((a) => a.id === input.id);
      if (idx >= 0) {
        local[idx] = { ...local[idx], ...payload, user_id: userId || null };
        setLocalAnalyses(local);
        return local[idx];
      }
    }
    const newRecord: AnalysisRecord = {
      ...payload,
      id: crypto.randomUUID ? crypto.randomUUID() : `local_${Date.now()}`,
      user_id: userId || null,
      share_slug: null,
      created_at: new Date().toISOString(),
    };
    local.unshift(newRecord);
    setLocalAnalyses(local);
    return newRecord;
  }

  if (input.id) {
    const { data, error } = await supabase
      .from('analyses')
      .update(payload)
      .eq('id', input.id)
      .select()
      .single();

    if (error) throw error;
    return data as AnalysisRecord;
  }

  const { data, error } = await supabase
    .from('analyses')
    .insert([
      {
        ...payload,
        user_id: userId || null,
        created_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as AnalysisRecord;
}

/**
 * List analyses for current user
 */
export async function listAnalyses(userId?: string | null): Promise<AnalysisRecord[]> {
  if (!isSupabaseConfigured) {
    const local = getLocalAnalyses();
    if (userId) {
      return local.filter((a) => a.user_id === userId);
    }
    return local;
  }

  let query = supabase.from('analyses').select('*').order('created_at', { ascending: false });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as AnalysisRecord[];
}

/**
 * Rename an analysis
 */
export async function renameAnalysis(id: string, newTitle: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const local = getLocalAnalyses();
    const target = local.find((a) => a.id === id);
    if (target) {
      target.title = newTitle;
      target.updated_at = new Date().toISOString();
      setLocalAnalyses(local);
    }
    return;
  }

  const { error } = await supabase
    .from('analyses')
    .update({ title: newTitle, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Delete an analysis
 */
export async function deleteAnalysis(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const local = getLocalAnalyses().filter((a) => a.id !== id);
    setLocalAnalyses(local);
    return;
  }

  const { error } = await supabase.from('analyses').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Set public state and generate a share slug
 */
export async function setPublic(
  id: string,
  isPublic: boolean,
): Promise<{ share_slug: string | null }> {
  if (!isSupabaseConfigured) {
    const share_slug = isPublic ? generateShareSlug() : null;
    const local = getLocalAnalyses();
    const target = local.find((a) => a.id === id);
    if (target) {
      target.is_public = isPublic;
      target.share_slug = share_slug;
      setLocalAnalyses(local);
    }
    return { share_slug };
  }

  const attempts = isPublic ? 5 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const share_slug = isPublic ? generateShareSlug() : null;
    const { error } = await supabase
      .from('analyses')
      .update({
        is_public: isPublic,
        share_slug,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (!error) return { share_slug };
    if (error.code !== '23505' || attempt === attempts - 1) throw error;
  }
  throw new Error('Unable to create a unique share link after five attempts.');
}

/**
 * Fetch a shared public analysis via RPC function get_public_analysis(p_slug text)
 * CRITICAL RULE: "Public shared analyses are fetched ONLY through the RPC function get_public_analysis(p_slug text); do not query analyses directly for public access."
 */
export async function getPublicBySlug(slug: string): Promise<AnalysisRecord | null> {
  if (!isSupabaseConfigured) {
    const local = getLocalAnalyses();
    const found = local.find((a) => a.share_slug === slug && a.is_public);
    return found || null;
  }

  const { data, error } = await supabase.rpc('get_public_analysis', {
    p_slug: slug,
  });

  if (error) {
    // If RPC returned an error (e.g. not found or rpc error), return null or throw
    console.error('get_public_analysis error:', error);
    return null;
  }

  if (!data) return null;

  // data could be single object or array depending on RPC return definition
  if (Array.isArray(data)) {
    return (data[0] as AnalysisRecord) || null;
  }
  return data as AnalysisRecord;
}

/**
 * List code samples
 */
export async function listSamples(): Promise<SampleRecord[]> {
  if (!isSupabaseConfigured) {
    return [
      {
        id: 'sample_factorial',
        title: 'Factorial Function',
        category: 'Algorithms',
        source_code: `int factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}\n\nint main() {\n    int res = factorial(5);\n    return 0;\n}`,
        difficulty: 'Easy',
      },
      {
        id: 'sample_bubble',
        title: 'Bubble Sort',
        category: 'Algorithms',
        source_code: `void sort(int arr[], int n) {\n    for (int i = 0; i < n - 1; i++) {\n        for (int j = 0; j < n - i - 1; j++) {\n            if (arr[j] > arr[j + 1]) {\n                int temp = arr[j];\n                arr[j] = arr[j + 1];\n                arr[j + 1] = temp;\n            }\n        }\n    }\n}`,
        difficulty: 'Medium',
      },
      {
        id: 'sample_syntax_err',
        title: 'Broken Syntax Recovery',
        category: 'Edge Cases',
        source_code: `int compute(int x, int y) {\n    int total = x + \n    if (x > 0 {\n        total += 10\n    }\n    return total;\n}`,
        difficulty: 'Malformed',
      },
    ];
  }

  const { data, error } = await supabase
    .from('samples')
    .select('*')
    .order('title', { ascending: true });

  if (error) {
    console.warn('Samples fetch error:', error);
    return [];
  }
  return (data || []) as SampleRecord[];
}

/**
 * Save benchmark run
 */
export async function saveBenchmarkRun(
  suiteName: string,
  results: any,
  userId?: string | null,
): Promise<BenchmarkRunRecord> {
  const payload = {
    suite_name: suiteName,
    results: results,
    user_id: userId || null,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured || !userId) {
    const local = getLocalBenchmarks();
    const newRun: BenchmarkRunRecord = {
      ...payload,
      id: crypto.randomUUID ? crypto.randomUUID() : `bench_${Date.now()}`,
    };
    local.unshift(newRun);
    setLocalBenchmarks(local);
    return newRun;
  }

  const { data, error } = await supabase.from('benchmark_runs').insert([payload]).select().single();

  if (error) throw error;
  return data as BenchmarkRunRecord;
}

/**
 * List benchmark runs
 */
export async function listBenchmarkRuns(userId?: string | null): Promise<BenchmarkRunRecord[]> {
  if (!isSupabaseConfigured || !userId) {
    const local = getLocalBenchmarks();
    if (userId) {
      return local.filter((b) => b.user_id === userId);
    }
    return local;
  }

  let query = supabase.from('benchmark_runs').select('*').order('created_at', { ascending: false });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as BenchmarkRunRecord[];
}
