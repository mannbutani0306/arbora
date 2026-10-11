import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  Cpu,
  BarChart2,
  Download,
  FileSpreadsheet,
  FileCode,
  XCircle,
  Sparkles,
  Layers,
  Activity,
  AlertTriangle,
  History as HistoryIcon,
  Filter,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import {
  runBenchmarkSuite,
  BenchmarkSuiteSummary,
  BenchmarkProgress,
  exportBenchmarkToCSV,
  downloadCSV,
  downloadJSON,
} from '../core/benchmarkRunner';
import { saveBenchmarkRun, listBenchmarkRuns } from '../lib/dataService';
import { BenchmarkRunRecord } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/toast';
import { Tooltip } from '../components/Tooltip';

export function Benchmarks() {
  const { user } = useAuth();
  const toast = useToast();

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [summary, setSummary] = useState<BenchmarkSuiteSummary | null>(null);
  const [historyRuns, setHistoryRuns] = useState<BenchmarkRunRecord[]>([]);
  const [filterType, setFilterType] = useState<
    'all' | 'delete' | 'insert' | 'swap' | 'replace' | 'natural'
  >('all');

  const cancelRef = useRef(false);

  // Load historical benchmark runs
  useEffect(() => {
    async function loadHistory() {
      try {
        const records = await listBenchmarkRuns(user?.id);
        setHistoryRuns(records);

        // If no active run summary, load the most recent run from history
        if (!summary && records.length > 0 && records[0].results?.classical) {
          setSummary(records[0].results as BenchmarkSuiteSummary);
        }
      } catch (err) {
        console.warn('Could not load history runs:', err);
      }
    }
    loadHistory();
  }, [user]);

  // Run Benchmark Suite
  const handleRunSuite = async () => {
    setIsRunning(true);
    cancelRef.current = false;
    setProgress({
      completed: 0,
      total: 1,
      currentProgramName: 'Initializing',
      stage: 'preparing',
      percent: 0,
    });

    try {
      const res = await runBenchmarkSuite({
        concurrency: 2,
        userId: user?.id,
        onProgress: (p) => setProgress(p),
        checkCancelled: () => cancelRef.current,
      });

      setSummary(res);

      // Save if signed in
      if (user?.id) {
        try {
          const saved = await saveBenchmarkRun('MiniC Full Suite', res, user.id);
          setHistoryRuns((prev) => [saved, ...prev]);
          toast.success('Run saved');
        } catch {
          toast.error('Failed to save run');
        }
      } else {
        toast.info('Run complete (sign in to save)');
      }
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) {
        toast.info('Benchmark cancelled');
      } else {
        toast.error('Benchmark suite error');
      }
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    toast.info('Cancelling suite...');
  };

  const handleExportCSV = () => {
    if (!summary) return;
    const csv = exportBenchmarkToCSV(summary);
    downloadCSV(`minic_benchmark_${summary.timestamp}.csv`, csv);
    toast.success('CSV downloaded');
  };

  const handleExportJSON = () => {
    if (!summary) return;
    downloadJSON(`minic_benchmark_${summary.timestamp}.json`, summary);
    toast.success('JSON downloaded');
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!summary) return [];
    if (filterType === 'all') return summary.items;
    return summary.items.filter((it) => it.errorType === filterType);
  }, [summary, filterType]);

  // Chart data: top-1 exact source correctness by error type.
  const errorTypeChartData = useMemo(() => {
    if (!summary) return [];
    return [
      {
        type: 'Delete',
        exactRate: summary.aiRepair.top1ExactRateByErrorType.delete,
      },
      {
        type: 'Insert',
        exactRate: summary.aiRepair.top1ExactRateByErrorType.insert,
      },
      {
        type: 'Swap',
        exactRate: summary.aiRepair.top1ExactRateByErrorType.swap,
      },
      {
        type: 'Replace',
        exactRate: summary.aiRepair.top1ExactRateByErrorType.replace,
      },
      {
        type: 'Natural',
        exactRate: summary.aiRepair.top1ExactRateByErrorType.natural,
      },
    ];
  }, [summary]);

  // Chart data: Ablation
  const ablationChartData = useMemo(() => {
    if (!summary) return [];
    return [
      {
        name: 'Top-k exact',
        b0: summary.ablation.b0NoneExactRate,
        b1: summary.ablation.b1ClassicalTop1ExactRate,
        aiRaw: summary.ablation.aiRawTop3ExactRate,
        aiVerified: summary.ablation.aiVerifiedTop3ExactRate,
      },
    ];
  }, [summary]);

  // Chart data: History across runs
  const historyChartData = useMemo(() => {
    if (historyRuns.length === 0) return [];
    const sorted = [...historyRuns].reverse();
    return sorted.map((run, idx) => {
      const res = run.results as BenchmarkSuiteSummary;
      const dateLabel = new Date(run.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        run: `Run #${idx + 1}`,
        time: dateLabel,
        verifiedRate: res?.aiRepair?.verifiedRate ?? 0,
        top1ExactRate: res?.aiRepair?.top1ExactRate ?? 0,
        f1Score: res?.neuralAst?.avgF1 ? Math.round(res.neuralAst.avgF1 * 100) : 0,
      };
    });
  }, [historyRuns]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-[#1C1917]">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Compiler benchmarks</h1>
          <p className="text-xs text-[#78716C] mt-0.5">
            Automated evaluation suite for deterministic, AI repair, and neural AST engines.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {summary && !isRunning && (
            <>
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-2.5 py-1.5 bg-white hover:bg-stone-50 border border-[#E7E5E4] rounded-lg text-xs font-medium text-[#78716C] hover:text-[#1C1917] transition-colors flex items-center gap-1.5 shadow-2xs"
                title="Export results as CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669]" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportJSON}
                className="px-2.5 py-1.5 bg-white hover:bg-stone-50 border border-[#E7E5E4] rounded-lg text-xs font-medium text-[#78716C] hover:text-[#1C1917] transition-colors flex items-center gap-1.5 shadow-2xs"
                title="Export results as JSON"
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-500" />
                <span>JSON</span>
              </button>
            </>
          )}

          {isRunning ? (
            <button
              type="button"
              onClick={handleCancel}
              className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRunSuite}
              className="px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run suite</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Display */}
      {isRunning && progress && (
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-2xs space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-ping" />
              <span className="font-semibold text-[#1C1917]">
                Evaluating {progress.currentProgramName}
              </span>
              <span className="text-[11px] text-[#78716C] capitalize">
                ({progress.stage})
              </span>
            </div>
            <span className="font-mono text-xs font-semibold text-[#059669]">
              {progress.completed} / {progress.total} ({progress.percent}%)
            </span>
          </div>

          <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden border border-[#E7E5E4]">
            <div
              className="bg-[#059669] h-full transition-all duration-300 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* STAT CARDS */}
      {summary && (
        <div className="space-y-4">
          <div className="text-[11px] text-[#78716C]">{summary.totalPrograms} programs</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. Classical: success rate & avg parse ms */}
            <Tooltip content="Deterministic parser success rate on valid programs and avg parse latency" position="top">
              <div className="bg-white rounded-xl border border-[#E7E5E4] p-3.5 shadow-2xs text-left w-full">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#78716C] mb-1">
                  <span>Classical valid</span>
                  <Activity className="w-3.5 h-3.5 text-[#059669]" />
                </div>
                <div className="text-xl font-mono font-semibold text-[#1C1917]">
                  {summary.classical.validSuccessRate}%
                </div>
                <div className="text-[11px] text-[#78716C] font-mono mt-0.5">
                  Avg {summary.classical.avgParseMs}ms
                </div>
              </div>
            </Tooltip>

            {/* 2. AI repair: top-1, top-3, verified rate, avg latency */}
            <Tooltip content="Top-1 and top-3 exact source correctness are separate from parser verification." position="top">
              <div className="bg-white rounded-xl border border-[#E7E5E4] p-3.5 shadow-2xs text-left w-full">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#78716C] mb-1">
                  <span>AI repair verified</span>
                  <Sparkles className="w-3.5 h-3.5 text-[#6366F1]" />
                </div>
                <div className="text-xl font-mono font-semibold text-[#6366F1]">
                  {summary.aiRepair.verifiedRate}%
                </div>
                <div className="text-[11px] text-[#78716C] font-mono mt-0.5">
                  Top-1 exact: {summary.aiRepair.top1ExactRate}% | Top-3 exact: {summary.aiRepair.top3ExactRate}%
                </div>
              </div>
            </Tooltip>

            {/* 3. Neural AST: avg TED, avg F1, exact match, validity */}
            <Tooltip content="Neural AST structural match: Tree Edit Distance and F1 score against ground-truth" position="top">
              <div className="bg-white rounded-xl border border-[#E7E5E4] p-3.5 shadow-2xs text-left w-full">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#78716C] mb-1">
                  <span>Neural AST F1</span>
                  <Cpu className="w-3.5 h-3.5 text-stone-600" />
                </div>
                <div className="text-xl font-mono font-semibold text-[#1C1917]">
                  {summary.neuralAst.avgF1}
                </div>
                <div className="text-[11px] text-[#78716C] font-mono mt-0.5">
                  TED: {summary.neuralAst.avgTed} | Match: {summary.neuralAst.exactMatchRate}%
                </div>
              </div>
            </Tooltip>

            {/* 4. Ablation: parser-only, classical, and AI correctness */}
            <Tooltip content="Exact source recovery: parser-only, classical baseline, and AI with or without parser verification." position="top">
              <div className="bg-white rounded-xl border border-[#E7E5E4] p-3.5 shadow-2xs text-left w-full">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#78716C] mb-1">
                  <span>Ablation delta</span>
                  <BarChart2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-xl font-mono font-semibold text-[#059669]">
                  {summary.ablation.aiVerifiedTop3ExactRate}%
                </div>
                <div className="text-[11px] text-[#78716C] font-mono mt-0.5">
                  B1: {summary.ablation.b1ClassicalTop1ExactRate}% | AI raw: {summary.ablation.aiRawTop3ExactRate}%
                </div>
              </div>
            </Tooltip>
          </div>

          {/* CHARTS SECTION (Recharts light palette) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart 1: Exact correctness by error type */}
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#059669]" />
                  <h2 className="text-xs font-semibold text-[#1C1917]">Top-1 exact by error type</h2>
                </div>
                <span className="text-[10px] text-[#78716C] font-mono">AI repair</span>
              </div>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={errorTypeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                    <XAxis dataKey="type" stroke="#78716C" fontSize={11} tickLine={false} />
                    <YAxis domain={[0, 100]} stroke="#78716C" fontSize={10} tickLine={false} unit="%" />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E7E5E4',
                        borderRadius: '8px',
                        fontSize: '11px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                      formatter={(val: any) => [`${val}%`, 'Top-1 exact']}
                    />
                    <Bar dataKey="exactRate" fill="#059669" radius={[4, 4, 0, 0]} barSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Ablation Bar Chart */}
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#6366F1]" />
                  <h2 className="text-xs font-semibold text-[#1C1917]">Ablation analysis</h2>
                </div>
                <span className="text-[10px] text-[#78716C] font-mono">Top-k exact</span>
              </div>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ablationChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                    <XAxis dataKey="name" stroke="#78716C" fontSize={11} tickLine={false} />
                    <YAxis domain={[0, 100]} stroke="#78716C" fontSize={10} tickLine={false} unit="%" />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E7E5E4',
                        borderRadius: '8px',
                        fontSize: '11px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                      formatter={(val: any, name: any) => [
                        `${val}%`,
                        name === 'b0' ? 'B0 none' :
                          name === 'b1' ? 'B1 classical' :
                            name === 'aiRaw' ? 'AI raw' : 'AI verified',
                      ]}
                    />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      formatter={(value) => (
                        value === 'b0' ? 'B0 none' :
                          value === 'b1' ? 'B1 classical' :
                            value === 'aiRaw' ? 'AI raw' : 'AI verified'
                      )}
                    />
                    <Bar dataKey="b0" fill="#A8A29E" radius={[4, 4, 0, 0]} barSize={32} />
                    <Bar dataKey="b1" fill="#78716C" radius={[4, 4, 0, 0]} barSize={32} />
                    <Bar dataKey="aiRaw" fill="#818CF8" radius={[4, 4, 0, 0]} barSize={32} />
                    <Bar dataKey="aiVerified" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Chart 3: History Across Runs Line Chart */}
          {historyChartData.length > 1 && (
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HistoryIcon className="w-4 h-4 text-[#059669]" />
                  <h2 className="text-xs font-semibold text-[#1C1917]">History across runs</h2>
                </div>
                <span className="text-[10px] text-[#78716C] font-mono">
                  {historyRuns.length} recorded runs
                </span>
              </div>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                    <XAxis dataKey="run" stroke="#78716C" fontSize={11} tickLine={false} />
                    <YAxis domain={[0, 100]} stroke="#78716C" fontSize={10} tickLine={false} unit="%" />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E7E5E4',
                        borderRadius: '8px',
                        fontSize: '11px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                    />
                    <Legend verticalAlign="top" height={28} />
                    <Line
                      type="monotone"
                      dataKey="verifiedRate"
                      name="AI Verified %"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="top1ExactRate"
                      name="Top-1 Acc %"
                      stroke="#6366F1"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="f1Score"
                      name="Neural F1 %"
                      stroke="#D97706"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* RESULTS TABLE */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-[#E7E5E4] flex flex-wrap items-center justify-between gap-3 bg-stone-50/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                <h2 className="text-xs font-semibold text-[#1C1917]">Detailed results</h2>
                <span className="text-[10px] text-[#78716C] font-mono">
                  {filteredItems.length} items
                </span>
              </div>

              {/* Error Type Filter Tabs */}
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-[#E7E5E4]">
                {(['all', 'delete', 'insert', 'swap', 'replace', 'natural'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(type)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
                      filterType === type
                        ? 'bg-stone-100 text-[#1C1917] font-semibold'
                        : 'text-[#78716C] hover:text-[#1C1917]'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead className="bg-stone-50 border-b border-[#E7E5E4] sticky top-0 z-10 text-[10px] text-[#78716C]">
                  <tr>
                    <th className="py-2 px-3">Program</th>
                    <th className="py-2 px-2.5">Category</th>
                    <th className="py-2 px-2.5">Mutation</th>
                    <th className="py-2 px-2.5 text-center">Classical</th>
                    <th className="py-2 px-2.5 text-center">AI Verified</th>
                    <th className="py-2 px-2.5 text-right">AI Latency</th>
                    <th className="py-2 px-2.5 text-right">Neural F1</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E4]/60">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="py-2 px-3 font-sans font-medium text-[#1C1917] max-w-[160px] truncate">
                        {item.name}
                      </td>
                      <td className="py-2 px-2.5 text-[11px] text-[#78716C] font-sans">
                        {item.category}
                      </td>
                      <td className="py-2 px-2.5">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold border ${
                            item.errorType === 'delete'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : item.errorType === 'insert'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}
                        >
                          {item.errorType}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        {item.classicalValidSuccess ? (
                          <span className="text-emerald-700 font-sans text-[11px]">
                            {item.classicalValidParseMs}ms
                          </span>
                        ) : (
                          <span className="text-rose-600 font-sans text-[11px]">Failed</span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        {item.aiRepairVerified ? (
                          <span className="inline-block px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-sans font-medium">
                            Verified
                          </span>
                        ) : (
                          <span className="inline-block px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 text-[10px] font-sans">
                            Unverified
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-right text-[#78716C]">
                        {item.aiRepairLatencyMs}ms
                      </td>
                      <td className="py-2 px-2.5 text-right font-medium text-[#1C1917]">
                        {item.neuralAstF1.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty State when no run has happened */}
      {!summary && !isRunning && (
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-12 text-center shadow-2xs space-y-3">
          <Cpu className="w-8 h-8 text-[#059669] mx-auto opacity-70" />
          <div>
            <h2 className="text-sm font-semibold text-[#1C1917]">No benchmark data</h2>
            <p className="text-xs text-[#78716C] mt-0.5">Run suite to benchmark classical, AI repair, and neural AST engines.</p>
          </div>
          <button
            type="button"
            onClick={handleRunSuite}
            className="px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run suite</span>
          </button>
        </div>
      )}
    </div>
  );
}
