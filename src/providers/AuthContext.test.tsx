import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGate, AuthProvider } from './AuthContext';

type VerifyReply = { ok: boolean; lockedOut?: boolean; retryAfterMs?: number; error?: string };

function installBridge(verify: (pin: string) => VerifyReply, reset?: () => { ok: boolean; error?: string }) {
  let pinOn = true;
  (window as unknown as { cadence: unknown }).cadence = {
    authStatus: async () => ({ enabled: pinOn }),
    authVerify: async ({ pin }: { pin: string }) => verify(pin),
    authResetWithAccountPassword: async () => {
      const r = reset ? reset() : { ok: true };
      if (r.ok) pinOn = false;
      return r;
    },
    userDataPath: async () => '/tmp',
    getAppVersion: async () => '0.0.0',
  };
}

async function renderLocked() {
  render(
    <AuthProvider>
      <AuthGate>
        <div>workspace</div>
      </AuthGate>
    </AuthProvider>,
  );
  return screen.findByPlaceholderText('PIN');
}

async function openRecoveryForm(input: HTMLElement) {
  await typePinAndSubmit(input, '0000');
  await screen.findByText(/2 more attempts/);
  await typePinAndSubmit(input, '0000');
  await screen.findByText(/1 more attempt before/);
  await typePinAndSubmit(input, '0000');
  return screen.findByPlaceholderText('Account password');
}

async function typePinAndSubmit(input: HTMLElement, pin: string) {
  fireEvent.change(input, { target: { value: pin } });
  fireEvent.click(screen.getByRole('button', { name: /unlock/i }));
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  cleanup();
  delete (window as unknown as { cadence?: unknown }).cadence;
});

describe('AuthGate', () => {
  it('shows the lockout message instead of "Incorrect PIN" while locked out', async () => {
    installBridge(() => ({ ok: false, lockedOut: true, retryAfterMs: 60_000, error: 'Too many attempts. Try again in about 1 minute.' }));
    const input = await renderLocked();
    await typePinAndSubmit(input, '1234');
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
    expect(screen.queryByText(/Incorrect PIN/)).toBeNull();
  });

  it('does not count a locked-out try toward opening the reset form', async () => {
    installBridge(() => ({ ok: false, lockedOut: true, error: 'Too many attempts. Try again in 30 seconds.' }));
    const input = await renderLocked();
    for (let i = 0; i < 4; i += 1) {
      await typePinAndSubmit(input, '1234');
      await screen.findByText(/Too many attempts/);
    }
    expect(screen.queryByPlaceholderText('PIN')).not.toBeNull();
  });

  it('still counts down wrong PINs and opens the reset form on the third', async () => {
    installBridge(() => ({ ok: false }));
    const input = await renderLocked();
    await typePinAndSubmit(input, '0000');
    expect(await screen.findByText(/2 more attempts/)).toBeTruthy();
    await typePinAndSubmit(input, '0000');
    expect(await screen.findByText(/1 more attempt before/)).toBeTruthy();
    await typePinAndSubmit(input, '0000');
    await waitFor(() => expect(screen.queryByPlaceholderText('PIN')).toBeNull());
  });

  it('opens the workspace on the right PIN', async () => {
    installBridge((pin) => ({ ok: pin === '1234' }));
    const input = await renderLocked();
    await typePinAndSubmit(input, '1234');
    expect(await screen.findByText('workspace')).toBeTruthy();
  });

  it('lets the user straight in once the PIN was removed with the account password', async () => {
    installBridge(() => ({ ok: false }), () => ({ ok: true }));
    const input = await renderLocked();
    const pwd = await openRecoveryForm(input);
    fireEvent.change(pwd, { target: { value: 'right-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: /remove pin/i }));

    expect(await screen.findByText('workspace')).toBeTruthy();
    expect(screen.queryByPlaceholderText('PIN')).toBeNull();
  });

  it('stays on the recovery form, with the reason, when the account password is wrong', async () => {
    installBridge(() => ({ ok: false }), () => ({ ok: false, error: 'Incorrect account password.' }));
    const input = await renderLocked();
    const pwd = await openRecoveryForm(input);
    fireEvent.change(pwd, { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /remove pin/i }));

    expect(await screen.findByText('Incorrect account password.')).toBeTruthy();
    expect(screen.queryByText('workspace')).toBeNull();
  });

  it('opens the reset form once, on the third wrong PIN, and then lets the user keep trying', async () => {
    installBridge(() => ({ ok: false }));
    const input = await renderLocked();
    await openRecoveryForm(input);
    fireEvent.click(screen.getByRole('button', { name: /back to pin entry/i }));

    const again = await screen.findByPlaceholderText('PIN');
    await typePinAndSubmit(again, '0000');

    expect(await screen.findByText(/Incorrect PIN/)).toBeTruthy();
    expect(screen.queryByPlaceholderText('Account password')).toBeNull();
    expect(screen.queryByPlaceholderText('PIN')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /forgot pin/i })).not.toBeNull();
  });

  it('reaches the lockout message after more tries, without being sent to the reset form again', async () => {
    let calls = 0;
    installBridge(() => {
      calls += 1;
      return calls > 6 ? { ok: false, lockedOut: true, error: 'Too many attempts. Try again in 30 seconds.' } : { ok: false };
    });
    const input = await renderLocked();
    await openRecoveryForm(input);
    fireEvent.click(screen.getByRole('button', { name: /back to pin entry/i }));
    let field = await screen.findByPlaceholderText('PIN');
    for (let i = 0; i < 3; i += 1) {
      await typePinAndSubmit(field, '0000');
      await screen.findByText(/Incorrect PIN/);
      field = screen.getByPlaceholderText('PIN');
    }
    await typePinAndSubmit(field, '0000');
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
  });
});
