import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  hierarchy,
  tree as d3Tree,
  type HierarchyPointLink,
  type HierarchyPointNode,
} from 'd3-hierarchy';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { linkHorizontal, linkRadial, linkVertical } from 'd3-shape';
import type { ASTNode } from '../../types/ast';
import { astToBracketedString, astToDot, astToJSON, countNodes } from '../../core/astUtils';
import type { NodeMatchStatus } from '../../core/compare';

export type TreeLayout = 'vertical' | 'horizontal' | 'radial';
export type TreeCanvasView = 'visual' | 'json' | 'bracketed' | 'dot';

interface TreeCanvasProps {
  ast: ASTNode;
  selectedNodeId?: string | null;
  activeNodeId?: string | null;
  onSelectNode?: (node: ASTNode) => void;
  onExplainNode?: (node: ASTNode) => void;
  onJumpToSource?: (line: number, col: number, endLine?: number, endCol?: number) => void;
  diffStatuses?: Map<string, NodeMatchStatus>;
  syncedTransform?: ZoomTransform;
  onTransformChange?: (transform: ZoomTransform) => void;
  view?: TreeCanvasView;
  autoCollapse?: boolean;
}

const NODE_WIDTH = 168;
const NODE_HEIGHT = 48;
const MARGIN = 72;

export interface TreeLayoutData {
  nodes: HierarchyPointNode<ASTNode>[];
  links: HierarchyPointLink<ASTNode>[];
  subtreeSizes: Map<string, number>;
  width: number;
  height: number;
}

export function computeTreeLayout(
  ast: ASTNode,
  layout: TreeLayout,
  collapsed: Set<string>,
  viewport: { width: number; height: number }
): TreeLayoutData {
  const visibleNodes = hierarchy<ASTNode>(ast, (node) => collapsed.has(node.id) ? null : node.children);
  const layoutTree = d3Tree<ASTNode>();
  if (layout === 'radial') {
    layoutTree.size([Math.PI * 2, Math.max(viewport.width, viewport.height) * 0.38]);
  } else if (layout === 'vertical') {
    layoutTree.nodeSize([NODE_WIDTH + 44, NODE_HEIGHT + 54]);
  } else {
    layoutTree.nodeSize([NODE_HEIGHT + 44, NODE_WIDTH + 70]);
  }
  const root = layoutTree(visibleNodes);
  const nodes = root.descendants() as HierarchyPointNode<ASTNode>[];
  const links = root.links() as HierarchyPointLink<ASTNode>[];
  const subtreeSizes = new Map<string, number>();
  root.eachAfter((item) => {
    subtreeSizes.set(item.data.id, 1 + (item.children ?? []).reduce(
      (sum, child) => sum + (subtreeSizes.get(child.data.id) ?? 0),
      0
    ));
  });
  let width: number;
  let height: number;
  if (layout === 'radial') {
    const radius = Math.max(viewport.width, viewport.height) * 0.38;
    width = radius * 2 + NODE_WIDTH + 2 * MARGIN;
    height = radius * 2 + NODE_HEIGHT + 2 * MARGIN;
    nodes.forEach((item) => {
      const angle = item.x - Math.PI / 2;
      const radiusAtNode = item.y;
      item.x = width / 2 + Math.cos(angle) * radiusAtNode;
      item.y = height / 2 + Math.sin(angle) * radiusAtNode;
    });
  } else {
    const minX = Math.min(...nodes.map((item) => item.x));
    const maxX = Math.max(...nodes.map((item) => item.x));
    const maxY = Math.max(...nodes.map((item) => item.y));
    width = layout === 'vertical' ? maxX - minX + 2 * MARGIN + NODE_WIDTH : maxY + 2 * MARGIN + NODE_WIDTH;
    height = layout === 'vertical' ? maxY + 2 * MARGIN + NODE_HEIGHT : maxX - minX + 2 * MARGIN + NODE_HEIGHT;
    nodes.forEach((item) => {
      const originalX = item.x;
      const originalY = item.y;
      item.x = layout === 'vertical' ? originalX - minX + MARGIN : originalY + MARGIN;
      item.y = layout === 'vertical' ? originalY + MARGIN : originalX - minX + MARGIN;
    });
  }
  return { nodes, links, subtreeSizes, width, height };
}

