import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, useCopy } from './clipboard';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'clipboard');
});

const withClipboard = (writeText: (t: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

describe('copyText', () => {
  it('is true only when the text really reached the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    withClipboard(writeText);
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('is false when the clipboard rejects or does not exist', async () => {
    withClipboard(() => Promise.reject(new Error('denied')));
    expect(await copyText('x')).toBe(false);
    Reflect.deleteProperty(navigator, 'clipboard');
    expect(await copyText('x')).toBe(false);
  });
});

function Probe({ text, id }: { text: string; id: string }) {
  const { copy, statusOf } = useCopy();
  return (
    <button type="button" onClick={() => void copy(id, text)}>
      {statusOf(id) === 'copied' ? 'Copied' : statusOf(id) === 'failed' ? 'Could not copy' : 'Copy'}
    </button>
  );
}

describe('useCopy', () => {
  it('shows Copied, then goes back to Copy', async () => {
    vi.useFakeTimers();
    withClipboard(() => Promise.resolve());
    render(<Probe id="a" text="t" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(screen.getByRole('button').textContent).toBe('Copied');
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('button').textContent).toBe('Copy');
  });

  it('says so when copying failed', async () => {
    withClipboard(() => Promise.reject(new Error('denied')));
    render(<Probe id="a" text="t" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(screen.getByRole('button').textContent).toBe('Could not copy');
  });
});
