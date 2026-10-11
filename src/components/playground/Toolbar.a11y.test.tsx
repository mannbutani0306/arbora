// @vitest-environment jsdom
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

describe('Playground toolbar accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <Toolbar
        title="Test program"
        mode="Strict"
        engine="Classical"
        samples={[]}
        onTitleChange={vi.fn()}
        onModeChange={vi.fn()}
        onEngineChange={vi.fn()}
        onSelectSample={vi.fn()}
        onRun={vi.fn()}
        onSave={vi.fn()}
        onShare={vi.fn()}
        onExport={vi.fn()}
        onReport={vi.fn()}
        onTour={vi.fn()}
        onInject={vi.fn()}
      />,
    );

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
