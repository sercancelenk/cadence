/**
 * Google OAuth 2.0 (PKCE) flow for the Drive backend.
 *
 * Two runtime paths
 * =================
 *
 * - **PWA / browser**: opens a popup window pointing at Google's
 *   consent screen, watches the redirect for the auth code via
 *   `postMessage`, exchanges the code for tokens.
 * - **Electron**: opens the system browser via `shell.openExternal`
 *   and listens for a `cadence://oauth/google` callback. The main
 *   process forwards the code back to the renderer.
 *
 * Both paths produce the same `OAuthTokens` shape.
 *
 * Setup the user MUST do (one-time, per fork of Cadence)
 * ======================================================
 *
 *   1. Create a Google Cloud project (free) at
 *      https://console.cloud.google.com/projectcreate
 *   2. Enable the Drive API.
 *   3. Configure the OAuth consent screen ("External" works for
 *      personal use; "Internal" if you have a Workspace and only
 *      your domain will use it).
 *   4. Create OAuth credentials:
 *      - "Web application" type for the PWA. Authorized redirect
 *        URIs: every origin where the PWA is hosted +
 *        `/cadence/app/?oauth=google` path.
 *      - "Desktop app" type for Electron. The Cloud Console issues
 *        a client ID with no redirect URI (Google detects loopback /
 *        custom URI automatically).
 *   5. Write the client IDs into `.env`:
 *        VITE_GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
 *      (Electron build picks up the same value via Vite's import.meta.env.)
 *
 * PKCE
 * ====
 *
 * No client secret is shipped. We use PKCE (RFC 7636), which proves
 * possession of the original `code_verifier` at exchange time and
 * makes intercepted auth codes useless to an attacker who couldn't
 * see the verifier in memory.
 */

/**
 * Where the Drive client ID comes from
 * ====================================
 *
 * Two sources, resolved in priority order:
 *
 *   1. Runtime override (`localStorage["cadence.sync.gdrive.clientId.v1"]`).
 *      Set from Settings → "Use my own Google client ID". This is what
 *      lets DMG / portable-build users enable Drive sync without
 *      rebuilding — they create their own Google Cloud project, paste
 *      the client ID into a field, done.
 *
 *   2. Build-time env (`VITE_GOOGLE_OAUTH_CLIENT_ID`). Vite replaces
 *      `import.meta.env.X` with a string literal at build time. This
 *      is what the official Cadence release ships with: the maintainer
 *      bakes a published client ID in and the end user just clicks
 *      "Sign in with Google".
 *
 * Either source is fine. The runtime override wins if both are set, so
 * a user can override an embedded client ID with their own self-hosted
 * one if they prefer that.
 */

const RUNTIME_CLIENT_ID_KEY = 'cadence.sync.gdrive.clientId.v1';

function readRuntimeClientId(): string {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  try {
    return window.localStorage.getItem(RUNTIME_CLIENT_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

function getClientId(): string {
  const runtime = readRuntimeClientId();
  if (runtime) return runtime;
  return (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ?? '';
}

/**
 * Where this client ID comes from — useful for the Settings UI to show
 * "(built-in)" vs "(user-supplied)" labels next to the indicator.
 */
export type ClientIdSource = 'runtime' | 'build' | 'none';

export function getClientIdSource(): ClientIdSource {
  if (readRuntimeClientId()) return 'runtime';
  const env = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ?? '';
  return env ? 'build' : 'none';
}

/**
 * Persist a user-supplied Google OAuth Client ID. Empty / null clears
 * the override (falls back to the build-time value, if any).
 *
 * We do a shape check here so a typo (e.g. pasting the project name
 * instead of the client ID) gets caught BEFORE Google rejects the
 * sign-in attempt — that error round-trip costs the user a popup,
 * a consent screen flash, and a confusing "invalid_client" message.
 */
export function setRuntimeClientId(clientId: string | null): { ok: true } | { ok: false; reason: string } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ok: false, reason: 'No persistent storage available in this runtime.' };
  }
  const trimmed = (clientId ?? '').trim();
  try {
    if (!trimmed) {
      window.localStorage.removeItem(RUNTIME_CLIENT_ID_KEY);
      return { ok: true };
    }
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(trimmed)) {
      return {
        ok: false,
        reason:
          'That does not look like a Google OAuth client ID. The expected shape is "<digits>-<hash>.apps.googleusercontent.com".',
      };
    }
    window.localStorage.setItem(RUNTIME_CLIENT_ID_KEY, trimmed);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Return the currently effective client ID (runtime override OR build), without revealing the source. */
export function getEffectiveClientId(): string {
  return getClientId();
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

// Only the appdata scope. This restricts Cadence to a private folder
// that is INVISIBLE in the user's Drive — they can see "Cadence is
// connected" in their Google account settings but the file itself
// doesn't clutter their Drive root.
const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

const TOKEN_KEY = 'cadence.sync.gdrive.tokens.v1';
const STATE_PREFIX = 'cadence.sync.gdrive.state.';

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  /** Unix epoch ms when the access token expires. */
  expiresAt: number;
  /** The token-bearer's Google account email (best-effort, may be undefined). */
  email?: string;
};

export type AuthResult =
  | { ok: true; tokens: OAuthTokens }
  | { ok: false; reason: AuthFailureReason; detail?: string };

export type AuthFailureReason =
  | 'no-client-id'
  | 'popup-blocked'
  | 'user-cancelled'
  | 'electron-unsupported'
  | 'network-error'
  | 'token-exchange-failed'
  | 'unexpected';

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function isClientConfigured(): boolean {
  return !!getClientId();
}

export function loadStoredTokens(): OAuthTokens | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.accessToken !== 'string') return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
    };
  } catch {
    return null;
  }
}

