/**
 * Regression tests for the session-resume bug that caused "PIN açtım, restart
 * yaptım, bütün datam gitti".
 *
 * Root cause history (May 2026):
 *   1. The Electron main process only puts the per-user data key into
 *      memory inside `account:login` / `account:register`. Process restart
 *      drops that map — there's nowhere safe to persist a password-derived
 *      key without prompting the user again.
 *   2. Before this fix, `account:session` happily returned the resumed user
 *      anyway. The renderer treated it as a normal sign-in, the next
 *      `data:load` failed with `no-key`, and the UI booted into an empty
 *      workspace. Worse, the first save fell through `writeUserData` with
 *      no key in memory and silently wrote PLAINTEXT, overwriting the
 *      encrypted file.
 *   3. The fix is to make `account:session` return `requiresAuth: true`
 *      (and a hint email) instead of pretending the resume succeeded.
 *      The renderer routes the user to /login pre-filled, derives the key
 *      via `account:login`, and the encrypted file is reachable again.
 *
 * These tests pin both halves of the contract:
 *   - `refresh()` exposes `pendingReauth` (not `user`) when the IPC says
 *     a re-auth is required.
 *   - A successful follow-up `login()` clears `pendingReauth` so banners
 *     and pre-fill state don't linger.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider, useAccount } from './AccountContext';

type SessionResp = {
  user: { id: string; email: string; displayName?: string } | null;
  requiresAuth?: boolean;
  email?: string;
  displayName?: string;
};

function setupCadence(opts: {
  session: SessionResp;
  login?: (
    payload: { email: string; password: string },
  ) => { ok: boolean; user?: SessionResp['user']; error?: string };
}) {
  const cadence = {
    accountSession: vi.fn(async () => opts.session),
    accountLogin: vi.fn(async (payload: { email: string; password: string }) =>
      opts.login ? opts.login(payload) : { ok: true, user: { id: 'u1', email: payload.email } },
    ),
    accountRegister: vi.fn(),
    accountLogout: vi.fn(async () => ({ ok: true })),
    accountChangePassword: vi.fn(),
    accountVerifyPassword: vi.fn(),
    accountHasLegacyData: vi.fn(async () => ({ has: false })),
  };
  // The renderer code only checks `window.cadence?.accountSession`; the rest
  // of the surface is irrelevant to this test, so we cast to the partial we
  // care about.
  (window as unknown as { cadence: typeof cadence }).cadence = cadence;
  return cadence;
}

function Probe() {
  const a = useAccount();
  return (
    <div>
      <div data-testid="loading">{a.loading ? '1' : '0'}</div>
      <div data-testid="user">{a.user ? a.user.email : ''}</div>
      <div data-testid="reauth">{a.pendingReauth ? a.pendingReauth.email : ''}</div>
      <div data-testid="reauthName">{a.pendingReauth?.displayName ?? ''}</div>
      <button
        type="button"
        data-testid="signin"
        onClick={() => {
          void a.login('pin@cadence.app', 'correct-horse-battery');
        }}
      >
        sign in
      </button>
    </div>
  );
}

beforeEach(() => {
  // Clean slate per test — leaking `window.cadence` across tests was the
  // single biggest source of flake when this file was first added.
  delete (window as unknown as { cadence?: unknown }).cadence;
});

afterEach(() => {
  // Vitest doesn't auto-run testing-library's cleanup unless `globals: true`
  // is set, and we keep that off so other tests don't accidentally rely on
  // jest-like ambient globals. Tear the DOM down explicitly between tests
  // to avoid "Found multiple elements" errors when the same testid renders
  // in back-to-back Probes.
  cleanup();
  delete (window as unknown as { cadence?: unknown }).cadence;
});

describe('AccountContext / session-resume re-auth flow', () => {
  it('returns no user but exposes pendingReauth when IPC reports requiresAuth', async () => {
    setupCadence({
      session: { user: null, requiresAuth: true, email: 'pin@cadence.app', displayName: 'Sercan' },
    });

    render(
      <AccountProvider>
        <Probe />
      </AccountProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('0'));
    expect(screen.getByTestId('user').textContent).toBe('');
    expect(screen.getByTestId('reauth').textContent).toBe('pin@cadence.app');
    expect(screen.getByTestId('reauthName').textContent).toBe('Sercan');
  });

  it('treats a missing-but-not-requiresAuth response as a clean signed-out state', async () => {
    setupCadence({ session: { user: null } });

    render(
      <AccountProvider>
        <Probe />
      </AccountProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('0'));
    expect(screen.getByTestId('reauth').textContent).toBe('');
    expect(screen.getByTestId('user').textContent).toBe('');
  });

  it('routes a fully-resumed session straight into the workspace', async () => {
    setupCadence({
      session: { user: { id: 'u1', email: 'ok@cadence.app', displayName: 'Plain' } },
    });

    render(
      <AccountProvider>
        <Probe />
      </AccountProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('ok@cadence.app'));
    expect(screen.getByTestId('reauth').textContent).toBe('');
  });

  it('clears pendingReauth as soon as login succeeds', async () => {
    setupCadence({
      session: { user: null, requiresAuth: true, email: 'pin@cadence.app' },
      login: ({ email }) => ({ ok: true, user: { id: 'u1', email } }),
    });

    render(
      <AccountProvider>
        <Probe />
      </AccountProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('reauth').textContent).toBe('pin@cadence.app'));

    await act(async () => {
      screen.getByTestId('signin').click();
    });

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('pin@cadence.app'));
    await waitFor(() => expect(screen.getByTestId('reauth').textContent).toBe(''));
  });
});
