import { describe, expect, it } from 'vitest';
import { getFrameFilename } from './capture-media';

describe('capture media frame filenames', () => {
  it('uses stable one-based, zero-padded filenames', () => {
    expect(getFrameFilename('hero', 0)).toBe('hero-001.png');
    expect(getFrameFilename('playground', 9)).toBe('playground-010.png');
  });
});
