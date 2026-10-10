import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Table,
  Layers,
  AlertTriangle,
  Search,
  CheckCircle2,
  Code2,
  ArrowRight,
  Command,
  Cpu,
  Workflow,
} from 'lucide-react';
import { getMiniCGrammar, EPSILON, ProductionRule } from '../core/grammar';
import { analyzeGrammar, GrammarAnalysisResult, EOF_SYMBOL } from '../core/grammarAnalyzer';
import { Tooltip } from '../components/Tooltip';

type DocsTab = 'grammar-lab' | 'specifications';

export function Docs() {
  const [activeTab, setActiveTab] = useState<DocsTab>('grammar-lab');
  const [cfgSearch, setCfgSearch] = useState('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);

  // Compute grammar analysis once
  const grammar = useMemo(() => getMiniCGrammar(), []);
  const analysis: GrammarAnalysisResult = useMemo(() => analyzeGrammar(grammar), [grammar]);

  // All lookaheads (Terminals + EOF) sorted
  const lookaheads = useMemo(() => {
    const list = [...grammar.terminals.filter((t) => t !== EPSILON), EOF_SYMBOL];
    return list.sort();
  }, [grammar]);

  // Filtered productions
  const filteredProductions = useMemo(() => {
    if (!cfgSearch.trim()) return grammar.productions;
    const q = cfgSearch.toLowerCase();
    return grammar.productions.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.lhs.toLowerCase().includes(q) ||
        p.rhs.join(' ').toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [grammar, cfgSearch]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-[#1C1917]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7E5E4] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Compiler docs</h1>
          <p className="text-xs text-[#78716C] mt-0.5">MiniC context-free grammar, architecture, and specifications.</p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex bg-stone-100 p-0.5 rounded-lg border border-[#E7E5E4]">
            <button
              type="button"
              onClick={() => setActiveTab('grammar-lab')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'grammar-lab'
                  ? 'bg-white text-[#1C1917] shadow-2xs font-semibold'
                  : 'text-[#78716C] hover:text-[#1C1917]'
              }`}
            >
              Grammar Lab
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('specifications')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'specifications'
                  ? 'bg-white text-[#1C1917] shadow-2xs font-semibold'
                  : 'text-[#78716C] hover:text-[#1C1917]'
              }`}
            >
              Specifications
            </button>
          </div>

          <Link
            to="/playground"
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <span>Playground</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* TAB: GRAMMAR LAB */}
      {activeTab === 'grammar-lab' && (
        <div className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs">
              <div className="text-[11px] font-medium text-[#78716C]">Productions</div>
              <div className="text-lg font-mono font-semibold text-[#1C1917] mt-0.5">
                {grammar.productions.length}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs">
              <div className="text-[11px] font-medium text-[#78716C]">Non-terminals</div>
              <div className="text-lg font-mono font-semibold text-[#1C1917] mt-0.5">
                {grammar.nonTerminals.length}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs">
              <div className="text-[11px] font-medium text-[#78716C]">Terminals</div>
              <div className="text-lg font-mono font-semibold text-[#1C1917] mt-0.5">
                {grammar.terminals.length}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs">
              <div className="text-[11px] font-medium text-[#78716C]">LL(1) Conflicts</div>
              <div className="text-lg font-mono font-semibold text-amber-600 mt-0.5 flex items-center gap-1.5">
                <span>{analysis.conflicts.length}</span>
                {analysis.conflicts.length > 0 && (
                  <span className="text-[10px] font-sans font-medium px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    Resolved by Pratt
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 1. MINIC CFG TABLE */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-[#E7E5E4] flex flex-wrap items-center justify-between gap-3 bg-stone-50/50">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#059669]" />
                <h2 className="text-xs font-semibold text-[#1C1917]">MiniC CFG</h2>
                <span className="text-[10px] text-[#78716C] font-mono">
                  {filteredProductions.length} rules
                </span>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#78716C]" />
                <input
                  type="text"
                  placeholder="Filter rules..."
                  value={cfgSearch}
                  onChange={(e) => setCfgSearch(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-white border border-[#E7E5E4] rounded-lg text-xs text-[#1C1917] focus:outline-none focus:border-emerald-600 w-44"
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead className="bg-stone-50 border-b border-[#E7E5E4] sticky top-0 z-10 text-[11px] text-[#78716C]">
                  <tr>
                    <th className="py-2 px-3 w-16">ID</th>
                    <th className="py-2 px-3 w-40">LHS</th>
                    <th className="py-2 px-3">RHS</th>
                    <th className="py-2 px-3 text-right">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E4]/60">
                  {filteredProductions.map((p) => (
                    <tr key={p.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="py-2 px-3 text-[#78716C] font-semibold">{p.id}</td>
                      <td className="py-2 px-3 font-semibold text-emerald-800">{p.lhs}</td>
                      <td className="py-2 px-3 text-[#1C1917]">
                        <span className="text-[#78716C] mr-2">→</span>
                        {p.rhs.length === 0 || (p.rhs.length === 1 && p.rhs[0] === EPSILON) ? (
                          <span className="text-rose-600 font-bold">{EPSILON}</span>
                        ) : (
                          p.rhs.map((sym, i) => {
                            const isNT = grammar.nonTerminals.includes(sym);
                            return (
                              <span
                                key={i}
                                className={`mr-1 px-1 py-0.2 rounded ${
                                  isNT
                                    ? 'bg-stone-100 text-emerald-900 font-medium'
                                    : 'text-indigo-700 font-normal'
                                }`}
                              >
                                {sym}
                              </span>
                            );
                          })
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-[11px] font-sans text-[#78716C]">
                        {p.description || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. FIRST & FOLLOW SETS TABLE */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-[#E7E5E4] flex items-center justify-between bg-stone-50/50">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#6366F1]" />
                <h2 className="text-xs font-semibold text-[#1C1917]">FIRST & FOLLOW sets</h2>
                <span className="text-[10px] text-[#78716C] font-mono">
                  {grammar.nonTerminals.length} non-terminals
                </span>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead className="bg-stone-50 border-b border-[#E7E5E4] sticky top-0 z-10 text-[11px] text-[#78716C]">
                  <tr>
                    <th className="py-2 px-3 w-40">Non-Terminal</th>
                    <th className="py-2 px-3 w-24 text-center">Nullable</th>
                    <th className="py-2 px-3">FIRST Set</th>
                    <th className="py-2 px-3">FOLLOW Set</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E4]/60">
                  {grammar.nonTerminals.map((nt) => {
                    const isNullable = analysis.nullable.includes(nt);
                    const firstSet = analysis.firstSets[nt] || [];
                    const followSet = analysis.followSets[nt] || [];

                    return (
                      <tr key={nt} className="hover:bg-stone-50/50 transition-colors">
                        <td className="py-2 px-3 font-semibold text-emerald-800">{nt}</td>
                        <td className="py-2 px-3 text-center">
                          {isNullable ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              Yes ({EPSILON})
                            </span>
                          ) : (
                            <span className="text-[#78716C] text-[10px]">No</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1 max-w-lg">
                            {firstSet.map((sym) => (
                              <span
                                key={sym}
                                className={`px-1 py-0.2 rounded text-[10px] border ${
                                  sym === EPSILON
                                    ? 'bg-rose-50 text-rose-700 border-rose-200 font-bold'
                                    : 'bg-stone-50 text-[#1C1917] border-[#E7E5E4]'
                                }`}
                              >
                                {sym}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1 max-w-lg">
                            {followSet.map((sym) => (
                              <span
                                key={sym}
                                className={`px-1 py-0.2 rounded text-[10px] border ${
                                  sym === EOF_SYMBOL
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
                                    : 'bg-stone-50 text-[#1C1917] border-[#E7E5E4]'
                                }`}
                              >
                                {sym}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. LL(1) PARSING TABLE MATRIX */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-[#E7E5E4] flex flex-wrap items-center justify-between gap-3 bg-stone-50/50">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-[#059669]" />
                <h2 className="text-xs font-semibold text-[#1C1917]">LL(1) parsing table</h2>
                <span className="text-[10px] text-[#78716C] font-mono">
                  {grammar.nonTerminals.length} × {lookaheads.length} cells
                </span>
              </div>

              {/* Conflict filter checkbox */}
              {analysis.conflicts.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-[#78716C] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyConflicts}
                    onChange={(e) => setOnlyConflicts(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Highlight conflicts only</span>
                </label>
              )}
            </div>

            {/* Matrix View */}
            <div className="overflow-auto max-h-[500px] border-t border-[#E7E5E4]/50">
              <table className="text-left text-xs font-mono border-collapse min-w-max">
                <thead className="bg-stone-50 sticky top-0 z-20 text-[10px] text-[#78716C] border-b border-[#E7E5E4]">
                  <tr>
                    <th className="py-2 px-3 sticky left-0 z-30 bg-stone-100 border-r border-[#E7E5E4] w-36">
                      Non-Terminal
                    </th>
                    {lookaheads.map((term) => (
                      <th
                        key={term}
                        className="py-2 px-2.5 border-r border-[#E7E5E4] text-center min-w-[70px]"
                      >
                        {term}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E4]/60">
                  {grammar.nonTerminals.map((nt) => {
                    const rowConflicts = analysis.conflicts.filter((c) => c.nonTerminal === nt);
                    if (onlyConflicts && rowConflicts.length === 0) return null;

                    return (
                      <tr key={nt} className="hover:bg-stone-50/40">
                        {/* Sticky NT column */}
                        <td className="py-2 px-3 sticky left-0 z-10 bg-white border-r border-[#E7E5E4] font-semibold text-emerald-800">
                          {nt}
                        </td>

                        {/* Lookahead Cells */}
                        {lookaheads.map((term) => {
                          const rules: ProductionRule[] = analysis.table[nt]?.[term] || [];
                          const conflict = analysis.conflicts.find(
                            (c) => c.nonTerminal === nt && c.lookahead === term
                          );

                          if (rules.length === 0) {
                            return (
                              <td
                                key={term}
                                className="py-1.5 px-2 text-center text-stone-300 border-r border-[#E7E5E4]/40"
                              >
                                -
                              </td>
                            );
                          }

                          if (conflict) {
                            return (
                              <td
                                key={term}
                                className="py-1.5 px-2 border-r border-[#E7E5E4]/40 bg-amber-50/90 text-amber-950 font-medium"
                              >
                                <Tooltip
                                  content={`Conflict (${conflict.reason}): ${rules.map((r) => `${r.id}: ${r.lhs} -> ${r.rhs.join(' ')}`).join(' | ')}`}
                                  position="top"
                                >
                                  <div className="flex flex-col items-center gap-0.5 cursor-help">
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-200 text-amber-900 font-bold">
                                      {rules.map((r) => r.id).join(',')}
                                    </span>
                                    <span className="text-[8px] text-amber-700">
                                      {conflict.reason === 'FIRST_FOLLOW' ? 'F/FLW' : 'F/F'}
                                    </span>
                                  </div>
                                </Tooltip>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={term}
                              className="py-1.5 px-2 border-r border-[#E7E5E4]/40 text-center"
                            >
                              <Tooltip
                                content={`${rules[0].id}: ${rules[0].lhs} -> ${rules[0].rhs.join(' ')}`}
                                position="top"
                              >
                                <span className="inline-block px-1.5 py-0.5 rounded bg-stone-100 text-[#1C1917] hover:bg-emerald-50 hover:text-emerald-900 transition-colors cursor-help text-[11px]">
                                  {rules[0].id}
                                </span>
                              </Tooltip>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: SPECIFICATIONS */}
      {activeTab === 'specifications' && (
        <div className="space-y-6">
          {/* 1. PIPELINE ARCHITECTURE SVG */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-[#059669]" />
              <h2 className="text-xs font-semibold text-[#1C1917]">Pipeline architecture</h2>
            </div>

            <div className="p-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-lg overflow-x-auto">
              <svg viewBox="0 0 760 110" className="w-full min-w-[680px] h-24 font-sans text-xs">
                {/* Stage 1: Source */}
                <rect x="10" y="30" width="100" height="50" rx="8" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="1.5" />
                <text x="60" y="52" textAnchor="middle" fill="#1C1917" fontWeight="600" fontSize="11">Source Code</text>
                <text x="60" y="67" textAnchor="middle" fill="#78716C" fontSize="9">MiniC (.c)</text>

                {/* Arrow 1 */}
                <path d="M 110 55 L 145 55" stroke="#78716C" strokeWidth="1.5" markerEnd="url(#arrow)" />

                {/* Stage 2: Lexer */}
                <rect x="150" y="30" width="105" height="50" rx="8" fill="#ECFDF5" stroke="#A7F3D0" strokeWidth="1.5" />
                <text x="202" y="52" textAnchor="middle" fill="#065F46" fontWeight="600" fontSize="11">Lexer</text>
                <text x="202" y="67" textAnchor="middle" fill="#047857" fontSize="9">Token Stream</text>

                {/* Arrow 2 */}
                <path d="M 255 55 L 290 55" stroke="#78716C" strokeWidth="1.5" markerEnd="url(#arrow)" />

                {/* Stage 3: Parser */}
                <rect x="295" y="30" width="120" height="50" rx="8" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="1.5" />
                <text x="355" y="52" textAnchor="middle" fill="#1C1917" fontWeight="600" fontSize="11">Pratt Parser</text>
                <text x="355" y="67" textAnchor="middle" fill="#78716C" fontSize="9">Recursive Descent</text>

                {/* Arrow 3 */}
                <path d="M 415 55 L 450 55" stroke="#78716C" strokeWidth="1.5" markerEnd="url(#arrow)" />

                {/* Stage 4: AST */}
                <rect x="455" y="30" width="100" height="50" rx="8" fill="#ECFDF5" stroke="#A7F3D0" strokeWidth="1.5" />
                <text x="505" y="52" textAnchor="middle" fill="#065F46" fontWeight="600" fontSize="11">AST Tree</text>
                <text x="505" y="67" textAnchor="middle" fill="#047857" fontSize="9">JSON / DOT</text>

                {/* Arrow 4 */}
                <path d="M 555 55 L 590 55" stroke="#78716C" strokeWidth="1.5" markerEnd="url(#arrow)" />

                {/* Stage 5: AI Engine */}
                <rect x="595" y="30" width="150" height="50" rx="8" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="1.5" />
                <text x="670" y="52" textAnchor="middle" fill="#3730A3" fontWeight="600" fontSize="11">AI Synthesis</text>
                <text x="670" y="67" textAnchor="middle" fill="#4F46E5" fontSize="9">Repair &amp; Explain</text>

                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#78716C" />
                  </marker>
                </defs>
              </svg>
            </div>
          </div>

          {/* 2. COMPACT MINIC REFERENCE TABLE */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-[#E7E5E4] bg-stone-50/50 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[#1C1917]">Language reference</h2>
              <span className="text-[10px] text-[#78716C]">Core features</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-stone-50 border-b border-[#E7E5E4] text-[11px] text-[#78716C]">
                  <tr>
                    <th className="py-2 px-3 w-32">Construct</th>
                    <th className="py-2 px-3">Syntax &amp; Semantics</th>
                    <th className="py-2 px-3 w-48 text-right">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E4]/60 font-mono text-[11px]">
                  <tr>
                    <td className="py-2 px-3 font-sans font-medium text-[#1C1917]">Types</td>
                    <td className="py-2 px-3 text-[#78716C]">int, float, bool, char, string, void</td>
                    <td className="py-2 px-3 text-right text-emerald-800">int count = 0;</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans font-medium text-[#1C1917]">Control Flow</td>
                    <td className="py-2 px-3 text-[#78716C]">if / else, while, do-while, for</td>
                    <td className="py-2 px-3 text-right text-emerald-800">while (n &gt; 0)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans font-medium text-[#1C1917]">Functions</td>
                    <td className="py-2 px-3 text-[#78716C]">Typed parameters, return statements</td>
                    <td className="py-2 px-3 text-right text-emerald-800">int add(int a, int b)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans font-medium text-[#1C1917]">Operators</td>
                    <td className="py-2 px-3 text-[#78716C]">+ - * / % &amp;&amp; || == != &lt; &lt;= &gt; &gt;=</td>
                    <td className="py-2 px-3 text-right text-emerald-800">x * x + y * y</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans font-medium text-[#1C1917]">Arrays</td>
                    <td className="py-2 px-3 text-[#78716C]">Static 1D arrays and indexing</td>
                    <td className="py-2 px-3 text-right text-emerald-800">int arr[10];</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. KEYBOARD SHORTCUTS TABLE */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-[#E7E5E4] bg-stone-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Command className="w-4 h-4 text-[#059669]" />
                <h2 className="text-xs font-semibold text-[#1C1917]">Keyboard shortcuts</h2>
              </div>
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50 border-b border-[#E7E5E4] text-[11px] text-[#78716C]">
                <tr>
                  <th className="py-2 px-3 w-48">Shortcut</th>
                  <th className="py-2 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E4]/60">
                <tr>
                  <td className="py-2 px-3 font-mono">
                    <kbd className="px-1.5 py-0.5 rounded bg-stone-100 border border-[#E7E5E4] text-[11px]">
                      Ctrl + Enter
                    </kbd>
                  </td>
                  <td className="py-2 px-3 text-[#78716C]">Run lexical and syntax parser</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-mono">
                    <kbd className="px-1.5 py-0.5 rounded bg-stone-100 border border-[#E7E5E4] text-[11px]">
                      Ctrl + K
                    </kbd>
                  </td>
                  <td className="py-2 px-3 text-[#78716C]">Open global command palette</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-mono">
                    <kbd className="px-1.5 py-0.5 rounded bg-stone-100 border border-[#E7E5E4] text-[11px]">
                      Esc
                    </kbd>
                  </td>
                  <td className="py-2 px-3 text-[#78716C]">Close active modal or palette</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 4. LIMITATIONS LIST (5 bullets max) */}
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h2 className="text-xs font-semibold text-[#1C1917]">System limitations</h2>
            </div>

            <ul className="space-y-1.5 text-xs text-[#78716C] list-disc list-inside">
              <li>No pointer arithmetic, unions, or structs.</li>
              <li>No preprocessor directives (#include, #define).</li>
              <li>Single compilation unit execution without external linking.</li>
              <li>Operator precedence transformed into non-left-recursive productions.</li>
              <li>AI synthesis is throttled with concurrency 2–3 on rate limits.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
