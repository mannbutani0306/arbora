import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { ASTNode } from '../types/ast';
import { getNodeLabel } from '../core/astUtils';
import { TreeCanvas, type TreeCanvasView } from './ast/TreeCanvas';

interface InteractiveAstTreeProps {
  node: ASTNode;
  onSelectNode: (node: ASTNode) => void;
  onExplainNode?: (node: ASTNode) => void;
  selectedNodeId?: string | null;
  activeNodeId?: string | null;
  onJumpToSource?: (line: number, col: number, endLine?: number, endCol?: number) => void;
}

type AstView = TreeCanvasView | 'outline';

export function InteractiveAstTree({
  node,
  onSelectNode,
  onExplainNode,
  selectedNodeId,
  activeNodeId,
  onJumpToSource,
}: InteractiveAstTreeProps) {
  const [view, setView] = useState<AstView>('visual');
  return (
    <div className="flex h-[600px] min-h-[360px] flex-col overflow-hidden rounded-lg border border-[#E7E5E4] bg-white">
      <div className="flex items-center gap-1 border-b border-[#E7E5E4] bg-[#FAFAF9] px-3 py-2 text-xs">
        {(['visual', 'outline', 'json', 'bracketed', 'dot'] as AstView[]).map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setView(item)}
            className={`rounded-md px-2.5 py-1 capitalize transition-colors ${view === item ? 'bg-white font-medium text-emerald-700 shadow-sm ring-1 ring-[#E7E5E4]' : 'text-[#78716C] hover:bg-white'}`}
          >
            {item === 'dot' ? 'DOT' : item === 'bracketed' ? 'Bracketed' : item === 'json' ? 'JSON' : item === 'outline' ? 'Outline' : 'Visual'}
          </button>
        ))}
      </div>
      {view === 'outline' ? (
        <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs">
          <OutlineNode
            node={node}
            onSelectNode={onSelectNode}
            onJumpToSource={onJumpToSource}
            onExplainNode={onExplainNode}
            selectedNodeId={selectedNodeId}
          />
        </div>
      ) : (
        <TreeCanvas
          ast={node}
          view={view}
          selectedNodeId={selectedNodeId}
          activeNodeId={activeNodeId}
          onSelectNode={onSelectNode}
          onExplainNode={onExplainNode}
          onJumpToSource={onJumpToSource}
        />
      )}
    </div>
  );
}

interface OutlineNodeProps {
  node: ASTNode;
  onSelectNode: (node: ASTNode) => void;
  onJumpToSource?: (line: number, col: number, endLine?: number, endCol?: number) => void;
  onExplainNode?: (node: ASTNode) => void;
  selectedNodeId?: string | null;
  level?: number;
}

function OutlineNode({
  node,
  onSelectNode,
  onJumpToSource,
  onExplainNode,
  selectedNodeId,
  level = 0,
}: OutlineNodeProps) {
  const [collapsed, setCollapsed] = useState(level > 3);
  const selected = selectedNodeId === node.id;
  return (
    <div className="my-0.5">
      <div
        className={`group flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
          selected
            ? 'border-emerald-300 bg-emerald-50 font-medium text-emerald-950 ring-1 ring-emerald-400/20'
            : 'border-transparent text-[#1C1917] hover:border-[#E7E5E4] hover:bg-stone-50'
        }`}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.type}`}
            onClick={() => setCollapsed((value) => !value)}
            className="rounded p-0.5 text-[#78716C] hover:bg-stone-200/60"
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        ) : <span className="w-3 shrink-0" />}
        <button type="button" onClick={() => {
          onSelectNode(node);
          onJumpToSource?.(node.span.startLine, node.span.startCol, node.span.endLine, node.span.endCol);
        }} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`font-semibold ${
            node.type === 'ErrorNode' ? 'text-rose-600'
              : ['FunctionDecl', 'Program', 'VarDecl', 'Param'].includes(node.type) ? 'text-emerald-700'
                : ['BinaryExpr', 'AssignExpr', 'UnaryExpr'].includes(node.type) ? 'text-indigo-600'
                  : 'text-[#1C1917]'
          }`}>{node.type}</span>
          <span className="truncate rounded border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[11px] text-[#1C1917]">{getNodeLabel(node)}</span>
          <span className="ml-auto shrink-0 text-[10px] text-[#78716C]">{node.span.startLine}:{node.span.startCol}</span>
        </button>
        {onExplainNode && <button type="button" aria-label={`Explain ${node.type}`} onClick={() => onExplainNode(node)} className="rounded p-1 text-indigo-600 opacity-0 transition-opacity hover:bg-indigo-50 group-hover:opacity-100"><Sparkles className="h-3 w-3" /></button>}
      </div>
      {!collapsed && node.children.length > 0 && (
        <div className="ml-2 mt-0.5 space-y-0.5 border-l border-[#E7E5E4] pl-4">
          {node.children.map((child) => (
            <OutlineNode key={child.id} node={child} onSelectNode={onSelectNode} onJumpToSource={onJumpToSource} onExplainNode={onExplainNode} selectedNodeId={selectedNodeId} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
