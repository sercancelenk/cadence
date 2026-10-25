import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PasswordChangeProgress } from './PasswordChangeProgress';

afterEach(cleanup);

describe('PasswordChangeProgress', () => {
  it('says what is happening and not to close the app, only while the change runs', () => {
    const { rerender } = render(<PasswordChangeProgress busy={false} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<PasswordChangeProgress busy />);
    const note = screen.getByRole('status');
    expect(note.textContent).toMatch(/re-encrypting/i);
    expect(note.textContent).toMatch(/keep Cadence open/i);
  });
});
