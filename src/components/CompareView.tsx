import { useCallback, useMemo, useState } from 'react';
import { zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { AlertTriangle, Check, GitCompare, Info, RefreshCw, Sparkles, X } from 'lucide-react';
import type { ASTNode } from '../types/ast';
import {
  annotateNodeStatuses,
  type ComparisonMetrics,
} from '../core/compare';
import { TreeCanvas } from './ast/TreeCanvas';

interface CompareViewProps {
  classicalAst: ASTNode | null;
  neuralAst: ASTNode | null;
  metrics: ComparisonMetrics | null;
  isLoading: boolean;
  onRunComparison: () => void;
  onJumpToSource?: (line: number, col: number) => void;
  aiOffline?: boolean;
}

export function CompareView({
  classicalAst,
  neuralAst,
  metrics,
  isLoading,
  onRunComparison,
  onJumpToSource,
  aiOffline,
}: CompareViewProps) {
  const [viewport, setViewport] = useState<ZoomTransform | undefined>();
  const { statusMapA, statusMapB } = useMemo(
    () => annotateNodeStatuses(classicalAst, neuralAst),
    [classicalAst, neuralAst]
  );
  const syncViewport = useCallback((transform: ZoomTransform) => {
    setViewport((prior) => prior
      && prior.k === transform.k
      && prior.x === transform.x
      && prior.y === transform.y
      ? prior
      : transform);
  }, []);

  if (isLoading) {
    return <div className="flex h-full flex-col items-center justify-center bg-[#FAFAF9] p-8">
      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      <p className="mb-3 text-sm text-[#78716C]">Synthesizing Neural AST…</p>
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[#E7E5E4]"><div className="h-full animate-pulse rounded-full bg-indigo-600" /></div>
    </div>;
  }

  if (!neuralAst) {
    return <div className="flex h-full flex-col items-center justify-center bg-[#FAFAF9] p-8 text-center">
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl border ${aiOffline ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-indigo-200 bg-indigo-50 text-indigo-600'}`}>
        {aiOffline ? <AlertTriangle className="h-6 w-6" /> : <GitCompare className="h-6 w-6" />}
      </div>
      <h3 className="mb-1 text-sm font-semibold text-[#1C1917]">{aiOffline ? 'AI Offline' : 'No Comparison Yet'}</h3>
      <p className="mb-4 max-w-sm text-xs text-[#78716C]">{aiOffline ? 'The deterministic parser remains available while AI is offline.' : 'Run the neural engine to compare AST structures.'}</p>
      <button type="button" onClick={onRunComparison} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700">
        <Sparkles className="h-3.5 w-3.5" />{aiOffline ? 'Retry' : 'Compare Trees'}
      </button>
    </div>;
  }

  const cards = [
    {
      label: 'TED',
      value: metrics?.treeEditDistance ?? 0,
      detail: 'Zhang-Shasha Tree Edit Distance',
    },
    {
      label: 'Similarity',
      value: `${Math.round((metrics?.similarity ?? 0) * 1000) / 10}%`,
      detail: '1 − TED / max(sizeA, sizeB)',
    },
    {
      label: 'F1',
      value: metrics?.f1?.toFixed(3) ?? '0.000',
      detail: 'Node (type, depth, parent) F1',
    },
    {
      label: 'Exact Match',
      value: metrics?.isExactMatch ? 'Yes' : 'No',
      detail: 'Structural exact match',
    },
    {
      label: 'Latency',
      value: `${metrics?.latencyClassicalMs ?? 0}ms / ${metrics?.latencyNeuralMs ?? 0}ms`,
      detail: 'Classical / neural',
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#FAFAF9]">
      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-[#E7E5E4] bg-white p-3 sm:grid-cols-5">
        {cards.map((card) => <div key={card.label} title={card.detail} className="flex flex-col justify-between rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-2.5">
          <div className="flex items-center gap-1 text-[11px] font-medium text-[#78716C]">{card.label}<Info className="h-3 w-3 text-[#A8A29E]" /></div>
          <span className={`mt-1 truncate font-mono text-lg font-semibold ${card.label === 'Exact Match' ? (metrics?.isExactMatch ? 'text-emerald-700' : 'text-rose-600') : 'text-[#1C1917]'}`}>
            {card.label === 'Exact Match' ? metrics?.isExactMatch ? <Check className="inline h-4 w-4 stroke-[3]" /> : <X className="inline h-4 w-4 stroke-[3]" /> : card.value}
            {card.label === 'Exact Match' ? ` ${card.value}` : ''}
          </span>
        </div>)}
      </div>
      <div className="flex items-center justify-between border-b border-[#E7E5E4] bg-[#F5F5F4] px-3 py-1.5 text-[11px]">
        <div className="flex items-center gap-3">
          {[['#059669', 'Match'], ['#D97706', 'Mismatch'], ['#E11D48', 'Missing/Extra']].map(([color, label]) => <div key={label} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /><span className="font-medium text-[#1C1917]">{label}</span></div>)}
        </div>
        <button type="button" onClick={onRunComparison} title="Re-run comparison" className="rounded p-1 text-indigo-600 hover:bg-[#E7E5E4]"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-[#E7E5E4] overflow-hidden bg-white md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-[#E7E5E4] bg-[#FAFAF9] px-3 py-1.5 text-xs font-medium"><span className="h-2 w-2 rounded-full bg-emerald-600" />Classical AST ({metrics?.sizeA ?? 0} nodes)</div>
          <div className="min-h-0 flex-1">{classicalAst && <TreeCanvas ast={classicalAst} diffStatuses={statusMapA} syncedTransform={viewport} onTransformChange={syncViewport} onJumpToSource={onJumpToSource} />}</div>
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-[#E7E5E4] bg-[#FAFAF9] px-3 py-1.5 text-xs font-medium"><Sparkles className="h-3.5 w-3.5 text-indigo-600" />Neural AST ({metrics?.sizeB ?? 0} nodes)</div>
          <div className="min-h-0 flex-1"><TreeCanvas ast={neuralAst} diffStatuses={statusMapB} syncedTransform={viewport} onTransformChange={syncViewport} onJumpToSource={onJumpToSource} /></div>
        </div>
      </div>
    </div>
  );
}
