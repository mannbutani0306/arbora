import { RepairCandidateCard, RepairSkeleton } from '../RepairCandidateCard';
import type { RepairResponse } from '../../ai/repair';
import type { ParseResult } from '../../types/ast';

interface ErrorsTabProps {
  code: string;
  parseResult: ParseResult | null;
  response: RepairResponse | null;
  isRepairing: boolean;
  onApply: (code: string) => void;
  onRunRepair: () => void;
}

export function ErrorsTab({ code, parseResult, response, isRepairing, onApply, onRunRepair }: ErrorsTabProps) {
  const errors = parseResult?.errors ?? [];
  if (!errors.length) return <div className="rounded-xl border border-[#E7E5E4] bg-white p-5 text-sm text-[#78716C]">No parser errors found.</div>;
  return <div className="space-y-3">
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="status">
      {errors.length} parser {errors.length === 1 ? 'error' : 'errors'}
      <ul className="mt-2 space-y-1 text-xs">{errors.slice(0, 8).map((error, index) => <li key={`${error.line}:${error.column}:${index}`}>{error.line}:{error.column} — {error.message}</li>)}</ul>
    </div>
    {isRepairing ? <RepairSkeleton /> : response?.candidates.length ? response.candidates.map((candidate, index) => (
      <RepairCandidateCard key={candidate.id} candidate={candidate} index={index} originalCode={code} onApply={onApply} />
    )) : <button onClick={onRunRepair} className="rounded-lg bg-[#059669] px-3 py-2 text-xs font-medium text-white hover:bg-[#047857]">Find repairs</button>}
  </div>;
}
