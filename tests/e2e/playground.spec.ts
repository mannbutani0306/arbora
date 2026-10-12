import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    axe: {
      run(
        context: Element,
        options?: { runOnly?: { type: string; values: string[] } },
      ): Promise<{ violations: Array<{ id: string }> }>;
    };
  }
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => console.error('Browser page error:', error));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('Browser console error:', message.text());
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('arbora_splash_seen', 'true');
    localStorage.setItem('arbora_tour_completed', 'true');
  });
  await page.route('**/rest/v1/samples**', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'sample_factorial',
          title: 'Factorial Function',
          category: 'Test',
          source_code: 'int main() { return 0; }',
          difficulty: 'Easy',
        },
      ],
    });
  });
  await page.route('**/rest/v1/model_evaluations**', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/analyses**', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/functions/v1/ai-gateway', async (route) => {
    await route.fulfill({
      json: {
        candidates: [
          {
            id: 'gateway-repair',
            repairedCode: 'int main() { return 0; }',
            confidence: 0.9,
            description: 'Restore the removed token',
            rationale: 'The parser reports the missing terminator.',
            verified: false,
            remainingErrors: [],
            engineId: 'gemini',
          },
        ],
      },
    });
  });
  await page.route('**/auth/v1/**', async (route) => {
    if (route.request().url().includes('token?grant_type=password')) {
      await route.fulfill({
        json: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'user@example.invalid',
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        },
      });
    } else {
      await route.fulfill({ json: {} });
    }
  });
  await page.route('https://fonts.googleapis.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
});

test('Playground sample, parsing, injection, and verified repair flow', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: 'Code, grown into trees.' })).toBeVisible();
  await page.getByRole('link', { name: /Open Playground/ }).click();
  await expect(page.getByRole('main')).toBeVisible();
  const editor = page.locator('.monaco-editor');
  await expect(editor.locator('.view-line').first()).toContainText('MiniC Sample Program');
  await expect
    .poll(() => editor.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(100);
  await page.getByLabel('Load sample').selectOption('sample_factorial');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Tokens/ })).toBeVisible();
  await page.getByLabel('Error injection type').selectOption('delete');
  await page.getByRole('button', { name: 'Inject' }).click();
  await expect(page.getByRole('tab', { name: /Errors/ })).toBeVisible();
  await expect(page.getByText('Ground truth:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Apply', exact: true }).first().click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('No parser errors found.')).toBeVisible();
});

test('built-in malformed samples display parser errors', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: 'Code, grown into trees.' })).toBeVisible();
  await page.getByRole('link', { name: /Open Playground/ }).click();
  await expect(page.getByRole('main')).toBeVisible();

  for (const [sampleId, title] of [
    ['sample_missing_semicolon', 'Missing Semicolon'],
    ['sample_unexpected_token', 'Unexpected Token'],
  ]) {
    await page.getByLabel('Load sample').selectOption(sampleId);
    await expect(page.getByLabel('Analysis title')).toHaveValue(title);
    const errorsTab = page.getByRole('tab', { name: /Errors \(\d+\)/ });
    await expect(errorsTab).toBeVisible();
    await errorsTab.click();
    await expect(page.getByRole('status').filter({ hasText: 'parser error' })).toBeVisible();
  }
});

test('Research and Benchmarks render with committed/offline fallbacks', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/research', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: 'Evidence for MiniC repair' })).toBeVisible();
  await page.goto('/benchmarks', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: 'Benchmarks' })).toBeVisible();
  await expect(page.getByText('Source:', { exact: false })).toBeVisible();
});

test('share page reports a missing public snapshot', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/rest/v1/rpc/get_public_analysis**', async (route) => {
    await route.fulfill({ json: null });
  });
  await page.goto('/share/missing-e2e', { waitUntil: 'commit' });
  await expect(page.getByText('Analysis not found or private.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Playground' })).toBeVisible();
});

test('supports command palette navigation and mocked sign-in', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/', { waitUntil: 'commit' });
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Type a command or navigate...').fill('Open Playground');
  await page
    .getByRole('button', { name: /Open Playground/ })
    .last()
    .click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.goto('/auth', { waitUntil: 'commit' });
  await page.getByLabel('Email').fill('user@example.invalid');
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
});

test('axe checks the primary user-facing routes', async ({ page }) => {
  test.setTimeout(120_000);
  const axeScript = await readFile(resolve('node_modules/axe-core/axe.min.js'), 'utf8');
  for (const route of ['/', '/playground', '/benchmarks', '/docs', '/auth']) {
    await page.goto(route, { waitUntil: 'commit' });
    await page.addScriptTag({ content: axeScript });
    const violations = await page.evaluate(async (currentRoute) => {
      const context =
        currentRoute === '/docs'
          ? document.querySelector('main h1')?.parentElement?.parentElement ?? document.body
          : document.body;
      const results = await window.axe.run(context, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return results.violations.map(({ id }) => id);
    }, route);
    expect(violations, `axe violations at ${route}`).toEqual([]);
  }
});
