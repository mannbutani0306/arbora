import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { astEngines, type AstEngineId } from '../../ai/engines';
import type { ExplanationContent } from '../../ai/explain';
import { checkAiAvailability, isAiAvailable } from '../../ai/gatewayClient';
import { compareASTs, type ComparisonMetrics } from '../../core/compare';
import { countNodes, getMaxDepth } from '../../core/astUtils';
import { injectSingleTokenError, type ErrorInjectionType } from '../../core/errorInjector';
import { lex } from '../../core/lexer';
import { parse } from '../../core/parser';
import type { SaveAnalysisInput } from '../../lib/dataService';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/toast';
import type { SampleRecord } from '../../lib/supabase';
import type { ASTNode } from '../../types/ast';
import type { PlaygroundOverlays } from './PlaygroundOverlays';
import type { PlaygroundWorkspaceProps } from './PlaygroundWorkspace';
import type { Toolbar } from './Toolbar';
import type { InjectionChoice } from './ErrorInjectionMenu';
import { useAnalysisPersistence, type PlaygroundLoadState } from './useAnalysisPersistence';
import { useEditorBridge } from './useEditorBridge';
import { usePipeline } from './usePipeline';
import { useRepair } from './useRepair';
import type { PlaygroundEngine, PlaygroundMode } from './types';
import type { AnalysisReportData } from '../../lib/reportGenerator';

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
    source_code:
      'int factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}\n',
    difficulty: 'Easy',
  },
  {
    id: 'sample_syntax_broken',
    title: 'Missing Delimiters',
    category: 'Malformed',
    source_code: 'int compute(int x) {\n    if (x > 0 {\n        return x\n    }\n}',
    difficulty: 'Broken',
  },
  {
    id: 'sample_missing_semicolon',
    title: 'Missing Semicolon',
    category: 'Malformed',
    source_code:
      'int add(int left, int right) {\n    int sum = left + right\n    return sum;\n}',
    difficulty: 'Broken',
  },
  {
    id: 'sample_unexpected_token',
    title: 'Unexpected Token',
    category: 'Malformed',
    source_code: 'int main() {\n    int value = 10;\n    return value + ;\n}',
    difficulty: 'Broken',
  },
];
const RANDOM_INJECTION_TYPES: ErrorInjectionType[] = [
  'delete',
  'insert',
  'swap',
  'replace',
  'natural',
];

function isAst(value: unknown): value is ASTNode {
  return typeof value === 'object' && value !== null && 'type' in value && 'children' in value;
}

function isComparisonMetrics(value: unknown): value is ComparisonMetrics {
  return (
    typeof value === 'object' &&
    value !== null &&
    'treeEditDistance' in value &&
    'similarity' in value &&
    'differences' in value
  );
}

function isExplanationMap(value: unknown): value is Record<string, ExplanationContent> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface PlaygroundController {
  toolbarProps: React.ComponentProps<typeof Toolbar>;
  workspaceProps: PlaygroundWorkspaceProps;
  overlayProps: React.ComponentProps<typeof PlaygroundOverlays>;
}

