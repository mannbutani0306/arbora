/**
 * AI-assisted syntax repair engine for MiniC using the server-side AI gateway.
 * Uses structured JSON schemas, fast Flash-class model, deterministic verification,
 * confidence ranking, automatic retry with error feedback, and classical panic-mode fallback.
 */

import { parse } from '../core/parser';
import { lex } from '../core/lexer';
import { ParseError, ParseResult, Token } from '../types/ast';
import { classicalRepair } from '../core/classicalRepair';
import { scoreRepair } from '../core/repairMetrics';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callGateway, isAiAvailable } from './gatewayClient';

export interface RepairEdit {
  line: number;
  column: number;
  operation: 'insert' | 'delete' | 'replace';
  text: string;
}

export interface RepairCandidate {
  id: string;
  description: string;
  edits: RepairEdit[];
  repairedCode: string;
  confidence: number; // 0.0 - 1.0
  rationale: string;
  verified: boolean;
  editDistance: number;
  remainingErrors: ParseError[];
  isFallback?: boolean;
}

export interface RepairResponse {
  candidates: RepairCandidate[];
  verifiedCandidate: RepairCandidate | null;
  bestCandidate: RepairCandidate | null;
  fellBackToClassical: boolean;
  message?: string;
  latencyMs: number;
  model: string;
}

export interface RepairLogEntry {
  id: string;
  timestamp: number;
  source_length: number;
  error_count: number;
  candidate_count: number;
  verified_count: number;
  latency_ms: number;
  model: string;
  is_verified_success: boolean;
  user_id?: string | null;
  error_type?: 'delete' | 'insert' | 'swap' | 'replace' | 'natural';
  top1_correct?: boolean | null;
  top3_correct?: boolean | null;
  exact_match?: boolean | null;
  ast_match?: boolean | null;
  verified?: boolean;
  edit_distance?: number | null;
  source_hash?: string | null;
  engine?: string;
}

export interface RepairContext {
  groundTruth?: string;
  errorType?: 'delete' | 'insert' | 'swap' | 'replace' | 'natural';
  sourceCode?: string;
  candidates?: RepairCandidate[];
  engine?: string;
}

export interface RepairStatsSummary {
  totalAttempts: number;
  verifiedSuccessCount: number;
  verifiedRate: number; // percent of attempts with at least one parser-valid candidate
  avgLatencyMs: number;
  avgCandidates: number;
  avgVerifiedCount: number;
  logs: RepairLogEntry[];
}

const STORAGE_KEY = 'arbora_repair_stats';
const MODEL_NAME = 'AI gateway';

/**
 * Calculates Levenshtein edit distance between two strings
 */
export function calculateEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1,     // deletion
        prev[j - 1] + cost // substitution
      );
    }
    const temp = prev;
    prev = curr;
    curr = temp;
  }

  return prev[b.length];
}

let inMemoryLogs: RepairLogEntry[] = [];

/**
 * Extracts context tokens around each error for grounding
 */
export function extractErrorContexts(
  tokens: Token[] | { tokens: Token[] },
  errors: ParseError[],
  sourceLines: string[]
): string {
  if (errors.length === 0) return 'No errors reported.';

  const tokenList: Token[] = Array.isArray(tokens)
    ? tokens
    : Array.isArray((tokens as any)?.tokens)
    ? (tokens as any).tokens
    : [];

  return errors
    .map((err, idx) => {
      // Find tokens on or adjacent to error line
      const errorTokens = tokenList.filter(
        (t) => Math.abs(t.line - err.line) <= 1
      );
      const tokenStream = errorTokens
        .map((t) => (t.line === err.line && t.column === err.column ? `[ERROR->${t.lexeme}]` : t.lexeme))
        .join(' ');

      const lineSnippet = sourceLines[err.line - 1] || '';

      return `Error ${idx + 1}:
- Position: Line ${err.line}, Column ${err.column}
- Message: ${err.message}
- Severity: ${err.severity}
- Expected: ${err.expected && err.expected.length > 0 ? err.expected.join(', ') : 'None'}
- Found: '${err.found}'
- Source Line: "${lineSnippet.trim()}"
- Local Token Stream: ${tokenStream || 'None'}`;
    })
    .join('\n\n');
}

