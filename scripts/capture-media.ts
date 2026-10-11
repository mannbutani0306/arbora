import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const baseUrl = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:3000';
const outputDir = resolve('docs/media');

export function getFrameFilename(name: string, index: number): string {
  return `${name}-${String(index + 1).padStart(3, '0')}.png`;
}

async function captureFrames(
  page: import('@playwright/test').Page,
  name: string,
  scrollPositions: number[],
): Promise<void> {
  for (const [index, scrollY] of scrollPositions.entries()) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);
    await page.waitForTimeout(350);
    const filename = getFrameFilename(name, index);
    await page.screenshot({ path: resolve(outputDir, filename) });
    if (index === 0) {
      await page.screenshot({ path: resolve(outputDir, `${name}.png`) });
    }
  }
}

function createGif(name: string): boolean {
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-framerate',
      '1',
      '-i',
      resolve(outputDir, `${name}-%03d.png`),
      '-vf',
      'fps=1,scale=960:-1:flags=lanczos',
      '-loop',
      '0',
      resolve(outputDir, `${name}.gif`),
    ],
    { stdio: 'ignore' },
  );
  return result.status === 0;
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await captureFrames(page, 'hero', [0, 500, 1000]);

    await page.goto(new URL('/playground', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page
      .locator('#playground-split-container')
      .waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(500);
    const skipTour = page.getByRole('button', { name: 'Skip tour', exact: true });
    if (await skipTour.isVisible().catch(() => false)) await skipTour.click();
    await page.getByLabel('Load sample').selectOption('sample_factorial');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.waitForTimeout(600);
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(outputDir, 'playground.png') });
    for (const [index, tab] of ['AST', 'Errors', 'Trace'].entries()) {
      await page.locator(`#playground-tab-${tab}`).click();
      await page.waitForTimeout(500);
      const filename = `playground-${String(index + 1).padStart(3, '0')}.png`;
      await page.screenshot({ path: resolve(outputDir, filename) });
    }

    await page.goto(new URL('/benchmarks', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: resolve(outputDir, 'benchmarks.png') });

    const generated = ['hero', 'playground'].filter(createGif);
    console.log(`Saved screenshots and frame sequences under ${outputDir}.`);
    if (generated.length) {
      console.log(
        `Generated GIFs with ffmpeg: ${generated.map((name) => `${name}.gif`).join(', ')}.`,
      );
    } else {
      console.warn(
        'ffmpeg was unavailable or failed. PNG frame sequences are ready; install ffmpeg and rerun to create hero.gif and playground.gif.',
      );
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
