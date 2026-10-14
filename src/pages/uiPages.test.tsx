// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axe from 'axe-core';

const mocks = vi.hoisted(() => ({
  listAnalyses: vi.fn(),
  deleteAnalysis: vi.fn(),
  renameAnalysis: vi.fn(),
  setPublic: vi.fn(),
  getPublicBySlug: vi.fn(),
  loadEvaluationReports: vi.fn(),
  useAuth: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/dataService', () => ({
  listAnalyses: mocks.listAnalyses,
  deleteAnalysis: mocks.deleteAnalysis,
  renameAnalysis: mocks.renameAnalysis,
  setPublic: mocks.setPublic,
  getPublicBySlug: mocks.getPublicBySlug,
}));
vi.mock('../lib/evaluationResults', () => ({
  loadEvaluationReports: mocks.loadEvaluationReports,
  exportRowsAsCsv: (rows: Array<Record<string, unknown>>) =>
    [Object.keys(rows[0] ?? {}).join(','), ...rows.map((row) => Object.values(row).join(','))].join(
      '\n',
    ),
}));
vi.mock('../lib/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../lib/toast', () => ({ useToast: () => mocks.toast }));

import { Splash } from '../components/Splash';
import { Landing } from './Landing';
import { Auth } from './Auth';
import { History } from './History';
import { Share } from './Share';
import { Benchmarks } from './Benchmarks';
import { Docs } from './Docs';
import { Research } from './Research';

const analysis = {
  id: 'analysis-1',
  title: 'Example tree',
  source_code: 'int main() { return 0; }',
  ast: { type: 'Program', children: [] },
  created_at: '2026-01-01T00:00:00.000Z',
  share_slug: null,
  is_public: false,
  language: 'minic',
  metrics: {},
};

function renderRoute(node: React.ReactNode, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}>{node}</MemoryRouter>);
}

describe('React pages and shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: null, isConfigured: true });
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the splash for two seconds once per session', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<Splash onComplete={onComplete} />);
    expect(screen.getByText('Arbora')).toBeTruthy();
    vi.advanceTimersByTime(1999);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(251);
    expect(sessionStorage.getItem('arbora_splash_seen')).toBe('true');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('renders Landing and is axe-clean', async () => {
    const { container } = renderRoute(<Landing />);
    expect(screen.getByRole('heading', { name: 'Code, grown into trees.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open results/ })).toBeTruthy();
    expect(
      (await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })).violations,
    ).toEqual([]);
  });

  it('validates sign-up password length before calling auth', async () => {
    renderRoute(<Auth />);
    fireEvent.click(screen.getByRole('button', { name: 'Need an account? Sign up' }));
    expect(screen.getByLabelText('Password').getAttribute('minLength')).toBe('8');
    expect(screen.getByLabelText('Email').getAttribute('required')).not.toBeNull();
  });

  it('supports history rename and delete against the data service', async () => {
    mocks.listAnalyses.mockResolvedValue([analysis]);
    mocks.renameAnalysis.mockResolvedValue(undefined);
    mocks.deleteAnalysis.mockResolvedValue(undefined);
    renderRoute(<History />);
    await screen.findByText('Example tree');
    fireEvent.click(screen.getByTitle('Rename'));
    fireEvent.change(screen.getByDisplayValue('Example tree'), {
      target: { value: 'Renamed tree' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Renamed tree');
    expect(mocks.renameAnalysis).toHaveBeenCalledWith('analysis-1', 'Renamed tree');
    fireEvent.click(screen.getByTitle('Delete analysis'));
    await waitFor(() => expect(mocks.deleteAnalysis).toHaveBeenCalledWith('analysis-1'));
    await screen.findByText('No saved syntax trees yet.');
  });

  it('renders share loading, not-found, and loaded states', async () => {
    let finish!: (record: typeof analysis | null) => void;
    mocks.getPublicBySlug.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <MemoryRouter initialEntries={['/share/example']}>
        <Routes>
          <Route path="/share/:slug" element={<Share />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading shared analysis...')).toBeTruthy();
    finish(null);
    await screen.findByText('Analysis not found or private.');
    cleanup();
    mocks.getPublicBySlug.mockResolvedValue(analysis);
    render(
      <MemoryRouter initialEntries={['/share/example']}>
        <Routes>
          <Route path="/share/:slug" element={<Share />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Example tree');
  });

  it('reads benchmark reports through the backend result loader', async () => {
    mocks.loadEvaluationReports.mockResolvedValue({ reports: [], source: 'supabase' });
    const { container } = renderRoute(<Benchmarks />);
    expect(await screen.findByText('No published model results are available yet.')).toBeTruthy();
    expect(mocks.loadEvaluationReports).toHaveBeenCalled();
    expect(
      (await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })).violations,
    ).toEqual([]);
  });

  it('renders committed reports when the backend is unavailable', async () => {
    const interval = { estimate: 0.75, lower: 0.5, upper: 1, n: 4 };
    mocks.loadEvaluationReports.mockResolvedValue({
      source: 'committed',
      reports: [{
        task: 'repair',
        dataset: 'committed-test',
        n_test: 4,
        seed: 42,
        git_sha: 'abc123',
        models: {
          'Fixture model': {
            metrics: {
              top1_exact: interval,
              top3_exact: interval,
              top1_ast_match: interval,
              top3_ast_match: interval,
              verified: interval,
            },
            by_error_type: {},
            by_size_bucket: {},
            latency_ms: { mean: 12, median: 10, p95: 20 },
            parameter_count: 100,
            n_cases: 4,
          },
        },
      }],
    });
    renderRoute(<Benchmarks />);
    expect(await screen.findByText(/committed result files/)).toBeTruthy();
    expect(screen.getByRole('row', { name: /Fixture model/ })).toBeTruthy();
    expect(screen.getAllByText(/n_test: 4/).length).toBeGreaterThan(0);
  });

  it('renders validated research data and exports model rows in both formats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          task: 'repair',
          dataset: 'fixture',
          n_test: 2,
          models: {
            'Measured baseline': {
              metrics: {
                top1_exact: { estimate: 0.5, lower: null, upper: null, n: 2 },
              },
              by_error_type: {},
              by_size_bucket: {},
              latency_ms: { mean: null, median: null, p95: null },
              parameter_count: 10,
              n_cases: 2,
            },
          },
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          split_seed: 42,
          train_programs: 8,
          test_programs: 2,
          metrics: {},
        }), { status: 200 })),
    );
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:research');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    renderRoute(<Research />);

    expect(screen.getByText('Loading research results…')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Evidence for MiniC repair' })).toBeTruthy();
    expect(screen.getByText('50.0%')).toBeTruthy();
    expect(screen.getByText('Not reported')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('shows a clear error when research data cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    );

    renderRoute(<Research />);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Evaluation results unavailable (503).',
    );
  });

  it('renders grammar documentation and is axe-clean', async () => {
    const { container } = renderRoute(<Docs />);
    expect(screen.getByRole('heading', { name: 'Compiler docs' })).toBeTruthy();
    const header = container.querySelector('h1')?.parentElement?.parentElement;
    if (!header) throw new Error('Documentation header was not rendered.');
    expect(
      (await axe.run(header, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })).violations,
    ).toEqual([]);
  }, 30_000);

  it('keeps the authentication form accessible', async () => {
    const { container } = renderRoute(<Auth />);
    expect(
      (await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })).violations,
    ).toEqual([]);
  }, 30_000);
});