function classicalCandidates(sourceCode: string, errors: ParseError[]): RepairCandidate[] {
  const originalParseResult: ParseResult = {
    ast: parse(sourceCode).ast,
    tokens: lex(sourceCode).tokens,
    errors,
    diagnostics: [],
    trace: [],
    success: errors.length === 0,
  };
  return classicalRepair(sourceCode, { originalParseResult }).map((candidate, index) => {
    const parsed = parse(candidate.repairedCode);
    return {
      id: `classical_${index + 1}`,
      description: 'Classical single-edit repair',
      edits: candidate.edits.map((edit) => {
        const token = originalParseResult.tokens[edit.tokenIndex];
        return {
          line: token?.line ?? 1,
          column: token?.column ?? 1,
          operation: edit.operation,
          text: edit.text,
        };
      }),
      repairedCode: candidate.repairedCode,
      confidence: 1,
      rationale: 'Found a deterministic edit that parses without errors.',
      verified: true,
      editDistance: calculateEditDistance(sourceCode, candidate.repairedCode),
      remainingErrors: parsed.errors,
      isFallback: true,
    };
  });
}

/**
 * Verifies and ranks candidates:
 * 1. verified (zero-error) first
 * 2. confidence descending
 * 3. smallest edit distance ascending
 */
export function verifyAndRankCandidates(
  rawCandidates: Array<{
    description?: string;
    edits?: RepairEdit[];
    repairedCode?: string;
    confidence?: number;
    rationale?: string;
  }>,
  originalSource: string
): RepairCandidate[] {
  const verifiedList: RepairCandidate[] = [];

  rawCandidates.forEach((c, idx) => {
    const code = (c.repairedCode || '').trim();
    if (!code) return;

    // Run our deterministic parser
    const parseResult = parse(code);
    const isZeroErrors = parseResult.errors.length === 0;
    const distance = calculateEditDistance(originalSource, code);

    verifiedList.push({
      id: `ai_candidate_${idx + 1}_${Date.now()}`,
      description: (c.description || 'Syntax fix').trim(),
      edits: Array.isArray(c.edits) ? c.edits : [],
      repairedCode: code,
      confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : 0.8,
      rationale: (c.rationale || 'Adjusted syntax to conform with MiniC grammar.').trim(),
      verified: isZeroErrors,
      editDistance: distance,
      remainingErrors: parseResult.errors,
      isFallback: false,
    });
  });

  // Rank: verified first, then confidence desc, then editDistance asc
  verifiedList.sort((a, b) => {
    // 1. Verified first
    if (a.verified !== b.verified) {
      return a.verified ? -1 : 1;
    }
    // 2. Confidence higher first
    if (Math.abs(b.confidence - a.confidence) > 0.001) {
      return b.confidence - a.confidence;
    }
    // 3. Smallest edit distance
    return a.editDistance - b.editDistance;
  });

  return verifiedList;
}

/**
 * Main syntax repair pipeline.
 */
