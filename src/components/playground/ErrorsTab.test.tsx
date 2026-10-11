// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepairCandidate, RepairResponse } from '../../ai/repair';
import { parse } from '../../core/parser';
import { ToastProvider } from '../../lib/toast';
import { ErrorsTab } from './ErrorsTab';

const validCode = 'int main() { return 0; }';
const candidate: RepairCandidate = {
  id: 'repair-1',
  description: 'Restore the original program',
  edits: [],
  repairedCode: validCode,
  confidence: 0.9,
  rationale: 'A closing expression was restored.',
  verified: true,
  editDistance: 1,
  remainingErrors: [],
  engineId: 'classical',
};

const response: RepairResponse = {
  candidates: [candidate],
  verifiedCandidate: candidate,
  bestCandidate: candidate,
  fellBackToClassical: false,
  latencyMs: 1,
  model: 'Classical',
};

describe('ErrorsTab', () => {
  afterEach(() => cleanup());
  it('shows parse validity separately from ground-truth correctness', () => {
    const parsedBrokenCode = parse('int main() { return 0 }');
    render(
      <ToastProvider>
        <ErrorsTab
          code="int main() { return 0 }"
          parseResult={parsedBrokenCode}
          response={response}
          isRepairing={false}
          groundTruth={validCode}
          onApply={vi.fn()}
          onRunRepair={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.getByText('Verified', { exact: true })).toBeTruthy();
    expect(screen.getByText('Matches original', { exact: true })).toBeTruthy();
    expect(screen.getByText('Same AST', { exact: true })).toBeTruthy();
  });

  it('never labels an unverified candidate as Verified', () => {
    const unverified: RepairCandidate = {
      ...candidate,
      id: 'repair-invalid',
      repairedCode: 'int main( {',
      verified: false,
      remainingErrors: parse('int main( {').errors,
    };
    render(
      <ToastProvider>
        <ErrorsTab
          code="int main() { return 0 }"
          parseResult={parse('int main() { return 0 }')}
          response={{
            ...response,
            candidates: [unverified],
            verifiedCandidate: null,
            bestCandidate: unverified,
          }}
          isRepairing={false}
          groundTruth={validCode}
          onApply={vi.fn()}
          onRunRepair={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.getByText('Unverified', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Verified', { exact: true })).toBeNull();
  });
});
