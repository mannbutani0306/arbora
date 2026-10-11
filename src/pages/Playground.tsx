import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parse } from '../core/parser';
import { compareASTs } from '../core/compare';
import { countNodes, getMaxDepth } from '../core/astUtils';
import { astEngines, type AstEngineId } from '../ai/engines';
import { checkAiAvailability, isAiAvailable } from '../ai/gatewayClient';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/toast';
import type { SaveAnalysisInput } from '../lib/dataService';
import type { SampleRecord } from '../lib/supabase';
import type { ASTNode } from '../types/ast';
import { PlaygroundWorkspace } from '../components/playground/PlaygroundWorkspace';
import { Toolbar } from '../components/playground/Toolbar';
import { PlaygroundOverlays } from '../components/playground/PlaygroundOverlays';
import { useAnalysisPersistence, type PlaygroundLoadState } from '../components/playground/useAnalysisPersistence';
import { useEditorBridge } from '../components/playground/useEditorBridge';
import { usePipeline } from '../components/playground/usePipeline';
import { useRepair } from '../components/playground/useRepair';
import type { PlaygroundEngine, PlaygroundMode } from '../components/playground/types';
import type { ExplanationContent } from '../ai/explain';

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
const FALLBACK_SAMPLES: SampleRecord[] = [];

function isAst(value: unknown): value is ASTNode {
  return typeof value === 'object' && value !== null && 'type' in value && 'children' in value;
}