export function saveTokens(tokens: OAuthTokens): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    /* swallow */
  }
}

export function clearStoredTokens(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* swallow */
  }
}

/**
 * Returns an access token guaranteed to be valid for at least 60
 * seconds. Refreshes silently if needed; returns null if the user
 * needs to (re)authorize (e.g. refresh token revoked).
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = loadStoredTokens();
  if (!tokens) return null;
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) return null;
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  if (!refreshed) return null;
  // Preserve the refresh token + email; Google doesn't re-emit them
  // on a refresh exchange.
  const merged: OAuthTokens = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    expiresAt: refreshed.expiresAt,
    email: refreshed.email ?? tokens.email,
  };
  saveTokens(merged);
  return merged.accessToken;
}

/**
 * Sign in: opens the consent popup and returns tokens, OR a
 * structured failure that the UI can render.
 */
export async function beginAuth(): Promise<AuthResult> {
  const clientId = getClientId();
  if (!clientId) {
    return {
      ok: false,
      reason: 'no-client-id',
      detail:
        'VITE_GOOGLE_OAUTH_CLIENT_ID is not configured. See README → Cloud sync setup.',
    };
  }
  try {
    if (isElectronRuntime()) {
      return await runElectronLoopbackAuth();
    }
    return await runBrowserAuthPopup();
  } catch (err) {
    return {
      ok: false,
      reason: 'unexpected',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Electron loopback flow                                              */
/* ------------------------------------------------------------------ */

/**
 * Electron loopback OAuth flow.
 *
 * Main process owns the localhost callback server and the PKCE
 * `code_verifier` — see `electron/main.cjs → ipcMain.handle('gdrive:beginAuth')`.
 * The renderer requests the flow, waits for the `{ code, codeVerifier,
 * redirectUri }` reply, then performs the token exchange against
 * Google's OAuth endpoint exactly the same way the PWA does.
 *
 * The reason token exchange happens in the renderer (rather than the
 * main process) is that the renderer is what ultimately holds, refreshes
 * and uses the tokens. Doing it here keeps a single code path for
 * `exchangeCodeForTokens` / `refreshAccessToken` and avoids passing
 * raw tokens across IPC.
 */
async function runElectronLoopbackAuth(): Promise<AuthResult> {
  const bridge = (window as unknown as ElectronAuthBridge).cadence?.gdriveAuth;
  if (!bridge?.start) {
    return {
      ok: false,
      reason: 'electron-unsupported',
      detail: 'This build of Cadence is missing the Drive auth bridge — update to the latest version.',
    };
  }
  let main: ElectronAuthMainResult;
  try {
    main = await bridge.start({ clientId: getClientId(), scopes: SCOPES });
  } catch (err) {
    return {
      ok: false,
      reason: 'unexpected',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  if (!main || main.ok !== true) {
    return {
      ok: false,
      reason: (main && main.reason) || 'unexpected',
      detail: main?.detail,
    };
  }
  return exchangeCodeForTokens(main.code, main.codeVerifier, main.redirectUri);
}

type ElectronAuthMainResult =
  | { ok: true; code: string; codeVerifier: string; redirectUri: string }
  | { ok: false; reason?: AuthFailureReason; detail?: string };

type ElectronAuthBridge = {
  cadence?: {
    gdriveAuth?: {
      start: (payload: { clientId: string; scopes: string[] }) => Promise<ElectronAuthMainResult>;
    };
  };
};

/**
 * Revoke the refresh token at Google AND clear local storage. Best-
 * effort: even if the revoke call fails (offline), the local tokens
 * are still cleared so the user is signed out from this device.
 */
export async function signOut(): Promise<void> {
  const tokens = loadStoredTokens();
  clearStoredTokens();
  if (!tokens?.refreshToken) return;
  try {
    await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.refreshToken }).toString(),
    });
  } catch {
    /* swallow — local sign-out already happened */
  }
}

/* ------------------------------------------------------------------ */
/* Browser popup flow                                                  */
/* ------------------------------------------------------------------ */

async function runBrowserAuthPopup(): Promise<AuthResult> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await sha256base64url(codeVerifier);
  const state = randomToken();
  // Park the verifier where the redirect handler in our own origin
  // can read it back. sessionStorage is fine — only the same origin's
  // popup can access it, and we delete it after the exchange.
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.setItem(STATE_PREFIX + state, codeVerifier);
  }

  const redirectUri = computeRedirectUri();
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', getClientId());
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  // `prompt=consent` forces Google to re-issue a refresh token. Without
  // it, repeated sign-ins from the same account skip the consent
  // screen but ALSO skip emitting a refresh token, which breaks the
  // long-lived background sync.
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');

  // Open the popup. Width/height match Google's recommended consent
  // dimensions; if the popup is blocked we surface a clean error.
  const popup = window.open(
    url.toString(),
    'cadence-gdrive-auth',
    'width=480,height=720,menubar=no,toolbar=no,location=no,status=no',
  );
  if (!popup) {
    cleanupStateRecord(state);
    return { ok: false, reason: 'popup-blocked' };
  }

  // Listen for the redirect-side broker page to post the code back.
  // We can't read the popup URL directly (cross-origin during the
  // Google leg) so the broker page (same-origin) does it for us.
  const code = await waitForAuthCode(popup, state);
  cleanupStateRecord(state);
  if (code === 'cancelled') return { ok: false, reason: 'user-cancelled' };

  return exchangeCodeForTokens(code, codeVerifier, redirectUri);
}

