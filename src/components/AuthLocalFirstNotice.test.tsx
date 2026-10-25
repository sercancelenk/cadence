import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthLocalFirstNotice } from './AuthLocalFirstNotice';

afterEach(cleanup);

describe('AuthLocalFirstNotice', () => {
  it('tells a new user that losing the password, the codes and every backup loses the data', () => {
    render(<AuthLocalFirstNotice variant="register" />);
    const note = screen.getByLabelText('How Cadence accounts work');
    expect(note.textContent).toMatch(/cannot be restored/i);
    expect(note.textContent).toMatch(/recovery codes/i);
    expect(note.textContent).toMatch(/backup/i);
  });

  it('says on the sign-in screen what happens without codes or a backup', () => {
    render(<AuthLocalFirstNotice variant="login" />);
    expect(screen.getByLabelText('How Cadence accounts work').textContent).toMatch(/neither/i);
  });

  it('says recovery needs all eight codes', () => {
    render(<AuthLocalFirstNotice variant="recover" />);
    expect(screen.getByLabelText('How Cadence accounts work').textContent).toMatch(/all 8/i);
  });
});
