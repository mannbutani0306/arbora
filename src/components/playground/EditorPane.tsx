import Editor, { type OnMount } from '@monaco-editor/react';
import { Eraser, Upload } from 'lucide-react';

interface EditorPaneProps {
  code: string;
  onChange: (value: string) => void;
  onMount: OnMount;
  onClear: () => void;
  onUpload: (file: File) => void;
}

export function EditorPane({ code, onChange, onMount, onClear, onUpload }: EditorPaneProps) {
  return (
    <section id="tour-editor" className="flex min-h-0 min-w-0 flex-1 flex-col bg-white" aria-label="MiniC editor">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#E7E5E4] px-3">
        <span className="text-xs font-medium text-[#78716C]">Source</span>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded p-1.5 text-[#78716C] hover:bg-stone-100" title="Upload source file">
            <Upload className="h-3.5 w-3.5" />
            <span className="sr-only">Upload source file</span>
            <input
              type="file"
              accept=".c,.txt,.mc"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <button type="button" onClick={onClear} title="Clear editor code" aria-label="Clear editor code" className="rounded p-1.5 text-[#78716C] hover:bg-stone-100">
            <Eraser className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          defaultLanguage="c"
          value={code}
          onChange={(value) => onChange(value ?? '')}
          onMount={onMount}
          theme="arbora-light"
          options={{
            fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace",
            fontSize: 13,
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            folding: true,
            automaticLayout: true,
            renderLineHighlight: 'all',
            tabSize: 4,
          }}
        />
      </div>
    </section>
  );
}
