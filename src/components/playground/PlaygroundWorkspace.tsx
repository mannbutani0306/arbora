import type { ASTNode, ParseResult, Token } from '../../types/ast';
import type { RepairResponse } from '../../ai/repair';
import type { ComparisonMetrics } from '../../core/compare';
import type { ExplanationContent } from '../../ai/explain';
import { EditorPane } from './EditorPane';
import { ResultsTabs } from './ResultsTabs';
import { StatusBar } from './StatusBar';
import { TabErrorBoundary } from './TabErrorBoundary';
import type { PlaygroundEngine, PlaygroundMode } from './types';
import type { OnMount } from '@monaco-editor/react';

export interface PlaygroundWorkspaceProps {
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
  mode: PlaygroundMode;
  isParsing: boolean;
  parseDuration: number;
  onCodeChange: (value: string) => void;
  onMount: OnMount;
  onClear: () => void;
  onUpload: (file: File) => void;
  onJump: (line: number, column: number) => void;
  onSelectNode: (node: ASTNode | null) => void;
  onApply: (code: string) => void;
  onRunRepair: () => void;
  onRunCompare: () => void;
  onExplanation: (key: string, content: ExplanationContent) => void;
}

export function PlaygroundWorkspace(props: PlaygroundWorkspaceProps) {
  return <>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <EditorPane
        code={props.code}
        onChange={props.onCodeChange}
        onMount={props.onMount}
        onClear={props.onClear}
        onUpload={props.onUpload}
      />
      <TabErrorBoundary>
        <ResultsTabs
          code={props.code}
          tokens={props.tokens}
          parseResult={props.parseResult}
          response={props.response}
          isRepairing={props.isRepairing}
          neuralAst={props.neuralAst}
          comparisonMetrics={props.comparisonMetrics}
          isComparing={props.isComparing}
          selectedNode={props.selectedNode}
          engine={props.engine}
          onJump={props.onJump}
          onSelectNode={props.onSelectNode}
          onApply={props.onApply}
          onRunRepair={props.onRunRepair}
          onRunCompare={props.onRunCompare}
          onExplanation={props.onExplanation}
        />
      </TabErrorBoundary>
    </div>
    <StatusBar parseResult={props.parseResult} isParsing={props.isParsing} duration={props.parseDuration} engine={props.engine} mode={props.mode} />
  </>;
}
