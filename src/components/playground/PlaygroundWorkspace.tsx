import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ASTNode, ParseResult, Token } from '../../types/ast';
import type { RepairResponse } from '../../ai/repair';
import type { ComparisonMetrics } from '../../core/compare';
import type { ExplanationContent } from '../../ai/explain';
import { EditorPane } from './EditorPane';
import { ResultsTabs } from './ResultsTabs';
import { StatusBar } from './StatusBar';
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
  groundTruth?: string;
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
  onRun: () => void;
  onRunCompare: () => void;
  onExplanation: (key: string, content: ExplanationContent) => void;
}

export function PlaygroundWorkspace(props: PlaygroundWorkspaceProps) {
  const [splitRatio, setSplitRatio] = useState(50);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const update = (clientX: number, clientY: number) => {
      const bounds = container.getBoundingClientRect();
      const isVertical = window.innerWidth < 1024;
      const ratio = isVertical
        ? ((clientY - bounds.top) / bounds.height) * 100
        : ((clientX - bounds.left) / bounds.width) * 100;
      setSplitRatio(Math.max(20, Math.min(80, ratio)));
    };
    const onMove = (moveEvent: globalThis.PointerEvent) =>
      update(moveEvent.clientX, moveEvent.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    update(event.clientX, event.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }, []);
  const adjustSplit = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setSplitRatio((value) =>
      Math.max(20, Math.min(80, value + (event.key === 'ArrowRight' ? 2 : -2))),
    );
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        id="playground-split-container"
        className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
      >
        <div
          className="min-h-0 min-w-0 flex-1 lg:flex-none"
          style={{ flexBasis: `${splitRatio}%` }}
        >
          <EditorPane
            code={props.code}
            onChange={props.onCodeChange}
            onMount={props.onMount}
            onClear={props.onClear}
            onUpload={props.onUpload}
          />
        </div>
        <div
          role="separator"
          aria-label="Resize editor and results panes"
          aria-orientation="vertical"
          aria-valuenow={Math.round(splitRatio)}
          aria-valuemin={20}
          aria-valuemax={80}
          tabIndex={0}
          onPointerDown={handleResize}
          onKeyDown={adjustSplit}
          className="h-1.5 shrink-0 cursor-row-resize bg-[#E7E5E4] hover:bg-[#059669] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:h-auto lg:w-1.5 lg:cursor-col-resize"
        />
        <div className="min-h-0 min-w-0 flex-1">
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
            groundTruth={props.groundTruth}
            onJump={props.onJump}
            onSelectNode={props.onSelectNode}
            onApply={props.onApply}
            onRunRepair={props.onRunRepair}
            onRun={props.onRun}
            onRunCompare={props.onRunCompare}
            onExplanation={props.onExplanation}
          />
        </div>
      </div>
      <StatusBar
        parseResult={props.parseResult}
        isParsing={props.isParsing}
        duration={props.parseDuration}
        engine={props.engine}
        mode={props.mode}
      />
    </>
  );
}