export async function repairCode(params: {
  sourceCode: string;
  tokens: Token[];
  errors: ParseError[];
  userId?: string | null;
  groundTruth?: string;
  errorType?: RepairContext['errorType'];
}): Promise<RepairResponse> {
  const startTime = performance.now();
  const { sourceCode, tokens, errors, userId, groundTruth, errorType = 'natural' } = params;

  // If already zero errors, nothing to repair
  if (errors.length === 0) {
    return {
      candidates: [],
      verifiedCandidate: null,
      bestCandidate: null,
      fellBackToClassical: false,
      latencyMs: Math.round(performance.now() - startTime),
      model: MODEL_NAME,
    };
  }

  if (!isAiAvailable()) {
    const candidates = classicalCandidates(sourceCode, errors);
    const fallback = candidates[0] ?? null;
    const latency = Math.round(performance.now() - startTime);

    await logRepairAttempt(
      {
        source_length: sourceCode.length,
        error_count: errors.length,
        candidate_count: candidates.length,
        verified_count: candidates.filter((candidate) => candidate.verified).length,
        latency_ms: latency,
        model: 'classical',
        is_verified_success: Boolean(fallback),
      },
      userId,
      { sourceCode, groundTruth, errorType, candidates, engine: 'classical' }
    );

    return {
      candidates,
      verifiedCandidate: fallback,
      bestCandidate: fallback,
      fellBackToClassical: true,
      message: fallback ? 'Used deterministic classical repair.' : 'No verified classical repair found.',
      latencyMs: latency,
      model: 'classical',
    };
  }

  try {
    // First attempt
    const response = await callGateway('repair', {
      sourceCode,
      tokens: tokens.map(({ line, column, lexeme }) => ({ line, column, lexeme })),
      errors: errors.map(({ line, column, message, severity, expected, found }) => ({
        line,
        column,
        message,
        severity,
        expected,
        found,
      })),
    });
    let candidates = verifyAndRankCandidates(response.candidates, sourceCode);
    let verifiedCount = candidates.filter((c) => c.verified).length;

    // Retry once if none verified
    if (verifiedCount === 0 && candidates.length > 0) {
      const unverifiedFirst = candidates[0];
      const feedbackErrors = unverifiedFirst.remainingErrors
        .map((e) => `Line ${e.line}:${e.column} - ${e.message}`)
        .join('\n');

      try {
        const retryResponse = await callGateway('repair', {
          sourceCode,
          tokens: tokens.map(({ line, column, lexeme }) => ({ line, column, lexeme })),
          errors: errors.map(({ line, column, message, severity, expected, found }) => ({
            line,
            column,
            message,
            severity,
            expected,
            found,
          })),
          retryCandidate: unverifiedFirst.repairedCode,
          retryErrors: feedbackErrors,
        });
        const retryCandidates = verifyAndRankCandidates(retryResponse.candidates, sourceCode);

        if (retryCandidates.some((c) => c.verified)) {
          candidates = retryCandidates;
          verifiedCount = candidates.filter((c) => c.verified).length;
        } else if (retryCandidates.length > 0) {
          candidates = retryCandidates;
        }
      } catch {
        // Retry failed, proceed to classical fallback check
      }
    }

    // If no AI candidate verifies, use deterministic classical repair.
    let fellBack = false;
    let fallbackMessage: string | undefined = undefined;

    if (verifiedCount === 0) {
      fellBack = true;
      fallbackMessage = 'Fell back to deterministic classical repair.';
      const fallbackCandidates = classicalCandidates(sourceCode, errors);
      // Prepend or add fallback candidate
      candidates = [...fallbackCandidates, ...candidates];
    }

    const latency = Math.round(performance.now() - startTime);
    const verifiedCandidate = candidates.find((c) => c.verified) || null;
    const bestCandidate = candidates[0] || null;

    await logRepairAttempt(
      {
        source_length: sourceCode.length,
        error_count: errors.length,
        candidate_count: candidates.length,
        verified_count: candidates.filter((candidate) => candidate.verified).length,
        latency_ms: latency,
        model: MODEL_NAME,
        is_verified_success: Boolean(verifiedCandidate),
      },
      userId,
      { sourceCode, groundTruth, errorType, candidates, engine: fellBack ? 'classical' : 'ai-gateway' }
    );

    return {
      candidates,
      verifiedCandidate,
      bestCandidate,
      fellBackToClassical: fellBack,
      message: fallbackMessage,
      latencyMs: latency,
      model: MODEL_NAME,
    };
  } catch {
    // In case of API failure / network outage, use deterministic classical repair.
    const candidates = classicalCandidates(sourceCode, errors);
    const fallback = candidates[0] ?? null;
    const latency = Math.round(performance.now() - startTime);

    await logRepairAttempt(
      {
        source_length: sourceCode.length,
        error_count: errors.length,
        candidate_count: candidates.length,
        verified_count: candidates.filter((candidate) => candidate.verified).length,
        latency_ms: latency,
        model: 'classical',
        is_verified_success: Boolean(fallback),
      },
      userId,
      { sourceCode, groundTruth, errorType, candidates, engine: 'classical' }
    );

    return {
      candidates,
      verifiedCandidate: fallback,
      bestCandidate: fallback,
      fellBackToClassical: true,
      message: fallback ? 'Used deterministic classical repair.' : 'No verified classical repair found.',
      latencyMs: latency,
      model: 'classical',
    };
  }
}

