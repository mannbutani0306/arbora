import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  GitCompare,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Info,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { ASTNode } from '../types/ast';
import {
  ComparisonMetrics,
  annotateNodeStatuses,
  NodeMatchStatus,
  ASTDiffItem,
} from '../core/compare';

interface CompareViewProps {
  classicalAst: ASTNode | null;
  neuralAst: ASTNode | null;
  metrics: ComparisonMetrics | null;
  isLoading: boolean;
  onRunComparison: () => void;
  onJumpToSource?: (line: number, col: number) => void;
  missingApiKey?: boolean;
}

export function CompareView({
  classicalAst,
  neuralAst,
  metrics,
  isLoading,
  onRunComparison,
  onJumpToSource,
  missingApiKey,
}: CompareViewProps) {
  // Synchronized Pan and Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hovered / Selected node synchronization
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  // Status mapping
  const { statusMapA, statusMapB } = useMemo(() => {
    return annotateNodeStatuses(classicalAst, neuralAst);
  }, [classicalAst, neuralAst]);

  // Synchronized scroll / pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((prev) => Math.max(0.4, Math.min(2.5, prev * zoomFactor)));
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // If loading, show clean loading state
  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-[#FAFAF9]">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-[#78716C] mb-3">Synthesizing Neural AST...</p>
        <div className="w-48 h-1.5 bg-[#E7E5E4] rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  // If API key is missing
  if (missingApiKey && !neuralAst) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#FAFAF9]">
        <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-4 text-amber-600">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-[#1C1917] mb-1">
          API Key Required
        </h3>
        <p className="text-xs text-[#78716C] max-w-sm mb-4">
          Set GEMINI_API_KEY to generate and compare Neural ASTs.
        </p>
        <button
          onClick={onRunComparison}
          className="px-3.5 py-1.5 bg-[#1C1917] hover:bg-[#292524] text-white text-xs font-medium rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // If no neural AST yet
  if (!neuralAst) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#FAFAF9]">
        <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mb-4 text-indigo-600">
          <GitCompare className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-[#1C1917] mb-1">
          No Comparison Yet
        </h3>
        <p className="text-xs text-[#78716C] max-w-xs mb-4">
          Run the neural engine to compare AST structures.
        </p>
        <button
          onClick={onRunComparison}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-xl shadow-sm transition-colors flex items-center gap-2"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Compare Trees
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#FAFAF9] overflow-hidden select-none">
      {/* Top Summary Cards (Numbers only, no paragraphs) */}
      <div className="grid grid-cols-5 gap-2 p-3 bg-white border-b border-[#E7E5E4] shrink-0">
        {/* TED */}
        <div className="p-2.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#78716C]">
            <span>TED</span>
            <div className="group relative">
              <Info className="w-3 h-3 text-[#A8A29E] cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 top-4 hidden group-hover:block z-50 bg-[#1C1917] text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                Zhang-Shasha Tree Edit Distance
              </div>
            </div>
          </div>
          <span className="text-lg font-semibold text-[#1C1917] font-mono mt-1">
            {metrics?.treeEditDistance ?? 0}
          </span>
        </div>

        {/* Similarity % */}
        <div className="p-2.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#78716C]">
            <span>Similarity</span>
            <div className="group relative">
              <Info className="w-3 h-3 text-[#A8A29E] cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 top-4 hidden group-hover:block z-50 bg-[#1C1917] text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                1 - TED / max(sizeA, sizeB)
              </div>
            </div>
          </div>
          <span
            className={`text-lg font-semibold font-mono mt-1 ${
              (metrics?.similarity ?? 0) >= 0.95
                ? 'text-[#059669]'
                : (metrics?.similarity ?? 0) >= 0.8
                ? 'text-amber-600'
                : 'text-rose-600'
            }`}
          >
            {Math.round((metrics?.similarity ?? 0) * 1000) / 10}%
          </span>
        </div>

        {/* F1 Score */}
        <div className="p-2.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#78716C]">
            <span>F1</span>
            <div className="group relative">
              <Info className="w-3 h-3 text-[#A8A29E] cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 top-4 hidden group-hover:block z-50 bg-[#1C1917] text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                Node (type, depth, parent) F1
              </div>
            </div>
          </div>
          <span className="text-lg font-semibold text-[#1C1917] font-mono mt-1">
            {metrics?.f1?.toFixed(3) ?? '0.000'}
          </span>
        </div>

        {/* Exact Match */}
        <div className="p-2.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#78716C]">
            <span>Exact Match</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {metrics?.isExactMatch ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#059669]">
                <Check className="w-3.5 h-3.5 stroke-[3]" /> Yes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                <X className="w-3.5 h-3.5 stroke-[3]" /> No
              </span>
            )}
          </div>
        </div>

        {/* Latency Classical vs Neural */}
        <div className="p-2.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#78716C]">
            <span>Latency</span>
            <div className="group relative">
              <Info className="w-3 h-3 text-[#A8A29E] cursor-help" />
              <div className="absolute right-0 top-4 hidden group-hover:block z-50 bg-[#1C1917] text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                Classical vs Neural parse time
              </div>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#1C1917] font-mono mt-2 truncate">
            {metrics?.latencyClassicalMs ?? 0}ms / {metrics?.latencyNeuralMs ?? 0}ms
          </span>
        </div>
      </div>

      {/* Synchronized Viewport Controls & Legend */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F5F5F4] border-b border-[#E7E5E4] text-[11px] shrink-0">
        {/* Color Legend */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#059669]" />
            <span className="text-[#1C1917] font-medium">Match</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-[#1C1917] font-medium">Mismatch</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-[#1C1917] font-medium">Missing/Extra</span>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
            className="p-1 hover:bg-[#E7E5E4] text-[#78716C] rounded transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[10px] text-[#78716C] min-w-8 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
            className="p-1 hover:bg-[#E7E5E4] text-[#78716C] rounded transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetViewport}
            className="p-1 hover:bg-[#E7E5E4] text-[#78716C] rounded transition-colors ml-1"
            title="Reset pan/zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRunComparison}
            className="p-1 hover:bg-[#E7E5E4] text-indigo-600 rounded transition-colors ml-1"
            title="Re-run comparison"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Two ASTs side-by-side with synchronized pan/zoom */}
      <div
        className="flex-1 grid grid-cols-2 divide-x divide-[#E7E5E4] overflow-hidden cursor-grab active:cursor-grabbing bg-white relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Left Column: Classical AST */}
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-3 py-1.5 bg-[#FAFAF9] border-b border-[#E7E5E4] flex items-center justify-between text-xs font-medium text-[#1C1917] shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#059669]" />
              Classical AST ({metrics?.sizeA ?? 0} nodes)
            </span>
          </div>
          <div className="flex-1 overflow-hidden p-4 relative">
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'top left',
                transition: isDragging.current ? 'none' : 'transform 100ms ease-out',
              }}
              className="inline-block"
            >
              {classicalAst ? (
                <TreeNodeItem
                  node={classicalAst}
                  path="root"
                  statusMap={statusMapA}
                  hoveredPath={hoveredPath}
                  setHoveredPath={setHoveredPath}
                  onJumpToSource={onJumpToSource}
                  side="classical"
                />
              ) : (
                <span className="text-xs text-[#78716C]">No classical AST</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Neural AST */}
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-3 py-1.5 bg-[#FAFAF9] border-b border-[#E7E5E4] flex items-center justify-between text-xs font-medium text-[#1C1917] shrink-0">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Neural AST ({metrics?.sizeB ?? 0} nodes)
            </span>
          </div>
          <div className="flex-1 overflow-hidden p-4 relative">
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'top left',
                transition: isDragging.current ? 'none' : 'transform 100ms ease-out',
              }}
              className="inline-block"
            >
              {neuralAst ? (
                <TreeNodeItem
                  node={neuralAst}
                  path="root"
                  statusMap={statusMapB}
                  hoveredPath={hoveredPath}
                  setHoveredPath={setHoveredPath}
                  onJumpToSource={onJumpToSource}
                  side="neural"
                />
              ) : (
                <span className="text-xs text-[#78716C]">No neural AST</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TreeNodeItemProps {
  node: ASTNode;
  path: string;
  statusMap: Map<string, NodeMatchStatus>;
  hoveredPath: string | null;
  setHoveredPath: (path: string | null) => void;
  onJumpToSource?: (line: number, col: number) => void;
  side: 'classical' | 'neural';
}

function TreeNodeItem({
  node,
  path,
  statusMap,
  hoveredPath,
  setHoveredPath,
  onJumpToSource,
  side,
}: TreeNodeItemProps) {
  const [collapsed, setCollapsed] = useState(false);
  const status = statusMap.get(node.id) || 'match';
  const hasChildren = node.children && node.children.length > 0;
  const isHovered = hoveredPath === path;

  // Determine styling based on match status
  // green = match, amber = type mismatch, red = missing/extra
  const statusBadge = useMemo(() => {
    switch (status) {
      case 'match':
        return {
          bg: 'bg-emerald-50 hover:bg-emerald-100/80',
          border: 'border-emerald-300',
          text: 'text-emerald-900',
          pill: 'bg-emerald-600 text-white',
        };
      case 'mismatch':
        return {
          bg: 'bg-amber-50 hover:bg-amber-100/80',
          border: 'border-amber-300',
          text: 'text-amber-900',
          pill: 'bg-amber-500 text-white',
        };
      case 'missing':
      case 'extra':
        return {
          bg: 'bg-rose-50 hover:bg-rose-100/80',
          border: 'border-rose-300',
          text: 'text-rose-900',
          pill: 'bg-rose-600 text-white',
        };
      default:
        return {
          bg: 'bg-stone-50',
          border: 'border-stone-200',
          text: 'text-stone-800',
          pill: 'bg-stone-600 text-white',
        };
    }
  }, [status]);

  // Extract descriptive label if node has name, operator, or value
  const detailLabel = useMemo(() => {
    const n = node as any;
    if (n.name) return n.name;
    if (n.operator) return n.operator;
    if (n.value !== undefined) return String(n.value);
    if (n.returnType) return `${n.returnType} ${n.name || ''}`;
    return null;
  }, [node]);

  return (
    <div className="flex flex-col select-none my-0.5">
      <div
        onMouseEnter={() => setHoveredPath(path)}
        onMouseLeave={() => setHoveredPath(null)}
        onClick={() => {
          if (node.span && onJumpToSource) {
            onJumpToSource(node.span.startLine, node.span.startCol);
          }
        }}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs cursor-pointer transition-colors ${
          statusBadge.bg
        } ${statusBadge.border} ${statusBadge.text} ${
          isHovered ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
        }`}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="p-0.5 hover:bg-black/5 rounded text-stone-500"
          >
            {collapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        ) : (
          <span className="w-3" />
        )}

        <span className="font-semibold font-mono">{node.type}</span>

        {detailLabel && (
          <span className="font-mono text-[11px] px-1 py-0.2 rounded bg-white/70 border border-stone-200/60 text-stone-700">
            {detailLabel}
          </span>
        )}

        {node.span && (
          <span className="text-[10px] text-stone-400 font-mono ml-auto">
            {node.span.startLine}:{node.span.startCol}
          </span>
        )}
      </div>

      {!collapsed && hasChildren && (
        <div className="pl-4 border-l border-stone-200/80 ml-2 mt-0.5 space-y-0.5">
          {node.children.map((child, idx) => (
            <TreeNodeItem
              key={child?.id || `${path}_${idx}`}
              node={child}
              path={`${path}/${child?.type || 'Node'}[${idx}]`}
              statusMap={statusMap}
              hoveredPath={hoveredPath}
              setHoveredPath={setHoveredPath}
              onJumpToSource={onJumpToSource}
              side={side}
            />
          ))}
        </div>
      )}
    </div>
  );
}
