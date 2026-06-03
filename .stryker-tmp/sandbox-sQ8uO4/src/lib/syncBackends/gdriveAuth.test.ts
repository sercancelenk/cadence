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
// @ts-nocheck


import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginAuth,
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

async function dispatchAuthCode(code: string, state: string) {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: 'cadence-gdrive-auth', code, state },
    }),
  );
}

function parseOAuthState(openedUrl: string): string {
  const match = openedUrl.match(/[?&]state=([^&]+)/);
  if (!match?.[1]) throw new Error(`missing OAuth state in ${openedUrl}`);
  return decodeURIComponent(match[1]);
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

  it('returns false when localStorage.getItem throws while reading runtime client id', () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', '');
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    setRuntimeClientId(null);
    expect(isClientConfigured()).toBe(false);
    getItem.mockRestore();
  });

  it('fails setRuntimeClientId when localStorage.setItem throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const result = setRuntimeClientId('123-abc.apps.googleusercontent.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('quota');
    setItem.mockRestore();
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

  it('returns null when accessToken is missing from stored JSON', () => {
    window.localStorage.setItem('cadence.sync.gdrive.tokens.v1', JSON.stringify({ expiresAt: 1 }));
    expect(loadStoredTokens()).toBeNull();
  });

  it('normalizes partial token payloads', () => {
    window.localStorage.setItem(
      'cadence.sync.gdrive.tokens.v1',
      JSON.stringify({ accessToken: 'a', expiresAt: 'bad', refreshToken: 123, email: 456 }),
    );
    expect(loadStoredTokens()).toEqual({
      accessToken: 'a',
      refreshToken: undefined,
      expiresAt: 0,
      email: undefined,
    });
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

  it('refreshes when token is within the 60s expiry window', async () => {
    saveTokens({
      accessToken: 'almost-expired',
      refreshToken: 'refresh-me',
      expiresAt: Date.now() + 30_000,
    });
    vi.stubGlobal('fetch', async () =>
      Response.json({ access_token: 'fresh', expires_in: 3600, refresh_token: 'new-refresh' }),
    );
    const token = await getValidAccessToken();
    expect(token).toBe('fresh');
    expect(loadStoredTokens()?.refreshToken).toBe('new-refresh');
  });

  it('returns null when refresh throws at the network layer', async () => {
    saveTokens({
      accessToken: 'expired',
      refreshToken: 'refresh-me',
      expiresAt: Date.now() - 60 * 1000,
    });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await getValidAccessToken()).toBeNull();
  });

  it('preserves email on refresh when Google omits id_token', async () => {
    saveTokens({
      accessToken: 'old',
      refreshToken: 'rt',
      expiresAt: Date.now() - 1000,
      email: 'keep@example.com',
    });
    vi.stubGlobal('fetch', async () =>
      Response.json({ access_token: 'new', expires_in: 3600 }),
    );
    expect(await getValidAccessToken()).toBe('new');
    expect(loadStoredTokens()).toEqual({
      accessToken: 'new',
      refreshToken: 'rt',
      expiresAt: expect.any(Number),
      email: 'keep@example.com',
    });
  });

  it('returns null from refresh when client id is not configured', async () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', '');
    window.localStorage.removeItem('cadence.sync.gdrive.clientId.v1');
    saveTokens({
      accessToken: 'old',
      refreshToken: 'rt',
      expiresAt: Date.now() - 1000,
    });
    expect(await getValidAccessToken()).toBeNull();
  });
});