async function hashSource(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function summarizeRepairLogs(logs: RepairLogEntry[]): RepairStatsSummary {
  const total = logs.length;
  if (total === 0) {
    return {
      totalAttempts: 0,
      verifiedSuccessCount: 0,
      verifiedRate: 0,
      avgLatencyMs: 0,
      avgCandidates: 0,
      avgVerifiedCount: 0,
      logs: [],
    };
  }
  const verifiedSuccess = logs.filter((log) => log.is_verified_success).length;
  return {
    totalAttempts: total,
    verifiedSuccessCount: verifiedSuccess,
    verifiedRate: Math.round((verifiedSuccess / total) * 100),
    avgLatencyMs: Math.round(logs.reduce((sum, log) => sum + (log.latency_ms || 0), 0) / total),
    avgCandidates: Number((logs.reduce((sum, log) => sum + (log.candidate_count || 0), 0) / total).toFixed(1)),
    avgVerifiedCount: Number((logs.reduce((sum, log) => sum + (log.verified_count || 0), 0) / total).toFixed(1)),
    logs,
  };
}

export async function logRepairAttempt(
  entry: Omit<RepairLogEntry, 'id' | 'timestamp'>,
  userId?: string | null,
  context: RepairContext = {}
): Promise<void> {
  const candidates = context.candidates ?? [];
  const score = context.groundTruth === undefined
    ? null
    : scoreRepair(candidates, context.groundTruth);
  let sourceHash: string | null = null;
  if (context.sourceCode !== undefined) {
    try {
      sourceHash = await hashSource(context.sourceCode);
    } catch (error) {
      console.error('Unable to hash source for repair logging.', error);
    }
  }
  let authenticatedUserId = userId || null;
  if (!authenticatedUserId && isSupabaseConfigured) {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Unable to resolve the repair event owner.', error);
      return;
    }
    authenticatedUserId = data.session?.user.id ?? null;
  }
  const topCandidate = candidates[0];
  const logItem: RepairLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    user_id: authenticatedUserId,
    error_type: context.errorType ?? 'natural',
    top1_correct: score?.top1Exact ?? null,
    top3_correct: score?.top3Exact ?? null,
    exact_match: score?.top1Exact ?? null,
    ast_match: score?.top1AstMatch ?? null,
    verified: candidates.some((candidate) => candidate.verified),
    edit_distance: topCandidate?.editDistance ?? null,
    source_hash: sourceHash,
    engine: context.engine ?? 'ai-gateway',
  };
  inMemoryLogs = [logItem, ...inMemoryLogs].slice(0, 100);

  if (authenticatedUserId && isSupabaseConfigured) {
    const { error } = await supabase.from('repair_events').insert({
      user_id: authenticatedUserId,
      error_type: logItem.error_type,
      candidates_count: entry.candidate_count,
      verified_count: entry.verified_count,
      top1_correct: logItem.top1_correct,
      top3_correct: logItem.top3_correct,
      latency_ms: entry.latency_ms,
      model: entry.model,
      engine: logItem.engine,
      exact_match: logItem.exact_match,
      ast_match: logItem.ast_match,
      verified: logItem.verified,
      edit_distance: logItem.edit_distance,
      source_hash: logItem.source_hash,
    });
    if (error) {
      console.error('Unable to persist repair event.', error);
      return;
    }
    return;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const existingRaw = localStorage.getItem(STORAGE_KEY);
      const existingList: RepairLogEntry[] = existingRaw ? JSON.parse(existingRaw) : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([logItem, ...existingList].slice(0, 100)));
    } catch (error) {
      console.error('Unable to persist guest repair event locally.', error);
    }
  }
}

export async function getRepairStats(): Promise<RepairStatsSummary> {
  if (isSupabaseConfigured) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user.id;
    if (userId) {
      const rows: Array<{
        id: string;
        created_at: string;
        error_type: RepairLogEntry['error_type'];
        candidates_count: number;
        verified_count: number;
        top1_correct: boolean | null;
        top3_correct: boolean | null;
        latency_ms: number;
        model: string;
        engine: string;
        exact_match: boolean | null;
        ast_match: boolean | null;
        verified: boolean;
        edit_distance: number | null;
        source_hash: string | null;
        user_id: string;
      }> = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('repair_events')
          .select('id,created_at,error_type,candidates_count,verified_count,top1_correct,top3_correct,latency_ms,model,engine,exact_match,ast_match,verified,edit_distance,source_hash,user_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }
      const logs = rows.map((row) => ({
        id: row.id,
        timestamp: Date.parse(row.created_at),
        source_length: 0,
        error_count: 0,
        candidate_count: row.candidates_count,
        verified_count: row.verified_count,
        latency_ms: row.latency_ms,
        model: row.model,
        is_verified_success: row.verified,
        user_id: row.user_id,
        error_type: row.error_type,
        top1_correct: row.top1_correct,
        top3_correct: row.top3_correct,
        exact_match: row.exact_match,
        ast_match: row.ast_match,
        verified: row.verified,
        edit_distance: row.edit_distance,
        source_hash: row.source_hash,
        engine: row.engine,
      } satisfies RepairLogEntry));
      return summarizeRepairLogs(logs);
    }
  }

  if (typeof localStorage === 'undefined') return summarizeRepairLogs(inMemoryLogs);
  const raw = localStorage.getItem(STORAGE_KEY);
  return summarizeRepairLogs(raw ? JSON.parse(raw) as RepairLogEntry[] : inMemoryLogs);
}

export async function clearRepairStats(): Promise<void> {
  inMemoryLogs = [];
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  if (!isSupabaseConfigured) return;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) return;
  const { error } = await supabase.from('repair_events').delete().eq('user_id', userId);
  if (error) throw error;
}
