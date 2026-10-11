import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Info, Sparkles, ArrowRight } from 'lucide-react';
import { RepairCandidate } from '../ai/repair';
import { RepairDiffViewer } from './RepairDiffViewer';
import { ENGINE_LABELS } from '../ai/engines';

interface RepairCandidateCardProps {
  candidate: RepairCandidate;
  index: number;
  originalCode: string;
  onApply: (repairedCode: string) => void;
}

export function RepairCandidateCard({
  candidate,
  index,
  originalCode,
  onApply,
}: RepairCandidateCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const confidencePct = Math.round(candidate.confidence * 100);

  return (
    <div className="bg-white rounded-xl border border-[#E7E5E4] p-3.5 shadow-xs transition-shadow hover:shadow-sm space-y-3">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-[#78716C] uppercase shrink-0">
            Fix {index + 1}
          </span>
          <h4 className="text-xs font-semibold text-[#1C1917] truncate">
            {candidate.description}
          </h4>
          <span className="px-1.5 py-0.5 rounded bg-stone-100 text-[10px] text-stone-700 border border-stone-200 shrink-0">
            {ENGINE_LABELS[candidate.engineId]}
          </span>
          {(candidate.agreedBy?.length ?? 0) > 1 && (
            <span
              className="text-[10px] text-[#78716C] truncate"
              title={`Agreed by ${candidate.agreedBy?.map((engine) => ENGINE_LABELS[engine]).join(', ')}`}
            >
              Agreed: {candidate.agreedBy?.map((engine) => ENGINE_LABELS[engine]).join(', ')}
            </span>
          )}

          {/* Rationale Tooltip Icon */}
          <div className="relative inline-block shrink-0">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={() => setShowTooltip(!showTooltip)}
              className="text-[#6366F1] hover:text-[#4F46E5] p-0.5 rounded focus:outline-none transition-colors"
              aria-label="Rationale"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            {showTooltip && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-30 w-64 p-2 bg-[#1C1917] text-white text-[11px] rounded-lg shadow-lg pointer-events-none leading-relaxed">
                <span className="font-semibold text-indigo-300 block mb-0.5">Rationale</span>
                {candidate.rationale}
              </div>
            )}
          </div>
        </div>

        {/* Status Badge + Apply Button */}
        <div className="flex items-center gap-2 shrink-0">
          {candidate.verified ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-[#059669]" />
              <span>Verified</span>
            </span>
          ) : candidate.isFallback ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-100 text-stone-700 border border-stone-200">
              <span>Panic recovery</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <AlertCircle className="w-3 h-3 text-amber-600" />
              <span>Unverified</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => onApply(candidate.repairedCode)}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-medium rounded-lg shadow-xs transition-colors shrink-0"
            title="Apply this fix to editor"
          >
            <span>Apply</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-[#78716C]">
          <span>Confidence</span>
          <span className="font-mono font-medium text-[#1C1917]">{confidencePct}%</span>
        </div>
        <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden border border-[#E7E5E4]">
          <div
            className="h-full bg-[#6366F1] rounded-full transition-all duration-300"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {/* Side-by-side Diff Viewer */}
      <RepairDiffViewer
        originalCode={originalCode}
        repairedCode={candidate.repairedCode}
      />
    </div>
  );
}

export function RepairSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-[#E7E5E4] p-3.5 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-12 h-3.5 bg-stone-200 rounded" />
              <div className="w-32 h-3.5 bg-stone-200 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-16 h-5 bg-stone-200 rounded-md" />
              <div className="w-14 h-6 bg-indigo-100 rounded-lg" />
            </div>
          </div>
          <div className="w-full h-1.5 bg-stone-200 rounded-full" />
          <div className="h-28 bg-stone-100 rounded-lg border border-[#E7E5E4]" />
        </div>
      ))}
    </div>
  );
}
