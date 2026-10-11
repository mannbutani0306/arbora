import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
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
import { TabErrorBoundary } from './TabErrorBoundary';
import { parse } from '../../core/parser';

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
  groundTruth?: string;
  onJump: (line: number, column: number) => void;
  onSelectNode: (node: ASTNode | null) => void;
  onApply: (code: string) => void;
  onRunRepair: () => void;
  onRun: () => void;
  onRunCompare: () => void;
  onExplanation: (key: string, content: ExplanationContent) => void;
}

const tabs: PlaygroundTab[] = ['Tokens', 'Trace', 'AST', 'Errors', 'Compare', 'Explain', 'Metrics'];

export function ResultsTabs(props: ResultsTabsProps) {
  const generatedParse = useMemo(
    () => (props.groundTruth === undefined ? undefined : parse(props.code)),
    [props.code, props.groundTruth],
  );
  const currentParse = generatedParse ?? props.parseResult;
  const [activeTab, setActiveTab] = useState<PlaygroundTab>(() =>
    props.engine === 'Compare' ? 'Compare' : 'Tokens',
  );
  useEffect(() => {
    if (props.groundTruth !== undefined) setActiveTab('Errors');
  }, [props.groundTruth]);
  useEffect(() => {
    const supportsComparison =
      props.engine === 'Gemini' || props.engine === 'Arbora-T5' || props.engine === 'Compare';
    setActiveTab((current) =>
      supportsComparison ? 'Compare' : current === 'Compare' ? 'Tokens' : current,
    );
  }, [props.engine]);
  const errors = currentParse?.errors ?? [];
  const visibleTabs =
    props.engine === 'Gemini' || props.engine === 'Arbora-T5' || props.engine === 'Compare'
      ? tabs
      : tabs.filter((tab) => tab !== 'Compare');
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, tab: PlaygroundTab) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const currentIndex = visibleTabs.indexOf(tab);
    const next = visibleTabs[(currentIndex + direction + visibleTabs.length) % visibleTabs.length];
    setActiveTab(next);
    document.getElementById(`playground-tab-${next}`)?.focus();
  };
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#FAFAF9]"
      aria-label="Analysis results"
    >
      <nav
        id="tour-tabs-bar"
        role="tablist"
        className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-[#E7E5E4] px-2"
        aria-label="Analysis tabs"
      >
        {visibleTabs.map((tab) => (
          <button
            id={tab === 'Explain' ? 'tour-explain-tab' : `playground-tab-${tab}`}
            key={tab}
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            aria-selected={activeTab === tab}
            aria-controls="playground-tabpanel"
            type="button"
            onKeyDown={(event) => moveTab(event, tab)}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-3 py-1.5 text-xs ${activeTab === tab ? 'border border-[#E7E5E4] bg-white font-medium text-[#1C1917]' : 'text-[#78716C] hover:bg-white'}`}
          >
            {tab}
            {tab === 'Errors' && errors.length > 0 ? ` (${errors.length})` : ''}
          </button>
        ))}
      </nav>
      <div
        id="playground-tabpanel"
        role="tabpanel"
        aria-label={`${activeTab} results`}
        className="min-h-0 flex-1 overflow-auto p-3"
        aria-live={activeTab === 'Errors' ? 'polite' : undefined}
      >
        <TabErrorBoundary key={activeTab}>
          {activeTab === 'Tokens' && (
            <TokensTab tokens={props.tokens} onJump={props.onJump} onRun={props.onRun} />
          )}
          {activeTab === 'Trace' &&
            (currentParse ? (
              <TracePlayer parseResult={currentParse} onJumpToSource={props.onJump} />
            ) : (
              <div className="flex items-center gap-3 text-sm text-[#78716C]">
                <span>Run the parser to create a trace.</span>
                <button
                  onClick={props.onRun}
                  className="rounded-lg bg-[#059669] px-3 py-1.5 text-xs font-medium text-white"
                >
                  Run
                </button>
              </div>
            ))}
          {activeTab === 'AST' &&
            (currentParse?.ast ? (
              <InteractiveAstTree
                node={currentParse.ast}
                onSelectNode={(node) => props.onSelectNode(node)}
                selectedNodeId={props.selectedNode?.id}
                onJumpToSource={props.onJump}
                onExplainNode={(node) => {
                  props.onSelectNode(node);
                  setActiveTab('Explain');
                }}
              />
            ) : (
              <div className="flex items-center gap-3 text-sm text-[#78716C]">
                <span>Run the parser to build an AST.</span>
                <button
                  onClick={props.onRun}
                  className="rounded-lg bg-[#059669] px-3 py-1.5 text-xs font-medium text-white"
                >
                  Run
                </button>
              </div>
            ))}
          {activeTab === 'Errors' && (
            <ErrorsTab
              code={props.code}
              parseResult={currentParse}
              response={props.response}
              isRepairing={props.isRepairing}
              onApply={props.onApply}
              onRunRepair={props.onRunRepair}
              groundTruth={props.groundTruth}
            />
          )}
          {activeTab === 'Compare' && (
            <CompareTab
              classicalAst={currentParse?.ast ?? null}
              neuralAst={props.neuralAst}
              metrics={props.comparisonMetrics}
              isLoading={props.isComparing}
              onRun={props.onRunCompare}
              onJump={props.onJump}
            />
          )}
          {activeTab === 'Explain' && (
            <ExplainTab
              ast={currentParse?.ast ?? null}
              code={props.code}
              selectedNode={props.selectedNode}
              onSelectNode={props.onSelectNode}
              onHighlight={props.onJump}
              onExplanation={props.onExplanation}
            />
          )}
          {activeTab === 'Metrics' && (
            <MetricsTab ast={currentParse?.ast ?? null} code={props.code} />
          )}
        </TabErrorBoundary>
      </div>
    </section>
  );
}