export function usePlaygroundController(): PlaygroundController {
  const location = useLocation();
  const navigate = useNavigate();
  const routerState = location.state as PlaygroundLoadState | null;
  const { user } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState(() => {
    const loadedCode = routerState?.code;
    return loadedCode && new TextEncoder().encode(loadedCode).length <= 20 * 1024
      ? loadedCode
      : DEFAULT_CODE;
  });
  const [title, setTitle] = useState(routerState?.title ?? 'MiniC Analysis');
  const [mode, setMode] = useState<PlaygroundMode>('Strict');
  const [engine, setEngine] = useState<PlaygroundEngine>(() =>
    routerState?.comparison || routerState?.neuralAst ? 'Compare' : 'Classical',
  );
  const [selectedNode, setSelectedNode] = useState<ASTNode | null>(null);
  const [neuralAst, setNeuralAst] = useState<ASTNode | null>(() =>
    isAst(routerState?.neuralAst) ? routerState.neuralAst : null,
  );
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetrics | null>(() =>
    isComparisonMetrics(routerState?.comparison) ? routerState.comparison : null,
  );
  const [isComparing, setIsComparing] = useState(false);
  const [storedExplanations, setStoredExplanations] = useState<Record<string, ExplanationContent>>(
    () => (isExplanationMap(routerState?.explanations) ? routerState.explanations : {}),
  );
  const [groundTruth, setGroundTruth] = useState<{
    original: string;
    type: ErrorInjectionType;
  } | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(
    () => localStorage.getItem('arbora_tour_completed') !== 'true',
  );
  const pipeline = usePipeline(code, mode);
  const repair = useRepair();
  const persistence = useAnalysisPersistence(FALLBACK_SAMPLES);
  const editorBridge = useEditorBridge(pipeline.parseResult, setSelectedNode);
  const injectionSeedRef = useRef(42);
  const skipAutomaticRepairRef = useRef<string | null>(null);
  const lastQuerySampleRef = useRef<string | null>(null);
  const astControllerRef = useRef<AbortController | null>(null);
  const previousEngineRef = useRef(engine);

  useEffect(() => {
    persistence.load(routerState ?? undefined);
    if (routerState) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate, persistence.load, routerState]);

  useEffect(() => {
    if (routerState?.code && new TextEncoder().encode(routerState.code).length > 20 * 1024) {
      toast.error('This analysis exceeds the Playground 20 KB source limit.');
    }
  }, [routerState, toast]);

  useEffect(() => {
    document.title = `${title || 'Playground'} | Arbora`;
    return () => {
      document.title = 'Arbora';
    };
  }, [title]);

  useEffect(() => {
    if (pipeline.parsedSource !== code) return;
    if (skipAutomaticRepairRef.current === code) {
      skipAutomaticRepairRef.current = null;
      return;
    }
    if (mode !== 'Repair' || !pipeline.parseResult?.errors.length) {
      if (mode !== 'Repair') {
        repair.abort();
        repair.clear();
      }
      return;
    }
    void repair
      .run({
        code,
        errors: pipeline.parseResult.errors,
        tokens: pipeline.tokens,
        mode,
        engine,
        userId: user?.id,
        groundTruth: groundTruth?.original,
        errorType: groundTruth?.type,
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') toast.error(error.message);
      });
  }, [
    mode,
    code,
    engine,
    user?.id,
    groundTruth,
    pipeline.parsedSource,
    pipeline.parseResult,
    pipeline.tokens,
    repair.run,
    repair.abort,
    repair.clear,
    toast,
  ]);

  const runNeuralComparison = useCallback(
    async (selectedEngine: PlaygroundEngine = engine) => {
      const source = code;
      const classical = parse(source).ast;
      astControllerRef.current?.abort();
      const controller = new AbortController();
      astControllerRef.current = controller;
      setIsComparing(true);
      try {
        if (!isAiAvailable() && !(await checkAiAvailability())) {
          if (controller.signal.aborted) return;
          setNeuralAst(null);
          setComparisonMetrics(null);
          toast.info('AI offline; deterministic parser remains active.');
          return;
        }
        if (controller.signal.aborted) return;
        const engineId: AstEngineId = selectedEngine === 'Arbora-T5' ? 'arbora-t5' : 'gemini';
        const result = await astEngines[engineId].generate(source, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!result.isValid || !result.ast) {
          toast.error('AST model returned an invalid tree; parser output is unchanged.');
          return;
        }
        setNeuralAst(result.ast);
        setComparisonMetrics(
          compareASTs(classical, result.ast, pipeline.parseDuration, result.latencyMs),
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        toast.info(
          error instanceof Error
            ? `${error.message} Deterministic parser output is unchanged.`
            : 'Model unavailable; deterministic parser output is unchanged.',
        );
      } finally {
        if (astControllerRef.current === controller) {
          astControllerRef.current = null;
          setIsComparing(false);
        }
      }
    },
    [code, engine, pipeline.parseDuration, toast],
  );

  useEffect(() => () => astControllerRef.current?.abort(), []);
  useEffect(() => {
    const controller = astControllerRef.current;
    if (!controller) return;
    controller.abort();
    astControllerRef.current = null;
    setIsComparing(false);
  }, [code, engine]);
  useEffect(() => {
    const changed = previousEngineRef.current !== engine;
    previousEngineRef.current = engine;
    if (changed && ['Gemini', 'Arbora-T5', 'Compare'].includes(engine))
      void runNeuralComparison(engine);
  }, [engine, runNeuralComparison]);

  const run = useCallback(() => {
    pipeline.run(code);
    if (engine === 'Gemini' || engine === 'Arbora-T5' || engine === 'Compare')
      void runNeuralComparison();
  }, [code, engine, pipeline.run, runNeuralComparison]);

  const mountEditor: PlaygroundWorkspaceProps['onMount'] = useCallback(
    (instance, monaco) => {
      editorBridge.mount(instance, monaco);
      instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
    },
    [editorBridge.mount, run],
  );

  const saveInput = useCallback(
    (): SaveAnalysisInput => ({
      id: persistence.lastSavedId ?? undefined,
      title: title.trim() || 'MiniC Analysis',
      source_code: code,
      language: 'c',
      mode: mode.toLowerCase(),
      tokens: pipeline.tokens,
      ast: pipeline.parseResult?.ast,
      errors: pipeline.parseResult?.errors ?? [],
      repaired_code: repair.repairResponse?.bestCandidate?.repairedCode ?? null,
      neural_ast: neuralAst,
      comparison: comparisonMetrics,
      explanations: storedExplanations,
      metrics: {
        tokenCount: pipeline.tokens.length,
        nodeCount: pipeline.parseResult ? countNodes(pipeline.parseResult.ast) : 0,
        maxDepth: pipeline.parseResult ? getMaxDepth(pipeline.parseResult.ast) : 0,
        parseDurationMs: pipeline.parseDuration,
      },
    }),
    [
      title,
      code,
      mode,
      pipeline.tokens,
      pipeline.parseResult,
      pipeline.parseDuration,
      repair.repairResponse,
      neuralAst,
      comparisonMetrics,
      storedExplanations,
      persistence.lastSavedId,
    ],
  );

  const save = useCallback(async () => {
    if (!user) {
      toast.info('Sign in to save this analysis.');
      return;
    }
    try {
      await persistence.save(saveInput(), user.id);
      toast.success('Saved analysis');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save analysis.');
    }
  }, [user, persistence.save, saveInput, toast]);

  const share = useCallback(async () => {
    if (!user) {
      toast.info('Sign in to share this analysis.');
      return;
    }
    try {
      const result = await persistence.share(saveInput(), user.id);
      if (!result.share_slug) throw new Error('Could not create a share link.');
      await navigator.clipboard.writeText(`${window.location.origin}/share/${result.share_slug}`);
      toast.success('Share link copied');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to share analysis.');
    }
  }, [user, persistence.share, saveInput, toast]);

  const exportJson = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            title,
            code,
            tokens: pipeline.tokens,
            ast: pipeline.parseResult?.ast,
            errors: pipeline.parseResult?.errors,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title.toLowerCase().replace(/\s+/g, '_')}_ast.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [title, code, pipeline.tokens, pipeline.parseResult]);

  const onExplanation = useCallback((key: string, content: ExplanationContent) => {
    setStoredExplanations((current) => ({ ...current, [key]: content }));
  }, []);

  const handleCodeChange = useCallback(
    (value: string) => {
      if (new TextEncoder().encode(value).length > 20 * 1024) {
        toast.error('Code limit is 20 KB. Shorten the source before pasting or uploading.');
        return;
      }
      repair.abort();
      repair.clear();
      setGroundTruth(null);
      setCode(value);
    },
    [toast, repair.abort, repair.clear],
  );

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('sample');
    if (!requested || !persistence.samples.length || lastQuerySampleRef.current === requested)
      return;
    const sample = persistence.samples.find(
      ({ id, title: sampleTitle }) =>
        id === requested || sampleTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') === requested,
    );
    if (!sample) return;
    lastQuerySampleRef.current = requested;
    handleCodeChange(sample.source_code);
    setTitle(sample.title);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.search, navigate, persistence.samples, handleCodeChange]);

  const injectError = useCallback(
    (choice: InjectionChoice) => {
      try {
        const seed = injectionSeedRef.current++;
        const selected =
          choice === 'random'
            ? RANDOM_INJECTION_TYPES[seed % RANDOM_INJECTION_TYPES.length]
            : choice;
        const injected = injectSingleTokenError(code, selected, seed);
        if (new TextEncoder().encode(injected.mutated).length > 20 * 1024)
          throw new Error('Injected source exceeds the Playground 20 KB limit.');
        const mutatedResult = parse(injected.mutated);
        if (!mutatedResult.errors.length)
          throw new Error('Injected source unexpectedly parsed without errors.');
        repair.abort();
        repair.clear();
        setGroundTruth({ original: injected.original, type: injected.type });
        skipAutomaticRepairRef.current = injected.mutated;
        setCode(injected.mutated);
        void repair
          .run({
            code: injected.mutated,
            errors: mutatedResult.errors,
            tokens: lex(injected.mutated).tokens,
            mode,
            engine,
            userId: user?.id,
            groundTruth: injected.original,
            errorType: injected.type,
          })
          .catch((error: unknown) => {
            if (error instanceof Error && error.name !== 'AbortError') toast.error(error.message);
          });
        toast.info(`${injected.description}; repair started.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not inject an error.');
      }
    },
    [code, mode, engine, user?.id, repair.run, repair.abort, repair.clear, toast],
  );

  const resetOriginal = useCallback(() => {
    if (!groundTruth) return;
    setCode(groundTruth.original);
    setGroundTruth(null);
    skipAutomaticRepairRef.current = null;
    repair.clear();
  }, [groundTruth, repair.clear]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [run]);

  const reportData: AnalysisReportData = {
    title,
    sourceCode: code,
    tokens: pipeline.tokens,
    ast: pipeline.parseResult?.ast ?? null,
    errors: pipeline.parseResult?.errors ?? [],
    repairedCode: repair.repairResponse?.bestCandidate?.repairedCode,
    comparison: comparisonMetrics,
    explanations: storedExplanations,
  };

  return {
    toolbarProps: {
      title,
      mode,
      engine,
      samples: persistence.samples,
      onTitleChange: setTitle,
      onModeChange: setMode,
      onEngineChange: setEngine,
      onSelectSample: (sample) => {
        handleCodeChange(sample.source_code);
        setTitle(sample.title);
      },
      onRun: run,
      onSave: () => void save(),
      onShare: () => void share(),
      onExport: exportJson,
      onReport: () => setReportModalOpen(true),
      onTour: () => setTourOpen(true),
      onInject: injectError,
      onResetOriginal: groundTruth ? resetOriginal : undefined,
    },
    workspaceProps: {
      code,
      tokens: pipeline.tokens,
      parseResult: pipeline.parseResult,
      response: repair.repairResponse,
      isRepairing: repair.isRepairing,
      neuralAst,
      comparisonMetrics,
      isComparing,
      selectedNode,
      engine,
      groundTruth: groundTruth?.original,
      mode,
      isParsing: pipeline.isParsing,
      parseDuration: pipeline.parseDuration,
      onCodeChange: handleCodeChange,
      onMount: mountEditor,
      onClear: () => handleCodeChange(''),
      onUpload: (file) =>
        void file
          .text()
          .then(handleCodeChange)
          .catch((error: unknown) =>
            toast.error(error instanceof Error ? error.message : 'Unable to read file.'),
          ),
      onJump: editorBridge.jumpToLocation,
      onSelectNode: setSelectedNode,
      onApply: (repaired) => {
        handleCodeChange(repaired);
        repair.clear();
      },
      onRunRepair: () => {
        if (pipeline.parseResult)
          void repair.run({
            code,
            errors: pipeline.parseResult.errors,
            tokens: pipeline.tokens,
            mode,
            engine,
            userId: user?.id,
            groundTruth: groundTruth?.original,
            errorType: groundTruth?.type,
          });
      },
      onRun: run,
      onRunCompare: () => void runNeuralComparison(),
      onExplanation,
    },
    overlayProps: {
      reportOpen: reportModalOpen,
      tourOpen,
      reportData,
      onCloseReport: () => setReportModalOpen(false),
      onCloseTour: () => {
        setTourOpen(false);
        localStorage.setItem('arbora_tour_completed', 'true');
      },
      onRun: run,
      onOpenReport: () => setReportModalOpen(true),
      onStartTour: () => setTourOpen(true),
    },
  };
}
