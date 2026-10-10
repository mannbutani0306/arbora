/**
 * HTML/PDF Report generation utility for compiler analyses.
 * Compiles:
 * - Token summary
 * - AST tree structure
 * - Syntax errors list
 * - Repair diff
 * - Comparison metrics
 * - AI explanations
 */

import { Token, ASTNode, ParseError } from '../types/ast';
import { ComparisonMetrics } from '../core/compare';
import { ExplanationContent } from '../ai/explain';

export interface AnalysisReportData {
  title: string;
  sourceCode: string;
  tokens: Token[];
  ast: ASTNode | null;
  errors: ParseError[];
  repairedCode?: string | null;
  comparison?: ComparisonMetrics | null;
  explanations?: Record<string, ExplanationContent> | null;
  timestamp?: number;
}

export function generateHTMLReport(data: AnalysisReportData): string {
  const {
    title,
    sourceCode,
    tokens,
    ast,
    errors,
    repairedCode,
    comparison,
    explanations,
    timestamp = Date.now(),
  } = data;

  const dateStr = new Date(timestamp).toLocaleString();

  // Token breakdown
  const tokenCounts: Record<string, number> = {};
  for (const t of tokens) {
    tokenCounts[t.type] = (tokenCounts[t.type] || 0) + 1;
  }

  // Escape HTML helper
  const esc = (str: string) =>
    (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)} - Compiler Analysis Report</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #FAFAF9;
      color: #1C1917;
      margin: 0;
      padding: 32px;
      line-height: 1.5;
    }
    .container { max-width: 860px; margin: 0 auto; background: #FFFFFF; padding: 40px; border-radius: 12px; border: 1px solid #E7E5E4; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px 0; color: #1C1917; }
    .meta { font-size: 12px; color: #78716C; margin-bottom: 28px; }
    h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #78716C; border-bottom: 1px solid #E7E5E4; padding-bottom: 6px; margin: 24px 0 12px 0; }
    pre { font-family: "JetBrains Mono", ui-monospace, Menlo, Monaco, Consolas, monospace; font-size: 12px; background: #FAFAF9; border: 1px solid #E7E5E4; padding: 12px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; }
    .badge { display: inline-block; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 4px; border: 1px solid #E7E5E4; background: #FAFAF9; margin: 2px; }
    .badge-success { background: #ECFDF5; border-color: #A7F3D0; color: #065F46; }
    .badge-error { background: #FFF1F2; border-color: #FECDD3; color: #9F1239; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #E7E5E4; }
    th { font-size: 11px; text-transform: uppercase; color: #78716C; background: #FAFAF9; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 12px 0; }
    .card { background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 8px; padding: 12px; }
    .card-title { font-size: 11px; color: #78716C; }
    .card-val { font-size: 18px; font-weight: 600; font-family: monospace; color: #1C1917; margin-top: 4px; }
    @media print {
      body { background: #FFFFFF; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <h1>${esc(title)}</h1>
        <div class="meta">Generated ${esc(dateStr)} • Arbora Compiler Analysis</div>
      </div>
      <button class="no-print" onclick="window.print()" style="padding: 8px 16px; background: #059669; color: #FFF; border: none; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer;">
        Print / Save PDF
      </button>
    </div>

    <h2>Source Code</h2>
    <pre>${esc(sourceCode)}</pre>

    <h2>Token Summary</h2>
    <div class="grid">
      <div class="card">
        <div class="card-title">Total Tokens</div>
        <div class="card-val">${tokens.length}</div>
      </div>
      <div class="card">
        <div class="card-title">Keywords</div>
        <div class="card-val">${tokenCounts['KEYWORD'] || 0}</div>
      </div>
      <div class="card">
        <div class="card-title">Identifiers</div>
        <div class="card-val">${tokenCounts['IDENTIFIER'] || 0}</div>
      </div>
      <div class="card">
        <div class="card-title">Operators / Delimiters</div>
        <div class="card-val">${(tokenCounts['OPERATOR'] || 0) + (tokenCounts['DELIMITER'] || 0)}</div>
      </div>
    </div>

    <h2>Diagnostics &amp; Syntax Errors</h2>
    ${
      errors.length === 0
        ? '<div style="padding: 12px; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; font-size: 12px; color: #065F46;">Zero syntax errors detected. Program is grammatically valid.</div>'
        : `<table>
            <thead><tr><th>Line:Col</th><th>Severity</th><th>Message</th></tr></thead>
            <tbody>
              ${errors
                .map(
                  (err) => `<tr>
                    <td style="font-family: monospace;">${err.line}:${err.column}</td>
                    <td><span class="badge ${err.severity === 'warning' ? '' : 'badge-error'}">${esc(err.severity)}</span></td>
                    <td>${esc(err.message)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>`
    }

    ${
      repairedCode
        ? `<h2>AI Syntax Repair Diff</h2>
           <pre style="background: #F0FDF4; border-color: #BBF7D0;">${esc(repairedCode)}</pre>`
        : ''
    }

    ${
      comparison
        ? `<h2>Neural vs Classical Comparison</h2>
           <div class="grid">
             <div class="card">
               <div class="card-title">Tree Edit Distance (TED)</div>
               <div class="card-val">${comparison.treeEditDistance}</div>
             </div>
             <div class="card">
               <div class="card-title">Similarity Score</div>
               <div class="card-val">${Math.round(comparison.similarity * 100)}%</div>
             </div>
             <div class="card">
               <div class="card-title">F1 Match</div>
               <div class="card-val">${comparison.f1.toFixed(3)}</div>
             </div>
             <div class="card">
               <div class="card-title">Exact Match</div>
               <div class="card-val">${comparison.isExactMatch ? 'YES' : 'NO'}</div>
             </div>
           </div>`
        : ''
    }

    ${
      explanations && Object.keys(explanations).length > 0
        ? `<h2>AI Semantic Explanations</h2>
           ${Object.values(explanations)
             .slice(0, 3)
             .map(
               (exp) => `
             <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
               <div style="font-size: 12px; font-weight: 500; color: #1C1917; margin-bottom: 4px;">${esc(exp.explanation)}</div>
               <div style="font-size: 11px; font-family: monospace; color: #059669; margin-bottom: 2px;">Rule: ${esc(exp.rule)}</div>
               <div style="font-size: 11px; font-style: italic; color: #78716C;">Analogy: "${esc(exp.analogy)}"</div>
             </div>`
             )
             .join('')}`
        : ''
    }

    ${
      ast
        ? `<h2>AST Structure Hierarchy</h2>
           <pre style="max-height: 360px; overflow-y: auto;">${esc(JSON.stringify(ast, null, 2))}</pre>`
        : ''
    }
  </div>
</body>
</html>`;
}

export function openPrintReport(data: AnalysisReportData): void {
  const html = generateHTMLReport(data);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

export function downloadHTMLReport(filename: string, data: AnalysisReportData): void {
  const html = generateHTMLReport(data);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
