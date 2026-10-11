import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateResultsSection, replaceGeneratedResults } from './readme-results';

describe('README results generation', () => {
  it('renders the measured reports and their distinct denominators', async () => {
    const [quickText, baselineText] = await Promise.all([
      readFile(resolve('ml/results/evaluation_baselines.json'), 'utf8'),
      readFile(resolve('results/baselines.json'), 'utf8'),
    ]);
    const section = generateResultsSection(JSON.parse(quickText), JSON.parse(baselineText));

    expect(section).toContain('30 corrupted test cases from 26 source programs');
    expect(section).toContain('505 generated corruption cases');
    expect(section).toContain('37.0% (187/505)');
    expect(section).toContain('95% bootstrap intervals');
  });

  it('replaces only the marked result section and rejects missing markers', () => {
    const document =
      'before\n<!-- BEGIN GENERATED RESULTS -->\nold\n<!-- END GENERATED RESULTS -->\nafter';

    expect(replaceGeneratedResults(document, 'new')).toBe(
      'before\n<!-- BEGIN GENERATED RESULTS -->\nnew\n<!-- END GENERATED RESULTS -->\nafter',
    );
    expect(() => replaceGeneratedResults('no markers', 'new')).toThrow(/marker pair/);
  });

  it('rejects malformed or incomplete result input', () => {
    expect(() => generateResultsSection({}, {})).toThrow();
  });
});
