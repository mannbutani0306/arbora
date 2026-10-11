import type { ParseError, Token } from '../types/ast';
import type { ASTNode } from '../types/ast';
import { astToBracketedString } from '../core/astUtils';
import { lex } from '../core/lexer';
import type { RepairCandidate, RepairResponse } from './repair';
import { generateNeuralAst, normalizeNeuralAST } from './neuralAst';
import { callGateway } from './gatewayClient';

export type RepairEngineId = 'classical' | 'ngram' | 'gemini' | 'arbora-t5';
export type RepairEngineChoice = RepairEngineId | 'ensemble';
export type AstEngineId = 'gemini' | 'arbora-t5';

export interface RepairEngine {
  id: RepairEngineId;
  label: string;
  repair(source: string, errors: ParseError[], tokens: Token[], options?: { signal?: AbortSignal }): Promise<RepairResponse>;
}

export interface AstEngineResult {
  ast: ASTNode | null;
  astBracketed: string | null;
  isValid: boolean;
  latencyMs: number;
  model: string;
}

export interface AstEngine {
  id: AstEngineId;
  label: string;
  generate(source: string, options?: { signal?: AbortSignal }): Promise<AstEngineResult>;
}

export const ENGINE_LABELS: Record<RepairEngineChoice, string> = {
  classical: 'Classical',
  ngram: 'N-gram',
  gemini: 'Gemini',
  'arbora-t5': 'Arbora-T5',
  ensemble: 'Ensemble',
};

type EngineExecutor = (
  engine: RepairEngineChoice,
  source: string,
  errors: ParseError[],
  tokens: Token[],
  signal?: AbortSignal
) => Promise<RepairResponse>;

const responseCache = new Map<string, RepairResponse>();

function cacheKey(source: string, engine: RepairEngineChoice): string {
  let hash = 0xcbf29ce484222325n;
  const input = `${engine}\u0000${source}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${engine}:${hash.toString(16)}`;
}

export function clearRepairEngineCache(): void {
  responseCache.clear();
  astResponseCache.clear();
}

const astResponseCache = new Map<string, AstEngineResult>();

async function cachedAst(
  engine: AstEngineId,
  source: string,
  signal: AbortSignal | undefined,
  generate: () => Promise<AstEngineResult>
): Promise<AstEngineResult> {
  const key = cacheKey(source, engine);
  const cached = astResponseCache.get(key);
  if (cached) return { ...cached, latencyMs: 0 };
  const result = await generate();
  if (!signal?.aborted && result.isValid && result.ast) {
    astResponseCache.set(key, result);
    if (astResponseCache.size > 100) {
      astResponseCache.delete(astResponseCache.keys().next().value as string);
    }
  }
  return result;
}

export async function cachedRepair(
  engine: RepairEngineChoice,
  source: string,
  errors: ParseError[],
  tokens: Token[],
  executor: EngineExecutor,
  signal?: AbortSignal
): Promise<RepairResponse> {
  const key = cacheKey(source, engine);
  const cached = responseCache.get(key);
  if (cached) return { ...cached, latencyMs: 0 };
  const response = await executor(engine, source, errors, tokens, signal);
  if (!signal?.aborted && !response.fellBackToClassical && !response.message) {
    responseCache.set(key, response);
    if (responseCache.size > 100) {
      responseCache.delete(responseCache.keys().next().value as string);
    }
  }
  return response;
}

export function createRepairEngines(executor: EngineExecutor): Record<RepairEngineId, RepairEngine> {
  const definitions: Array<[RepairEngineId, string]> = [
    ['classical', 'Classical'],
    ['ngram', 'N-gram'],
    ['gemini', 'Gemini'],
    ['arbora-t5', 'Arbora-T5'],
  ];
  return Object.fromEntries(definitions.map(([id, label]) => [
    id,
    {
      id,
      label,
      repair: (
        source: string,
        errors: ParseError[],
        tokens: Token[],
        options: { signal?: AbortSignal } = {}
      ) => cachedRepair(id, source, errors, tokens, executor, options.signal),
    } satisfies RepairEngine,
  ])) as Record<RepairEngineId, RepairEngine>;
}

export function mergeEnsembleCandidates(groups: RepairCandidate[][]): RepairCandidate[] {
  const merged = new Map<string, RepairCandidate>();
  for (const candidates of groups) {
    for (const candidate of candidates) {
      const key = lex(candidate.repairedCode).tokens
        .filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT')
        .map((token) => `${token.type}:${token.lexeme}`)
        .join('\u0000');
      const prior = merged.get(key);
      if (prior) {
        const engines = new Set([...(prior.agreedBy ?? [prior.engineId]), candidate.engineId]);
        prior.agreedBy = [...engines];
        prior.confidence = Math.max(prior.confidence, candidate.confidence);
      } else {
        merged.set(key, {
          ...candidate,
          agreedBy: candidate.agreedBy ?? [candidate.engineId],
        });
      }
    }
  }
  return [...merged.values()].sort((left, right) =>
    Number(right.verified) - Number(left.verified) ||
    (right.agreedBy?.length ?? 1) - (left.agreedBy?.length ?? 1) ||
    right.confidence - left.confidence
  );
}

export const astEngines: Record<AstEngineId, AstEngine> = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    async generate(source, options = {}) {
      return cachedAst('gemini', source, options.signal, async () => {
        const result = await generateNeuralAst(source, undefined, options.signal);
        return {
          ast: result.ast,
          astBracketed: result.ast ? astToBracketedString(result.ast) : null,
          isValid: result.isValid,
          latencyMs: result.latencyMs,
          model: result.model,
        };
      });
    },
  },
  'arbora-t5': {
    id: 'arbora-t5',
    label: 'Arbora-T5',
    async generate(source, options = {}) {
      return cachedAst('arbora-t5', source, options.signal, async () => {
        const started = performance.now();
        const result = await callGateway('ast_t5', { code: source }, { signal: options.signal });
        const bracketed = result.ast_bracketed;
        const ast = bracketedAstToNode(bracketed);
        return {
          ast,
          astBracketed: bracketed,
          isValid: result.is_valid && ast !== null,
          latencyMs: result.latency_ms || Math.round(performance.now() - started),
          model: result.model_id,
        };
      });
    },
  },
};

function bracketedAstToNode(source: string): ASTNode | null {
  const tokens = source.match(/\(|\)|"(?:\\.|[^"\\])*"|[^\s()]+/g) ?? [];
  let index = 0;
  let nextId = 0;

  function readNode(): Record<string, unknown> | null {
    if (tokens[index++] !== '(') return null;
    const type = tokens[index++];
    if (!type || type === ')' || !/^[A-Za-z][A-Za-z0-9]*$/.test(type)) return null;
    const children: Record<string, unknown>[] = [];
    while (index < tokens.length && tokens[index] === '(') {
      const child = readNode();
      if (!child) return null;
      children.push(child);
    }
    while (index < tokens.length && tokens[index] !== ')') index += 1;
    if (tokens[index++] !== ')') return null;
    return {
      id: `arbora_${nextId++}`,
      type,
      span: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
      children,
    };
  }

  const raw = readNode();
  return raw && index === tokens.length && raw.type === 'Program'
    ? normalizeNeuralAST(raw)
    : null;
}
