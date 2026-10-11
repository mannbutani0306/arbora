import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { buildTreeAtStep } from '../../core/astUtils';
import type { ParseResult } from '../../types/ast';
import { TreeCanvas } from './TreeCanvas';

interface TracePlayerProps {
  parseResult: ParseResult;
  onJumpToSource?: (line: number, col: number, endLine?: number, endCol?: number) => void;
}

const SPEEDS = [0.5, 1, 2, 4];

export function TracePlayer({ parseResult, onJumpToSource }: TracePlayerProps) {
  const trace = parseResult.trace;
  const [stepIndex, setStepIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const current = trace[stepIndex];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStepIndex((index) => {
        if (index >= trace.length - 1) {
          setPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, 1000 / speed);
    return () => window.clearInterval(timer);
  }, [playing, speed, trace.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPlaying(false);
        setStepIndex((index) => Math.min(trace.length - 1, index + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPlaying(false);
        setStepIndex((index) => Math.max(0, index - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [trace.length]);

  const partialTree = useMemo(
    () => buildTreeAtStep(parseResult.ast, trace, stepIndex),
    [parseResult.ast, trace, stepIndex]
  );
  const activeNodeId = useMemo(() => {
    const visit = (node: typeof partialTree): string | null => {
      if (node.active) return node.id;
      for (const child of node.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(partialTree);
  }, [partialTree]);
  const tokenIndex = trace.slice(0, stepIndex + 1).filter((step) => step.event === 'consume').length - 1;
  const ruleColor = current?.event === 'error' || current?.event === 'recover'
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : 'border-[#E7E5E4] bg-[#FAFAF9] text-[#1C1917]';

  if (trace.length === 0) {
    return <div className="flex h-full items-center justify-center rounded-xl border border-[#E7E5E4] bg-white p-8 text-sm text-[#78716C]">No parser trace is available. Run the parser to generate one.</div>;
  }

  return (
    <section className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white" aria-label="Parser trace player">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E7E5E4] bg-[#FAFAF9] px-3 py-2">
        <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((value) => !value)} className="rounded-md bg-emerald-600 p-1.5 text-white hover:bg-emerald-700">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button type="button" aria-label="Previous step" onClick={() => { setPlaying(false); setStepIndex((index) => Math.max(0, index - 1)); }} className="rounded p-1.5 text-[#78716C] hover:bg-stone-200"><SkipBack className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label="Next step" onClick={() => { setPlaying(false); setStepIndex((index) => Math.min(trace.length - 1, index + 1)); }} className="rounded p-1.5 text-[#78716C] hover:bg-stone-200"><SkipForward className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label="Reset trace" onClick={() => { setPlaying(false); setStepIndex(0); }} className="rounded p-1.5 text-[#78716C] hover:bg-stone-200"><RotateCcw className="h-3.5 w-3.5" /></button>
        <span className="min-w-20 font-mono text-[11px] text-[#78716C]">Step {stepIndex + 1} / {trace.length}</span>
        <input aria-label="Trace step" type="range" min={0} max={trace.length - 1} value={stepIndex} onChange={(event) => { setPlaying(false); setStepIndex(Number(event.target.value)); }} className="min-w-28 flex-1 accent-emerald-600" />
        <label className="flex items-center gap-1 text-[11px] text-[#78716C]">
          Speed
          <select aria-label="Playback speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="rounded border border-[#E7E5E4] bg-white px-1.5 py-1">
            {SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </label>
        {parseResult.traceTruncated && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">Trace truncated</span>}
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-[#E7E5E4] bg-white px-3 py-2" aria-label="Consumed tokens">
        {parseResult.tokens.filter((token) => token.type !== 'EOF').map((token, index) => (
          <button
            type="button"
            key={`${token.start}-${index}`}
            onClick={() => onJumpToSource?.(token.line, token.column, token.line, token.column + Math.max(1, token.lexeme.length))}
            className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
              index === tokenIndex ? 'border-emerald-500 bg-emerald-100 text-emerald-900 ring-1 ring-emerald-500/30'
                : index < tokenIndex ? 'border-stone-200 bg-stone-100 text-stone-500'
                  : 'border-[#E7E5E4] bg-white text-[#78716C]'
            }`}
          >{token.lexeme}</button>
        ))}
      </div>
      <div className="grid shrink-0 gap-2 border-b border-[#E7E5E4] bg-white p-3 md:grid-cols-4">
        <div className={`rounded-md border p-2 ${ruleColor}`}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">Grammar rule</div>
          <div className="text-xs font-medium">{current?.ruleApplied ?? 'Ready'}</div>
        </div>
        <div className="rounded-md border border-[#E7E5E4] bg-[#FAFAF9] p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#78716C]">Consumed</div>
          <code className="text-xs">{current?.tokenConsumed ?? '—'}</code>
        </div>
        <div className="rounded-md border border-[#E7E5E4] bg-[#FAFAF9] p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#78716C]">Lookahead</div>
          <code className="text-xs">{current?.lookahead ?? '—'}</code>
        </div>
        <div className="rounded-md border border-[#E7E5E4] bg-[#FAFAF9] p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#78716C]">Rule stack</div>
          <div className="truncate font-mono text-[10px]" title={current?.stack.join(' →')}>{current?.stack.join(' → ') || '—'}</div>
        </div>
      </div>
      {(current?.event === 'error' || current?.event === 'recover') && (
        <div className="shrink-0 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <span className="font-semibold">{current.event === 'error' ? 'Parse error' : 'Recovery'}:</span> {current.ruleApplied}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <TreeCanvas ast={partialTree} activeNodeId={activeNodeId} autoCollapse={false} />
      </div>
    </section>
  );
}
