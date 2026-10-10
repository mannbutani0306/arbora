import { parse } from './parser';
import { lex } from './lexer';
import { countNodes, getMaxDepth } from './astUtils';
import { ParseResult, Token } from '../types/ast';

export interface WorkerParseRequest {
  id: number;
  source: string;
  mode?: 'Strict' | 'Repair';
}

export interface WorkerParseResponse {
  id: number;
  parseResult: ParseResult;
  tokens: Token[];
  metrics: {
    durationMs: number;
    tokenCount: number;
    nodeCount: number;
    maxDepth: number;
    errorCount: number;
  };
}

self.onmessage = (event: MessageEvent<WorkerParseRequest>) => {
  const { id, source } = event.data;
  const start = performance.now();

  try {
    const lexResult = lex(source);
    const parseResult = parse(source);
    const end = performance.now();
    const durationMs = Math.round((end - start) * 100) / 100;

    const nodeCount = countNodes(parseResult.ast);
    const maxDepth = getMaxDepth(parseResult.ast);
    const tokenCount = lexResult.tokens.length;
    const errorCount = (parseResult.errors?.length || 0) + (lexResult.errors?.length || 0);

    const response: WorkerParseResponse = {
      id,
      parseResult,
      tokens: lexResult.tokens,
      metrics: {
        durationMs,
        tokenCount,
        nodeCount,
        maxDepth,
        errorCount,
      },
    };

    self.postMessage(response);
  } catch (err: any) {
    const end = performance.now();
    // Return graceful fallback
    const fallbackParse: ParseResult = {
      ast: {
        id: 'prog_err',
        type: 'Program',
        declarations: [],
        children: [],
        span: { startLine: 1, startCol: 1, endLine: 1, endCol: 1 },
      },
      tokens: [],
      errors: [
        {
          code: 'WORKER_ERR',
          message: err?.message || 'Parsing failed unexpectedly',
          line: 1,
          column: 1,
          expected: [],
          found: 'error',
          severity: 'error',
          recoveryAction: 'check syntax',
        },
      ],
      diagnostics: [],
      trace: [],
      success: false,
    };

    self.postMessage({
      id,
      parseResult: fallbackParse,
      tokens: [],
      metrics: {
        durationMs: Math.round((end - start) * 100) / 100,
        tokenCount: 0,
        nodeCount: 0,
        maxDepth: 0,
        errorCount: 1,
      },
    } satisfies WorkerParseResponse);
  }
};