describe('beginAuth', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'fake.apps.googleusercontent.com');
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
    delete window.cadence;
    delete (window as { leeadman?: unknown }).leeadman;
  });

  afterEach(() => {
    delete window.cadence;
    delete (window as { leeadman?: unknown }).leeadman;
  });

  it('returns no-client-id when OAuth is not configured', async () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', '');
    setRuntimeClientId(null);
    const result = await beginAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-client-id');
  });

  it('returns popup-blocked when window.open returns null', async () => {
    vi.stubGlobal('open', vi.fn(() => null));
    const result = await beginAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('popup-blocked');
  });

  it('returns user-cancelled when the popup closes before postMessage', async () => {
    vi.stubGlobal('open', vi.fn(() => ({ closed: true }) as Window));
    const result = await beginAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('user-cancelled');
  });

  it('uses the Electron bridge when cadence host is present', async () => {
    window.cadence = {
      gdriveAuth: {
        start: async () => ({
          ok: true as const,
          code: 'electron-code',
          codeVerifier: 'verifier-123456789012345678901234567890123456789012345678901234567890',
          redirectUri: 'http://127.0.0.1:53682/',
        }),
      },
    } as Window['cadence'];
    vi.stubGlobal('fetch', async () =>
      Response.json({ access_token: 'electron-token', expires_in: 3600 }),
    );

    const result = await beginAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tokens.accessToken).toBe('electron-token');
  });

  it('returns electron-unsupported when the bridge is missing', async () => {
    window.cadence = {} as Window['cadence'];
    const result = await beginAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('electron-unsupported');
  });

  it('returns token-exchange-failed when the Electron bridge succeeds but Google rejects the code', async () => {
    window.cadence = {
      gdriveAuth: {
        start: async () => ({
          ok: true as const,
          code: 'electron-code',
          codeVerifier: 'verifier-123456789012345678901234567890123456789012345678901234567890',
          redirectUri: 'http://127.0.0.1:53682/',
        }),
      },
    } as Window['cadence'];
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: 'invalid_grant', error_description: 'bad code' }, { status: 400 }),
    );

    const result = await beginAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('token-exchange-failed');
      expect(result.detail).toContain('bad code');
    }
  });

  it('returns network-error when token exchange fetch throws', async () => {
    window.cadence = {
      gdriveAuth: {
        start: async () => ({
          ok: true as const,
          code: 'electron-code',
          codeVerifier: 'verifier-123456789012345678901234567890123456789012345678901234567890',
          redirectUri: 'http://127.0.0.1:53682/',
        }),
      },
    } as Window['cadence'];
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });

    const result = await beginAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('network-error');
  });

  it('extracts email from id_token on successful token exchange', async () => {
    window.cadence = {
      gdriveAuth: {
        start: async () => ({
          ok: true as const,
          code: 'electron-code',
          codeVerifier: 'verifier-123456789012345678901234567890123456789012345678901234567890',
          redirectUri: 'http://127.0.0.1:53682/',
        }),
      },
    } as Window['cadence'];
    vi.stubGlobal('fetch', async () =>
      Response.json({
        access_token: 'electron-token',
        expires_in: 3600,
        id_token:
          'eyJhbGciOiJub25lIn0.' +
          btoa(JSON.stringify({ email: 'oauth@example.com' })).replace(/=+$/, '') +
          '.sig',
      }),
    );

    const result = await beginAuth();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokens.accessToken).toBe('electron-token');
      expect(result.tokens.email).toBe('oauth@example.com');
    }
  });

  it('builds redirect_uri without a double slash when pathname ends with /', async () => {
    setLocation('http://localhost:3000/app/');
    let openedUrl = '';
    vi.stubGlobal('open', vi.fn((url: string | URL) => {
      openedUrl = String(url);
      return { closed: true } as Window;
    }));
    await beginAuth();
    expect(openedUrl).toContain(
      encodeURIComponent('http://localhost:3000/app/?oauth=google'),
    );
  });

  it('builds an OAuth URL with PKCE and offline consent params', async () => {
    let openedUrl = '';
    vi.stubGlobal('open', vi.fn((url: string | URL) => {
      openedUrl = String(url);
      return { closed: true } as Window;
    }));
    await beginAuth();
    expect(openedUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(openedUrl).toContain('code_challenge=');
    expect(openedUrl).toContain('code_challenge_method=S256');
    expect(openedUrl).toContain('access_type=offline');
    expect(openedUrl).toContain('prompt=consent');
    expect(openedUrl).toContain('redirect_uri=');
  });

  it('completes browser popup auth when postMessage delivers a matching code', async () => {
    const popup = { closed: false } as Window;
    let openedUrl = '';
    vi.stubGlobal('open', vi.fn((url: string | URL) => {
      openedUrl = String(url);
      return popup;
    }));
    vi.stubGlobal('fetch', async () =>
      Response.json({ access_token: 'popup-token', expires_in: 3600, refresh_token: 'rt' }),
    );

    const authPromise = beginAuth();
    await vi.waitFor(() => expect(openedUrl.length).toBeGreaterThan(0));
    const state = parseOAuthState(openedUrl);
    await dispatchAuthCode('browser-code', state);

    const result = await authPromise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokens.accessToken).toBe('popup-token');
      expect(result.tokens.refreshToken).toBe('rt');
    }
  });

  it('ignores postMessage from wrong origin, state, or payload shape', async () => {
    const popup = { closed: false } as Window;
    let openedUrl = '';
    vi.stubGlobal('open', vi.fn((url: string | URL) => {
      openedUrl = String(url);
      return popup;
    }));
    const authPromise = beginAuth();
    await vi.waitFor(() => expect(openedUrl.length).toBeGreaterThan(0));
    const state = parseOAuthState(openedUrl);

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example',
        data: { type: 'cadence-gdrive-auth', code: 'x', state },
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'cadence-gdrive-auth', code: 'x', state: 'wrong-state' },
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'cadence-gdrive-auth', code: 123, state: 'wrong-state' },
      }),
    );

    vi.stubGlobal('fetch', async () => Response.json({ access_token: 'ok', expires_in: 3600 }));
    await dispatchAuthCode('real-code', state);
    const result = await authPromise;
    expect(result.ok).toBe(true);
  });

  it('returns token-exchange-failed with HTTP status when error body is not JSON', async () => {
    window.cadence = {
      gdriveAuth: {
        start: async () => ({
          ok: true as const,
          code: 'electron-code',
          codeVerifier: 'verifier-123456789012345678901234567890123456789012345678901234567890',
          redirectUri: 'http://127.0.0.1:53682/',
        }),
      },
    } as Window['cadence'];
    vi.stubGlobal('fetch', async () => new Response('plain-text-error', { status: 500 }));

    const result = await beginAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('token-exchange-failed');
      expect(result.detail).toContain('HTTP 500');
    }
  });

  it('ignores malformed id_token payloads during token exchange', async () => {
    window.cadence = {
      gdriveAuth: {
        start: async () => ({
          ok: true as const,
          code: 'electron-code',
          codeVerifier: 'verifier-123456789012345678901234567890123456789012345678901234567890',
          redirectUri: 'http://127.0.0.1:53682/',
        }),
      },
    } as Window['cadence'];
    vi.stubGlobal('fetch', async () =>
      Response.json({
        access_token: 'tok',
        expires_in: 3600,
        id_token: 'not.three.parts',
      }),
    );

    const result = await beginAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tokens.email).toBeUndefined();
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

  it('ignores postMessage when opener throws', () => {
    setLocation('http://localhost:3000/?oauth=google&code=abc&state=s');
    const opener = {
      postMessage: () => {
        throw new Error('gone');
      },
    } as unknown as Window;
    Object.defineProperty(window, 'opener', { value: opener, configurable: true });
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

describe('runtime without localStorage', () => {
  it('loadStoredTokens returns null when localStorage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadStoredTokens()).toBeNull();
    getItem.mockRestore();
  });

  it('saveTokens and clearStoredTokens swallow storage errors', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('quota');
    });
    saveTokens({ accessToken: 'a', expiresAt: 0 });
    clearStoredTokens();
    setItem.mockRestore();
    removeItem.mockRestore();
  });
});

describe('beginAuth — Electron bridge failures', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'fake.apps.googleusercontent.com');
    window.cadence = {
      gdriveAuth: {
        start: async () => ({ ok: false, reason: 'user-cancelled', detail: 'closed' }),
      },
    } as Window['cadence'];
  });

  afterEach(() => {
    delete window.cadence;
  });

  it('maps a failed Electron bridge result to AuthResult', async () => {
    const result = await beginAuth();
    expect(result).toEqual({ ok: false, reason: 'user-cancelled', detail: 'closed' });
  });

  it('maps a missing ok flag on the bridge payload to unexpected', async () => {
    window.cadence = {
      gdriveAuth: {
        start: async () => ({ ok: false } as { ok: false }),
      },
    } as Window['cadence'];
    const result = await beginAuth();
    expect(result).toEqual({ ok: false, reason: 'unexpected', detail: undefined });
  });
});

