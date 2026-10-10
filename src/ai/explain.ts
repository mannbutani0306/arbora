/**
 * AI-assisted AST node and program explanation engine for MiniC.
 * Uses Gemini (@google/genai) streaming API with tiered audiences:
 * - Beginner: Jargon-free, intuitive descriptions.
 * - Intermediate: Software developer perspective, scope & syntax tree mechanics.
 * - Expert: Compiler theory, formal grammar productions & operational semantics.
 *
 * Caching strategy:
 * 1. In-memory hash map cache.
 * 2. Supabase table `explanation_cache` (columns: cache_key, level, content jsonb).
 * Cache key is a deterministic hash of (node subtree + level).
 */

import { GoogleGenAI } from '@google/genai';
import { ASTNode } from '../types/ast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { COMPACT_MINIC_GRAMMAR } from './repair';

export type ExplanationLevel = 'Beginner' | 'Intermediate' | 'Expert';

export interface ExplanationContent {
  explanation: string; // Max 3 sentences
  rule: string;        // Grammar production that produced it
  analogy: string;     // One line
  cached?: boolean;
}

// In-memory cache
const inMemoryCache = new Map<string, ExplanationContent>();

/**
 * Returns Gemini API key safely from environment or secrets.
 */
export function getGeminiApiKey(): string | null {
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    const key = process.env.GEMINI_API_KEY;
    if (key && !key.startsWith('MY_') && key !== 'undefined' && key.trim() !== '') {
      return key.trim();
    }
  }

  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const metaEnv = (import.meta as any).env;
    const key = metaEnv.VITE_GEMINI_API_KEY || metaEnv.GEMINI_API_KEY;
    if (key && !key.startsWith('MY_') && key !== 'undefined' && key.trim() !== '') {
      return key.trim();
    }
  }

  return null;
}

/**
 * FNV-1a 32-bit hash algorithm for fast, deterministic cache keys.
 */
export function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Serializes an AST node subtree structure into a stable string signature.
 */
export function serializeSubtree(node: ASTNode | null | 'whole_program'): string {
  if (!node || node === 'whole_program') {
    return 'whole_program';
  }

  const parts: string[] = [node.type];
  const anyNode = node as any;

  if (anyNode.name) parts.push(`n:${anyNode.name}`);
  if (anyNode.operator) parts.push(`op:${anyNode.operator}`);
  if (anyNode.returnType) parts.push(`ret:${anyNode.returnType}`);
  if (anyNode.varType) parts.push(`vt:${anyNode.varType}`);
  if (anyNode.paramType) parts.push(`pt:${anyNode.paramType}`);
  if (anyNode.literalType) parts.push(`lt:${anyNode.literalType}`);
  if (anyNode.value !== undefined) parts.push(`v:${String(anyNode.value)}`);

  if (Array.isArray(node.children) && node.children.length > 0) {
    parts.push(`[${node.children.map(serializeSubtree).join(',')}]`);
  }

  return parts.join('|');
}

/**
 * Computes deterministic cache key from (node subtree + level).
 */
export function computeExplanationCacheKey(
  node: ASTNode | null | 'whole_program',
  level: ExplanationLevel,
  codeSnippet?: string
): string {
  const subtreeSig = serializeSubtree(node);
  const snippetPart = codeSnippet ? fnv1a(codeSnippet.trim()) : '';
  const payload = `${subtreeSig}::${snippetPart}::${level}`;
  return `exp_${fnv1a(payload)}`;
}

/**
 * Reads from in-memory cache, then Supabase table `explanation_cache`.
 */
export async function getCachedExplanation(
  cacheKey: string,
  level: ExplanationLevel
): Promise<ExplanationContent | null> {
  // 1. In-memory check
  const memKey = `${cacheKey}__${level}`;
  if (inMemoryCache.has(memKey)) {
    return { ...inMemoryCache.get(memKey)!, cached: true };
  }

  // 2. Supabase check
  if (isSupabaseConfigured) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);

      const { data, error } = await supabase
        .from('explanation_cache')
        .select('content')
        .eq('cache_key', cacheKey)
        .eq('level', level)
        .abortSignal(controller.signal)
        .maybeSingle();

      clearTimeout(timer);

      if (!error && data?.content) {
        const parsed = data.content as ExplanationContent;
        inMemoryCache.set(memKey, parsed);
        return { ...parsed, cached: true };
      }
    } catch {
      // Non-blocking fallback
    }
  }

  return null;
}

/**
 * Stores explanation into in-memory cache and Supabase table `explanation_cache`.
 */
export async function storeCachedExplanation(
  cacheKey: string,
  level: ExplanationLevel,
  content: ExplanationContent,
  userId?: string | null
): Promise<void> {
  const memKey = `${cacheKey}__${level}`;
  inMemoryCache.set(memKey, content);

  if (isSupabaseConfigured && userId) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);

      await supabase.from('explanation_cache').upsert(
        {
          cache_key: cacheKey,
          level,
          content,
        },
        { onConflict: 'cache_key,level' }
      ).abortSignal(controller.signal);

      clearTimeout(timer);
    } catch {
      // Non-blocking log
    }
  }
}