function waitForAuthCode(popup: Window, expectedState: string): Promise<string> {
  return new Promise((resolve) => {
    let resolved = false;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || data.type !== 'cadence-gdrive-auth') return;
      if (data.state !== expectedState) return;
      resolved = true;
      cleanup();
      resolve(typeof data.code === 'string' ? data.code : 'cancelled');
    };
    const onClose = window.setInterval(() => {
      if (popup.closed && !resolved) {
        resolved = true;
        cleanup();
        resolve('cancelled');
      }
    }, 500);
    function cleanup() {
      window.removeEventListener('message', onMessage);
      window.clearInterval(onClose);
    }
    window.addEventListener('message', onMessage);
  });
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<AuthResult> {
  let resp: Response;
  try {
    resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: getClientId(),
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'network-error',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      detail = j.error_description || j.error || detail;
    } catch {
      /* swallow */
    }
    return { ok: false, reason: 'token-exchange-failed', detail };
  }
  const j = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };
  const expiresAt = Date.now() + (j.expires_in ?? 3500) * 1000;
  const email = j.id_token ? extractEmailFromIdToken(j.id_token) : undefined;
  const tokens: OAuthTokens = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt,
    email,
  };
  saveTokens(tokens);
  return { ok: true, tokens };
}

async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens | null> {
  const clientId = getClientId();
  if (!clientId) return null;
  let resp: Response;
  try {
    resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  const j = (await resp.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (j.expires_in ?? 3500) * 1000,
  };
}

/* ------------------------------------------------------------------ */
/* OAuth broker page support                                           */
/* ------------------------------------------------------------------ */

/**
 * Called by `bootstrap` (in `main.tsx`) to handle the redirect leg of
 * the OAuth dance. If the current URL is the redirect target (i.e. it
 * has `?oauth=google&code=...`), we read the code + state and forward
 * them to the opener via postMessage, then close ourselves.
 *
 * Returns `true` when this page WAS the redirect — the caller should
 * skip its normal rendering since we're about to close.
 */
export function maybeHandleOAuthRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('oauth') !== 'google') return false;
  const code = params.get('code') ?? '';
  const state = params.get('state') ?? '';
  const opener = window.opener as Window | null;
  if (opener) {
    try {
      opener.postMessage(
        { type: 'cadence-gdrive-auth', code, state },
        window.location.origin,
      );
    } catch {
      /* opener went away */
    }
  }
  // Always close ourselves, even if no opener — leaves a clean tab state.
  setTimeout(() => {
    if (typeof window !== 'undefined') window.close();
  }, 50);
  return true;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isElectronRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as { cadence?: unknown; leeadman?: unknown }).cadence;
}

function computeRedirectUri(): string {
  // The redirect lives at the PWA's own origin so the popup is
  // same-origin once Google sends us back — that's how we read the
  // `?code=` param. We strip any hash and append `?oauth=google`.
  const base = `${window.location.origin}${window.location.pathname}`;
  // Trim trailing slash to avoid `…//` join when origin already ends with /
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}/?oauth=google`;
}

function cleanupStateRecord(state: string): void {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(STATE_PREFIX + state);
    } catch {
      /* swallow */
    }
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function generateCodeVerifier(): string {
  // RFC 7636 recommends 43-128 url-safe chars. 64 random bytes ⇒ ~86
  // base64url chars, well in range and high entropy.
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function sha256base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return toBase64Url(new Uint8Array(hash));
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function extractEmailFromIdToken(idToken: string): string | undefined {
  try {
    // id_token = header.payload.signature; we only need the unsigned payload.
    const parts = idToken.split('.');
    if (parts.length < 2) return undefined;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = JSON.parse(atob(padded + pad));
    return typeof json.email === 'string' ? json.email : undefined;
  } catch {
    return undefined;
  }
}
