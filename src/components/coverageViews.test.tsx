// @vitest-environment jsdom
import React from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MetricsView } from './MetricsView';
import { CompareView } from './CompareView';
import { ExplainView } from './ExplainView';
import { InteractiveAstTree } from './InteractiveAstTree';
import { ErrorBoundary } from './ErrorBoundary';
import { ReportModal } from './ReportModal';
import { Tooltip } from './Tooltip';
import { parse } from '../core/parser';
import { compareASTs } from '../core/compare';
import type { RepairLogEntry, RepairStatsSummary } from '../ai/repair';
import type { ExplanationContent } from '../ai/explain';
import type { AnalysisReportData } from '../lib/reportGenerator';

const mocks = vi.hoisted(() => ({
  getRepairStats: vi.fn(),
  clearRepairStats: vi.fn(),
  streamExplainNode: vi.fn(),
  computeExplanationCacheKey: vi.fn(),
  extractNodeSnippet: vi.fn(),
  openPrintReport: vi.fn(),
  downloadHTMLReport: vi.fn(),
  reportClientError: vi.fn(),
  useAuth: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../ai/repair', () => ({
  getRepairStats: mocks.getRepairStats,
  clearRepairStats: mocks.clearRepairStats,
}));
vi.mock('../ai/explain', () => ({
  streamExplainNode: mocks.streamExplainNode,
  computeExplanationCacheKey: mocks.computeExplanationCacheKey,
  extractNodeSnippet: mocks.extractNodeSnippet,
}));
vi.mock('./ast/TreeCanvas', () => ({
  TreeCanvas: ({ view }: { view?: string }) => (
    <div data-testid="tree-canvas" data-view={view ?? 'visual'} />
  ),
}));
vi.mock('../lib/reportGenerator', () => ({
  openPrintReport: mocks.openPrintReport,
  downloadHTMLReport: mocks.downloadHTMLReport,
}));
vi.mock('../lib/observability', () => ({
  reportClientError: mocks.reportClientError,
}));
vi.mock('../lib/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../lib/toast', () => ({
  useToast: () => ({
    info: mocks.toastInfo,
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}));

function repairStats(logs: RepairLogEntry[] = []): RepairStatsSummary {
  return {
    totalAttempts: logs.length,
    verifiedSuccessCount: logs.filter((log) => log.is_verified_success).length,
    verifiedRate: logs.length ? 50 : 0,
    avgLatencyMs: logs.length ? 15 : 0,
    avgCandidates: logs.length ? 2 : 0,
    avgVerifiedCount: logs.length ? 1 : 0,
    logs,
  };
}

const logs: RepairLogEntry[] = [
  {
    id: 'log-1',
    timestamp: 1,
    source_length: 30,
    error_count: 1,
    candidate_count: 2,
    verified_count: 1,
    latency_ms: 10,
    model: 'Gemini',
    is_verified_success: true,
    exact_match: true,
    engine: 'gemini',
  },
  {
    id: 'log-2',
    timestamp: 2,
    source_length: 40,
    error_count: 2,
    candidate_count: 2,
    verified_count: 0,
    latency_ms: 20,
    model: 'Classical',
    is_verified_success: false,
    exact_match: false,
    engine: 'classical',
  },
];

describe('metrics and AST comparison views', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: 'user-1' } });
    mocks.getRepairStats.mockResolvedValue(repairStats(logs));
    mocks.clearRepairStats.mockResolvedValue(undefined);
    mocks.streamExplainNode.mockResolvedValue({
      explanation: 'A function returns a value.',
      rule: 'ReturnStmt -> return Expression ;',
      analogy: 'A result passed to the caller.',
    } satisfies ExplanationContent);
    mocks.computeExplanationCacheKey.mockReturnValue('explanation-key');
    mocks.extractNodeSnippet.mockReturnValue('int main() { return 0; }');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders metrics, applies diff presets, and clears repair statistics', async () => {
    const code = 'int main() { int sum = 1 + 2; return sum; }';
    const { container } = render(<MetricsView ast={parse(code).ast} code={code} />);

    expect(screen.getByText('Code metrics')).toBeTruthy();
    expect((await screen.findAllByText('50%')).length).toBeGreaterThan(0);
    expect(screen.getByText('2 ground-truth attempts')).toBeTruthy();
    expect(container.querySelectorAll('textarea')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Loop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Operator' }));
    fireEvent.click(screen.getByRole('button', { name: 'Function' }));
    expect(mocks.toastInfo).toHaveBeenCalledWith('Applied diff preset');

    mocks.getRepairStats.mockResolvedValueOnce(repairStats());
    fireEvent.click(screen.getByRole('button', { name: 'Clear my stats' }));

    await waitFor(() => expect(mocks.clearRepairStats).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledWith('Cleared repair stats'));
    expect(await screen.findByText('No syntax repair attempts recorded yet.')).toBeTruthy();
  });

  it('notifies the user if repair statistics cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getRepairStats.mockRejectedValueOnce(new Error('storage unavailable'));

    render(<MetricsView ast={null} code="" />);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'Unable to load repair statistics',
    ));
  });

  it('shows AI loading and offline states and starts a retry', () => {
    const run = vi.fn();
    const ast = parse('int main() { return 0; }').ast;
    const { rerender } = render(
      <CompareView
        classicalAst={ast}
        neuralAst={null}
        metrics={null}
        isLoading
        onRunComparison={run}
      />,
    );
    expect(screen.getByText('Synthesizing Neural AST…')).toBeTruthy();

    rerender(
      <CompareView
        classicalAst={ast}
        neuralAst={null}
        metrics={null}
        isLoading={false}
        onRunComparison={run}
        aiOffline
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(run).toHaveBeenCalledOnce();
    expect(screen.getByText('AI Offline')).toBeTruthy();
  });

  it('renders comparison metrics and re-runs a populated AST comparison', () => {
    const ast = parse('int main() { return 0; }').ast;
    const run = vi.fn();
    render(
      <CompareView
        classicalAst={ast}
        neuralAst={ast}
        metrics={compareASTs(ast, ast)}
        isLoading={false}
        onRunComparison={run}
      />,
    );

    expect(screen.getByText('Exact Match')).toBeTruthy();
    expect(screen.getByText('Yes', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByTitle('Re-run comparison'));
    expect(run).toHaveBeenCalledOnce();
  });

  it('explains the program, supports levels, and walks the AST', async () => {
    const code = 'int main() { return 0; }';
    const ast = parse(code).ast;
    const onSelectNode = vi.fn();
    const onHighlightSpan = vi.fn();
    const onExplanationGenerated = vi.fn();
    render(
      <ExplainView
        ast={ast}
        code={code}
        selectedNode={null}
        onSelectNode={onSelectNode}
        onHighlightSpan={onHighlightSpan}
        onExplanationGenerated={onExplanationGenerated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Explain Program' }));
    expect(await screen.findByText('A function returns a value.')).toBeTruthy();
    expect(mocks.streamExplainNode).toHaveBeenCalledWith({
      node: 'whole_program',
      fullCode: code,
      level: 'Intermediate',
      userId: 'user-1',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Expert' }));
    await waitFor(() => expect(mocks.streamExplainNode).toHaveBeenCalledTimes(2));
    expect(onExplanationGenerated).toHaveBeenCalledWith(
      'explanation-key',
      expect.objectContaining({ rule: 'ReturnStmt -> return Expression ;' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Walkthrough' }));
    expect(screen.getByText(/1 \/ /)).toBeTruthy();
    fireEvent.click(screen.getByTitle('Next node'));
    expect(onSelectNode).toHaveBeenCalled();
    expect(onHighlightSpan).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByTitle('Exit walkthrough'));
    expect(screen.queryByText(/1 \/ /)).toBeNull();
  });

  it('reports empty ASTs and explanation request failures', async () => {
    const onSelectNode = vi.fn();
    const onHighlightSpan = vi.fn();
    render(
      <ExplainView
        ast={null}
        code=""
        selectedNode={null}
        onSelectNode={onSelectNode}
        onHighlightSpan={onHighlightSpan}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Walkthrough' }));
    expect(mocks.toastInfo).toHaveBeenCalledWith('No AST nodes found');

    mocks.streamExplainNode.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Explain Program' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'Explanation request failed',
    ));
  });

  it('switches AST views and selects, explains, collapses, and jumps from the outline', () => {
    const ast = parse('int main() { return 0; }').ast;
    const onSelectNode = vi.fn();
    const onExplainNode = vi.fn();
    const onJumpToSource = vi.fn();
    render(
      <InteractiveAstTree
        node={ast}
        onSelectNode={onSelectNode}
        onExplainNode={onExplainNode}
        selectedNodeId={ast.id}
        activeNodeId={ast.children[0]?.id}
        onJumpToSource={onJumpToSource}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Program' }));
    expect(screen.queryByText('FunctionDecl', { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Program' }));

    const functionLabel = screen.getByText('FunctionDecl', { exact: true });
    const functionButton = functionLabel.closest('button');
    if (!functionButton) throw new Error('Function node is not selectable.');
    fireEvent.click(functionButton);
    expect(onSelectNode).toHaveBeenCalled();
    expect(onJumpToSource).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Explain Program' }));
    expect(onExplainNode).toHaveBeenCalledWith(ast);

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByTestId('tree-canvas').getAttribute('data-view')).toBe('json');
    fireEvent.click(screen.getByRole('button', { name: 'Bracketed' }));
    expect(screen.getByTestId('tree-canvas').getAttribute('data-view')).toBe('bracketed');
    fireEvent.click(screen.getByRole('button', { name: 'DOT' }));
    expect(screen.getByTestId('tree-canvas').getAttribute('data-view')).toBe('dot');
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }));
    expect(screen.getByTestId('tree-canvas').getAttribute('data-view')).toBe('visual');
  });

  it('exports reports, closes the modal, and catches render failures', () => {
    const ast = parse('int main() { return 0; }').ast;
    const data: AnalysisReportData = {
      title: 'Fixture',
      sourceCode: 'int main() { return 0; }',
      tokens: [],
      ast,
      errors: [],
    };
    const onClose = vi.fn();
    const { rerender } = render(
      <ReportModal isOpen={false} onClose={onClose} data={data} />,
    );
    expect(screen.queryByText('Export analysis report')).toBeNull();

    rerender(<ReportModal isOpen onClose={onClose} data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download HTML' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print / PDF' }));
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(mocks.downloadHTMLReport).toHaveBeenCalledWith(
      expect.stringMatching(/^arbora_report_\d+\.html$/),
      data,
    );
    expect(mocks.openPrintReport).toHaveBeenCalledWith(data);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('HTML report downloaded');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Print window opened');
    expect(onClose).toHaveBeenCalledOnce();

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function BrokenChild(): ReactNode {
      throw new Error('render failure');
    }
    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong.')).toBeTruthy();
    expect(mocks.reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render failure' }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it('opens tooltips on pointer and focus and supports each placement', async () => {
    const placements = [
      ['top', 'bottom-full'],
      ['bottom', 'top-full'],
      ['left', 'right-full'],
      ['right', 'left-full'],
    ] as const;
    const { rerender } = render(
      <Tooltip content="Helpful detail" position="top">
        <button type="button">Target</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Target' });
    fireEvent.mouseEnter(trigger.parentElement!);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Helpful detail');

    for (const [position, placementClass] of placements) {
      rerender(
        <Tooltip content="Helpful detail" position={position}>
          <button type="button">Target</button>
        </Tooltip>,
      );
      expect(screen.getByRole('tooltip').className).toContain(placementClass);
    }

    fireEvent.mouseLeave(trigger.parentElement!);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    fireEvent.focus(trigger.parentElement!);
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    fireEvent.blur(trigger.parentElement!);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });
});
