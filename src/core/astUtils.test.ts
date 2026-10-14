import { describe, expect, it } from 'vitest';
import {
  astToBracketedString,
  astToDot,
  astToJSON,
  buildTreeAtStep,
  countNodes,
  findNodeAtPosition,
  getMaxDepth,
  getNodeLabel,
} from './astUtils';
import { parse } from './parser';
import type { ASTNode } from '../types/ast';

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

  it('serializes, labels, and exports a control-flow AST', () => {
    const parsed = parse(`int main() {
  int i = 0;
  int values[2];
  if (i < 2) { i++; } else { i--; }
  while (i < 3) { i = i + 1; }
  for (i = 0; i < 2; i++) { values[i] = i; }
  do { i--; } while (i > 0);
  return i;
}`);
    expect(parsed.errors).toEqual([]);

    const bracketed = astToBracketedString(parsed.ast);
    const dot = astToDot(parsed.ast);

    expect(bracketed).toContain('(IfStmt');
    expect(bracketed).toContain('(WhileStmt');
    expect(bracketed).toContain('(ForStmt');
    expect(bracketed).toContain('(DoWhileStmt');
    expect(bracketed).toContain('(AssignExpr');
    expect(dot).toContain('digraph MiniCAST');
    expect(dot).toContain('->');
    expect(astToJSON(parsed.ast, false)).not.toContain('\n');
    expect(JSON.parse(astToJSON(parsed.ast))).toMatchObject({ type: 'Program' });
    expect(getMaxDepth(parsed.ast)).toBeGreaterThan(1);

    const nodes: ASTNode[] = [];
    const visit = (node: ASTNode) => {
      nodes.push(node);
      node.children.forEach(visit);
    };
    visit(parsed.ast);
    expect(nodes.every((node) => getNodeLabel(node).length > 0)).toBe(true);
  });

  it('handles traces with missing node IDs and an unfinished active path', () => {
    const root = result.ast;
    const tree = buildTreeAtStep(
      root,
      [
        { event: 'consume', stepIndex: 0, ruleApplied: 'token', depth: 0, stack: [], lookahead: 'int' },
        { event: 'enter', stepIndex: 1, ruleApplied: 'function', depth: 1, stack: [], lookahead: 'main', nodeId: root.children[0]?.id },
        { event: 'enter', stepIndex: 2, ruleApplied: 'unknown', depth: 2, stack: [], lookahead: '', nodeId: 'unknown' },
      ],
      2,
    );

    expect(tree.active).toBe(false);
    expect(countNodes(tree)).toBe(2);
  });
});
