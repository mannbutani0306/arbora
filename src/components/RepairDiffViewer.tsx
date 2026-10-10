import React, { useMemo } from 'react';
import { lex } from '../core/lexer';
import { Token } from '../types/ast';

interface RepairDiffViewerProps {
  originalCode: string;
  repairedCode: string;
}

interface DiffLine {
  origLineNum?: number;
  origText?: string;
  origTokens?: Token[];
  repLineNum?: number;
  repText?: string;
  repTokens?: Token[];
  status: 'unchanged' | 'modified' | 'added' | 'deleted';
}

export function RepairDiffViewer({ originalCode, repairedCode }: RepairDiffViewerProps) {
  const diffLines = useMemo(() => {
    const origLines = originalCode.split('\n');
    const repLines = repairedCode.split('\n');
    const origLex = lex(originalCode);
    const repLex = lex(repairedCode);

    const origTokensByLine = new Map<number, Token[]>();
    for (const tok of origLex.tokens) {
      if (!origTokensByLine.has(tok.line)) origTokensByLine.set(tok.line, []);
      origTokensByLine.get(tok.line)!.push(tok);
    }

    const repTokensByLine = new Map<number, Token[]>();
    for (const tok of repLex.tokens) {
      if (!repTokensByLine.has(tok.line)) repTokensByLine.set(tok.line, []);
      repTokensByLine.get(tok.line)!.push(tok);
    }

    const lines: DiffLine[] = [];
    const maxLen = Math.max(origLines.length, repLines.length);

    // Simple line alignment
    for (let i = 0; i < maxLen; i++) {
      const origText = origLines[i];
      const repText = repLines[i];

      if (origText === undefined && repText !== undefined) {
        lines.push({
          repLineNum: i + 1,
          repText,
          repTokens: repTokensByLine.get(i + 1) || [],
          status: 'added',
        });
      } else if (origText !== undefined && repText === undefined) {
        lines.push({
          origLineNum: i + 1,
          origText,
          origTokens: origTokensByLine.get(i + 1) || [],
          status: 'deleted',
        });
      } else {
        const isSame = origText === repText;
        lines.push({
          origLineNum: i + 1,
          origText,
          origTokens: origTokensByLine.get(i + 1) || [],
          repLineNum: i + 1,
          repText,
          repTokens: repTokensByLine.get(i + 1) || [],
          status: isSame ? 'unchanged' : 'modified',
        });
      }
    }

    return lines;
  }, [originalCode, repairedCode]);

  return (
    <div className="rounded-lg border border-[#E7E5E4] overflow-hidden bg-white text-xs font-mono">
      {/* Column Headers */}
      <div className="grid grid-cols-2 bg-stone-50 border-b border-[#E7E5E4] px-3 py-1.5 text-[11px] font-sans font-medium text-[#78716C]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          <span>Original</span>
        </div>
        <div className="flex items-center gap-1.5 pl-3 border-l border-[#E7E5E4]">
          <span className="w-2 h-2 rounded-full bg-[#6366F1]" />
          <span>Repaired</span>
        </div>
      </div>

      {/* Side-by-side lines */}
      <div className="divide-y divide-[#E7E5E4]/50 max-h-56 overflow-y-auto">
        {diffLines.map((line, idx) => {
          const isModified = line.status === 'modified';
          const isAdded = line.status === 'added';
          const isDeleted = line.status === 'deleted';

          return (
            <div key={idx} className="grid grid-cols-2 hover:bg-stone-50/50 transition-colors">
              {/* Original column */}
              <div
                className={`flex items-start px-2 py-1 pr-3 overflow-x-auto ${
                  isModified
                    ? 'bg-rose-50/40'
                    : isDeleted
                    ? 'bg-rose-50/70'
                    : ''
                }`}
              >
                <span className="w-6 shrink-0 text-right pr-2 text-[10px] text-[#78716C]/60 select-none">
                  {line.origLineNum ?? ''}
                </span>
                <span
                  className={`flex-1 whitespace-pre break-all ${
                    isModified
                      ? 'text-rose-900'
                      : isDeleted
                      ? 'text-rose-900 line-through'
                      : 'text-[#1C1917]'
                  }`}
                >
                  {line.origText ?? ''}
                </span>
              </div>

              {/* Repaired column */}
              <div
                className={`flex items-start px-2 py-1 pl-3 border-l border-[#E7E5E4] overflow-x-auto ${
                  isModified
                    ? 'bg-indigo-50/50'
                    : isAdded
                    ? 'bg-emerald-50/60'
                    : ''
                }`}
              >
                <span className="w-6 shrink-0 text-right pr-2 text-[10px] text-[#78716C]/60 select-none">
                  {line.repLineNum ?? ''}
                </span>
                <span
                  className={`flex-1 whitespace-pre break-all ${
                    isModified
                      ? 'text-indigo-950 font-medium'
                      : isAdded
                      ? 'text-emerald-900 font-medium'
                      : 'text-[#1C1917]'
                  }`}
                >
                  {line.repText ?? ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
