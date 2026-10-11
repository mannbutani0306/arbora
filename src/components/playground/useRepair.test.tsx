// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepair } from './useRepair';

const mockRepairCode = vi.hoisted(() => vi.fn());
vi.mock('../../ai/repair', () => ({ repairCode: mockRepairCode }));

describe('useRepair', () => {
  beforeEach(() => {
    mockRepairCode.mockReset();
  });

  it('aborts the previous request when a new repair starts', async () => {
    const signals: AbortSignal[] = [];
    mockRepairCode.mockImplementation((params?: { signal?: AbortSignal }) => {
      if (params?.signal) signals.push(params.signal);
      return new Promise(() => undefined);
    });
    const { result, unmount } = renderHook(() => useRepair());

    act(() => {
      void result.current.run({ code: 'int a', errors: [], tokens: [], mode: 'Repair', engine: 'Classical' });
    });
    act(() => {
      void result.current.run({ code: 'int b', errors: [], tokens: [], mode: 'Repair', engine: 'Classical' });
    });

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
});
