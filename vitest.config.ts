import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 4,
    exclude: ['supabase/**', 'tests/e2e/**', 'node_modules/**', 'dist/**', 'coverage/**'],
    coverage: {
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        lines: 75,
        'src/core/**': { lines: 90 },
        'src/ai/**': { lines: 80 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
