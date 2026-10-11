import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import type { RunnerResult } from 'lighthouse';
import { preview } from 'vite';
import { getLighthouseBudgetIssues } from './lighthouseBudgets';

const baseUrl = 'http://127.0.0.1:4173';
const routes = ['/', '/playground', '/benchmarks'];
const categories = ['performance', 'accessibility', 'best-practices', 'seo'] as const;
type LighthouseReport = RunnerResult['lhr'];

function getScriptTransferSize(report: LighthouseReport): number {
  const details = report.audits['resource-summary']?.details;
  if (!details || !('items' in details) || !Array.isArray(details.items)) {
    throw new Error('Lighthouse report has no script resource summary.');
  }
  return details.items.reduce((total, item) => {
    if (!item || typeof item !== 'object') return total;
    const row = item as Record<string, unknown>;
    return row.resourceType === 'script' && typeof row.transferSize === 'number'
      ? total + row.transferSize
      : total;
  }, 0);
}

function getScores(report: LighthouseReport): Record<string, number> {
  return Object.fromEntries(
    categories.map((category) => [category, report.categories[category]?.score ?? 0]),
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const server = await preview({
  logLevel: 'error',
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
const chrome = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox'],
});

const failures: string[] = [];
try {
  await mkdir(resolve('lhci-reports'), { recursive: true });
  for (const route of routes) {
    const reportRuns: Array<{
      scores: Record<string, number>;
      scriptBytes: number;
    }> = [];
    for (let run = 1; run <= 3; run += 1) {
      const result = await lighthouse(
        `${baseUrl}${route}`,
        {
          port: chrome.port,
          output: 'json',
          onlyCategories: [...categories],
          formFactor: 'desktop',
          throttlingMethod: 'provided',
          screenEmulation: {
            mobile: false,
            width: 1280,
            height: 900,
            deviceScaleFactor: 1,
            disabled: true,
          },
        },
      );
      if (!result) throw new Error(`Lighthouse returned no report for ${route}.`);
      reportRuns.push({
        scores: getScores(result.lhr),
        scriptBytes: getScriptTransferSize(result.lhr),
      });
      await writeFile(
        resolve('lhci-reports', `${route === '/' ? 'landing' : route.slice(1)}-${run}.json`),
        Array.isArray(result.report) ? result.report.join('\n') : result.report,
      );
    }

    const scores = Object.fromEntries(
      categories.map((category) => [
        category,
        median(reportRuns.map((run) => run.scores[category])),
      ]),
    );
    const largestScriptTotal = Math.max(...reportRuns.map((run) => run.scriptBytes));
    const issues = getLighthouseBudgetIssues(scores, largestScriptTotal, route === '/');
    console.log(
      `${route}: ${Object.entries(scores)
        .map(([category, score]) => `${category}=${score.toFixed(2)}`)
        .join(', ')}; scripts=${largestScriptTotal} bytes`,
    );
    failures.push(...issues.map((issue) => `${route}: ${issue}`));
  }
} finally {
  await chrome.kill();
  await new Promise<void>((resolveClose, reject) => {
    server.httpServer.close((error) => (error ? reject(error) : resolveClose()));
  });
}

if (failures.length) {
  throw new Error(`Lighthouse budgets failed:\n${failures.join('\n')}`);
}
