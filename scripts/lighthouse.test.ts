import { describe, expect, it } from 'vitest';
import { getLighthouseBudgetIssues } from './lighthouseBudgets';

describe('Lighthouse budgets', () => {
  it('accepts scores at the minimums and scripts within the Landing budget', () => {
    expect(
      getLighthouseBudgetIssues(
        { performance: 0.85, accessibility: 0.95, 'best-practices': 0.95, seo: 0.9 },
        200 * 1024,
        true,
      ),
    ).toEqual([]);
  });

  it('reports every score and script-size budget violation', () => {
    expect(
      getLighthouseBudgetIssues(
        { performance: 0.84, accessibility: 0.94, 'best-practices': 0.94, seo: 0.89 },
        200 * 1024 + 1,
        true,
      ),
    ).toHaveLength(4);
  });

  it('does not apply the Landing script budget to lazy-loaded routes', () => {
    expect(
      getLighthouseBudgetIssues(
        { performance: 0.85, accessibility: 0.95, 'best-practices': 0.95, seo: 0.9 },
        500 * 1024,
        false,
      ),
    ).toEqual([]);
  });
});
