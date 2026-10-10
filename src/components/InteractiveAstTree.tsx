import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Sparkles } from 'lucide-react';
import { ASTNode } from '../types/ast';

interface InteractiveAstTreeProps {
  node: ASTNode;
  onSelectNode: (node: ASTNode) => void;
  onExplainNode?: (node: ASTNode) => void;
  selectedNodeId?: string | null;
  level?: number;
}

export function InteractiveAstTree({
  node,
  onSelectNode,
  onExplainNode,
  selectedNodeId,
  level = 0,
}: InteractiveAstTreeProps) {
  const isSelected = selectedNodeId === node.id;
  const [collapsed, setCollapsed] = useState(level > 3 && !isSelected);
  const hasChildren = node.children && node.children.length > 0;

  // Auto-expand if selected
  React.useEffect(() => {
    if (isSelected && collapsed) {
      setCollapsed(false);
    }
  }, [isSelected]);

  // Node details label (name, operator, value, etc.)
  const anyNode = node as any;
  const detailLabel = anyNode.name || anyNode.operator || (anyNode.value !== undefined ? String(anyNode.value) : null);

  return (
    <div className="flex flex-col select-none my-0.5">
      <div
        onClick={() => onSelectNode(node)}
        className={`group flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors text-xs cursor-pointer ${
          isSelected
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 ring-1 ring-emerald-400/20 font-medium'
            : 'border-transparent hover:border-[#E7E5E4] hover:bg-stone-50 text-[#1C1917]'
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="p-0.5 hover:bg-stone-200/60 rounded text-[#78716C]"
          >
            {collapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <span
          className={`font-semibold font-mono ${
            node.type === 'ErrorNode'
              ? 'text-rose-600'
              : node.type === 'FunctionDecl' || node.type === 'Program'
              ? 'text-[#059669]'
              : node.type === 'BinaryExpr' || node.type === 'AssignExpr'
              ? 'text-[#6366F1]'
              : 'text-[#1C1917]'
          }`}
        >
          {node.type}
        </span>

        {detailLabel && (
          <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-stone-100 text-[#1C1917] border border-stone-200">
            {detailLabel}
          </span>
        )}

        {node.span && (
          <span className="text-[10px] text-[#78716C] font-mono ml-auto">
            {node.span.startLine}:{node.span.startCol}
          </span>
        )}

        {onExplainNode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExplainNode(node);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 text-[#6366F1] hover:bg-indigo-50 rounded transition-all ml-1"
            title="Explain node"
          >
            <Sparkles className="w-3 h-3" />
          </button>
        )}
      </div>

      {!collapsed && hasChildren && (
        <div className="pl-4 border-l border-[#E7E5E4] ml-2 mt-0.5 space-y-0.5">
          {node.children.map((child, idx) => (
            <InteractiveAstTree
              key={child?.id || `${node.id}_${idx}`}
              node={child}
              onSelectNode={onSelectNode}
              onExplainNode={onExplainNode}
              selectedNodeId={selectedNodeId}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