export function Playground() {
  const location = useLocation();
  const navigate = useNavigate();
  const routerState = location.state as PlaygroundLoadState | null;
  const { user } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState(routerState?.code ?? DEFAULT_CODE);
  const [title, setTitle] = useState(routerState?.title ?? 'MiniC Analysis');
  const [mode, setMode] = useState<PlaygroundMode>('Strict');
  const [engine, setEngine] = useState<PlaygroundEngine>('Classical');
  const [selectedNode, setSelectedNode] = useState<ASTNode | null>(null);
  const [neuralAst, setNeuralAst] = useState<ASTNode | null>(() => isAst(routerState?.neuralAst) ? routerState.neuralAst : null);
  const [comparisonMetrics, setComparisonMetrics] = useState<ReturnType<typeof compareASTs> | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [storedExplanations, setStoredExplanations] = useState<Record<string, ExplanationContent>>({});
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => localStorage.getItem('arbora_tour_completed') !== 'true');
  const pipeline = usePipeline(code, mode);
  const repair = useRepair();
  const persistence = useAnalysisPersistence(FALLBACK_SAMPLES);
  const editorBridge = useEditorBridge(pipeline.parseResult, setSelectedNode);

  useEffect(() => {
    persistence.load(routerState ?? undefined);
    if (routerState) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate, persistence.load, routerState]);

  useEffect(() => {
    document.title = `${title || 'Playground'} | Arbora`;
    return () => { document.title = 'Arbora'; };
  }, [title]);

  useEffect(() => {
    if (mode !== 'Repair' || !pipeline.parseResult?.errors.length) {
      if (mode !== 'Repair') repair.clear();
      return;
    }
    void repair.run({
      code,
      errors: pipeline.parseResult.errors,
      tokens: pipeline.tokens,
      mode,
      engine,
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') toast.error(error.message);
    });
  }, [mode, code, engine, pipeline.parseResult, pipeline.tokens, repair.run, repair.clear, toast]);

  const runNeuralComparison = useCallback(async () => {
    const source = code;
    const classical = pipeline.parseResult?.ast ?? parse(source).ast;
    if (!isAiAvailable() && !(await checkAiAvailability())) {
      setNeuralAst(null);
      setComparisonMetrics(null);
      toast.info('AI offline; deterministic parser remains active.');
      return;
    }
    setIsComparing(true);
    try {
      const engineId: AstEngineId = engine === 'Arbora-T5' ? 'arbora-t5' : 'gemini';
      const result = await astEngines[engineId].generate(source);
      if (!result.isValid || !result.ast) {
        toast.error('AST model returned an invalid tree; parser output is unchanged.');
        return;
      }
      setNeuralAst(result.ast);
      setComparisonMetrics(compareASTs(classical, result.ast, pipeline.parseDuration, result.latencyMs));
    } catch (error) {
      toast.info(error instanceof Error ? `${error.message} Deterministic parser output is unchanged.` : 'Model unavailable; deterministic parser output is unchanged.');
    } finally {
      setIsComparing(false);
    }
  }, [code, engine, pipeline.parseResult, pipeline.parseDuration, toast]);

  const run = useCallback(() => {
    pipeline.run(code);
    if (engine === 'Gemini' || engine === 'Arbora-T5' || engine === 'Compare') {
      void runNeuralComparison();
    }
  }, [code, engine, pipeline.run, runNeuralComparison]);

  const saveInput = useCallback((): SaveAnalysisInput => ({
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
  }), [title, code, mode, pipeline.tokens, pipeline.parseResult, pipeline.parseDuration, repair.repairResponse, neuralAst, comparisonMetrics, storedExplanations]);

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
    const blob = new Blob([JSON.stringify({ title, code, tokens: pipeline.tokens, ast: pipeline.parseResult?.ast, errors: pipeline.parseResult?.errors }, null, 2)], { type: 'application/json' });
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

  const reportData = {
    title,
    sourceCode: code,
    tokens: pipeline.tokens,
    ast: pipeline.parseResult?.ast ?? null,
    errors: pipeline.parseResult?.errors ?? [],
    repairedCode: repair.repairResponse?.bestCandidate?.repairedCode,
    comparison: comparisonMetrics,
    explanations: storedExplanations,
  };

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

  return <main className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-[#FAFAF9] text-[#1C1917]">
    <Toolbar
      title={title}
      mode={mode}
      engine={engine}
      samples={persistence.samples}
      onTitleChange={setTitle}
      onModeChange={setMode}
      onEngineChange={(value) => { setEngine(value); if (value === 'Gemini' || value === 'Arbora-T5' || value === 'Compare') void runNeuralComparison(); }}
      onSelectSample={(sample) => { setCode(sample.source_code); setTitle(sample.title); }}
      onRun={run}
      onSave={() => void save()}
      onShare={() => void share()}
      onExport={exportJson}
      onReport={() => setReportModalOpen(true)}
      onTour={() => setTourOpen(true)}
    />
    <PlaygroundWorkspace
      code={code}
      tokens={pipeline.tokens}
      parseResult={pipeline.parseResult}
      response={repair.repairResponse}
      isRepairing={repair.isRepairing}
      neuralAst={neuralAst}
      comparisonMetrics={comparisonMetrics}
      isComparing={isComparing}
      selectedNode={selectedNode}
      engine={engine}
      mode={mode}
      isParsing={pipeline.isParsing}
      parseDuration={pipeline.parseDuration}
      onCodeChange={setCode}
      onMount={editorBridge.mount}
      onClear={() => setCode('')}
      onUpload={(file) => void file.text().then(setCode).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to read file.'))}
      onJump={editorBridge.jumpToLocation}
      onSelectNode={setSelectedNode}
      onApply={(repaired) => { setCode(repaired); repair.clear(); }}
      onRunRepair={() => { if (pipeline.parseResult) void repair.run({ code, errors: pipeline.parseResult.errors, tokens: pipeline.tokens, mode, engine }); }}
      onRunCompare={() => void runNeuralComparison()}
      onExplanation={onExplanation}
    />
    <PlaygroundOverlays
      reportOpen={reportModalOpen}
      tourOpen={tourOpen}
      reportData={reportData}
      onCloseReport={() => setReportModalOpen(false)}
      onCloseTour={() => {
        setTourOpen(false);
        localStorage.setItem('arbora_tour_completed', 'true');
      }}
      onRun={run}
      onOpenReport={() => setReportModalOpen(true)}
      onStartTour={() => setTourOpen(true)}
    />
  </main>;
}
