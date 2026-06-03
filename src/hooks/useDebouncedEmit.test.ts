import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedEmit } from './useDebouncedEmit';

describe('useDebouncedEmit', () => {
  it('flushes pending value on unmount so edits are not lost', () => {
    vi.useFakeTimers();
    const onEmit = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedEmit(150, onEmit));

    act(() => {
      result.current.schedule('draft');
    });
    expect(onEmit).not.toHaveBeenCalled();

    unmount();
    expect(onEmit).toHaveBeenCalledWith('draft');

    vi.useRealTimers();
  });

  it('does not emit duplicate values', () => {
    const onEmit = vi.fn();
    const { result } = renderHook(() => useDebouncedEmit(0, onEmit));

    act(() => {
      result.current.flush('same');
      result.current.flush('same');
    });

    expect(onEmit).toHaveBeenCalledTimes(1);
  });
});
