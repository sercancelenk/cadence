import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

afterEach(cleanup);

function Trigger({ onUndo }: { onUndo: () => void }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast.show({ kind: 'success', title: 'Checklist added', action: { label: 'Undo', onClick: onUndo } })}
    >
      go
    </button>
  );
}

describe('toast with an action waits while the user is on it', () => {
  it('does not disappear while hovered or focused, and counts down again afterwards', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger onUndo={() => {}} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    const toastEl = screen.getByText('Checklist added').closest('.toast') as HTMLElement;
    fireEvent.mouseEnter(toastEl);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByText('Checklist added')).not.toBeNull();
    fireEvent.mouseLeave(toastEl);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByText('Checklist added')).toBeNull();
    vi.useRealTimers();
  });
});

describe('toast action', () => {
  it('shows an action button that runs once and dismisses the toast', () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByText('Checklist added')).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Checklist added')).toBeNull();
  });

  it('a toast without an action has no extra button', () => {
    function Plain() {
      const toast = useToast();
      return <button type="button" onClick={() => toast.showSuccess('Saved')}>go</button>;
    }
    render(
      <ToastProvider>
        <Plain />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['go', 'Dismiss notification']);
  });
});

describe('toast announcements', () => {
  it('has exactly one live region, so a toast is read out once', () => {
    function Plain() {
      const toast = useToast();
      return <button type="button" onClick={() => toast.showSuccess('Saved')}>go</button>;
    }
    render(
      <ToastProvider>
        <Plain />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByRole('region', { name: 'Notifications' }).getAttribute('aria-live')).toBe('polite');
    expect(document.querySelectorAll('.toast[role="status"], .toast[aria-live]')).toHaveLength(0);
  });
});

describe('toast live region', () => {
  it('is on the page before the first toast, so a screen reader announces that toast', () => {
    render(
      <ToastProvider>
        <Trigger onUndo={() => {}} />
      </ToastProvider>,
    );
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.children).toHaveLength(0);
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByRole('region', { name: 'Notifications' })).toBe(region);
    expect(region.children).toHaveLength(1);
  });
});