/**
 * Deterministic offline fallback explanation when API key is missing or offline.
 */
export function getOfflineFallbackExplanation(
  node: ASTNode | null | 'whole_program',
  level: ExplanationLevel
): ExplanationContent {
  if (!node || node === 'whole_program') {
    return {
      explanation:
        'This represents the complete compilation unit of the MiniC program. It encapsulates all top-level function declarations and global variables. The compiler evaluates these declarations in sequential translation order.',
      rule: 'Program -> TopLevelItem*',
      analogy: 'Like the blueprint of an entire building containing individual rooms.',
      cached: false,
    };
  }

  switch (node.type) {
    case 'FunctionDecl': {
      const fnName = (node as any).name || 'fn';
      return {
        explanation: `Declares the callable function '${fnName}' with specified return type and parameter contracts. It creates a lexical scope containing executed statements. When invoked, execution jumps to this function body before returning.`,
        rule: "FunctionDecl -> Type IDENTIFIER '(' ParamListOpt ')' Block",
        analogy: 'A kitchen recipe that takes ingredients (parameters) and produces a dish (return value).',
        cached: false,
      };
    }
    case 'IfStmt':
      return {
        explanation:
          'Evaluates a conditional expression to branch program execution paths. If the condition truth value evaluates to true, the then-branch executes. Otherwise, control flows to an optional else-branch or the subsequent statement.',
        rule: "IfStmt -> 'if' '(' Expression ')' Statement ('else' Statement)?",
        analogy: 'A fork in a hiking trail where a sign directs you depending on the weather.',
        cached: false,
      };
    case 'WhileStmt':
    case 'ForStmt':
    case 'DoWhileStmt':
      return {
        explanation:
          'Repeatedly executes a body of statements while a boolean condition remains true. Each iteration evaluates the loop condition to determine if termination occurs. Control leaves the loop once the condition evaluates to false or a break occurs.',
        rule: `${node.type} -> loop-construct`,
        analogy: 'A carousel turning until the ride timer expires.',
        cached: false,
      };
    case 'BinaryExpr': {
      const op = (node as any).operator || 'op';
      return {
        explanation: `Evaluates two operand sub-trees using the '${op}' operator according to MiniC precedence rules. Left and right subtrees are resolved before the operator applies. The result forms a single evaluated value.`,
        rule: `BinaryExpr -> Expression '${op}' Expression`,
        analogy: 'A two-sided balance scale combining two weights with a mathematical rule.',
        cached: false,
      };
    }
    case 'ReturnStmt':
      return {
        explanation:
          'Terminates execution of the current function immediately and yields an optional result value. Control returns directly to the caller at the invocation site. Any subsequent statements in the block are bypassed.',
        rule: "ReturnStmt -> 'return' Expression? ';'",
        analogy: 'Handing in a completed exam to the teacher and leaving the classroom.',
        cached: false,
      };
    case 'VarDecl': {
      const name = (node as any).name || 'var';
      return {
        explanation: `Allocates a named storage location '${name}' in the current scope with an explicit type. If provided, an initialization expression is evaluated and stored. The variable remains accessible within its enclosing block.`,
        rule: "VarDecl -> Type IDENTIFIER ('=' Expression)? ';'",
        analogy: 'Labeling an empty storage box before placing an item inside.',
        cached: false,
      };
    }
    case 'CallExpr':
      return {
        explanation:
          'Transfers control to a target function, passing evaluated argument expressions. A stack frame is established to track parameters and local variables. Upon completion, execution resumes immediately after this call.',
        rule: "CallExpr -> Callee '(' ArgListOpt ')'",
        analogy: 'Dialing a phone number to ask a specialist a question and waiting for the answer.',
        cached: false,
      };
    default:
      return {
        explanation: `A syntax tree node of type '${node.type}' representing an elementary syntactic construct in MiniC. It organizes child tokens into a structured hierarchy for compiler analysis.`,
        rule: `${node.type} -> production`,
        analogy: 'A branch or leaf on an oak tree contributing to the overall canopy.',
        cached: false,
      };
  }
}

/**
 * Extracts a concise source code snippet corresponding to an AST node span.
 */
export function extractNodeSnippet(node: ASTNode | null | 'whole_program', fullSource: string): string {
  if (!node || node === 'whole_program') return fullSource;
  if (!node.span) return '';

  const lines = fullSource.split('\n');
  const startLine = Math.max(1, node.span.startLine);
  const endLine = Math.min(lines.length, node.span.endLine);

  if (startLine === endLine) {
    const line = lines[startLine - 1] || '';
    const startCol = Math.max(0, node.span.startCol - 1);
    const endCol = Math.min(line.length, node.span.endCol);
    return line.slice(startCol, endCol).trim();
  }

  const snippetLines = lines.slice(startLine - 1, endLine);
  return snippetLines.join('\n').trim();
}

