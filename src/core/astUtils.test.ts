import { describe, expect, it } from 'vitest';
import { buildTreeAtStep, countNodes, findNodeAtPosition } from './astUtils';
import { parse } from './parser';

describe('AST position and trace utilities', () => {
  const result = parse('int main() {\n  int answer = 4 + 2;\n  return answer;\n}');

  it('selects the deepest node containing a source position', () => {
    const node = findNodeAtPosition(result.ast, 2, 20);
    expect(node?.type).toBe('Literal');
    expect(findNodeAtPosition(result.ast, 99, 1)).toBeNull();
  });

  it('builds monotonically growing trees from trace node events', () => {
    let previousCount = 0;
    for (let index = 0; index < result.trace.length; index += 1) {
      const tree = buildTreeAtStep(result.ast, result.trace, index);
      const count = countNodes(tree);
      expect(count).toBeGreaterThanOrEqual(previousCount);
      previousCount = count;
    }
    expect(previousCount).toBe(countNodes(result.ast));
  });
});
