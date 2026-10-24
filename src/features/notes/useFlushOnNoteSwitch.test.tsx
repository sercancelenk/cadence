import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFlushOnNoteSwitch } from './useFlushOnNoteSwitch';

describe('useFlushOnNoteSwitch', () => {
  it('does not flush on the first render', () => {
    const flush = vi.fn(async () => undefined);
    renderHook(() => useFlushOnNoteSwitch('a', flush));
    expect(flush).not.toHaveBeenCalled();
  });

  it('flushes once each time the selected note changes', () => {
    const flush = vi.fn(async () => undefined);
    const { rerender } = renderHook(({ id }) => useFlushOnNoteSwitch(id, flush), {
      initialProps: { id: 'a' as string | null },
    });

    rerender({ id: 'b' });
    expect(flush).toHaveBeenCalledTimes(1);

    rerender({ id: 'b' });
    expect(flush).toHaveBeenCalledTimes(1);

    rerender({ id: null });
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('flushes when the notes view goes away', () => {
    const flush = vi.fn(async () => undefined);
    const { unmount } = renderHook(() => useFlushOnNoteSwitch('a', flush));
    unmount();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('uses the latest flush function when it is replaced between renders', () => {
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    const { rerender } = renderHook(({ id, fn }) => useFlushOnNoteSwitch(id, fn), {
      initialProps: { id: 'a', fn: first },
    });

    rerender({ id: 'b', fn: second });

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('does not let a rejected flush surface as an unhandled rejection', async () => {
    const flush = vi.fn(async () => {
      throw new Error('disk full');
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = renderHook(({ id }) => useFlushOnNoteSwitch(id, flush), {
      initialProps: { id: 'a' },
    });

    rerender({ id: 'b' });
    await Promise.resolve();
    await Promise.resolve();

    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});
