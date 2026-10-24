import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiResultPanel } from './AiResultPanel';
import type { AiContextChip } from './AiContextChips';

afterEach(cleanup);

const chips: AiContextChip[] = [
  { label: 'This note', detail: '1,240 characters', sent: 'Kullanıcı siparişi verir, API Gateway...' },
  { label: 'Lists', detail: 'Work, Home' },
];

function setup(over: Partial<React.ComponentProps<typeof AiResultPanel>> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onApply: vi.fn(),
    onCopy: vi.fn(),
    onRegenerate: vi.fn(),
    onContinue: vi.fn(),
  };
  render(
    <AiResultPanel
      open
      title="Extract tasks"
      connectionLabel="Company gateway"
      chips={chips}
      status="ready"
      {...handlers}
      {...over}
    >
      <p>RESULT BODY</p>
    </AiResultPanel>,
  );
  return handlers;
}

describe('AiResultPanel', () => {
  it('renders nothing when closed', () => {
    render(<AiResultPanel open={false} title="X" chips={[]} status="ready" onClose={() => {}} />);
    expect(screen.queryByText('X')).toBeNull();
  });

  describe('ready', () => {
    it('shows the result and the action bar: Apply, Copy, Regenerate, Discard', () => {
      const h = setup({ applyLabel: 'Add all' });
      expect(screen.getByText('RESULT BODY')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Add all' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      expect(h.onApply).toHaveBeenCalledTimes(1);
      expect(h.onCopy).toHaveBeenCalledTimes(1);
      expect(h.onRegenerate).toHaveBeenCalledTimes(1);
      expect(h.onClose).toHaveBeenCalledTimes(1);
    });

    it('Apply defaults to the label "Apply" and can be disabled', () => {
      setup({ applyDisabled: true });
      expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('has no Apply button when there is nothing to apply (read-only result)', () => {
      setup({ onApply: undefined });
      expect(screen.queryByRole('button', { name: /^Apply$/ })).toBeNull();
      expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    });

    it('offers Continue when the reply was cut off', () => {
      const h = setup({ truncated: true });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(h.onContinue).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/cut off|token limit/i)).toBeTruthy();
    });

    it('shows the connection quietly in the footer', () => {
      setup();
      expect(screen.getByText(/via Company gateway/)).toBeTruthy();
    });
  });

  describe('running', () => {
    it('announces progress politely, hides the result and Apply, and lets the user cancel', () => {
      const h = setup({ status: 'running' });
      const live = screen.getByRole('status');
      expect(live.textContent).toMatch(/working/i);
      expect(screen.queryByText('RESULT BODY')).toBeNull();
      expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(h.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('error', () => {
    it('shows the message, a collapsible diagnostic and Try again', () => {
      const h = setup({ status: 'error', message: 'The gateway answered HTTP 405', diagnostic: 'POST https://x\n-> HTTP 405' });
      expect(screen.getByText('The gateway answered HTTP 405')).toBeTruthy();
      expect(screen.getByText('Diagnostic details')).toBeTruthy();
      expect(screen.getByText(/-> HTTP 405/)).toBeTruthy();
      expect(screen.queryByText('RESULT BODY')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(h.onRegenerate).toHaveBeenCalledTimes(1);
    });

    it('omits the diagnostic section when there is none', () => {
      setup({ status: 'error', message: 'Nope' });
      expect(screen.queryByText('Diagnostic details')).toBeNull();
    });
  });

  describe('blocked', () => {
    it('explains why and offers the one fix', () => {
      const action = vi.fn();
      setup({ status: 'blocked', message: 'This uses 1:1 data and “Cloud” is not allowed for it.', blockedAction: { label: 'Open AI settings', onClick: action } });
      expect(screen.getByText(/not allowed for it/)).toBeTruthy();
      expect(screen.queryByText('RESULT BODY')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Open AI settings' }));
      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  describe('context chips', () => {
    it('lists what was read and lets the user open exactly what was sent', () => {
      setup();
      expect(screen.getByText('This note')).toBeTruthy();
      expect(screen.getByText(/1,240 characters/)).toBeTruthy();
      expect(screen.getByText(/Work, Home/)).toBeTruthy();
      const sent = screen.getByText(/API Gateway/);
      const details = sent.closest('details') as HTMLDetailsElement;
      expect(details).toBeTruthy();
      expect(within(details).getByText('What was sent')).toBeTruthy();
      expect(details.open).toBe(false);
    });

    it('a chip without sent text has no expander', () => {
      setup({ chips: [{ label: 'Lists', detail: 'Work' }] });
      expect(screen.queryByText('What was sent')).toBeNull();
    });
  });

  it('Escape closes the panel', () => {
    const h = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(h.onClose).toHaveBeenCalled();
  });
});
