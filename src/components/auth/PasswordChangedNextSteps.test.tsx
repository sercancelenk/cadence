import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { PasswordChangedNextSteps } from './PasswordChangedNextSteps';

afterEach(cleanup);

function renderSteps(props: { recoveryCodesInvalidated: boolean; notesRecoveryNeedsRenewal: boolean }) {
  return render(
    <MemoryRouter>
      <PasswordChangedNextSteps {...props} />
    </MemoryRouter>,
  );
}

describe('PasswordChangedNextSteps', () => {
  it('links to new recovery codes when the old ones stopped working', () => {
    renderSteps({ recoveryCodesInvalidated: true, notesRecoveryNeedsRenewal: false });
    expect(screen.getByRole('status').textContent).toMatch(/Password updated/);
    expect(screen.getByRole('link', { name: /new recovery codes/i }).getAttribute('href')).toBe('/settings#recovery-codes');
    expect(screen.queryByRole('link', { name: /notes/i })).toBeNull();
  });

  it('links to the Notes page when Notes recovery still needs the old password', () => {
    renderSteps({ recoveryCodesInvalidated: true, notesRecoveryNeedsRenewal: true });
    expect(screen.getByRole('status').textContent).toMatch(/previous account password/i);
    expect(screen.getByRole('link', { name: /renew notes recovery/i }).getAttribute('href')).toBe('/notes');
  });

  it('shows just the confirmation when nothing needs doing', () => {
    renderSteps({ recoveryCodesInvalidated: false, notesRecoveryNeedsRenewal: false });
    expect(screen.getByRole('status').textContent).toMatch(/Password updated/);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