/**
 * Streams explanation for an AST node or whole program from Gemini 3.8 Flash.
 * Returns { explanation (max 3 sentences), rule (grammar production), analogy (one line) }.
 */
export async function streamExplainNode(params: {
  node: ASTNode | null | 'whole_program';
  fullCode: string;
  level: ExplanationLevel;
  userId?: string | null;
  onChunk?: (streamedText: string) => void;
  apiKeyOverride?: string;
}): Promise<ExplanationContent> {
  const { node, fullCode, level, userId, onChunk, apiKeyOverride } = params;

  const nodeSnippet = extractNodeSnippet(node, fullCode);
  const cacheKey = computeExplanationCacheKey(node, level, nodeSnippet);

  // 1. Check Cache first
  const cached = await getCachedExplanation(cacheKey, level);
  if (cached) {
    onChunk?.(cached.explanation);
    return cached;
  }

  // 2. Check API key
  const apiKey = apiKeyOverride !== undefined ? apiKeyOverride : getGeminiApiKey();
  if (!apiKey) {
    const offline = getOfflineFallbackExplanation(node, level);
    onChunk?.(offline.explanation);
    return offline;
  }

  // 3. Prepare Prompt & System Instruction
  const targetLabel =
    !node || node === 'whole_program'
      ? 'Whole Program'
      : `Node '${node.type}'${(node as any).name ? ` (${(node as any).name})` : (node as any).operator ? ` (${(node as any).operator})` : ''}`;

  const systemInstruction = `You are an expert compiler educator and syntax analyzer for the MiniC programming language.
Explain the requested AST node or whole program for the target audience level: ${level}.

Requirements:
- "explanation": Maximum 3 sentences. No filler words. Focus directly on the syntax and semantics.
- "rule": Exactly ONE grammar production rule that generated this construct (e.g. "FunctionDecl -> Type IDENTIFIER '(' ParamListOpt ')' Block" or "BinaryExpr -> Expression '+' Expression").
- "analogy": Exactly ONE sentence with an intuitive analogy.

Audience Level Nuances:
- Beginner: No compiler theory jargon. Clear, simple words.
- Intermediate: Standard programming language concepts (scope, type rules, call stack).
- Expert: Compiler frontend concepts (context-free grammar, AST hierarchy, operational semantics, precedence).

Return ONLY a valid JSON object matching:
{
  "explanation": "string (max 3 sentences)",
  "rule": "string (grammar production rule)",
  "analogy": "string (1 sentence)"
}`;

  const prompt = `Grammar Reference:
${COMPACT_MINIC_GRAMMAR}

Source Code:
\`\`\`c
${fullCode}
\`\`\`

Target Construct:
Target: ${targetLabel}
Snippet:
\`\`\`c
${nodeSnippet}
\`\`\`
AST Node Details:
${!node || node === 'whole_program' ? 'Whole program root node' : JSON.stringify({ type: node.type, span: node.span, details: { name: (node as any).name, operator: (node as any).operator, value: (node as any).value } })}

Audience: ${level}`;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    let rawBuffer = '';

    for await (const chunk of responseStream) {
      if (chunk.text) {
        rawBuffer += chunk.text;
        // Try parsing progressive explanation to show live text
        try {
          const partial = JSON.parse(rawBuffer);
          if (partial.explanation) {
            onChunk?.(partial.explanation);
          } else {
            onChunk?.(rawBuffer);
          }
        } catch {
          onChunk?.(rawBuffer);
        }
      }
    }

    // Parse final JSON
    let parsed: any;
    try {
      parsed = JSON.parse(rawBuffer);
    } catch {
      // Clean possible markdown code fences
      const clean = rawBuffer.replace(/```json\s*|```/g, '').trim();
      parsed = JSON.parse(clean);
    }

    const result: ExplanationContent = {
      explanation: (parsed.explanation || 'Construct parsed successfully.').trim(),
      rule: (parsed.rule || `${node && node !== 'whole_program' ? node.type : 'Program'} -> rule`).trim(),
      analogy: (parsed.analogy || 'A foundational building block of the program.').trim(),
      cached: false,
    };

    // Store in cache
    await storeCachedExplanation(cacheKey, level, result, userId);

    return result;
  } catch {
    // If Gemini call fails, return graceful offline fallback
    const fallback = getOfflineFallbackExplanation(node, level);
    onChunk?.(fallback.explanation);
    return fallback;
  }
}

/**
 * Clears in-memory explanation cache (useful for testing or reset).
 */
export function clearExplanationCache(): void {
  inMemoryCache.clear();
}
