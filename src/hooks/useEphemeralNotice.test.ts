import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEphemeralNotice } from './useEphemeralNotice';

describe('useEphemeralNotice', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows and auto-clears a notice after the default duration', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEphemeralNotice(1000));

    act(() => {
      result.current.showNotice('Saved');
    });
    expect(result.current.notice).toBe('Saved');

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.notice).toBe('Saved');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.notice).toBeNull();
  });

  it('clears notice immediately when clearNotice is called', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEphemeralNotice());

    act(() => {
      result.current.showNotice('Pending');
      result.current.clearNotice();
    });
    expect(result.current.notice).toBeNull();
  });

  it('resets the timer when showNotice is called again', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEphemeralNotice(500));

    act(() => {
      result.current.showNotice('First');
      vi.advanceTimersByTime(400);
      result.current.showNotice('Second', 500);
    });
    expect(result.current.notice).toBe('Second');

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.notice).toBe('Second');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.notice).toBeNull();
  });

  it('clears pending timer on unmount', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useEphemeralNotice(500));

    act(() => {
      result.current.showNotice('Bye');
    });
    unmount();

    expect(() => {
      vi.advanceTimersByTime(500);
    }).not.toThrow();
  });
});
