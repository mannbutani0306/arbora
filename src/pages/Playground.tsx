import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { parse } from '../core/parser';
import { lex } from '../core/lexer';
import { countNodes, findNodeAtPosition, getMaxDepth } from '../core/astUtils';
import { Token, ParseError, ParseResult } from '../types/ast';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/toast';
import {
  saveAnalysis,
  setPublic,
  listSamples,
  SaveAnalysisInput,
} from '../lib/dataService';
import { SampleRecord } from '../lib/supabase';
import {
  Play,
  Bookmark,
  Share2,
  Download,
  FolderOpen,
  Upload,
  Eraser,
  Bug,
  ChevronDown,
  LogIn,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  FileCode,
  Copy,
  ExternalLink,
  Sparkles,
  RefreshCw,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  repairCode,
  getRepairStats,
  RepairResponse,
  RepairCandidate,
  clearRepairStats,
} from '../ai/repair';
import {
  RepairCandidateCard,
  RepairSkeleton,
} from '../components/RepairCandidateCard';
import { astEngines, type AstEngineId, type RepairEngineChoice } from '../ai/engines';
import { checkAiAvailability, isAiAvailable } from '../ai/gatewayClient';
import {
  compareASTs,
  ComparisonMetrics,
} from '../core/compare';
import { CompareView } from '../components/CompareView';
import { ExplainView } from '../components/ExplainView';
import { MetricsView } from '../components/MetricsView';
import { InteractiveAstTree } from '../components/InteractiveAstTree';
import { TracePlayer } from '../components/ast/TracePlayer';
import { ReportModal } from '../components/ReportModal';
import { OnboardingTour } from '../components/OnboardingTour';
import { CommandPalette } from '../components/CommandPalette';
import { ExplanationContent } from '../ai/explain';
import { ASTNode } from '../types/ast';

type Mode = 'Strict' | 'Repair';
type Engine = 'Classical' | 'N-gram' | 'Gemini' | 'Arbora-T5' | 'Ensemble' | 'Compare';
type ActiveTab = 'Tokens' | 'Trace' | 'AST' | 'Errors' | 'Compare' | 'Explain' | 'Metrics';

const DEFAULT_CODE = `// MiniC Sample Program
int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main() {
    int val = 5;
    int result = factorial(val);
    return 0;
}
`;

const FALLBACK_SAMPLES: SampleRecord[] = [
  {
    id: 'sample_factorial',
    title: 'Factorial Function',
    category: 'Algorithms',
    source_code: `int factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}\n\nint main() {\n    int res = factorial(5);\n    return 0;\n}`,
    difficulty: 'Easy',
  },
  {
    id: 'sample_bubble',
    title: 'Bubble Sort',
    category: 'Algorithms',
    source_code: `void sort(int arr[], int n) {\n    for (int i = 0; i < n - 1; i++) {\n        for (int j = 0; j < n - i - 1; j++) {\n            if (arr[j] > arr[j + 1]) {\n                int temp = arr[j];\n                arr[j] = arr[j + 1];\n                arr[j + 1] = temp;\n            }\n        }\n    }\n}`,
    difficulty: 'Medium',
  },
  {
    id: 'sample_syntax_broken',
    title: 'Missing Delimiters',
    category: 'Malformed',
    source_code: `int compute(int x, int y) {\n    int total = x + \n    if (x > 0 {\n        total += 10\n    }\n    return total;\n}`,
    difficulty: 'Broken',
  },
  {
    id: 'sample_unclosed_block',
    title: 'Unclosed Braces',
    category: 'Malformed',
    source_code: `int run() {\n    while (1) {\n        int step = 2;\n    return 0;\n}`,
    difficulty: 'Broken',
  },
  {
    id: 'sample_expressions',
    title: 'Operator Precedence',
    category: 'Expressions',
    source_code: `int eval() {\n    int a = 2 + 3 * 4;\n    bool b = a > 10 && a < 20 || false;\n    return a;\n}`,
    difficulty: 'Easy',
  },
];

