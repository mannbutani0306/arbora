/**
 * AI-assisted syntax repair engine for MiniC using the server-side AI gateway.
 * Uses structured JSON schemas, fast Flash-class model, deterministic verification,
 * confidence ranking, automatic retry with error feedback, and classical panic-mode fallback.
 */

import { parse } from '../core/parser';
import { lex } from '../core/lexer';
import { ParseError, ParseResult, Token } from '../types/ast';
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
}

export interface RepairStatsSummary {
  totalAttempts: number;
  verifiedSuccessCount: number;
  successRate: number; // 0 - 100
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

/**
 * Deterministic classical heuristic recovery when AI is unavailable or fails verification.
 */
export function classicalPanicModeRecovery(
  sourceCode: string,
  errors: ParseError[]
): RepairCandidate {
  let repaired = sourceCode;

  // 1. Balance unclosed braces
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    const missing = openBraces - closeBraces;
    repaired = repaired.trimEnd() + '\n' + '}'.repeat(missing) + '\n';
  }

  // 2. Fix unclosed parentheses in conditions / signatures
  // e.g. if (x > 0 { -> if (x > 0) {
  repaired = repaired.replace(/(\b(?:if|while|for)\s*\([^)\n{]+?)\s*\{/g, '$1) {');
  // function signatures missing paren: int foo(int x { -> int foo(int x) {
  repaired = repaired.replace(/(fn|int|float|void|char|bool)\s+([a-zA-Z_]\w*)\s*\(([^)\n{]+?)\s*\{/g, '$1 $2($3) {');

  // 3. Fix trailing binary operators left hanging: x + \n -> x;\n
  repaired = repaired.replace(/([=+\-*/%&|<>!]+)\s*(\n|\}|$)/g, ' 0;$2');

  // 4. Missing semicolons at statement ends
  const lines = repaired.split('\n');
  const fixedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (
      trimmed.length > 0 &&
      !trimmed.endsWith(';') &&
      !trimmed.endsWith('{') &&
      !trimmed.endsWith('}') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/*') &&
      (trimmed.startsWith('int ') ||
        trimmed.startsWith('float ') ||
        trimmed.startsWith('char ') ||
        trimmed.startsWith('bool ') ||
        trimmed.startsWith('return') ||
        trimmed.startsWith('break') ||
        trimmed.startsWith('continue') ||
        trimmed.includes('='))
    ) {
      return line + ';';
    }
    return line;
  });
  repaired = fixedLines.join('\n');

  // 5. Verify the heuristic fix
  const parseCheck = parse(repaired);
  const isZeroErrors = parseCheck.errors.length === 0;

  return {
    id: 'classical_fallback',
    description: 'Classical panic-mode recovery',
    edits: [
      {
        line: 1,
        column: 1,
        operation: 'replace',
        text: repaired,
      },
    ],
    repairedCode: repaired,
    confidence: isZeroErrors ? 0.75 : 0.45,
    rationale: 'Balanced delimiters and statement termination boundaries using compiler panic-mode heuristics.',
    verified: isZeroErrors,
    editDistance: calculateEditDistance(sourceCode, repaired),
    remainingErrors: parseCheck.errors,
    isFallback: true,
  };
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
}): Promise<RepairResponse> {
  const startTime = performance.now();
  const { sourceCode, tokens, errors, userId } = params;

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
    const fallback = classicalPanicModeRecovery(sourceCode, errors);
    const latency = Math.round(performance.now() - startTime);

    logRepairAttempt(
      {
        source_length: sourceCode.length,
        error_count: errors.length,
        candidate_count: 1,
        verified_count: fallback.verified ? 1 : 0,
        latency_ms: latency,
        model: 'classical-heuristic',
        is_verified_success: fallback.verified,
      },
      userId
    );

    return {
      candidates: [fallback],
      verifiedCandidate: fallback.verified ? fallback : null,
      bestCandidate: fallback,
      fellBackToClassical: true,
      message: 'Fell back to classical panic-mode recovery.',
      latencyMs: latency,
      model: 'classical-heuristic',
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

    // If still none verified, fall back to classical panic-mode recovery
    let fellBack = false;
    let fallbackMessage: string | undefined = undefined;

    if (verifiedCount === 0) {
      fellBack = true;
      fallbackMessage = 'Fell back to classical panic-mode recovery.';
      const fallback = classicalPanicModeRecovery(sourceCode, errors);
      // Prepend or add fallback candidate
      candidates = [fallback, ...candidates];
    }

    const latency = Math.round(performance.now() - startTime);
    const verifiedCandidate = candidates.find((c) => c.verified) || null;
    const bestCandidate = candidates[0] || null;

    logRepairAttempt(
      {
        source_length: sourceCode.length,
        error_count: errors.length,
        candidate_count: candidates.length,
        verified_count: verifiedCount > 0 ? verifiedCount : (bestCandidate?.verified ? 1 : 0),
        latency_ms: latency,
        model: MODEL_NAME,
        is_verified_success: Boolean(verifiedCandidate),
      },
      userId
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
    // In case of API failure / network outage, fall back to classical recovery
    const fallback = classicalPanicModeRecovery(sourceCode, errors);
    const latency = Math.round(performance.now() - startTime);

    logRepairAttempt(
      {
        source_length: sourceCode.length,
        error_count: errors.length,
        candidate_count: 1,
        verified_count: fallback.verified ? 1 : 0,
        latency_ms: latency,
        model: 'classical-heuristic',
        is_verified_success: fallback.verified,
      },
      userId
    );

    return {
      candidates: [fallback],
      verifiedCandidate: fallback.verified ? fallback : null,
      bestCandidate: fallback,
      fellBackToClassical: true,
      message: 'Fell back to classical panic-mode recovery.',
      latencyMs: latency,
      model: 'classical-heuristic',
    };
  }
}

/**
 * Logs every repair attempt (source_length, error_count, candidate_count, verified_count, latency_ms, model)
 * For signed-in users, logs to Supabase benchmark_runs; for guests keeps stats in localStorage.
 */
export function logRepairAttempt(
  entry: Omit<RepairLogEntry, 'id' | 'timestamp'>,
  userId?: string | null
): void {
  const logItem: RepairLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    user_id: userId || null,
  };

  inMemoryLogs = [logItem, ...inMemoryLogs].slice(0, 100);

  try {
    if (typeof localStorage !== 'undefined') {
      const existingRaw = localStorage.getItem(STORAGE_KEY);
      const existingList: RepairLogEntry[] = existingRaw ? JSON.parse(existingRaw) : [];
      const updated = [logItem, ...existingList].slice(0, 100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {
    // Storage quota or disabled in iframe
  }

  // 2. If signed-in user and Supabase is configured, record to benchmark_runs
  if (userId && isSupabaseConfigured) {
    void (async () => {
      try {
        await supabase.from('benchmark_runs').insert({
          user_id: userId,
          suite_name: 'ai_repair',
          results: {
            source_length: entry.source_length,
            error_count: entry.error_count,
            candidate_count: entry.candidate_count,
            verified_count: entry.verified_count,
            latency_ms: entry.latency_ms,
            model: entry.model,
            is_verified_success: entry.is_verified_success,
          },
        });
      } catch {
        // Non-blocking log
      }
    })();
  }
}

/**
 * Returns repair statistics summary for Metrics tab and Benchmarks page
 */
export function getRepairStats(): RepairStatsSummary {
  try {
    let logs: RepairLogEntry[] = inMemoryLogs;
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        logs = JSON.parse(raw);
      }
    }

    if (logs.length === 0) {
      return {
        totalAttempts: 0,
        verifiedSuccessCount: 0,
        successRate: 0,
        avgLatencyMs: 0,
        avgCandidates: 0,
        avgVerifiedCount: 0,
        logs: [],
      };
    }

    const total = logs.length;
    const verifiedSuccess = logs.filter((l) => l.is_verified_success).length;
    const sumLatency = logs.reduce((acc, l) => acc + (l.latency_ms || 0), 0);
    const sumCandidates = logs.reduce((acc, l) => acc + (l.candidate_count || 0), 0);
    const sumVerified = logs.reduce((acc, l) => acc + (l.verified_count || 0), 0);

    return {
      totalAttempts: total,
      verifiedSuccessCount: verifiedSuccess,
      successRate: Math.round((verifiedSuccess / total) * 100),
      avgLatencyMs: Math.round(sumLatency / total),
      avgCandidates: Number((sumCandidates / total).toFixed(1)),
      avgVerifiedCount: Number((sumVerified / total).toFixed(1)),
      logs,
    };
  } catch {
    return {
      totalAttempts: 0,
      verifiedSuccessCount: 0,
      successRate: 0,
      avgLatencyMs: 0,
      avgCandidates: 0,
      avgVerifiedCount: 0,
      logs: [],
    };
  }
}

/**
 * Clears repair stats if requested
 */
export function clearRepairStats(): void {
  inMemoryLogs = [];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Unable to clear persisted repair stats.', error);
  }
}
