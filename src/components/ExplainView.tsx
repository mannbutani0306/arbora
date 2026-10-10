import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Copy,
  Check,
  RefreshCw,
  BookOpen,
  ChevronRight,
  Database,
  Cpu,
  Layers,
  StopCircle,
} from 'lucide-react';
import { ASTNode } from '../types/ast';
import {
  ExplanationLevel,
  ExplanationContent,
  streamExplainNode,
  computeExplanationCacheKey,
  getCachedExplanation,
  extractNodeSnippet,
} from '../ai/explain';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/toast';

interface ExplainViewProps {
  ast: ASTNode | null;
  code: string;
  selectedNode: ASTNode | null;
  onSelectNode: (node: ASTNode | null) => void;
  onHighlightSpan: (line: number, col: number, endCol?: number) => void;
  onExplanationGenerated?: (cacheKey: string, content: ExplanationContent) => void;
}

export function ExplainView({
  ast,
  code,
  selectedNode,
  onSelectNode,
  onHighlightSpan,
  onExplanationGenerated,
}: ExplainViewProps) {
  const [level, setLevel] = useState<ExplanationLevel>('Intermediate');
  const [targetType, setTargetType] = useState<'node' | 'whole'>('whole');
  const [isStreaming, setIsStreaming] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationContent | null>(null);
  const [streamBuffer, setStreamBuffer] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Walkthrough state
  const [isWalkthrough, setIsWalkthrough] = useState(false);
  const [walkthroughIndex, setWalkthroughIndex] = useState(0);
  const [isWalkthroughPlaying, setIsWalkthroughPlaying] = useState(false);
  const walkthroughTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { user } = useAuth();
  const toast = useToast();

  // Linearize meaningful nodes for the Walkthrough
  const flattenedNodes = useMemo(() => {
    if (!ast) return [];
    const list: ASTNode[] = [];

    function traverse(node: ASTNode) {
      if (!node) return;
      // Skip pure containers like Program or empty Blocks in the walkthrough steps
      if (node.type !== 'Program') {
        list.push(node);
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (child) traverse(child);
        }
      }
    }

    traverse(ast);
    return list;
  }, [ast]);

  // Request explanation for current target
  const triggerExplain = useCallback(
    async (
      nodeTarget: ASTNode | null | 'whole_program',
      currentLevel: ExplanationLevel = level
    ) => {
      setIsStreaming(true);
      setStreamBuffer('');
      setExplanation(null);

      try {
        const result = await streamExplainNode({
          node: nodeTarget,
          fullCode: code,
          level: currentLevel,
          userId: user?.id,
          onChunk: (chunk) => {
            setStreamBuffer(chunk);
          },
        });

        setExplanation(result);
        const cacheKey = computeExplanationCacheKey(
          nodeTarget,
          currentLevel,
          extractNodeSnippet(nodeTarget, code)
        );
        onExplanationGenerated?.(cacheKey, result);
      } catch {
        toast.error('Explanation request failed');
      } finally {
        setIsStreaming(false);
      }
    },
    [code, level, user, onExplanationGenerated, toast]
  );

  // When selectedNode changes, switch target to 'node' and fetch explanation
  useEffect(() => {
    if (selectedNode) {
      setTargetType('node');
      triggerExplain(selectedNode, level);
      if (selectedNode.span) {
        onHighlightSpan(
          selectedNode.span.startLine,
          selectedNode.span.startCol,
          selectedNode.span.endCol
        );
      }
    }
  }, [selectedNode, level, triggerExplain, onHighlightSpan]);

  // Handle switching to Whole Program
  const handleSelectWhole = () => {
    onSelectNode(null);
    setTargetType('whole');
    triggerExplain('whole_program', level);
  };

  // Walkthrough navigation
  const jumpToWalkthroughStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= flattenedNodes.length) return;
      setWalkthroughIndex(index);
      const node = flattenedNodes[index];
      onSelectNode(node);
      if (node.span) {
        onHighlightSpan(node.span.startLine, node.span.startCol, node.span.endCol);
      }
      triggerExplain(node, level);
    },
    [flattenedNodes, onSelectNode, onHighlightSpan, triggerExplain, level]
  );

  const startWalkthrough = () => {
    if (flattenedNodes.length === 0) {
      toast.info('No AST nodes found');
      return;
    }
    setIsWalkthrough(true);
    setIsWalkthroughPlaying(true);
    jumpToWalkthroughStep(0);
  };

  const stopWalkthrough = () => {
    setIsWalkthrough(false);
    setIsWalkthroughPlaying(false);
    if (walkthroughTimerRef.current) {
      clearInterval(walkthroughTimerRef.current);
      walkthroughTimerRef.current = null;
    }
  };

  const nextStep = () => {
    if (walkthroughIndex < flattenedNodes.length - 1) {
      jumpToWalkthroughStep(walkthroughIndex + 1);
    } else {
      setIsWalkthroughPlaying(false);
    }
  };

  const prevStep = () => {
    if (walkthroughIndex > 0) {
      jumpToWalkthroughStep(walkthroughIndex - 1);
    }
  };

  // Auto-play timer for Walkthrough
  useEffect(() => {
    if (isWalkthrough && isWalkthroughPlaying) {
      walkthroughTimerRef.current = setInterval(() => {
        setWalkthroughIndex((prev) => {
          if (prev < flattenedNodes.length - 1) {
            const nextIdx = prev + 1;
            const node = flattenedNodes[nextIdx];
            onSelectNode(node);
            if (node.span) {
              onHighlightSpan(node.span.startLine, node.span.startCol, node.span.endCol);
            }
            triggerExplain(node, level);
            return nextIdx;
          } else {
            setIsWalkthroughPlaying(false);
            return prev;
          }
        });
      }, 4000);
    } else if (walkthroughTimerRef.current) {
      clearInterval(walkthroughTimerRef.current);
      walkthroughTimerRef.current = null;
    }

    return () => {
      if (walkthroughTimerRef.current) {
        clearInterval(walkthroughTimerRef.current);
      }
    };
  }, [isWalkthrough, isWalkthroughPlaying, flattenedNodes, onSelectNode, onHighlightSpan, triggerExplain, level]);

  const copyExplanation = () => {
    if (!explanation) return;
    const text = `${explanation.explanation}\n\nRule: ${explanation.rule}\nAnalogy: ${explanation.analogy}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied explanation');
    setTimeout(() => setCopied(false), 2000);
  };

  // Node details label
  const activeNode = targetType === 'node' ? selectedNode : null;
  const activeLabel = activeNode
    ? `${activeNode.type}${(activeNode as any).name ? ` "${(activeNode as any).name}"` : (activeNode as any).operator ? ` (${(activeNode as any).operator})` : ''}`
    : 'Whole Program';

  const snippet = activeNode ? extractNodeSnippet(activeNode, code) : code;

  return (
    <div className="space-y-4 text-[#1C1917]">
      {/* Walkthrough Header / Bar */}
      {isWalkthrough ? (
        <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-pulse" />
            <span className="text-xs font-semibold text-[#1C1917]">
              Walkthrough
            </span>
            <span className="text-[11px] font-mono text-[#78716C]">
              {walkthroughIndex + 1} / {flattenedNodes.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={prevStep}
              disabled={walkthroughIndex === 0}
              className="p-1 text-[#78716C] hover:text-[#1C1917] hover:bg-white rounded transition-colors disabled:opacity-40"
              title="Previous node"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setIsWalkthroughPlaying(!isWalkthroughPlaying)}
              className="px-2.5 py-1 text-xs font-medium text-white bg-[#6366F1] hover:bg-[#4F46E5] rounded-lg transition-colors flex items-center gap-1"
            >
              {isWalkthroughPlaying ? (
                <>
                  <Pause className="w-3 h-3" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={nextStep}
              disabled={walkthroughIndex === flattenedNodes.length - 1}
              className="p-1 text-[#78716C] hover:text-[#1C1917] hover:bg-white rounded transition-colors disabled:opacity-40"
              title="Next node"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={stopWalkthrough}
              className="p-1 text-[#78716C] hover:text-rose-600 hover:bg-white rounded transition-colors ml-1"
              title="Exit walkthrough"
            >
              <StopCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Target Selector & Level Bar */}
      <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Target Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectWhole}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              targetType === 'whole'
                ? 'bg-stone-100 text-[#1C1917] font-semibold border border-[#E7E5E4]'
                : 'text-[#78716C] hover:text-[#1C1917] hover:bg-stone-50'
            }`}
          >
            Whole Program
          </button>

          {activeNode && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-mono">
              <span>{activeNode.type}</span>
              {activeNode.span && (
                <span className="text-[10px] text-emerald-600">
                  {activeNode.span.startLine}:{activeNode.span.startCol}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Level Toggle & Walkthrough Trigger */}
        <div className="flex items-center gap-2">
          {/* Level Toggle: Beginner | Intermediate | Expert */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-[#E7E5E4]">
            {(['Beginner', 'Intermediate', 'Expert'] as ExplanationLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  setLevel(lvl);
                  triggerExplain(targetType === 'whole' ? 'whole_program' : activeNode, lvl);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  level === lvl
                    ? 'bg-white text-[#1C1917] shadow-2xs'
                    : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Walkthrough Button */}
          {!isWalkthrough && (
            <button
              type="button"
              onClick={startWalkthrough}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Walkthrough</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Explanation Card */}
      <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-2xs space-y-4">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-[#E7E5E4] pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-[#6366F1] shrink-0" />
            <h3 className="text-xs font-semibold text-[#1C1917] truncate">
              {activeLabel}
            </h3>
            {explanation?.cached && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-[#78716C] border border-[#E7E5E4] flex items-center gap-1">
                <Database className="w-2.5 h-2.5" />
                <span>Cached</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => triggerExplain(targetType === 'whole' ? 'whole_program' : activeNode, level)}
              disabled={isStreaming}
              className="p-1.5 text-[#78716C] hover:text-[#1C1917] hover:bg-stone-50 rounded-lg transition-colors disabled:opacity-40"
              title="Regenerate explanation"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isStreaming ? 'animate-spin' : ''}`} />
            </button>

            {explanation && (
              <button
                type="button"
                onClick={copyExplanation}
                className="p-1.5 text-[#78716C] hover:text-[#1C1917] hover:bg-stone-50 rounded-lg transition-colors"
                title="Copy explanation"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#059669]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Snippet Preview */}
        {snippet && (
          <div className="bg-[#FAFAF9] border border-[#E7E5E4] rounded-lg p-2.5 font-mono text-xs text-[#1C1917] overflow-x-auto max-h-24">
            <pre className="whitespace-pre">{snippet.slice(0, 300)}</pre>
          </div>
        )}

        {/* Content Body */}
        {isStreaming && !explanation ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-[#6366F1]">
              <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-ping" />
              <span>Streaming explanation...</span>
            </div>
            <div className="p-3 bg-stone-50 rounded-lg font-sans text-xs text-[#1C1917] leading-relaxed whitespace-pre-wrap min-h-16">
              {streamBuffer || 'Synthesizing semantics...'}
            </div>
          </div>
        ) : explanation ? (
          <div className="space-y-4">
            {/* 1. Explanation (max 3 sentences) */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#78716C] mb-1">
                Explanation
              </div>
              <p className="text-xs text-[#1C1917] leading-relaxed font-sans">
                {explanation.explanation}
              </p>
            </div>

            {/* 2. Grammar Rule Production */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#78716C] mb-1">
                Grammar rule
              </div>
              <div className="px-2.5 py-1.5 bg-stone-50 border border-[#E7E5E4] rounded-lg font-mono text-xs text-[#059669]">
                {explanation.rule}
              </div>
            </div>

            {/* 3. One-line Analogy */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#78716C] mb-1">
                Analogy
              </div>
              <p className="text-xs text-[#78716C] italic font-sans bg-indigo-50/40 border border-indigo-100 rounded-lg p-2.5">
                "{explanation.analogy}"
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-xs text-[#78716C] mb-3">
              Click an AST node or request an explanation.
            </p>
            <button
              type="button"
              onClick={() => triggerExplain(targetType === 'whole' ? 'whole_program' : activeNode, level)}
              className="px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-medium rounded-lg transition-colors"
            >
              Explain Program
            </button>
          </div>
        )}
      </div>

      {/* Program Tree Outline / Quick Picker */}
      <div className="bg-white rounded-xl border border-[#E7E5E4] p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">
            Syntax tree outline
          </span>
          <span className="text-[10px] text-[#78716C]">
            Click node to explain
          </span>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1">
          {flattenedNodes.map((n) => {
            const isSelected = selectedNode?.id === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onSelectNode(n)}
                className={`w-full text-left px-2 py-1 rounded text-xs font-mono flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-300 font-medium'
                    : 'hover:bg-stone-50 text-[#1C1917]'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-[#78716C] text-[10px]">•</span>
                  <span className="font-semibold">{n.type}</span>
                  {(n as any).name && (
                    <span className="text-[#78716C]">"{(n as any).name}"</span>
                  )}
                  {(n as any).operator && (
                    <span className="text-indigo-600">{(n as any).operator}</span>
                  )}
                </div>
                {n.span && (
                  <span className="text-[10px] text-[#78716C] ml-2 shrink-0">
                    {n.span.startLine}:{n.span.startCol}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
