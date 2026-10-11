// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from '../../core/parser';
import { computeTreeLayout, serializeTreeSvg, TreeCanvas } from './TreeCanvas';
import { TracePlayer } from './TracePlayer';

const ast = parse('int main() { int value = 1; return value; }').ast;
afterEach(cleanup);

describe('TreeCanvas', () => {
  it('renders controls and changes between all three layouts', () => {
    render(<TreeCanvas ast={ast} />);
    const selector = screen.getByLabelText('Tree layout');
    expect(selector).toBeTruthy();
    fireEvent.change(selector, { target: { value: 'horizontal' } });
    expect((selector as HTMLSelectElement).value).toBe('horizontal');
    fireEvent.change(selector, { target: { value: 'radial' } });
    expect((selector as HTMLSelectElement).value).toBe('radial');
  });

  it('collapses and expands subtrees', () => {
    render(<TreeCanvas ast={ast} />);
    const button = screen.getByRole('button', { name: `Collapse ${ast.type}` });
    fireEvent.click(button);
    expect(screen.queryByLabelText(/FunctionDecl int main/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Expand ${ast.type}` }));
    expect(screen.getAllByLabelText(/FunctionDecl/).length).toBeGreaterThan(0);
  });

  describe('TracePlayer', () => {
    it('steps through parser events with controls and keyboard input', () => {
      const parsed = parse('int main() { return 0; }');
      render(<TracePlayer parseResult={parsed} />);
      expect(screen.getByText(`Step 1 / ${parsed.trace.length}`)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
      expect(screen.getByText(`Step 2 / ${parsed.trace.length}`)).toBeTruthy();
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText(`Step 1 / ${parsed.trace.length}`)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    });
  });

  it('highlights search matches and cycles to subsequent matches', () => {
    render(<TreeCanvas ast={ast} />);
    const search = screen.getByLabelText('Search AST');
    fireEvent.change(search, { target: { value: 'value' } });
    expect(screen.getByText('1/2')).toBeTruthy();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('serializes a well-formed, self-contained SVG document', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = '<g><text>Program</text></g>';
    const serialized = serializeTreeSvg(svg, 100, 80);
    const parsed = new DOMParser().parseFromString(serialized, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(parsed.documentElement.getAttribute('width')).toBe('100');
  });
});

describe('tree layout performance', () => {
  it('lays out a 1,500-node tree within the 250 ms development budget', () => {
    let id = 0;
    const root = {
      ...ast,
      children: Array.from({ length: 1499 }, (_, index) => ({
        id: `perf_${id++}`,
        type: index % 2 === 0 ? 'Identifier' as const : 'Literal' as const,
        name: `value_${index}`,
        value: index,
        raw: String(index),
        literalType: 'int' as const,
        span: { startLine: index + 1, startCol: 1, endLine: index + 1, endCol: 5 },
        children: [],
      })),
    };
    const started = performance.now();
    const layout = computeTreeLayout(root, 'vertical', new Set(), { width: 1000, height: 600 });
    const elapsed = performance.now() - started;
    console.info(`1,500-node layout: ${elapsed.toFixed(1)} ms (budget: 250 ms)`);
    expect(layout.nodes).toHaveLength(1500);
    expect(elapsed).toBeLessThan(250);
  });
});
