import React, { useState, useMemo } from 'react';
import {
  Activity,
  Layers,
  Repeat,
  Code2,
  AlertTriangle,
  GitCompare,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Clock,
  BarChart2,
  Check,
  X,
  FileCode,
} from 'lucide-react';
import { ASTNode } from '../types/ast';
import { computeAllMetrics } from '../core/codeMetrics';
import { getRepairStats, clearRepairStats } from '../ai/repair';
import { parse } from '../core/parser';
import { compareASTs } from '../core/compare';
import { Tooltip } from './Tooltip';
import { useToast } from '../lib/toast';

interface MetricsViewProps {
  ast: ASTNode | null;
  code: string;
}

const DEFAULT_DIFF_CODE_B = `int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    // Mutated loop variant
    int acc = 1;
    while (n > 1) {
        acc *= n;
        n--;
    }
    return acc;
}
`;

export function MetricsView({ ast, code }: MetricsViewProps) {
  const toast = useToast();

  // Metrics from current AST
  const metrics = useMemo(() => {
    return computeAllMetrics(ast);
  }, [ast]);

  // AI Repair stats from localStorage / memory
  const [repairStats, setRepairStats] = useState(() => getRepairStats());

  // AST Diff state
  const [diffCodeA, setDiffCodeA] = useState<string>(code || '');
  const [diffCodeB, setDiffCodeB] = useState<string>(DEFAULT_DIFF_CODE_B);

  // Sync DiffCodeA when active playground code changes
  React.useEffect(() => {
    if (code) {
      setDiffCodeA(code);
    }
  }, [code]);

  // Compute AST comparison between Code A and Code B
  const comparisonResult = useMemo(() => {
    try {
      const parsedA = parse(diffCodeA);
      const parsedB = parse(diffCodeB);
      return {
        metrics: compareASTs(parsedA.ast, parsedB.ast),
        astA: parsedA.ast,
        astB: parsedB.ast,
        errorsA: parsedA.errors,
        errorsB: parsedB.errors,
      };
    } catch {
      return null;
    }
  }, [diffCodeA, diffCodeB]);

  const handleClearRepairStats = () => {
    clearRepairStats();
    setRepairStats(getRepairStats());
    toast.info('Cleared repair stats');
  };

  const applyDiffPreset = (type: 'loop' | 'operator' | 'function') => {
    if (type === 'loop') {
      setDiffCodeB(`int main() {\n    int sum = 0;\n    for (int i = 0; i < 10; i++) {\n        sum += i;\n    }\n    return sum;\n}`);
    } else if (type === 'operator') {
      setDiffCodeB(diffCodeA.replace('+', '*').replace('<=', '<'));
    } else if (type === 'function') {
      setDiffCodeB(`${diffCodeA}\n\nint helper(int x) {\n    return x * 2;\n}`);
    }
    toast.info('Applied diff preset');
  };

  return (
    <div className="space-y-6 text-[#1C1917]">
      {/* 1. SEVEN CODE METRICS STAT CARDS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#1C1917]">Code metrics</h3>
          <span className="text-[10px] text-[#78716C] font-mono">AST analysis</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {/* 1. Cyclomatic Complexity */}
          <Tooltip content="McCabe complexity: 1 + decision points" position="top">
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs text-left w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#78716C]">Complexity</span>
                <Activity className="w-3.5 h-3.5 text-[#059669]" />
              </div>
              <div className="text-lg font-mono font-semibold text-[#1C1917]">
                {metrics.cyclomaticComplexity}
              </div>
            </div>
          </Tooltip>

          {/* 2. Max Nesting Depth */}
          <Tooltip content="Deepest level of nested control flow" position="top">
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs text-left w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#78716C]">Max nesting</span>
                <Layers className="w-3.5 h-3.5 text-stone-500" />
              </div>
              <div className="text-lg font-mono font-semibold text-[#1C1917]">
                {metrics.maxNestingDepth}
              </div>
            </div>
          </Tooltip>

          {/* 3. Function Count */}
          <Tooltip content="Total function declarations" position="top">
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs text-left w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#78716C]">Functions</span>
                <Code2 className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <div className="text-lg font-mono font-semibold text-[#1C1917]">
                {metrics.functionCount}
              </div>
            </div>
          </Tooltip>

          {/* 4. Loop Count */}
          <Tooltip content="Total while, for, and do-while loops" position="top">
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs text-left w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#78716C]">Loops</span>
                <Repeat className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="text-lg font-mono font-semibold text-[#1C1917]">
                {metrics.loopCount}
              </div>
            </div>
          </Tooltip>

          {/* 5. Unused Variables */}
          <Tooltip
            content={
              metrics.unusedVariables.length > 0
                ? `Unused: ${metrics.unusedVariables.join(', ')}`
                : 'All declared variables are referenced'
            }
            position="top"
          >
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs text-left w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#78716C]">Unused vars</span>
                <AlertTriangle
                  className={`w-3.5 h-3.5 ${
                    metrics.unusedVariableCount > 0 ? 'text-amber-500' : 'text-[#059669]'
                  }`}
                />
              </div>
              <div
                className={`text-lg font-mono font-semibold ${
                  metrics.unusedVariableCount > 0 ? 'text-amber-600' : 'text-[#1C1917]'
                }`}
              >
                {metrics.unusedVariableCount}
              </div>
            </div>
          </Tooltip>

          {/* 6. Node Count */}
          <Tooltip content="Total nodes in abstract syntax tree" position="top">
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs text-left w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#78716C]">Node count</span>
                <BarChart2 className="w-3.5 h-3.5 text-sky-500" />
              </div>
              <div className="text-lg font-mono font-semibold text-[#1C1917]">
                {metrics.nodeCount}
              </div>
            </div>
          </Tooltip>

          {/* 7. Tree Depth */}
          <Tooltip content="Maximum hierarchy depth of AST" position="top">
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs text-left w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#78716C]">Tree depth</span>
                <Activity className="w-3.5 h-3.5 text-stone-500" />
              </div>
              <div className="text-lg font-mono font-semibold text-[#1C1917]">
                {metrics.treeDepth}
              </div>
            </div>
          </Tooltip>
        </div>
      </div>

      {/* 2. REPAIR STATISTICS */}
      <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-[#E7E5E4] pb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#6366F1]" />
            <h3 className="text-xs font-semibold text-[#1C1917]">Repair statistics</h3>
          </div>
          {repairStats.totalAttempts > 0 && (
            <button
              type="button"
              onClick={handleClearRepairStats}
              className="text-[11px] text-[#78716C] hover:text-[#1C1917] flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {repairStats.totalAttempts === 0 ? (
          <p className="text-xs text-[#78716C] py-2">
            No syntax repair attempts recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-2.5 bg-indigo-50/40 rounded-lg border border-indigo-100">
                <div className="text-[10px] text-[#6366F1] mb-1">Attempts</div>
                <div className="text-base font-mono font-semibold text-[#1C1917]">
                  {repairStats.totalAttempts}
                </div>
              </div>
              <div className="p-2.5 bg-emerald-50/40 rounded-lg border border-emerald-100">
                <div className="text-[10px] text-[#059669] mb-1">Verified rate</div>
                <div className="text-base font-mono font-semibold text-[#059669]">
                  {repairStats.successRate}%
                </div>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-lg border border-[#E7E5E4]">
                <div className="text-[10px] text-[#78716C] mb-1">Avg latency</div>
                <div className="text-base font-mono font-semibold text-[#1C1917]">
                  {repairStats.avgLatencyMs}ms
                </div>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-lg border border-[#E7E5E4]">
                <div className="text-[10px] text-[#78716C] mb-1">Avg candidates</div>
                <div className="text-base font-mono font-semibold text-[#1C1917]">
                  {repairStats.avgCandidates}
                </div>
              </div>
            </div>

            {/* Recent Repair Log */}
            <div className="rounded-lg border border-[#E7E5E4] overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-stone-50 text-[10px] text-[#78716C] border-b border-[#E7E5E4]">
                  <tr>
                    <th className="py-1.5 px-3">Model</th>
                    <th className="py-1.5 px-3 text-center">Errors</th>
                    <th className="py-1.5 px-3 text-center">Candidates</th>
                    <th className="py-1.5 px-3 text-center">Verified</th>
                    <th className="py-1.5 px-3 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E4]/50">
                  {repairStats.logs.slice(0, 4).map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-stone-50/50">
                      <td className="py-1.5 px-3 font-sans text-[11px] text-[#1C1917]">
                        {log.model}
                      </td>
                      <td className="py-1.5 px-3 text-center text-[#78716C]">
                        {log.error_count}
                      </td>
                      <td className="py-1.5 px-3 text-center text-[#78716C]">
                        {log.candidate_count}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        {log.is_verified_success ? (
                          <span className="text-emerald-700 font-sans font-medium text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 border border-emerald-200">
                            Verified
                          </span>
                        ) : (
                          <span className="text-stone-500 font-sans text-[10px]">
                            Unverified
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right text-[#78716C]">
                        {log.latency_ms}ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 3. AST DIFF (TWO CODE BOXES + COLORED STRUCTURAL TREE DIFF) */}
      <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E7E5E4] pb-2.5">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-[#059669]" />
            <h3 className="text-xs font-semibold text-[#1C1917]">AST diff</h3>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#78716C]">Presets:</span>
            <button
              type="button"
              onClick={() => applyDiffPreset('loop')}
              className="px-2 py-0.5 text-[10px] bg-stone-100 hover:bg-stone-200 rounded text-[#1C1917] transition-colors"
            >
              Loop
            </button>
            <button
              type="button"
              onClick={() => applyDiffPreset('operator')}
              className="px-2 py-0.5 text-[10px] bg-stone-100 hover:bg-stone-200 rounded text-[#1C1917] transition-colors"
            >
              Operator
            </button>
            <button
              type="button"
              onClick={() => applyDiffPreset('function')}
              className="px-2 py-0.5 text-[10px] bg-stone-100 hover:bg-stone-200 rounded text-[#1C1917] transition-colors"
            >
              Function
            </button>
          </div>
        </div>

        {/* Two Code Input Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Code Box A */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[#78716C]">
              <span className="font-medium text-[#1C1917]">Source A</span>
              <span className="font-mono text-[10px]">Current</span>
            </div>
            <textarea
              value={diffCodeA}
              onChange={(e) => setDiffCodeA(e.target.value)}
              rows={6}
              className="w-full font-mono text-xs bg-[#FAFAF9] border border-[#E7E5E4] rounded-lg p-2.5 text-[#1C1917] focus:outline-none focus:border-emerald-600 resize-y"
              placeholder="Source code A..."
            />
          </div>

          {/* Code Box B */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[#78716C]">
              <span className="font-medium text-[#1C1917]">Source B</span>
              <span className="font-mono text-[10px]">Variant</span>
            </div>
            <textarea
              value={diffCodeB}
              onChange={(e) => setDiffCodeB(e.target.value)}
              rows={6}
              className="w-full font-mono text-xs bg-[#FAFAF9] border border-[#E7E5E4] rounded-lg p-2.5 text-[#1C1917] focus:outline-none focus:border-emerald-600 resize-y"
              placeholder="Source code B..."
            />
          </div>
        </div>

        {/* Comparison Summary Banner */}
        {comparisonResult?.metrics && (
          <div className="p-3 bg-stone-50 border border-[#E7E5E4] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[#78716C] block text-[10px]">TED</span>
                <span className="font-mono font-semibold text-[#1C1917]">
                  {comparisonResult.metrics.treeEditDistance}
                </span>
              </div>
              <div>
                <span className="text-[#78716C] block text-[10px]">Similarity</span>
                <span
                  className={`font-mono font-semibold ${
                    comparisonResult.metrics.similarity >= 0.9
                      ? 'text-[#059669]'
                      : 'text-amber-600'
                  }`}
                >
                  {Math.round(comparisonResult.metrics.similarity * 100)}%
                </span>
              </div>
              <div>
                <span className="text-[#78716C] block text-[10px]">F1 Score</span>
                <span className="font-mono font-semibold text-[#1C1917]">
                  {comparisonResult.metrics.f1.toFixed(3)}
                </span>
              </div>
              <div>
                <span className="text-[#78716C] block text-[10px]">Exact Match</span>
                <span className="font-semibold">
                  {comparisonResult.metrics.isExactMatch ? (
                    <span className="text-[#059669] flex items-center gap-1">
                      <Check className="w-3 h-3" /> Yes
                    </span>
                  ) : (
                    <span className="text-rose-600 flex items-center gap-1">
                      <X className="w-3 h-3" /> No
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-[#78716C]">
              {comparisonResult.metrics.differences.length} structural differences
            </div>
          </div>
        )}

        {/* Colored Structural Differences List */}
        {comparisonResult?.metrics && comparisonResult.metrics.differences.length > 0 ? (
          <div className="rounded-lg border border-[#E7E5E4] overflow-hidden max-h-48 overflow-y-auto">
            <div className="bg-stone-50 px-3 py-1.5 text-[10px] font-medium text-[#78716C] border-b border-[#E7E5E4]">
              Structural differences
            </div>
            <div className="divide-y divide-[#E7E5E4]/50">
              {comparisonResult.metrics.differences.map((diff, idx) => {
                const isMismatch = diff.kind === 'mismatched';
                const isExtra = diff.kind === 'extra';
                const isMissing = diff.kind === 'missing';

                return (
                  <div
                    key={idx}
                    className="px-3 py-1.5 flex items-center justify-between text-xs font-mono hover:bg-stone-50/50"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded border ${
                          isMismatch
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : isExtra
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {diff.kind}
                      </span>
                      <span className="text-[#78716C] text-[11px] truncate">
                        {diff.path}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#1C1917] shrink-0 font-medium">
                      {isMismatch && (
                        <span>
                          {diff.expected} → <strong className="text-amber-700">{diff.actual}</strong>
                        </span>
                      )}
                      {isExtra && (
                        <span className="text-indigo-700">+{diff.actual}</span>
                      )}
                      {isMissing && (
                        <span className="text-rose-700">-{diff.expected}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : comparisonResult?.metrics?.isExactMatch ? (
          <div className="p-4 rounded-lg bg-emerald-50/50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            <span>Trees are structurally identical.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
