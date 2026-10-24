import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVED_FLASH_MS, SavedFlash } from './SavedFlash';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('<SavedFlash />', () => {
  it('shows nothing on mount, even when an earlier save exists', () => {
    render(<SavedFlash savedAt={1000} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a green saved icon when a new save lands, then hides it after 5 s', () => {
    expect(SAVED_FLASH_MS).toBe(5000);
    const { rerender } = render(<SavedFlash savedAt={1000} />);
    rerender(<SavedFlash savedAt={2000} />);
    const el = screen.getByRole('status');
    expect(el.getAttribute('aria-label')).toBe('Saved');
    expect(el.textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(SAVED_FLASH_MS - 1);
    });
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('restarts the 5 s window when another save lands while it is showing', () => {
    const { rerender } = render(<SavedFlash savedAt={1000} />);
    rerender(<SavedFlash savedAt={2000} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    rerender(<SavedFlash savedAt={3000} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
