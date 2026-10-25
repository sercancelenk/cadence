import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateRecoveryCodes } from '../lib/accountRecovery';

vi.mock('../providers/AccountContext', () => ({
  useAccount: () => ({ user: null, loading: false, recoverWithCodes: vi.fn() }),
}));

import { RecoverAccountPage } from './RecoverAccountPage';

afterEach(cleanup);

function paste(el: HTMLElement, text: string) {
  fireEvent.paste(el, { clipboardData: { getData: () => text } });
}

describe('RecoverAccountPage', () => {
  it('fills all eight fields when the codes are pasted into any one of them', () => {
    const codes = generateRecoveryCodes();
    render(
      <MemoryRouter>
        <RecoverAccountPage />
      </MemoryRouter>,
    );
    paste(screen.getByPlaceholderText('Code 3'), codes.join('\n'));
    const values = Array.from({ length: 8 }, (_, i) => (screen.getByPlaceholderText(`Code ${i + 1}`) as HTMLInputElement).value);
    expect(values).toEqual(codes);
  });

  it('leaves a paste of a single code to the field itself', () => {
    const codes = generateRecoveryCodes();
    render(
      <MemoryRouter>
        <RecoverAccountPage />
      </MemoryRouter>,
    );
    const notPrevented = fireEvent.paste(screen.getByPlaceholderText('Code 1'), { clipboardData: { getData: () => codes[0] } });
    expect(notPrevented).toBe(true);
    expect((screen.getByPlaceholderText('Code 2') as HTMLInputElement).value).toBe('');
  });

  it('says that the fields were filled, for people who cannot see the screen', () => {
    const codes = generateRecoveryCodes();
    render(
      <MemoryRouter>
        <RecoverAccountPage />
      </MemoryRouter>,
    );
    paste(screen.getByPlaceholderText('Code 1'), codes.join('\n'));
    expect(screen.getByRole('status').textContent).toMatch(/filled in all 8/i);
  });
});
