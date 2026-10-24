import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBeforeFlushHooks } from '../lib/pendingSaveFlush';
import { useDebouncedEmit } from './useDebouncedEmit';

describe('useDebouncedEmit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits the buffered value when a save or quit flushes, before the timer fires', async () => {
    const onEmit = vi.fn();
    const { result } = renderHook(() => useDebouncedEmit(150, onEmit));

    act(() => result.current.schedule('last keystrokes'));
    expect(onEmit).not.toHaveBeenCalled();

    await act(async () => {
      await runBeforeFlushHooks();
    });
    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(onEmit).toHaveBeenCalledWith('last keystrokes');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onEmit).toHaveBeenCalledTimes(1);
  });

  it('emits nothing when the flush finds no pending value', async () => {
    const onEmit = vi.fn();
    renderHook(() => useDebouncedEmit(150, onEmit));
    await act(async () => {
      await runBeforeFlushHooks();
    });
    expect(onEmit).not.toHaveBeenCalled();
  });

  it('does not re-emit a value that was already emitted', async () => {
    const onEmit = vi.fn();
    const { result } = renderHook(() => useDebouncedEmit(150, onEmit));
    act(() => result.current.schedule('same'));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      await runBeforeFlushHooks();
    });
    expect(onEmit).toHaveBeenCalledTimes(1);
  });

  it('stops flushing after unmount, which itself still emits what was pending', async () => {
    const onEmit = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedEmit(150, onEmit));
    act(() => result.current.schedule('pending at unmount'));
    unmount();
    expect(onEmit).toHaveBeenCalledWith('pending at unmount');
    onEmit.mockClear();
    await runBeforeFlushHooks();
    expect(onEmit).not.toHaveBeenCalled();
  });
});
