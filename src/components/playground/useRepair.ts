import { useCallback, useEffect, useRef, useState } from 'react';
import { repairCode, type RepairContext, type RepairResponse } from '../../ai/repair';
import type { ParseResult, Token } from '../../types/ast';
import type { PlaygroundEngine, PlaygroundMode } from './types';

export function useRepair() {
  const [repairResponse, setRepairResponse] = useState<RepairResponse | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsRepairing(false);
  }, []);

  const clear = useCallback(() => setRepairResponse(null), []);

  const run = useCallback(
    async (input: {
      code: string;
      errors: ParseResult['errors'];
      tokens: Token[];
      mode: PlaygroundMode;
      engine: PlaygroundEngine;
      groundTruth?: string;
      errorType?: RepairContext['errorType'];
      userId?: string | null;
    }) => {
      abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsRepairing(true);
      try {
        const selectedEngine =
          input.engine === 'Arbora-T5'
            ? 'arbora-t5'
            : input.engine === 'Gemini' || input.engine === 'Compare'
              ? 'gemini'
              : input.engine === 'N-gram'
                ? 'ngram'
                : input.engine === 'Ensemble'
                  ? 'ensemble'
                  : 'classical';
        const result = await repairCode({
          sourceCode: input.code,
          errors: input.errors,
          tokens: input.tokens,
          engine: selectedEngine,
          userId: input.userId,
          groundTruth: input.groundTruth,
          errorType: input.errorType,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setRepairResponse(result);
        return result;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsRepairing(false);
        }
      }
    },
    [abort],
  );

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );
  return { repairResponse, isRepairing, run, abort, clear };
}
