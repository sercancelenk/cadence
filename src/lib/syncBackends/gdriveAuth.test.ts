/**
 * Tests for the parts of `gdriveAuth.ts` that don't require a real
 * browser popup or a real Google OAuth endpoint: token persistence,
 * silent token refresh, sign-out revoke, and the redirect-side
 * broker page (`maybeHandleOAuthRedirect`).
 *
 * The flows that DO require user interaction (the consent popup,
 * the loopback server) are exercised separately during the manual
 * "first sign-in" QA pass. Everything else — including the error
 * paths Google's docs say are possible — is covered here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredTokens,
  getClientIdSource,
  getEffectiveClientId,
  getValidAccessToken,
  loadStoredTokens,
  maybeHandleOAuthRedirect,
  saveTokens,
  setRuntimeClientId,
  isClientConfigured,
  signOut,
} from './gdriveAuth';

function setLocation(href: string) {
  // jsdom lets us mutate location.search via `window.history.replaceState`,
  // which is gentler than overwriting `window.location` directly.
  const url = new URL(href);
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('client-id configuration', () => {
  it('reports false when VITE_GOOGLE_OAUTH_CLIENT_ID is empty and no runtime override', () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', '');
    setRuntimeClientId(null);
    expect(isClientConfigured()).toBe(false);
    expect(getClientIdSource()).toBe('none');
  });

  it('reports true (source: build) when VITE_GOOGLE_OAUTH_CLIENT_ID has a value', () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'foo.apps.googleusercontent.com');
    setRuntimeClientId(null);
    expect(isClientConfigured()).toBe(true);
    expect(getClientIdSource()).toBe('build');
    expect(getEffectiveClientId()).toBe('foo.apps.googleusercontent.com');
  });

  it('accepts a runtime client ID and treats it as configured', () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', '');
    const result = setRuntimeClientId('123-abc.apps.googleusercontent.com');
    expect(result.ok).toBe(true);
    expect(isClientConfigured()).toBe(true);
    expect(getClientIdSource()).toBe('runtime');
    expect(getEffectiveClientId()).toBe('123-abc.apps.googleusercontent.com');
  });

  it('runtime override wins over build-time value', () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'baked-in.apps.googleusercontent.com');
    setRuntimeClientId('user-supplied.apps.googleusercontent.com');
    expect(getEffectiveClientId()).toBe('user-supplied.apps.googleusercontent.com');
    expect(getClientIdSource()).toBe('runtime');
  });

  it('rejects a client ID that does not look like a Google OAuth client ID', () => {
    const result = setRuntimeClientId('not-a-client-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toContain('client id');
    }
  });

  it('clears the runtime override when passed null/empty', () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', '');
    setRuntimeClientId('123-abc.apps.googleusercontent.com');
    expect(isClientConfigured()).toBe(true);
    setRuntimeClientId(null);
    expect(isClientConfigured()).toBe(false);
    expect(getClientIdSource()).toBe('none');
  });

  it('trims whitespace before validating', () => {
    setRuntimeClientId(null);
    const result = setRuntimeClientId('   123-abc.apps.googleusercontent.com   ');
    expect(result.ok).toBe(true);
    expect(getEffectiveClientId()).toBe('123-abc.apps.googleusercontent.com');
  });
});

describe('token persistence', () => {
  it('round-trips tokens through localStorage', () => {
    saveTokens({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 123,
      email: 'x@y.com',
    });
    expect(loadStoredTokens()).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 123,
      email: 'x@y.com',
    });
  });

  it('returns null when no tokens are stored', () => {
    expect(loadStoredTokens()).toBeNull();
  });

  it('returns null for malformed stored payloads', () => {
    window.localStorage.setItem('cadence.sync.gdrive.tokens.v1', 'not-json');
    expect(loadStoredTokens()).toBeNull();
  });

  it('clears tokens', () => {
    saveTokens({ accessToken: 'a', expiresAt: 0 });
    clearStoredTokens();
    expect(loadStoredTokens()).toBeNull();
  });
});

describe('getValidAccessToken', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'fake.apps.googleusercontent.com');
  });

  it('returns the access token unchanged when far from expiry', async () => {
    saveTokens({
      accessToken: 'still-fresh',
      refreshToken: 'r',
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    const token = await getValidAccessToken();
    expect(token).toBe('still-fresh');
  });

  it('returns null when no tokens are stored', async () => {
    const token = await getValidAccessToken();
    expect(token).toBeNull();
  });

  it('returns null when tokens are expired AND no refresh token is present', async () => {
    saveTokens({
      accessToken: 'expired',
      refreshToken: undefined,
      expiresAt: Date.now() - 60 * 1000,
    });
    const token = await getValidAccessToken();
    expect(token).toBeNull();
  });

  it('refreshes when the token is expired and a refresh token is present', async () => {
    saveTokens({
      accessToken: 'expired',
      refreshToken: 'refresh-me',
      expiresAt: Date.now() - 60 * 1000,
    });
    let bodySeen = '';
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toBe('https://oauth2.googleapis.com/token');
      bodySeen = String(init?.body ?? '');
      return Response.json({ access_token: 'new-access', expires_in: 3600 });
    });

    const token = await getValidAccessToken();
    expect(token).toBe('new-access');
    expect(bodySeen).toContain('refresh_token=refresh-me');
    expect(bodySeen).toContain('grant_type=refresh_token');
    // Refresh token should be preserved across refresh.
    expect(loadStoredTokens()?.refreshToken).toBe('refresh-me');
  });

  it('returns null when refresh request fails', async () => {
    saveTokens({
      accessToken: 'expired',
      refreshToken: 'refresh-me',
      expiresAt: Date.now() - 60 * 1000,
    });
    vi.stubGlobal('fetch', async () => new Response('bad', { status: 400 }));

    const token = await getValidAccessToken();
    expect(token).toBeNull();
  });
});

describe('maybeHandleOAuthRedirect', () => {
  it('returns false when the current URL is not an OAuth redirect', () => {
    setLocation('http://localhost:3000/');
    expect(maybeHandleOAuthRedirect()).toBe(false);
  });

  it('returns true and forwards code+state to opener when redirect matches', () => {
    setLocation('http://localhost:3000/?oauth=google&code=abc123&state=xyz');
    const messages: { data: unknown; origin: string }[] = [];
    // Fake opener with a postMessage listener.
    const opener = {
      postMessage: (data: unknown, origin: string) => messages.push({ data, origin }),
    } as unknown as Window;
    Object.defineProperty(window, 'opener', { value: opener, configurable: true });

    expect(maybeHandleOAuthRedirect()).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0].data).toEqual({ type: 'cadence-gdrive-auth', code: 'abc123', state: 'xyz' });
  });

  it('returns true even without an opener (gracefully closes itself)', () => {
    setLocation('http://localhost:3000/?oauth=google&code=abc');
    Object.defineProperty(window, 'opener', { value: null, configurable: true });
    expect(maybeHandleOAuthRedirect()).toBe(true);
  });
});

describe('signOut', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'fake.apps.googleusercontent.com');
  });

  it('clears local tokens even if the revoke call fails', async () => {
    saveTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60000 });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    await signOut();
    expect(loadStoredTokens()).toBeNull();
  });

  it('calls the revoke endpoint with the refresh token', async () => {
    saveTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60000 });
    let calledUrl = '';
    let calledBody = '';
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = typeof input === 'string' ? input : input.toString();
      calledBody = String(init?.body ?? '');
      return new Response('', { status: 200 });
    });
    await signOut();
    expect(calledUrl).toBe('https://oauth2.googleapis.com/revoke');
    expect(calledBody).toContain('token=r');
    expect(loadStoredTokens()).toBeNull();
  });

  it('is a no-op when there is no refresh token', async () => {
    saveTokens({ accessToken: 'a', refreshToken: undefined, expiresAt: 0 });
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await signOut();
    expect(spy).not.toHaveBeenCalled();
    expect(loadStoredTokens()).toBeNull();
  });
});
