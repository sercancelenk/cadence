import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiLegacyNotice } from './AiLegacyNotice';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('AiLegacyNotice', () => {
  it('says once that earlier instructions are still applied, as a short focus note, and where to manage them', () => {
    render(<AiLegacyNotice active />);
    expect(screen.getByText(/earlier instructions are still applied as a short focus note/i)).toBeTruthy();
    expect(screen.getByText(/Previous instructions/)).toBeTruthy();
  });

  it('is hidden when there is nothing legacy to apply', () => {
    render(<AiLegacyNotice active={false} />);
    expect(screen.queryByText(/earlier instructions/i)).toBeNull();
  });

  it('stays dismissed on this device after "Got it"', () => {
    const { unmount } = render(<AiLegacyNotice active />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/earlier instructions/i)).toBeNull();
    unmount();
    render(<AiLegacyNotice active />);
    expect(screen.queryByText(/earlier instructions/i)).toBeNull();
  });

  it('still works when storage is unavailable', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    try {
      render(<AiLegacyNotice active />);
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByText(/earlier instructions/i)).toBeNull();
    } finally {
      if (real) Object.defineProperty(window, 'localStorage', real);
    }
  });
});