function nodeDetail(node: ASTNode): string {
  if (node.type === 'Param') return `${node.paramType} ${node.name}`;
  if (node.type === 'VarDecl') return `${node.varType} ${node.name}`;
  if (node.type === 'FunctionDecl') return `${node.returnType} ${node.name}()`;
  if (node.type === 'Literal') return node.raw || String(node.value);
  if (node.type === 'ErrorNode') return node.unexpectedToken || node.message;
  if ('name' in node) return node.name;
  if ('operator' in node) return node.operator;
  return '';
}

function nodeColor(node: ASTNode, status?: NodeMatchStatus): { fill: string; stroke: string; text: string } {
  if (status === 'match') return { fill: '#ECFDF5', stroke: '#059669', text: '#065F46' };
  if (status === 'mismatch') return { fill: '#FFFBEB', stroke: '#D97706', text: '#92400E' };
  if (status === 'missing' || status === 'extra') return { fill: '#FFF1F2', stroke: '#E11D48', text: '#9F1239' };
  if (node.type === 'ErrorNode') return { fill: '#FFF1F2', stroke: '#E11D48', text: '#9F1239' };
  if (['Program', 'FunctionDecl', 'Param', 'VarDecl'].includes(node.type)) {
    return { fill: '#ECFDF5', stroke: '#059669', text: '#065F46' };
  }
  if (['IfStmt', 'WhileStmt', 'ForStmt', 'DoWhileStmt', 'ReturnStmt', 'BreakStmt', 'ContinueStmt', 'ExprStmt', 'Block'].includes(node.type)) {
    return { fill: '#EEF2FF', stroke: '#6366F1', text: '#3730A3' };
  }
  if (['BinaryExpr', 'UnaryExpr', 'AssignExpr', 'CallExpr', 'IndexExpr', 'ArrayLiteral'].includes(node.type)) {
    return { fill: '#FFFBEB', stroke: '#D97706', text: '#92400E' };
  }
  return { fill: '#F5F5F4', stroke: '#A8A29E', text: '#44403C' };
}

function ancestorsOfNode(ast: ASTNode, targetId: string): Set<string> {
  const path = new Set<string>();
  const visit = (node: ASTNode): boolean => {
    if (node.id === targetId) return true;
    for (const child of node.children) {
      if (visit(child)) {
        path.add(node.id);
        return true;
      }
    }
    return false;
  };
  visit(ast);
  return path;
}

function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function serializeTreeSvg(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.querySelectorAll('*').forEach((element) => {
    if (element instanceof SVGElement) element.setAttribute('font-family', 'Inter, sans-serif');
  });
  return new XMLSerializer().serializeToString(clone);
}

