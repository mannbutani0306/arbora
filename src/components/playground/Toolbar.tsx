import { Download, Play, Share2, Bookmark, FileText, CircleHelp } from 'lucide-react';
import type { SampleRecord } from '../../lib/supabase';
import { SamplePicker } from './SamplePicker';
import type { PlaygroundEngine, PlaygroundMode } from './types';
import { ErrorInjectionMenu, type InjectionChoice } from './ErrorInjectionMenu';

interface ToolbarProps {
  title: string;
  mode: PlaygroundMode;
  engine: PlaygroundEngine;
  samples: SampleRecord[];
  onTitleChange: (value: string) => void;
  onModeChange: (value: PlaygroundMode) => void;
  onEngineChange: (value: PlaygroundEngine) => void;
  onSelectSample: (sample: SampleRecord) => void;
  onRun: () => void;
  onSave: () => void;
  onShare: () => void;
  onExport: () => void;
  onReport: () => void;
  onTour: () => void;
  onInject: (choice: InjectionChoice) => void;
  onResetOriginal?: () => void;
}

const engineHelp: Record<PlaygroundEngine, string> = {
  Classical: 'Deterministic repair proposals',
  'N-gram': 'Classical candidates ranked by a trigram model',
  Gemini: 'Gemini proposals; verified locally',
  'Arbora-T5': 'Arbora-T5 proposals; verified locally',
  Ensemble: 'Merge proposals from all engines',
  Compare: 'Compare model AST output with the parser',
};

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-[#E7E5E4] bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Analysis title"
          value={props.title}
          onChange={(event) => props.onTitleChange(event.target.value)}
          className="w-36 rounded-lg border border-transparent px-2 py-1.5 text-xs font-semibold text-[#1C1917] focus:border-[#E7E5E4] focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
        <button
          onClick={props.onRun}
          className="flex items-center gap-1 rounded-lg bg-[#059669] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#047857]"
          title="Run parser (Ctrl+Enter)"
        >
          <Play className="h-3.5 w-3.5" /> Run
        </button>
        <select
          id="tour-mode-switch"
          aria-label="Parser mode"
          value={props.mode}
          onChange={(event) => props.onModeChange(event.target.value as PlaygroundMode)}
          className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-2 py-1.5 text-xs"
        >
          <option>Strict</option>
          <option>Repair</option>
        </select>
        <select
          aria-label="Repair engine"
          value={props.engine}
          onChange={(event) => props.onEngineChange(event.target.value as PlaygroundEngine)}
          className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] px-2 py-1.5 text-xs"
        >
          {(Object.keys(engineHelp) as PlaygroundEngine[]).map((engine) => (
            <option key={engine} value={engine} title={engineHelp[engine]}>
              {engine}
            </option>
          ))}
        </select>
        <SamplePicker samples={props.samples} onSelect={props.onSelectSample} />
        <ErrorInjectionMenu onInject={props.onInject} />
        {props.onResetOriginal && (
          <button
            type="button"
            onClick={props.onResetOriginal}
            className="rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs text-amber-800 hover:bg-amber-50"
          >
            Reset original
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={props.onReport}
          aria-label="Create report"
          title="Create report"
          className="rounded-lg p-2 text-[#78716C] hover:bg-stone-100"
        >
          <FileText className="h-4 w-4" />
        </button>
        <button
          onClick={props.onTour}
          aria-label="Start tour"
          title="Start tour"
          className="rounded-lg p-2 text-[#78716C] hover:bg-stone-100"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
        <button
          onClick={props.onSave}
          aria-label="Save analysis"
          title="Save"
          className="rounded-lg p-2 text-[#78716C] hover:bg-stone-100"
        >
          <Bookmark className="h-4 w-4" />
        </button>
        <button
          onClick={props.onShare}
          aria-label="Share analysis"
          title="Share"
          className="rounded-lg p-2 text-[#78716C] hover:bg-stone-100"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <button
          onClick={props.onExport}
          aria-label="Export analysis"
          title="Export JSON"
          className="rounded-lg p-2 text-[#78716C] hover:bg-stone-100"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
