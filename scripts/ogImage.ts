import sharp from 'sharp';

export async function renderOpenGraphImage(svg: Buffer): Promise<Buffer> {
  return sharp(svg).png({ compressionLevel: 9 }).toBuffer();
}