export function TreeCanvas({
  ast,
  selectedNodeId = null,
  activeNodeId = null,
  onSelectNode,
  onExplainNode,
  onJumpToSource,
  diffStatuses,
  syncedTransform,
  onTransformChange,
  view = 'visual',
  autoCollapse = true,
}: TreeCanvasProps) {
  const searchId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<SVGGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodeElements = useRef(new Map<string, SVGGElement>());
  const [layout, setLayout] = useState<TreeLayout>('vertical');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (countNodes(ast) <= 400) return new Set();
    const initial = new Set<string>();
    const walk = (node: ASTNode, depth: number) => {
      if (depth > 6 && node.children.length) initial.add(node.id);
      else node.children.forEach((child) => walk(child, depth + 1));
    };
    walk(ast, 0);
    return initial;
  });
  const [search, setSearch] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [size, setSize] = useState({ width: 900, height: 480 });
  const [tooltip, setTooltip] = useState<{ node: ASTNode; x: number; y: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    if (!autoCollapse) return;
    if (countNodes(ast) <= 400) {
      setCollapsed(new Set());
      return;
    }
    const initial = new Set<string>();
    const walk = (node: ASTNode, depth: number) => {
      if (depth > 6 && node.children.length) initial.add(node.id);
      else node.children.forEach((child) => walk(child, depth + 1));
    };
    walk(ast, 0);
    setCollapsed(initial);
  }, [ast, autoCollapse]);

  useEffect(() => {
    const target = svgRef.current?.parentElement;
    if (!target || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const treeData = useMemo(
    () => computeTreeLayout(ast, layout, collapsed, size),
    [ast, layout, collapsed, size]
  );

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    const found: ASTNode[] = [];
    const visit = (node: ASTNode) => {
      if (`${node.type} ${nodeDetail(node)}`.toLowerCase().includes(term)) found.push(node);
      node.children.forEach(visit);
    };
    visit(ast);
    return found;
  }, [search, ast]);
  const matchedIds = useMemo(() => new Set(matches.map((node) => node.id)), [matches]);
  const activeMatch = matches[matchIndex];
  const ancestors = useMemo(() => {
    const path = new Set<string>();
    if (!selectedNodeId) return path;
    const visit = (node: ASTNode): boolean => {
      if (node.id === selectedNodeId) return true;
      for (const child of node.children) {
        if (visit(child)) {
          path.add(node.id);
          return true;
        }
      }
      return false;
    };
    visit(ast);
    return path;
  }, [ast, selectedNodeId]);

  useEffect(() => {
    if (!svgRef.current || !viewportRef.current) return;
    const svg = select(svgRef.current);
    const behavior = d3Zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [size.width, size.height]])
      .scaleExtent([0.12, 4])
      .on('zoom', (event) => {
        select(viewportRef.current).attr('transform', event.transform.toString());
        setTransform(event.transform);
        onTransformChange?.(event.transform);
      });
    zoomRef.current = behavior;
    svg.call(behavior);
    if (syncedTransform) svg.call(behavior.transform, syncedTransform);
    else {
      const fit = Math.min(size.width / treeData.width, size.height / treeData.height, 1);
      const initial = zoomIdentity
        .translate((size.width - treeData.width * fit) / 2, (size.height - treeData.height * fit) / 2)
        .scale(fit);
      svg.call(behavior.transform, initial);
    }
    return () => {
      svg.on('.zoom', null);
    };
  }, [treeData.width, treeData.height, size.width, size.height, syncedTransform, onTransformChange]);

  const applyTransform = useCallback((value: ZoomTransform) => {
    if (svgRef.current && zoomRef.current) {
      select(svgRef.current).call(zoomRef.current.transform, value);
    }
  }, []);

  const fitToScreen = useCallback(() => {
    const fit = Math.min(size.width / treeData.width, size.height / treeData.height, 1);
    applyTransform(zoomIdentity
      .translate((size.width - treeData.width * fit) / 2, (size.height - treeData.height * fit) / 2)
      .scale(fit));
  }, [size, treeData.width, treeData.height, applyTransform]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement | null)?.tagName ?? '')) return;
      if (event.key === '+' || event.key === '=') applyTransform(transform.scale(1.2));
      else if (event.key === '-') applyTransform(transform.scale(0.8));
      else if (event.key === '0') fitToScreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [transform, applyTransform, fitToScreen]);

  const centerOnNode = useCallback((node: ASTNode) => {
    const point = treeData.nodes.find(({ data }) => data.id === node.id);
    if (!point) return;
    const scale = 0.85;
    applyTransform(zoomIdentity.translate(size.width / 2 - point.x * scale, size.height / 2 - point.y * scale).scale(scale));
  }, [treeData.nodes, size, applyTransform]);

  const selectNode = useCallback((node: ASTNode) => {
    onSelectNode?.(node);
    onJumpToSource?.(node.span.startLine, node.span.startCol, node.span.endLine, node.span.endCol);
  }, [onSelectNode, onJumpToSource]);

  const cycleMatches = useCallback((direction = 1) => {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    centerOnNode(matches[next]);
  }, [matches, matchIndex, centerOnNode]);

  useEffect(() => {
    if (!activeMatch) return;
    const ancestorsToExpand = ancestorsOfNode(ast, activeMatch.id);
    setCollapsed((prior) => {
      const next = new Set(prior);
      ancestorsToExpand.forEach((id) => next.delete(id));
      return next.size === prior.size ? prior : next;
    });
  }, [activeMatch?.id, ast]);

  useEffect(() => {
    if (activeMatch && treeData.nodes.some(({ data }) => data.id === activeMatch.id)) {
      centerOnNode(activeMatch);
    }
  }, [activeMatch?.id, treeData.nodes, centerOnNode]);

  const exportSvg = useCallback(() => {
    setExporting(true);
    window.requestAnimationFrame(() => {
      const svg = svgRef.current;
      if (svg) {
        const serialized = serializeTreeSvg(svg, treeData.width, treeData.height);
        const documentSvg = new DOMParser().parseFromString(serialized, 'image/svg+xml');
        documentSvg.documentElement.setAttribute('viewBox', `0 0 ${treeData.width} ${treeData.height}`);
        documentSvg.querySelector('[data-tree-viewport]')?.removeAttribute('transform');
        downloadText('arbora-ast.svg', new XMLSerializer().serializeToString(documentSvg), 'image/svg+xml');
      }
      setExporting(false);
    });
  }, [treeData.width, treeData.height]);

  const exportPng = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    setExporting(true);
    window.requestAnimationFrame(() => {
      const currentSvg = svgRef.current;
      if (!currentSvg) {
        setExporting(false);
        return;
      }
      const serialized = serializeTreeSvg(currentSvg, treeData.width * 2, treeData.height * 2);
      const documentSvg = new DOMParser().parseFromString(serialized, 'image/svg+xml');
      documentSvg.documentElement.setAttribute('viewBox', `0 0 ${treeData.width} ${treeData.height}`);
      documentSvg.querySelector('[data-tree-viewport]')?.removeAttribute('transform');
      const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(documentSvg)], { type: 'image/svg+xml' }));
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = treeData.width * 2;
        canvas.height = treeData.height * 2;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#FFFFFF';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'arbora-ast.png';
              link.click();
              URL.revokeObjectURL(url);
            }
            URL.revokeObjectURL(svgUrl);
          }, 'image/png');
        } else URL.revokeObjectURL(svgUrl);
        setExporting(false);
      };
      image.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        setExporting(false);
      };
      image.src = svgUrl;
    });
  }, [treeData.width, treeData.height]);

  const keyNode = (event: ReactKeyboardEvent<SVGGElement>, node: HierarchyPointNode<ASTNode>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectNode(node.data);
      return;
    }
    let target: ASTNode | undefined;
    if (event.key === 'ArrowUp') target = node.parent?.data;
    if (event.key === 'ArrowDown') target = node.children?.[0]?.data;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const siblings = node.parent?.children ?? [node];
      const index = siblings.findIndex((item) => item.data.id === node.data.id);
      target = siblings[index + (event.key === 'ArrowLeft' ? -1 : 1)]?.data;
    }
    if (target) {
      event.preventDefault();
      const element = nodeElements.current.get(target.id);
      element?.focus();
      selectNode(target);
    }
  };

  const edgePath = (link: HierarchyPointLink<ASTNode>) => {
    if (layout === 'radial') {
      const radial = linkRadial<{ source: HierarchyPointNode<ASTNode>; target: HierarchyPointNode<ASTNode> }, HierarchyPointNode<ASTNode>>()
        .angle((point) => point.x)
        .radius((point) => point.y);
      const sourceAngle = Math.atan2(link.source.y - treeData.height / 2, link.source.x - treeData.width / 2);
      const targetAngle = Math.atan2(link.target.y - treeData.height / 2, link.target.x - treeData.width / 2);
      const sourceRadius = Math.hypot(link.source.x - treeData.width / 2, link.source.y - treeData.height / 2);
      const targetRadius = Math.hypot(link.target.x - treeData.width / 2, link.target.y - treeData.height / 2);
      const radialPath = radial({
        source: { x: sourceAngle + Math.PI / 2, y: sourceRadius } as HierarchyPointNode<ASTNode>,
        target: { x: targetAngle + Math.PI / 2, y: targetRadius } as HierarchyPointNode<ASTNode>,
      });
      return radialPath;
    }
    if (layout === 'horizontal') {
      return linkHorizontal<HierarchyPointLink<ASTNode>, HierarchyPointNode<ASTNode>>()
        .x((point) => point.x)
        .y((point) => point.y)(link);
    }
    return linkVertical<HierarchyPointLink<ASTNode>, HierarchyPointNode<ASTNode>>()
      .x((point) => point.x)
      .y((point) => point.y)(link);
  };

  const visible = (x: number, y: number, width = NODE_WIDTH, height = NODE_HEIGHT) =>
    exporting ||
    treeData.nodes.length <= 400 ||
    (transform.applyX(x + width / 2) > -width &&
      transform.applyX(x - width / 2) < size.width + width &&
      transform.applyY(y + height / 2) > -height &&
      transform.applyY(y - height / 2) < size.height + height);

  return (
    <div className="flex h-full min-h-[360px] flex-col bg-white text-[#1C1917]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E7E5E4] bg-[#FAFAF9] px-3 py-2 text-xs">
        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor={searchId}>Search AST</label>
          <input
            id={searchId}
            value={search}
            onChange={(event) => { setSearch(event.target.value); setMatchIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                cycleMatches(event.shiftKey ? -1 : 1);
              }
            }}
            placeholder="Search nodes"
            className="w-36 rounded-md border border-[#E7E5E4] bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500"
          />
          {search && <span className="min-w-8 text-center font-mono text-[10px] text-[#78716C]">{matches.length ? `${matchIndex + 1}/${matches.length}` : '0'}</span>}
          {view === 'visual' && (
            <>
              <select aria-label="Tree layout" value={layout} onChange={(event) => setLayout(event.target.value as TreeLayout)} className="rounded-md border border-[#E7E5E4] bg-white px-2 py-1">
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
                <option value="radial">Radial</option>
              </select>
              <button type="button" onClick={() => setCollapsed(new Set(treeData.nodes.filter(({ depth }) => depth > 0).map(({ data }) => data.id)))} className="rounded px-1.5 py-1 text-[#78716C] hover:bg-white">Collapse all</button>
              <button type="button" onClick={() => setCollapsed(new Set())} className="rounded px-1.5 py-1 text-[#78716C] hover:bg-white">Expand all</button>
              <button type="button" onClick={() => applyTransform(transform.scale(1.2))} aria-label="Zoom in" className="rounded p-1 hover:bg-white">+</button>
              <button type="button" onClick={() => applyTransform(transform.scale(0.8))} aria-label="Zoom out" className="rounded p-1 hover:bg-white">−</button>
              <button type="button" onClick={fitToScreen} className="rounded px-1.5 py-1 text-[#78716C] hover:bg-white">Fit</button>
            </>
          )}
          <div className="relative">
            <button type="button" onClick={() => setExportOpen((open) => !open)} className="rounded-md border border-[#E7E5E4] bg-white px-2 py-1 text-[#44403C]">Export</button>
            {exportOpen && <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-md border border-[#E7E5E4] bg-white p-1 shadow-lg">
              <button type="button" onClick={() => { exportSvg(); setExportOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left hover:bg-stone-50">SVG</button>
              <button type="button" onClick={() => { void exportPng(); setExportOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left hover:bg-stone-50">PNG (2×)</button>
              <button type="button" onClick={() => { downloadText('arbora-ast.json', astToJSON(ast), 'application/json'); setExportOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left hover:bg-stone-50">JSON</button>
            </div>}
          </div>
        </div>
      </div>
      {view === 'visual' && (
        <div className="relative min-h-0 flex-1 overflow-hidden" data-testid="tree-canvas">
          <svg ref={svgRef} className="h-full w-full touch-none" role="tree" aria-label={`${ast.type} syntax tree`}>
            {!reducedMotion && <style>{'@keyframes arbora-node-in{from{opacity:0}to{opacity:1}}.arbora-node-enter{animation:arbora-node-in 180ms ease-out both}'}</style>}
            <g ref={viewportRef} data-tree-viewport="true">
              {treeData.links.map((link) => {
                if (!visible(link.target.x, link.target.y)) return null;
                const isPath = ancestors.has(link.source.data.id) && ancestors.has(link.target.data.id);
                return <path key={`${link.source.data.id}-${link.target.data.id}`} d={edgePath(link) ?? ''} transform={layout === 'radial' ? `translate(${treeData.width / 2},${treeData.height / 2})` : undefined} fill="none" stroke={isPath ? '#059669' : '#D6D3D1'} strokeWidth={isPath ? 2.5 : 1.5} />;
              })}
              {treeData.nodes.map((point) => {
                const node = point.data;
                if (!visible(point.x, point.y)) return null;
                const colors = nodeColor(node, diffStatuses?.get(node.id));
                const selected = selectedNodeId === node.id;
                const highlighted = matchedIds.has(node.id);
                const detail = nodeDetail(node);
                const hasChildren = node.children.length > 0;
                return <g
                  key={node.id}
                  ref={(element) => { if (element) nodeElements.current.set(node.id, element); else nodeElements.current.delete(node.id); }}
                  data-node-id={node.id}
                  role="treeitem"
                  aria-label={`${node.type}${detail ? ` ${detail}` : ''}, ${node.children.length} children`}
                  aria-selected={selected}
                  aria-expanded={hasChildren ? !collapsed.has(node.id) : undefined}
                  tabIndex={0}
                  transform={`translate(${point.x},${point.y})`}
                  onClick={() => selectNode(node)}
                  onKeyDown={(event) => keyNode(event, point)}
                  onMouseEnter={(event) => setTooltip({ node, x: event.clientX, y: event.clientY })}
                  onMouseLeave={() => setTooltip(null)}
                  className={!reducedMotion ? 'arbora-node-enter' : undefined}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{`${node.type}${detail ? ` · ${detail}` : ''}\n${node.span.startLine}:${node.span.startCol}–${node.span.endLine}:${node.span.endCol}\n${node.children.length} children · ${treeData.subtreeSizes.get(node.id) ?? 1} nodes`}</title>
                  <rect x={-NODE_WIDTH / 2} y={-NODE_HEIGHT / 2} width={NODE_WIDTH} height={NODE_HEIGHT} rx={14} fill={colors.fill} stroke={selected ? '#059669' : colors.stroke} strokeWidth={selected ? 3 : highlighted || node.active || activeNodeId === node.id ? 2.5 : 1.5} strokeDasharray={node.active || activeNodeId === node.id ? '5 3' : undefined} filter={highlighted ? 'drop-shadow(0 1px 4px #F59E0B)' : undefined} />
                  <text x={0} y={detail ? -3 : 4} textAnchor="middle" fill={colors.text} fontFamily="JetBrains Mono, monospace" fontSize={12} fontWeight={600}>{node.type}</text>
                  {detail && <text x={0} y={15} textAnchor="middle" fill="#78716C" fontFamily="JetBrains Mono, monospace" fontSize={10}>{detail.length > 23 ? `${detail.slice(0, 22)}…` : detail}</text>}
                  {hasChildren && <g
                    role="button"
                    aria-label={collapsed.has(node.id) ? `Expand ${node.type}` : `Collapse ${node.type}`}
                    onClick={(event) => { event.stopPropagation(); setCollapsed((prior) => {
                      const next = new Set(prior);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      return next;
                    }); }}
                  >
                    <circle cx={NODE_WIDTH / 2 - 2} cy={0} r={9} fill="white" stroke={colors.stroke} />
                    <text x={NODE_WIDTH / 2 - 2} y={4} textAnchor="middle" fill={colors.text} fontSize={12}>{collapsed.has(node.id) ? '+' : '−'}</text>
                  </g>}
                  {onExplainNode && <foreignObject x={NODE_WIDTH / 2 - 25} y={-NODE_HEIGHT / 2 - 9} width={26} height={25}>
                    <button type="button" aria-label={`Explain ${node.type}`} onClick={(event) => { event.stopPropagation(); onExplainNode(node); }} className="rounded-full bg-white px-1 text-[10px] text-indigo-600 shadow">✦</button>
                  </foreignObject>}
                </g>;
              })}
            </g>
          </svg>
          <svg viewBox={`0 0 ${treeData.width} ${treeData.height}`} className="absolute bottom-3 right-3 h-24 w-36 rounded-md border border-[#E7E5E4] bg-white/90 shadow-sm" aria-label="Tree minimap">
            {treeData.links.map((link) => <path key={`mini-${link.source.data.id}-${link.target.data.id}`} d={edgePath(link) ?? ''} transform={layout === 'radial' ? `translate(${treeData.width / 2},${treeData.height / 2})` : undefined} fill="none" stroke="#A8A29E" strokeWidth={3} />)}
            {treeData.nodes.map(({ data, x, y }) => <circle key={`mini-${data.id}`} cx={x} cy={y} r={8} fill={nodeColor(data, diffStatuses?.get(data.id)).stroke} />)}
            <rect x={Math.max(0, (-transform.x / transform.k))} y={Math.max(0, (-transform.y / transform.k))} width={size.width / transform.k} height={size.height / transform.k} fill="rgba(5,150,105,.08)" stroke="#059669" strokeWidth={4} style={{ cursor: 'move' }} onPointerDown={(event) => {
              const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
              if (!rect) return;
              const factorX = treeData.width / rect.width;
              const factorY = treeData.height / rect.height;
              const startX = event.clientX;
              const startY = event.clientY;
              const startTransform = transform;
              const move = (moveEvent: PointerEvent) => applyTransform(zoomIdentity
                .translate(startTransform.x - (moveEvent.clientX - startX) * factorX * startTransform.k, startTransform.y - (moveEvent.clientY - startY) * factorY * startTransform.k)
                .scale(startTransform.k));
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up, { once: true });
            }} />
          </svg>
          {tooltip && <div className="pointer-events-none fixed z-50 max-w-xs rounded-md bg-[#1C1917] px-2.5 py-2 text-[11px] text-white shadow-lg" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
            <div className="font-semibold">{tooltip.node.type}{nodeDetail(tooltip.node) ? ` · ${nodeDetail(tooltip.node)}` : ''}</div>
            <div className="text-stone-300">Span {tooltip.node.span.startLine}:{tooltip.node.span.startCol}–{tooltip.node.span.endLine}:{tooltip.node.span.endCol}</div>
            <div className="text-stone-300">{tooltip.node.children.length} children · {treeData.subtreeSizes.get(tooltip.node.id) ?? 1} nodes</div>
          </div>}
        </div>
      )}
      {view === 'json' && <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mb-2 flex items-center gap-2">
          <button type="button" onClick={() => setJsonOpen((open) => !open)} className="rounded px-2 py-1 text-xs text-[#78716C] hover:bg-stone-100">{jsonOpen ? 'Collapse' : 'Expand'} JSON</button>
          <button type="button" onClick={() => void navigator.clipboard.writeText(astToJSON(ast))} className="rounded px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Copy</button>
        </div>
        {jsonOpen && <pre className="whitespace-pre-wrap font-mono text-xs">{astToJSON(ast)}</pre>}
      </div>}
      {view === 'bracketed' && <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs">{astToBracketedString(ast)}</pre>}
      {view === 'dot' && <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs">{astToDot(ast)}</pre>}
    </div>
  );
}
