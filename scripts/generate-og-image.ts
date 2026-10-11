import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderOpenGraphImage } from './ogImage';

const svg = await readFile(resolve('public/og-image.svg'));
const png = await renderOpenGraphImage(svg);
await writeFile(resolve('public/og-image.png'), png);
console.log('Generated 1200 x 630 Open Graph image.');
