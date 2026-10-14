// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Lexer } from '../core/lexer';
import { parse } from '../core/parser';
import type { ComparisonMetrics } from '../core/compare';
import type { ExplanationContent } from '../ai/explain';
import {
  downloadHTMLReport,
  generateHTMLReport,
  openPrintReport,
  type AnalysisReportData,
} from './reportGenerator';

function reportData(overrides: Partial<AnalysisReportData> = {}): AnalysisReportData {
  const sourceCode = 'int main() { return 0; }';
  return {
    title: 'Test <report> & details',
    sourceCode,
    tokens: new Lexer(sourceCode).tokenize().tokens,
    ast: parse(sourceCode).ast,
    errors: [],
    timestamp: 0,
    ...overrides,
  };
}

describe('HTML analysis reports', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a valid report and escapes user-provided HTML', () => {
    const html = generateHTMLReport(reportData());

    expect(html).toContain('<title>Test &lt;report&gt; &amp; details - Compiler Analysis Report</title>');
    expect(html).toContain('Zero syntax errors detected.');
    expect(html).toContain('int main() { return 0; }');
    expect(html).toContain('Total Tokens');
    expect(html).toContain('Keywords');
    expect(html).toContain('Identifiers');
    expect(html).toContain('Operators / Delimiters');
    expect(html).toContain('Generated');
    expect(html).toContain('AST Structure Hierarchy');
  });

  it('includes diagnostics, repair, comparison, and bounded explanation details', () => {
    const comparison: ComparisonMetrics = {
      treeEditDistance: 2,
      similarity: 0.75,
      sizeA: 4,
      sizeB: 5,
      precision: 0.8,
      recall: 0.7,
      f1: 0.746,
      isExactMatch: false,
      differences: [],
    };
    const explanation: ExplanationContent = {
      explanation: 'Returns <a value> & more',
      rule: 'ReturnStmt -> return Expression ;',
      analogy: 'A & B',
    };
    const errors: AnalysisReportData['errors'] = [
      {
        code: 'E_EXPECTED',
        message: 'Expected <semicolon> & found none',
        line: 2,
        column: 7,
        expected: [';'],
        found: '}',
        severity: 'error',
        recoveryAction: 'Insert semicolon',
      },
      {
        code: 'W_STYLE',
        message: 'Consider a clearer name',
        line: 3,
        column: 1,
        expected: [],
        found: 'x',
        severity: 'warning',
        recoveryAction: 'Rename variable',
      },
    ];
    const explanations = Object.fromEntries(
      Array.from({ length: 4 }, (_, index) => [`node-${index}`, explanation]),
    );
    const html = generateHTMLReport(
      reportData({
        errors,
        repairedCode: 'int main() { return 0; }',
        comparison,
        explanations,
      }),
    );

    expect(html).toContain('Diagnostics &amp; Syntax Errors');
    expect(html).toContain('Expected &lt;semicolon&gt; &amp; found none');
    expect(html).toContain('badge-error');
    expect(html).toContain('AI Syntax Repair Diff');
    expect(html).toContain('Neural vs Classical Comparison');
    expect(html).toContain('75%');
    expect(html).toContain('0.746');
    expect(html).toContain('NO');
    expect(html).toContain('AI Semantic Explanations');
    expect(html).toContain('Returns &lt;a value&gt; &amp; more');
    expect(html.match(/Rule: ReturnStmt/g)).toHaveLength(3);
  });

  it('opens reports for printing only when a popup is available', () => {
    const write = vi.fn();
    const close = vi.fn();
    vi.stubGlobal('window', {
      open: vi.fn(() => ({ document: { write, close } })),
    });

    openPrintReport(reportData());

    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Compiler Analysis Report'));
    expect(close).toHaveBeenCalledOnce();

    vi.stubGlobal('window', { open: vi.fn(() => null) });
    expect(() => openPrintReport(reportData())).not.toThrow();
  });

  it('downloads an HTML blob with the requested filename', () => {
    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadHTMLReport('analysis.html', reportData());

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });
});
