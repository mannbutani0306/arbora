import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderOpenGraphImage } from './ogImage';

describe('Open Graph image generation', () => {
  it('renders the Arbora artwork as a 1200 by 630 PNG', async () => {
    const svg = await readFile(resolve('public/og-image.svg'));
    const png = await renderOpenGraphImage(svg);
    const metadata = await sharp(png).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 1200, height: 630 });
  });
});
