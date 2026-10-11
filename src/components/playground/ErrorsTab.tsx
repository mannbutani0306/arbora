import { useEffect } from 'react';
import { RepairCandidateCard, RepairSkeleton } from '../RepairCandidateCard';
import type { RepairResponse } from '../../ai/repair';
import type { ParseResult } from '../../types/ast';
import { astEqual, scoreRepair, tokensEqual } from '../../core/repairMetrics';

interface ErrorsTabProps {
  code: string;
  parseResult: ParseResult | null;
  response: RepairResponse | null;
  isRepairing: boolean;
  onApply: (code: string) => void;
  onRunRepair: () => void;
  groundTruth?: string;
}

export function ErrorsTab({
  code,
  parseResult,
  response,
  isRepairing,
  onApply,
  onRunRepair,
  groundTruth,
}: ErrorsTabProps) {
  const errors = parseResult?.errors ?? [];
  useEffect(() => {
    if (!response?.candidates.length) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        event.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
      )
        return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < Math.min(3, response.candidates.length)) {
        event.preventDefault();
        onApply(response.candidates[index].repairedCode);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [response, onApply]);
  if (!errors.length)
    return (
      <div className="rounded-xl border border-[#E7E5E4] bg-white p-5 text-sm text-[#78716C]">
        No parser errors found.
      </div>
    );
  const groundTruthScore =
    groundTruth === undefined ? null : scoreRepair(response?.candidates ?? [], groundTruth);
  return (
    <div className="space-y-3">
      <div
        className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
        role="status"
      >
        {errors.length} parser {errors.length === 1 ? 'error' : 'errors'}
        <ul className="mt-2 space-y-1 text-xs">
          {errors.slice(0, 8).map((error, index) => (
            <li key={`${error.line}:${error.column}:${index}`}>
              {error.line}:{error.column} — {error.message}
            </li>
          ))}
        </ul>
      </div>
      {groundTruthScore && (
        <div className="rounded-xl border border-[#E7E5E4] bg-white px-3 py-2 text-xs text-[#1C1917]">
          Ground truth: top-1 {groundTruthScore.top1Exact ? 'matches original' : 'differs'}; top-3{' '}
          {groundTruthScore.top3Exact ? 'contains an exact match' : 'no exact match'}.
        </div>
      )}
      {response?.message && (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          role="status"
        >
          {response.message}
        </p>
      )}
      {isRepairing ? (
        <RepairSkeleton />
      ) : response?.candidates.length ? (
        response.candidates.map((candidate, index) => (
          <RepairCandidateCard
            key={candidate.id}
            candidate={candidate}
            index={index}
            originalCode={code}
            onApply={onApply}
            matchesOriginal={
              groundTruth === undefined
                ? undefined
                : tokensEqual(candidate.repairedCode, groundTruth)
            }
            sameAst={
              groundTruth === undefined ? undefined : astEqual(candidate.repairedCode, groundTruth)
            }
          />
        ))
      ) : (
        <button
          onClick={onRunRepair}
          className="rounded-lg bg-[#059669] px-3 py-2 text-xs font-medium text-white hover:bg-[#047857]"
        >
          Find repairs
        </button>
      )}
    </div>
  );
}
