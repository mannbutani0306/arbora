import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve environment variables safely
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('your-project')
);

// Fallback dummy URL/Key to avoid client creation crash if env is missing
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? supabaseUrl! : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey! : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// Database Types
export interface Profile {
  id: string;
  email?: string;
  created_at?: string;
}

export interface AnalysisRecord {
  id: string;
  user_id?: string | null;
  title: string;
  source_code: string;
  language: string;
  mode: string;
  tokens?: any;
  ast: any;
  errors?: any;
  repaired_code?: string | null;
  neural_ast?: any;
  comparison?: any;
  explanations?: any;
  metrics?: {
    nodeCount?: number;
    depth?: number;
    diagnosticsCount?: number;
    parseTimeMs?: number;
  } | null;
  is_public: boolean;
  share_slug?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface BenchmarkRunRecord {
  id: string;
  user_id?: string | null;
  suite_name: string;
  results: any;
  created_at: string;
}

export interface SampleRecord {
  id: string;
  title: string;
  category: string;
  source_code: string;
  difficulty: string;
}

// Helper: 8-character random share slug
export function generateShareSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}