export function Playground() {
  const [code, setCode] = useState<string>(() => {
    return sessionStorage.getItem('arbora_load_code') || DEFAULT_CODE;
  });
  const [title, setTitle] = useState<string>(() => {
    return sessionStorage.getItem('arbora_load_title') || 'MiniC Analysis';
  });

  const [mode, setMode] = useState<Mode>('Strict');
  const [engine, setEngine] = useState<Engine>(() => {
    if (
      sessionStorage.getItem('arbora_load_comparison') ||
      sessionStorage.getItem('arbora_load_neural_ast')
    ) {
      return 'Compare';
    }
    return 'Classical';
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (
      sessionStorage.getItem('arbora_load_comparison') ||
      sessionStorage.getItem('arbora_load_neural_ast')
    ) {
      return 'Compare';
    }
    return 'Tokens';
  });

  // Neural AST & Comparison state
  const [neuralAst, setNeuralAst] = useState<ASTNode | null>(() => {
    try {
      const raw = sessionStorage.getItem('arbora_load_neural_ast');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetrics | null>(() => {
    try {
      const raw = sessionStorage.getItem('arbora_load_comparison');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [isComparing, setIsComparing] = useState<boolean>(false);

  // Analysis result state
  const [tokens, setTokens] = useState<Token[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseDuration, setParseDuration] = useState<number>(0);
  const [isParsing, setIsParsing] = useState<boolean>(false);

  // Split-pane dragging
  const [splitRatio, setSplitRatio] = useState<number>(50); // percentage for left pane
  const isDraggingSplitter = useRef(false);

  // Samples dropdown & file input
  const [samples, setSamples] = useState<SampleRecord[]>(FALLBACK_SAMPLES);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const samplesDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monaco editor instance & decor collection
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);

  // Auth & toast
  const { user } = useAuth();
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const [guestActionType, setGuestActionType] = useState<'Save' | 'Share'>('Save');

  // Token hover / highlight state
  const [hoveredTokenIndex, setHoveredTokenIndex] = useState<number | null>(null);

  // Explanation state
  const [selectedNodeForExplanation, setSelectedNodeForExplanation] = useState<ASTNode | null>(null);
  const [storedExplanations, setStoredExplanations] = useState<Record<string, ExplanationContent>>(() => {
    try {
      const raw = sessionStorage.getItem('arbora_load_explanations');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Report modal & Onboarding tour states
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('arbora_tour_completed') !== 'true';
  });

  // Web Worker ref
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);

  // Initialize Web Worker
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL('../core/parserWorker.ts', import.meta.url),
        { type: 'module' }
      );

      workerRef.current.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (data.id === requestIdRef.current) {
          setParseResult(data.parseResult);
          setTokens(data.tokens);
          setParseDuration(data.metrics.durationMs);
          setIsParsing(false);
        }
      };

      workerRef.current.onerror = (err) => {
        console.warn('Worker error, running synchronous fallback:', err);
        runSynchronousParse(code);
        setIsParsing(false);
      };
    } catch {
      // If Web Worker instantiation fails in certain sandboxes, use synchronous
      workerRef.current = null;
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Fetch samples on load
  useEffect(() => {
    // Clear the loaded items after mounting
    sessionStorage.removeItem('arbora_load_code');
    sessionStorage.removeItem('arbora_load_title');
    sessionStorage.removeItem('arbora_load_id');
    sessionStorage.removeItem('arbora_load_neural_ast');
    sessionStorage.removeItem('arbora_load_comparison');
    sessionStorage.removeItem('arbora_load_explanations');

    listSamples()
      .then((items) => {
        if (items && items.length > 0) {
          // Merge items with fallback samples, avoiding duplicates
          const ids = new Set(items.map((i) => i.id));
          const extra = FALLBACK_SAMPLES.filter((f) => !ids.has(f.id));
          setSamples([...items, ...extra]);
        }
      })
      .catch(() => {
        setSamples(FALLBACK_SAMPLES);
      });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        samplesDropdownRef.current &&
        !samplesDropdownRef.current.contains(e.target as Node)
      ) {
        setSamplesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Synchronous parser execution (used when worker is disabled or immediate run)
  const runSynchronousParse = useCallback((src: string) => {
    const start = performance.now();
    try {
      const lexRes = lex(src);
      const pRes = parse(src);
      const end = performance.now();
      setTokens(lexRes.tokens);
      setParseResult(pRes);
      setParseDuration(Math.round((end - start) * 100) / 100);
    } catch (e: any) {
      const end = performance.now();
      setParseDuration(Math.round((end - start) * 100) / 100);
    }
  }, []);

  // Trigger parse via Web Worker with 400ms debounce
  const triggerWorkerParse = useCallback(
    (src: string) => {
      setIsParsing(true);
      const currentReqId = ++requestIdRef.current;

      if (workerRef.current) {
        workerRef.current.postMessage({
          id: currentReqId,
          source: src,
          mode,
        });
      } else {
        runSynchronousParse(src);
        setIsParsing(false);
      }
    },
    [mode, runSynchronousParse]
  );

  // Debounced execution when code changes (400ms debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      triggerWorkerParse(code);
    }, 400);

    return () => clearTimeout(timer);
  }, [code, triggerWorkerParse]);

  // AI Repair state
  const [repairResponse, setRepairResponse] = useState<RepairResponse | null>(null);
  const [isRepairing, setIsRepairing] = useState<boolean>(false);
  const lastRepairedHash = useRef<string>('');
  const repairControllerRef = useRef<AbortController | null>(null);
  const astControllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => {
    repairControllerRef.current?.abort();
    astControllerRef.current?.abort();
  }, []);

  // Neural AST runner & Comparison generator
  const runNeuralComparison = useCallback(
    async (sourceCode?: string, overrideAst?: ASTNode) => {
      const src = sourceCode !== undefined ? sourceCode : code;
      let classicalTree = overrideAst || parseResult?.ast;
      if (!classicalTree) {
        const pRes = parse(src);
        setParseResult(pRes);
        classicalTree = pRes.ast;
      }

      if (!isAiAvailable() && !(await checkAiAvailability())) {
        setNeuralAst(null);
        setComparisonMetrics(null);
        toast.info('AI offline; deterministic parser remains active.');
        return;
      }

      astControllerRef.current?.abort();
      const controller = new AbortController();
      astControllerRef.current = controller;
      setIsComparing(true);
      try {
        const astEngineId: AstEngineId = engine === 'Arbora-T5' ? 'arbora-t5' : 'gemini';
        const astResult = await astEngines[astEngineId].generate(src, { signal: controller.signal });
        if (astResult.isValid && astResult.ast) {
          setNeuralAst(astResult.ast);
          const metrics = compareASTs(
            classicalTree,
            astResult.ast,
            parseDuration,
            astResult.latencyMs
          );
          setComparisonMetrics(metrics);
          toast.success(`${astEngines[astEngineId].label} trees compared`);
        } else {
          toast.error('AST model returned an invalid tree; deterministic parser output is unchanged.');
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        toast.info(err?.code === 'MODEL_COLD_START'
          ? 'Model waking up, retry in 20 s. Deterministic parser output is unchanged.'
          : `${engine === 'Arbora-T5' ? 'Arbora-T5' : 'Gemini'} unavailable; deterministic parser output is unchanged.`);
      } finally {
        if (astControllerRef.current === controller) setIsComparing(false);
      }
    },
    [code, parseResult, parseDuration, toast, engine]
  );

  // Immediate run (e.g., Ctrl+Enter or Run button)
  const handleImmediateRun = useCallback(() => {
    triggerWorkerParse(code);
    toast.info('Ran parser');
    if (engine === 'Gemini' || engine === 'Arbora-T5' || engine === 'Compare') {
      runNeuralComparison(code);
    }
  }, [code, triggerWorkerParse, engine, runNeuralComparison, toast]);

  // Handle engine switcher
  const handleSelectEngine = (newEngine: Engine) => {
    setEngine(newEngine);
    if (newEngine === 'Compare' || newEngine === 'Gemini' || newEngine === 'Arbora-T5') {
      setActiveTab('Compare');
      runNeuralComparison(code);
    } else if (activeTab === 'Compare') {
      setActiveTab('Tokens');
    }
  };

  // AI Repair runner
  const runAiRepair = useCallback(
    async (forced = false) => {
      if (!parseResult || parseResult.errors.length === 0) {
        setRepairResponse(null);
        return;
      }

      const currentHash = `${code}__${parseResult.errors.length}`;
      const selectedEngine: RepairEngineChoice = engine === 'Arbora-T5'
        ? 'arbora-t5'
        : engine === 'Gemini' || engine === 'Compare'
          ? 'gemini'
          : engine === 'N-gram'
            ? 'ngram'
            : engine === 'Ensemble'
              ? 'ensemble'
              : 'classical';
      const fullRequestHash = `${currentHash}__${selectedEngine}`;
      if (!forced && lastRepairedHash.current === fullRequestHash) return;
      lastRepairedHash.current = fullRequestHash;

      repairControllerRef.current?.abort();
      const controller = new AbortController();
      repairControllerRef.current = controller;
      setIsRepairing(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (controller.signal.aborted) return;
        const res = await repairCode({
          sourceCode: code,
          tokens,
          errors: parseResult.errors,
          userId: user?.id,
          engine: selectedEngine,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setRepairResponse(res);
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : 'Repair request failed.');
        }
      } finally {
        if (repairControllerRef.current === controller) setIsRepairing(false);
      }
    },
    [code, parseResult, tokens, user, engine, toast]
  );

  // Trigger repair in Repair mode
  useEffect(() => {
    if (mode === 'Repair' && parseResult && parseResult.errors.length > 0) {
      runAiRepair();
    } else if (mode !== 'Repair') {
      setRepairResponse(null);
    }
  }, [mode, parseResult, runAiRepair]);

  // Apply chosen repair candidate
  const handleApplyRepair = useCallback(
    (repairedCode: string) => {
      setCode(repairedCode);
      setRepairResponse(null);
      lastRepairedHash.current = '';
      toast.success('Applied repair fix');
    },
    [toast]
  );

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleImmediateRun();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleImmediateRun]);

  // Sync Monaco Error Squiggles (Markers) whenever parseResult updates
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    if (!parseResult || !parseResult.errors || parseResult.errors.length === 0) {
      monacoRef.current.editor.setModelMarkers(model, 'minic-parser', []);
      return;
    }

    const markers: editor.IMarkerData[] = parseResult.errors.map((err) => {
      const line = Math.max(1, err.line || 1);
      const col = Math.max(1, err.column || 1);
      return {
        severity:
          err.severity === 'warning'
            ? monacoRef.current!.MarkerSeverity.Warning
            : err.severity === 'info'
            ? monacoRef.current!.MarkerSeverity.Info
            : monacoRef.current!.MarkerSeverity.Error,
        message: err.message,
        startLineNumber: line,
        startColumn: col,
        endLineNumber: line,
        endColumn: col + Math.max(1, (err.found || '').length),
        source: 'MiniC',
      };
    });

    monacoRef.current.editor.setModelMarkers(model, 'minic-parser', markers);
  }, [parseResult]);

  useEffect(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance || !parseResult?.ast) return;
    const disposable = editorInstance.onDidChangeCursorPosition(({ position }) => {
      const node = findNodeAtPosition(parseResult.ast, position.lineNumber, position.column);
      if (node) setSelectedNodeForExplanation(node);
    });
    return () => disposable.dispose();
  }, [parseResult]);

  // Editor Mount
  const handleEditorDidMount: OnMount = (editorInstance, monacoInstance) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;

    // Define custom light theme matching palette
    monacoInstance.editor.defineTheme('arbora-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '059669', fontStyle: 'bold' },
        { token: 'type', foreground: '047857' },
        { token: 'string', foreground: '6366F1' },
        { token: 'number', foreground: '0284C7' },
        { token: 'comment', foreground: 'A8A29E', fontStyle: 'italic' },
        { token: 'delimiter', foreground: '78716C' },
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#1C1917',
        'editorLineNumber.foreground': '#A8A29E',
        'editorLineNumber.activeForeground': '#059669',
        'editor.selectionBackground': '#E7E5E4',
        'editor.inactiveSelectionBackground': '#F5F5F4',
        'editorCursor.foreground': '#059669',
        'editorWhitespace.foreground': '#E7E5E4',
      },
    });

    monacoInstance.editor.setTheme('arbora-light');

    // Add keyboard command for Run (Ctrl+Enter / Cmd+Enter) inside editor
    editorInstance.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      () => {
        handleImmediateRun();
      }
    );
  };

  // Jump to source location
  const jumpToLocation = (line: number, column: number) => {
    if (!editorRef.current) return;
    const safeLine = Math.max(1, line);
    const safeCol = Math.max(1, column);

    editorRef.current.revealPositionInCenter({
      lineNumber: safeLine,
      column: safeCol,
    });
    editorRef.current.setPosition({
      lineNumber: safeLine,
      column: safeCol,
    });
    editorRef.current.focus();

    // Highlight temporarily
    if (monacoRef.current) {
      decorationsRef.current = editorRef.current.deltaDecorations(
        decorationsRef.current,
        [
          {
            range: new monacoRef.current.Range(
              safeLine,
              1,
              safeLine,
              safeCol + 50
            ),
            options: {
              isWholeLine: true,
              className: 'bg-emerald-50 border-l-2 border-emerald-500',
            },
          },
        ]
      );
      setTimeout(() => {
        if (editorRef.current) {
          decorationsRef.current = editorRef.current.deltaDecorations(
            decorationsRef.current,
            []
          );
        }
      }, 1800);
    }
  };

  const jumpToAstNode = (line: number, column: number, endLine = line, endColumn = column + 1) => {
    if (!editorRef.current || !monacoRef.current) return;
    const startLine = Math.max(1, line);
    const startColumn = Math.max(1, column);
    const finishLine = Math.max(startLine, endLine);
    const finishColumn = finishLine === startLine
      ? Math.max(startColumn + 1, endColumn)
      : Math.max(1, endColumn);
    const range = new monacoRef.current.Range(startLine, startColumn, finishLine, finishColumn);
    editorRef.current.revealRangeInCenter(range);
    editorRef.current.setSelection(range);
    editorRef.current.focus();
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [{
      range,
      options: {
        className: 'bg-emerald-100/70 border-b border-emerald-600',
        inlineClassName: 'font-semibold text-emerald-900',
      },
    }]);
  };

  // Highlight token span on table row hover
  const handleTokenHover = (tok: Token | null) => {
    if (!editorRef.current || !monacoRef.current) return;
    if (!tok) {
      decorationsRef.current = editorRef.current.deltaDecorations(
        decorationsRef.current,
        []
      );
      return;
    }

    const startLine = tok.line || tok.span?.start?.line || 1;
    const startCol = tok.column || tok.span?.start?.column || 1;
    const endCol = startCol + Math.max(1, tok.lexeme.length);

    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      [
        {
          range: new monacoRef.current.Range(
            startLine,
            startCol,
            startLine,
            endCol
          ),
          options: {
            className: 'bg-emerald-100/70 border-b border-emerald-600',
            inlineClassName: 'font-semibold text-emerald-800',
          },
        },
      ]
    );
  };

  // Upload file handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (typeof content === 'string') {
        setCode(content);
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
        toast.success(`Uploaded ${file.name}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Clear editor handler
  const handleClear = () => {
    setCode('');
    toast.info('Editor cleared');
  };

  // Inject error (creates a deliberate syntax error to test recovery)
  const handleInjectError = () => {
    const variations = [
      () => setCode((prev) => prev.replace(';', '')),
      () => setCode((prev) => prev.replace('{', '')),
      () => setCode((prev) => prev.replace(')', '')),
      () => setCode((prev) => prev + '\nint broken = 10 + ;'),
    ];
    const inject = variations[Math.floor(Math.random() * variations.length)];
    inject();
    toast.info('Injected error');
  };

  // Compute metrics
  const nodeCount = useMemo(() => {
    return parseResult?.ast ? countNodes(parseResult.ast) : 0;
  }, [parseResult]);

  const maxDepth = useMemo(() => {
    return parseResult?.ast ? getMaxDepth(parseResult.ast) : 0;
  }, [parseResult]);

  const tokenCount = useMemo(() => tokens.length, [tokens]);

  // Grouped samples
  const groupedSamples = useMemo(() => {
    const groups: { [cat: string]: SampleRecord[] } = {};
    for (const s of samples) {
      const cat = s.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [samples]);

  // Save analysis to Supabase
  const handleSave = async () => {
    if (!user) {
      setGuestActionType('Save');
      setGuestPromptOpen(true);
      return;
    }

    setIsSaving(true);
    try {
      const input: SaveAnalysisInput = {
        id: lastSavedId || undefined,
        title: title.trim() || 'MiniC Analysis',
        source_code: code,
        language: 'c',
        mode: mode.toLowerCase(),
        tokens: tokens,
        ast: parseResult?.ast,
        errors: parseResult?.errors || [],
        repaired_code: repairResponse?.bestCandidate?.repairedCode || null,
        neural_ast: neuralAst,
        comparison: comparisonMetrics,
        explanations: storedExplanations,
        metrics: {
          tokenCount,
          nodeCount,
          maxDepth,
          parseDurationMs: parseDuration,
        },
      };

      const saved = await saveAnalysis(input, user.id);
      setLastSavedId(saved.id);
      toast.success('Saved analysis');
    } catch {
      toast.error('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Share analysis (sets public and copies link)
  const handleShare = async () => {
    if (!user) {
      setGuestActionType('Share');
      setGuestPromptOpen(true);
      return;
    }

    setIsSharing(true);
    try {
      let analysisId = lastSavedId;
      if (!analysisId) {
        // Save first if not saved
        const input: SaveAnalysisInput = {
          title: title.trim() || 'MiniC Analysis',
          source_code: code,
          language: 'c',
          mode: mode.toLowerCase(),
          tokens: tokens,
          ast: parseResult?.ast,
          errors: parseResult?.errors || [],
          repaired_code: repairResponse?.bestCandidate?.repairedCode || null,
          neural_ast: neuralAst,
          comparison: comparisonMetrics,
          explanations: storedExplanations,
          metrics: {
            tokenCount,
            nodeCount,
            maxDepth,
            parseDurationMs: parseDuration,
          },
        };
        const saved = await saveAnalysis(input, user.id);
        analysisId = saved.id;
        setLastSavedId(saved.id);
      }

      const { share_slug } = await setPublic(analysisId, true);
      if (share_slug) {
        const shareUrl = `${window.location.origin}/share/${share_slug}`;
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link copied');
      } else {
        toast.error('Could not generate link');
      }
    } catch {
      toast.error('Failed to share');
    } finally {
      setIsSharing(false);
    }
  };

  // Export JSON AST
  const handleExport = () => {
    const exportData = {
      title,
      code,
      tokens,
      ast: parseResult?.ast,
      errors: parseResult?.errors,
      metrics: {
        tokenCount,
        nodeCount,
        maxDepth,
        parseDurationMs: parseDuration,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_ast.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported JSON');
  };

  // Split-pane dragging logic
  const handleMouseDownSplitter = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplitter.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingSplitter.current) return;
      const container = document.getElementById('playground-split-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      if (newWidth >= 20 && newWidth <= 80) {
        setSplitRatio(newWidth);
      }
    };

    const handleMouseUp = () => {
      isDraggingSplitter.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Get token badge styling
  const getTokenBadgeClass = (type: string) => {
    switch (type) {
      case 'KEYWORD':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'IDENTIFIER':
        return 'bg-stone-100 text-stone-700 border-stone-200';
      case 'INT_LITERAL':
      case 'FLOAT_LITERAL':
      case 'NUMBER':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'STRING_LITERAL':
      case 'CHAR_LITERAL':
      case 'STRING':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'OPERATOR':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'DELIMITER':
      case 'PUNCTUATION':
        return 'bg-stone-50 text-stone-600 border-stone-200';
      case 'ERROR':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-stone-100 text-stone-600 border-stone-200';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#FAFAF9] text-[#1C1917]">
      {/* TOP BAR */}
      <div className="h-13 bg-white border-b border-[#E7E5E4] px-4 flex items-center justify-between shrink-0">
        {/* Left: Title + Run + Mode + Engine */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xs font-semibold px-2 py-1 bg-transparent hover:bg-stone-50 focus:bg-white rounded border border-transparent focus:border-[#E7E5E4] focus:outline-none max-w-[160px] truncate"
            title="Analysis Title"
          />

          <div className="h-4 w-px bg-[#E7E5E4]" />

          {/* Run Button */}
          <button
            type="button"
            onClick={handleImmediateRun}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-medium rounded-lg shadow-xs transition-colors"
            title="Run parser (Ctrl+Enter)"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run</span>
          </button>

          {/* Mode Selector */}
          <div id="tour-mode-switch" className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-[#E7E5E4]">
            {(['Strict', 'Repair'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mode === m
                    ? 'bg-white text-[#1C1917] shadow-xs'
                    : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
                title={`Parser mode: ${m}`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Engine Selector */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-[#E7E5E4]">
            {(['Classical', 'N-gram', 'Gemini', 'Arbora-T5', 'Ensemble', 'Compare'] as Engine[]).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => handleSelectEngine(e)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  engine === e
                    ? 'bg-white text-[#1C1917] shadow-xs'
                    : 'text-[#78716C] hover:text-[#1C1917]'
                }`}
                title={{
                  Classical: 'Deterministic single-edit search',
                  'N-gram': 'Classical candidates ranked by a trigram model',
                  Gemini: 'Gemini repair proposals; parser-verified locally',
                  'Arbora-T5': 'Arbora-T5 proposals; parser-verified locally',
                  Ensemble: 'Run all repair engines and merge their proposals',
                  Compare: 'Compare neural AST output with the deterministic parser',
                }[e]}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Save, Share, Export, Report, Tour */}
        <div className="flex items-center gap-2">
          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-stone-50 border border-[#E7E5E4] rounded-lg text-xs font-medium text-[#1C1917] transition-colors"
            title="Save analysis to cloud or local storage"
          >
            <Bookmark className="w-3.5 h-3.5 text-[#78716C]" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-stone-50 border border-[#E7E5E4] rounded-lg text-xs font-medium text-[#1C1917] transition-colors"
            title="Create public link and copy to clipboard"
          >
            <Share2 className="w-3.5 h-3.5 text-[#78716C]" />
            <span>{isSharing ? 'Sharing...' : 'Share'}</span>
          </button>

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-stone-50 border border-[#E7E5E4] rounded-lg text-xs font-medium text-[#1C1917] transition-colors"
            title="Export AST JSON file"
          >
            <Download className="w-3.5 h-3.5 text-[#78716C]" />
            <span>Export</span>
          </button>

          {/* Report Button */}
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-stone-50 border border-[#E7E5E4] rounded-lg text-xs font-medium text-[#1C1917] transition-colors"
            title="Export printable HTML/PDF report"
          >
            <FileText className="w-3.5 h-3.5 text-[#059669]" />
            <span>Report</span>
          </button>

          {/* Tour Button */}
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="p-1.5 text-[#78716C] hover:text-[#1C1917] hover:bg-stone-100 rounded-lg transition-colors"
            title="Start onboarding tour"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Guest Prompt Banner (if guest clicked Save or Share) */}
      {guestPromptOpen && !user && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Sign in to enable saving and sharing analyses across sessions.</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded text-xs font-medium text-amber-900 transition-colors"
            >
              <LogIn className="w-3 h-3" />
              <span>Sign in</span>
            </Link>
            <button
              type="button"
              onClick={() => setGuestPromptOpen(false)}
              className="text-amber-700 hover:text-amber-950 px-1 font-semibold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* SPLIT PANE CONTAINER */}
      <div
        id="playground-split-container"
        className="flex-1 flex min-h-0 relative select-text"
      >
        {/* LEFT PANE: EDITOR & TOOLBAR */}
        <div
          style={{ width: `${splitRatio}%` }}
          className="flex flex-col h-full border-r border-[#E7E5E4] bg-white min-w-[280px]"
        >
          {/* ICON TOOLBAR */}
          <div className="h-10 bg-white border-b border-[#E7E5E4] px-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1">
              {/* Samples Dropdown */}
              <div className="relative" ref={samplesDropdownRef}>
                <button
                  type="button"
                  onClick={() => setSamplesOpen((prev) => !prev)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#1C1917] hover:bg-stone-100 rounded-lg transition-colors border border-transparent hover:border-[#E7E5E4]"
                  title="Load sample programs"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#059669]" />
                  <span>Samples</span>
                  <ChevronDown className="w-3 h-3 text-[#78716C]" />
                </button>

                {samplesOpen && (
                  <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-[#E7E5E4] p-1.5 z-50 max-h-80 overflow-y-auto">
                    {Object.entries(groupedSamples).map(([cat, list]) => (
                      <div key={cat} className="mb-2 last:mb-0">
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#78716C]">
                          {cat}
                        </div>
                        {list.map((s) => {
                          const isBroken =
                            s.difficulty === 'Broken' ||
                            s.difficulty === 'Malformed' ||
                            s.category === 'Edge Cases' ||
                            s.category === 'Malformed';
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setCode(s.source_code);
                                setTitle(s.title);
                                setSamplesOpen(false);
                                toast.info(`Loaded ${s.title}`);
                              }}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-stone-50 flex items-center justify-between text-xs transition-colors group"
                            >
                              <span className="truncate text-[#1C1917] group-hover:text-[#059669]">
                                {s.title}
                              </span>
                              {isBroken && (
                                <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                                  Broken
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".c,.txt,.mc"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-[#78716C] hover:text-[#1C1917] hover:bg-stone-100 rounded-lg transition-colors"
                title="Upload source file (.c, .txt, .mc)"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>

              {/* Clear Button */}
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 text-[#78716C] hover:text-[#1C1917] hover:bg-stone-100 rounded-lg transition-colors"
                title="Clear editor code"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>

              {/* Inject Error */}
              <button
                type="button"
                onClick={handleInjectError}
                className="p-1.5 text-[#78716C] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                title="Inject syntax error to test recovery"
              >
                <Bug className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-[11px] text-[#78716C] font-mono">
              Ctrl+Enter to Run
            </div>
          </div>

          {/* MONACO EDITOR */}
          <div id="tour-editor" className="flex-1 min-h-0 relative">
            <Editor
              height="100%"
              defaultLanguage="c"
              value={code}
              onChange={(value) => setCode(value || '')}
              onMount={handleEditorDidMount}
              theme="arbora-light"
              options={{
                fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace",
                fontSize: 13,
                lineHeight: 20,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                glyphMargin: false,
                folding: true,
                automaticLayout: true,
                renderLineHighlight: 'all',
                suggestOnTriggerCharacters: true,
                tabSize: 4,
              }}
            />
          </div>
        </div>

        {/* SPLITTER HANDLE */}
        <div
          onMouseDown={handleMouseDownSplitter}
          className="w-1.5 hover:w-2 bg-[#E7E5E4] hover:bg-[#059669] cursor-col-resize transition-all z-20 flex items-center justify-center select-none"
          title="Drag to resize pane"
        />

        {/* RIGHT PANE: TABBED RESULTS */}
        <div
          style={{ width: `${100 - splitRatio}%` }}
          className="flex flex-col h-full bg-white min-w-[280px]"
        >
          {/* TAB HEADERS (ONE-WORD LABELS) */}
          <div id="tour-tabs-bar" className="h-10 border-b border-[#E7E5E4] px-2 flex items-center gap-1 bg-[#FAFAF9] shrink-0 overflow-x-auto">
            {(
              (engine === 'Gemini' || engine === 'Arbora-T5' || engine === 'Compare'
                ? ['Tokens', 'Trace', 'AST', 'Errors', 'Compare', 'Explain', 'Metrics']
                : ['Tokens', 'Trace', 'AST', 'Errors', 'Explain', 'Metrics']
              ) as ActiveTab[]
            ).map((tab) => {
              const isActive = activeTab === tab;
              const errorCount =
                parseResult?.errors?.length || 0;
              return (
                <button
                  key={tab}
                  id={tab === 'Explain' ? 'tour-explain-tab' : undefined}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-white text-[#1C1917] shadow-xs border border-[#E7E5E4]'
                      : 'text-[#78716C] hover:text-[#1C1917]'
                  }`}
                  title={`${tab} tab`}
                >
                  <span>{tab}</span>
                  {tab === 'Errors' && errorCount > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700">
                      {errorCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB CONTENT AREA */}
          <div className="flex-1 min-h-0 overflow-auto p-4 bg-[#FAFAF9]">
            {/* TAB: TOKENS */}
            {activeTab === 'Tokens' && (
              <div className="bg-white rounded-xl border border-[#E7E5E4] overflow-hidden shadow-xs">
                {tokens.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-xs text-[#78716C] mb-3">No tokens scanned yet.</p>
                    <button
                      type="button"
                      onClick={handleImmediateRun}
                      className="px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-medium rounded-lg"
                    >
                      Scan Tokens
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono border-collapse">
                      <thead>
                        <tr className="bg-stone-50 border-b border-[#E7E5E4] text-[11px] text-[#78716C]">
                          <th className="py-2 px-3 font-medium w-12 text-center">#</th>
                          <th className="py-2 px-3 font-medium">Type</th>
                          <th className="py-2 px-3 font-medium">Lexeme</th>
                          <th className="py-2 px-3 font-medium text-right">Line:Col</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E7E5E4]/60">
                        {tokens.map((tok, idx) => {
                          const isHovered = hoveredTokenIndex === idx;
                          return (
                            <tr
                              key={`${idx}-${tok.lexeme}-${tok.line}`}
                              onMouseEnter={() => {
                                setHoveredTokenIndex(idx);
                                handleTokenHover(tok);
                              }}
                              onMouseLeave={() => {
                                setHoveredTokenIndex(null);
                                handleTokenHover(null);
                              }}
                              onClick={() => jumpToLocation(tok.line, tok.column)}
                              className={`cursor-pointer transition-colors ${
                                isHovered ? 'bg-emerald-50/70' : 'hover:bg-stone-50'
                              }`}
                            >
                              <td className="py-2 px-3 text-center text-[11px] text-[#78716C]">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`inline-block px-1.5 py-0.5 text-[10px] font-sans font-semibold rounded border ${getTokenBadgeClass(
                                    tok.type
                                  )}`}
                                >
                                  {tok.type}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono font-medium text-[#1C1917] max-w-[200px] truncate">
                                {tok.lexeme === '\n'
                                  ? '\\n'
                                  : tok.lexeme.trim() === ''
                                  ? `'${tok.lexeme}'`
                                  : tok.lexeme}
                              </td>
                              <td className="py-2 px-3 text-right text-[11px] text-[#78716C]">
                                {tok.line}:{tok.column}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB: ERRORS */}
            {activeTab === 'Errors' && (
              <div className="space-y-4">
                {!parseResult || parseResult.errors.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[#E7E5E4] p-8 text-center shadow-xs">
                    <CheckCircle2 className="w-8 h-8 text-[#059669] mx-auto mb-2" />
                    <p className="text-xs text-[#1C1917] font-medium mb-1">
                      No syntax errors detected.
                    </p>
                    <p className="text-xs text-[#78716C] mb-4">
                      Grammar is valid and successfully parsed.
                    </p>
                    <button
                      type="button"
                      onClick={handleInjectError}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-[#1C1917] text-xs font-medium rounded-lg transition-colors"
                    >
                      Inject Error
                    </button>
                  </div>
                ) : (
                  <>
                    {/* If in Repair mode, show AI Candidates */}
                    {mode === 'Repair' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#1C1917]">
                              Repair candidates
                            </span>
                            {repairResponse && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-[#6366F1] border border-indigo-200">
                                {repairResponse.model}
                              </span>
                            )}
                            {repairResponse?.latencyMs !== undefined && (
                              <span className="text-[10px] font-mono text-[#78716C]">
                                {repairResponse.latencyMs}ms
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => runAiRepair(true)}
                            disabled={isRepairing}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#6366F1] hover:text-[#4F46E5] hover:bg-indigo-50 rounded transition-colors disabled:opacity-50"
                            title="Regenerate repair candidates"
                          >
                            <RefreshCw className={`w-3 h-3 ${isRepairing ? 'animate-spin' : ''}`} />
                            <span>Retry</span>
                          </button>
                        </div>

                        {/* Skeleton while waiting */}
                        {isRepairing && <RepairSkeleton />}

                        {/* Fallback message if classical recovery fallback triggered */}
                        {(repairResponse?.fellBackToClassical || repairResponse?.message) && !isRepairing && (
                          <div className="px-3 py-2 bg-stone-100 border border-stone-200 text-xs text-stone-700 rounded-lg flex items-center justify-between">
                            <span>{repairResponse.message ?? 'Fell back to deterministic classical repair.'}</span>
                            <span className="text-[10px] font-mono text-stone-500">
                              {repairResponse.fellBackToClassical ? 'Classical' : 'Notice'}
                            </span>
                          </div>
                        )}

                        {/* Candidate Cards */}
                        {!isRepairing &&
                          repairResponse?.candidates &&
                          repairResponse.candidates.length > 0 && (
                            <div className="space-y-3">
                              {repairResponse.candidates.map((cand, idx) => (
                                <RepairCandidateCard
                                  key={cand.id || idx}
                                  candidate={cand}
                                  index={idx}
                                  originalCode={code}
                                  onApply={handleApplyRepair}
                                />
                              ))}
                            </div>
                          )}
                      </div>
                    )}

                    {/* If in Strict mode, prompt to switch */}
                    {mode === 'Strict' && (
                      <div className="px-3.5 py-2.5 bg-stone-50 border border-[#E7E5E4] rounded-xl flex items-center justify-between text-xs">
                        <span className="text-[#78716C]">
                          Strict mode active. Switch to Repair mode for automatic fixes.
                        </span>
                        <button
                          type="button"
                          onClick={() => setMode('Repair')}
                          className="px-2.5 py-1 text-xs font-medium text-[#6366F1] bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                        >
                          Enable Repair
                        </button>
                      </div>
                    )}

                    {/* Parser Error List */}
                    <div className="bg-white rounded-xl border border-[#E7E5E4] overflow-hidden shadow-xs divide-y divide-[#E7E5E4]">
                      <div className="px-4 py-2.5 bg-stone-50 flex items-center justify-between text-xs">
                        <span className="font-medium text-[#1C1917]">
                          {parseResult.errors.length}{' '}
                          {parseResult.errors.length === 1 ? 'Error' : 'Errors'} Found
                        </span>
                        <span className="text-[11px] text-[#78716C]">
                          Click item to jump to code
                        </span>
                      </div>
                      {parseResult.errors.map((err, idx) => (
                        <div
                          key={idx}
                          onClick={() => jumpToLocation(err.line, err.column)}
                          className="p-3.5 hover:bg-stone-50 cursor-pointer transition-colors flex items-start gap-3 group"
                        >
                          <div className="mt-0.5 shrink-0">
                            {err.severity === 'warning' ? (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-rose-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                  err.severity === 'warning'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {err.severity}
                              </span>
                              <span className="font-mono text-xs font-medium text-[#1C1917]">
                                {err.message}
                              </span>
                              <span className="ml-auto text-[11px] font-mono text-[#78716C] group-hover:text-[#059669]">
                                Line {err.line}:{err.column}
                              </span>
                            </div>

                            {err.recoveryAction && (
                              <div className="text-[11px] text-[#78716C] mt-1 flex items-center gap-1.5">
                                <span className="font-medium text-stone-600">Recovery:</span>
                                <span>{err.recoveryAction}</span>
                              </div>
                            )}

                            {err.expected && err.expected.length > 0 && (
                              <div className="text-[11px] text-[#78716C] mt-0.5">
                                <span className="font-medium text-stone-600">Expected:</span>{' '}
                                <code className="text-[10px] bg-stone-100 px-1 py-0.5 rounded">
                                  {err.expected.join(', ')}
                                </code>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB: TRACE */}
            {activeTab === 'Trace' && (
              parseResult
                ? <TracePlayer parseResult={parseResult} onJumpToSource={jumpToAstNode} />
                : <div className="rounded-xl border border-[#E7E5E4] bg-white p-8 text-center shadow-xs">
                    <p className="mb-3 text-xs text-[#78716C]">Run the parser to build a step-by-step trace.</p>
                    <button type="button" onClick={handleImmediateRun} className="rounded-lg bg-[#059669] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#047857]">Parse Program</button>
                  </div>
            )}

            {/* TAB: AST */}
            {activeTab === 'AST' && (
              <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-[#E7E5E4] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#1C1917]">Abstract syntax tree</span>
                    <span className="text-[10px] font-mono text-[#78716C]">{nodeCount} nodes</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNodeForExplanation(parseResult?.ast || null);
                      setActiveTab('Explain');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#6366F1] hover:text-[#4F46E5] transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Explain AST</span>
                  </button>
                </div>
                {!parseResult || !parseResult.ast ? (
                  <div className="p-8 text-center">
                    <p className="text-xs text-[#78716C] mb-3">No syntax tree available.</p>
                    <button
                      type="button"
                      onClick={handleImmediateRun}
                      className="px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-medium rounded-lg"
                    >
                      Parse AST
                    </button>
                  </div>
                ) : (
                  <InteractiveAstTree
                    node={parseResult.ast}
                    selectedNodeId={selectedNodeForExplanation?.id}
                    onSelectNode={setSelectedNodeForExplanation}
                    onJumpToSource={jumpToAstNode}
                    onExplainNode={(node) => {
                      setSelectedNodeForExplanation(node);
                      setActiveTab('Explain');
                    }}
                  />
                )}
              </div>
            )}

            {/* TAB: COMPARE */}
            {activeTab === 'Compare' && (
              <div className="h-full bg-white rounded-xl border border-[#E7E5E4] overflow-hidden shadow-xs flex flex-col">
                <CompareView
                  classicalAst={parseResult?.ast || null}
                  neuralAst={neuralAst}
                  metrics={comparisonMetrics}
                  isLoading={isComparing}
                  onRunComparison={() => runNeuralComparison(code)}
                  onJumpToSource={jumpToLocation}
                  aiOffline={!isAiAvailable()}
                />
              </div>
            )}

            {/* TAB: EXPLAIN */}
            {activeTab === 'Explain' && (
              <ExplainView
                ast={parseResult?.ast || null}
                code={code}
                selectedNode={selectedNodeForExplanation}
                onSelectNode={(node) => {
                  setSelectedNodeForExplanation(node);
                  if (node?.span) {
                    jumpToLocation(node.span.startLine, node.span.startCol);
                  }
                }}
                onHighlightSpan={(line, col) => {
                  jumpToLocation(line, col);
                }}
                onExplanationGenerated={(cacheKey, content) => {
                  setStoredExplanations((prev) => ({
                    ...prev,
                    [cacheKey]: content,
                  }));
                }}
              />
            )}

            {/* TAB: METRICS */}
            {activeTab === 'Metrics' && (
              <MetricsView
                ast={parseResult?.ast || null}
                code={code}
              />
            )}
          </div>
        </div>
      </div>

      {/* STATUS BAR */}
      <div className="h-7 bg-white border-t border-[#E7E5E4] px-4 flex items-center justify-between text-[11px] font-mono text-[#78716C] shrink-0 select-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
            <span>Tokens: <strong className="text-[#1C1917] font-semibold">{tokenCount}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Nodes: <strong className="text-[#1C1917] font-semibold">{nodeCount}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Depth: <strong className="text-[#1C1917] font-semibold">{maxDepth}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isParsing && (
            <span className="text-[#059669] font-sans">Parsing...</span>
          )}
          <span>{parseDuration} ms</span>
        </div>
      </div>

      {/* REPORT MODAL */}
      <ReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        data={{
          title,
          sourceCode: code,
          tokens,
          ast: parseResult?.ast || null,
          errors: parseResult?.errors || [],
          repairedCode: repairResponse?.bestCandidate?.repairedCode || null,
          comparison: comparisonMetrics,
          explanations: storedExplanations,
        }}
      />

      {/* 4-STEP ONBOARDING TOUR */}
      <OnboardingTour
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
      />

      {/* GLOBAL COMMAND PALETTE */}
      <CommandPalette
        onOpenReport={() => setReportModalOpen(true)}
        onRunCode={handleImmediateRun}
        onOpenSamples={() => setSamplesOpen(true)}
        onStartTour={() => setTourOpen(true)}
      />
    </div>
  );
}
