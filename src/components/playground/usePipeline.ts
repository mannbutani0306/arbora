import { useCallback, useEffect, useRef, useState } from 'react';
import { parse } from '../../core/parser';
import { lex } from '../../core/lexer';
import type { ParseResult, Token } from '../../types/ast';
import type { PlaygroundMode } from './types';

interface WorkerReply {
  id: number;
  parseResult: ParseResult;
  tokens: Token[];
  metrics: { durationMs: number };
}

export interface PipelineResult {
  parseResult: ParseResult | null;
  tokens: Token[];
  parseDuration: number;
  isParsing: boolean;
  run: (source?: string) => void;
}

export function usePipeline(
  code: string,
  mode: PlaygroundMode,
  options: { debounceMs?: number; workerFactory?: () => Worker | null } = {}
): PipelineResult {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [parseDuration, setParseDuration] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  useEffect(() => {
    workerRef.current = options.workerFactory
      ? options.workerFactory()
      : new Worker(new URL('../../core/parserWorker.ts', import.meta.url), { type: 'module' });
    if (workerRef.current) {
      workerRef.current.onmessage = (event: MessageEvent<WorkerReply>) => {
        const data = event.data;
        if (data.id !== requestIdRef.current) return;
        setParseResult(data.parseResult);
        setTokens(data.tokens);
        setParseDuration(data.metrics.durationMs);
        setIsParsing(false);
      };
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [options.workerFactory]);

  const run = useCallback((source = code) => {
    const id = ++requestIdRef.current;
    setIsParsing(true);
    if (workerRef.current) {
      workerRef.current.postMessage({ id, source, mode });
      return;
    }
    const start = performance.now();
    try {
      const parsed = parse(source);
      if (id !== requestIdRef.current) return;
      setParseResult(parsed);
      setTokens(lex(source).tokens);
      setParseDuration(Math.round((performance.now() - start) * 100) / 100);
    } finally {
      if (id === requestIdRef.current) setIsParsing(false);
    }
  }, [code, mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => run(code), options.debounceMs ?? 400);
    return () => window.clearTimeout(timer);
  }, [code, run, options.debounceMs]);

  return { parseResult, tokens, parseDuration, isParsing, run };
}
