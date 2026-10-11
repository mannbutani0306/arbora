import type { ParseResult } from '../../types/ast';
import type { PlaygroundEngine, PlaygroundMode } from './types';

export function StatusBar({
  parseResult,
  isParsing,
  duration,
  engine,
  mode,
}: {
  parseResult: ParseResult | null;
  isParsing: boolean;
  duration: number;
  engine: PlaygroundEngine;
  mode: PlaygroundMode;
}) {
  return (
    <footer
      className="flex h-7 shrink-0 items-center justify-between border-t border-[#E7E5E4] bg-white px-3 text-[10px] text-[#78716C]"
      aria-live="polite"
    >
      <span>
        {isParsing
          ? 'Parsing…'
          : parseResult?.success
            ? 'Parse successful'
            : `${parseResult?.errors.length ?? 0} parser errors`}
      </span>
      <span>
        {engine} · {mode} · {duration.toFixed(2)} ms
      </span>
    </footer>
  );
}
