import { useState } from 'react';
import { InteractiveAstTree } from '../InteractiveAstTree';
import { TracePlayer } from '../ast/TracePlayer';
import type { ASTNode, ParseResult, Token } from '../../types/ast';
import type { RepairResponse } from '../../ai/repair';
import type { ComparisonMetrics } from '../../core/compare';
import type { ExplanationContent } from '../../ai/explain';
import { CompareTab } from './CompareTab';
import { ErrorsTab } from './ErrorsTab';
import { ExplainTab } from './ExplainTab';
import { MetricsTab } from './MetricsTab';
import { TokensTab } from './TokensTab';
import type { PlaygroundEngine, PlaygroundTab } from './types';

interface ResultsTabsProps {
  code: string;
  tokens: Token[];
  parseResult: ParseResult | null;
  response: RepairResponse | null;
  isRepairing: boolean;
  neuralAst: ASTNode | null;
  comparisonMetrics: ComparisonMetrics | null;
  isComparing: boolean;
  selectedNode: ASTNode | null;
  engine: PlaygroundEngine;
  onJump: (line: number, column: number) => void;
  onSelectNode: (node: ASTNode | null) => void;
  onApply: (code: string) => void;
  onRunRepair: () => void;
  onRunCompare: () => void;
  onExplanation: (key: string, content: ExplanationContent) => void;
}

const tabs: PlaygroundTab[] = ['Tokens', 'Trace', 'AST', 'Errors', 'Compare', 'Explain', 'Metrics'];

export function ResultsTabs(props: ResultsTabsProps) {
  const [activeTab, setActiveTab] = useState<PlaygroundTab>('Tokens');
  const errors = props.parseResult?.errors ?? [];
  const visibleTabs = props.engine === 'Gemini' || props.engine === 'Arbora-T5' || props.engine === 'Compare'
    ? tabs
    : tabs.filter((tab) => tab !== 'Compare');
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#FAFAF9]" aria-label="Analysis results">
    <nav id="tour-tabs-bar" className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-[#E7E5E4] px-2" aria-label="Analysis tabs">
      {visibleTabs.map((tab) => <button id={tab === 'Explain' ? 'tour-explain-tab' : undefined} key={tab} type="button" onClick={() => setActiveTab(tab)} aria-current={activeTab === tab ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 text-xs ${activeTab === tab ? 'border border-[#E7E5E4] bg-white font-medium text-[#1C1917]' : 'text-[#78716C] hover:bg-white'}`}>
        {tab}{tab === 'Errors' && errors.length > 0 ? ` (${errors.length})` : ''}
      </button>)}
    </nav>
    <div className="min-h-0 flex-1 overflow-auto p-3" aria-live={activeTab === 'Errors' ? 'polite' : undefined}>
      {activeTab === 'Tokens' && <TokensTab tokens={props.tokens} onJump={props.onJump} />}
      {activeTab === 'Trace' && (props.parseResult ? <TracePlayer parseResult={props.parseResult} onJumpToSource={props.onJump} /> : <p className="text-sm text-[#78716C]">Run the parser to create a trace.</p>)}
      {activeTab === 'AST' && (props.parseResult?.ast ? <InteractiveAstTree node={props.parseResult.ast} onSelectNode={(node) => props.onSelectNode(node)} selectedNodeId={props.selectedNode?.id} onJumpToSource={props.onJump} onExplainNode={(node) => { props.onSelectNode(node); setActiveTab('Explain'); }} /> : <p className="text-sm text-[#78716C]">Run the parser to build an AST.</p>)}
      {activeTab === 'Errors' && <ErrorsTab code={props.code} parseResult={props.parseResult} response={props.response} isRepairing={props.isRepairing} onApply={props.onApply} onRunRepair={props.onRunRepair} />}
      {activeTab === 'Compare' && <CompareTab classicalAst={props.parseResult?.ast ?? null} neuralAst={props.neuralAst} metrics={props.comparisonMetrics} isLoading={props.isComparing} onRun={props.onRunCompare} onJump={props.onJump} />}
      {activeTab === 'Explain' && <ExplainTab ast={props.parseResult?.ast ?? null} code={props.code} selectedNode={props.selectedNode} onSelectNode={props.onSelectNode} onHighlight={props.onJump} onExplanation={props.onExplanation} />}
      {activeTab === 'Metrics' && <MetricsTab ast={props.parseResult?.ast ?? null} code={props.code} />}
    </div>
  </section>;
}
