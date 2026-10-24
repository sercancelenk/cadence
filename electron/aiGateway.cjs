'use strict';

/**
 * Main-process HTTP client for the "Custom gateway" AI provider
 * (any OpenAI-compatible endpoint, e.g. OmniRoute).
 *
 * Why the main process: the renderer is bound by the production CSP
 * (`connect-src` lists fixed hosts) and by browser CORS, and a gateway's
 * error responses may omit CORS headers, which the renderer would see as an
 * opaque network failure. Requests made here avoid both, and the base URL is
 * validated here regardless of what the renderer sent.
 *
 * The renderer chooses the wire format and builds and parses the JSON; this
 * module only validates the target (base URL, path, headers) and performs the
 * HTTP exchange, reporting status + body text.
 */

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_CHARS = 4_000_000;

/** Mirrors `src/lib/aiGatewayUrl.ts` — keep the two in sync. */
function isPrivateHttpHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '[::1]') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return a === 192 && b === 168;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true; url: string } | { ok: false; error: string }}
 */
function normalizeGatewayBaseUrl(raw) {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input) return { ok: false, error: 'Enter the gateway base URL, e.g. http://localhost:20128/v1.' };
  let u;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, error: 'This is not a valid URL. Include http:// or https://.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, error: 'Only http:// and https:// URLs are supported.' };
  }
  if (u.username || u.password) {
    return { ok: false, error: 'Do not put credentials in the URL. Use the API key field.' };
  }
  if (u.search || u.hash) {
    return { ok: false, error: 'The URL must not contain a query string or fragment.' };
  }
  if (u.protocol === 'http:' && !isPrivateHttpHost(u.hostname)) {
    return {
      ok: false,
      error:
        'Plain http:// is only allowed for localhost and private-network addresses. Use https:// for remote gateways.',
    };
  }
  return { ok: true, url: `${u.origin}${u.pathname.replace(/\/+$/, '')}` };
}

/** `.` or `..`, also when written percent-encoded (`%2e%2e`), which URL parsing collapses. */
function isDotSegment(seg) {
  let decoded = seg;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    return true; // malformed escape: refuse rather than guess
  }
  // A decoded `%2f` can hide a dot segment inside one path segment (`%2e%2e%2fx`).
  return decoded.split('/').some((part) => part === '.' || part === '..');
}

/** Mirrors `validateGatewayPath` in `src/lib/aiGatewayUrl.ts` — keep the two in sync. */
function validateGatewayPath(raw) {
  const full = typeof raw === 'string' ? raw.trim() : '';
  const q = full.indexOf('?');
  const path = q === -1 ? full : full.slice(0, q);
  const query = q === -1 ? '' : full.slice(q + 1);
  if (!path.startsWith('/') || path.startsWith('//')) {
    return { ok: false, error: 'The request path must start with a single "/", e.g. /chat/completions.' };
  }
  if (/[#\\\s]/.test(path)) {
    return { ok: false, error: 'The request path must not contain "#", "\\" or spaces.' };
  }
  if (query && (/[#\\\s]/.test(query) || !/^[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(query))) {
    return { ok: false, error: 'The query string contains characters that are not allowed.' };
  }
  if (path.split('/').some(isDotSegment)) {
    return { ok: false, error: 'The request path must not contain "." or ".." segments.' };
  }
  if (!/^[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(path)) {
    return { ok: false, error: 'The request path contains characters that are not allowed.' };
  }
  return { ok: true, path: full };
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MAX_HEADERS = 20;
const MAX_HEADER_VALUE = 4096;
const FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'content-type',
  'connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'keep-alive',
  'expect',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'proxy-connection',
]);

/** Mirrors `validateGatewayHeaders` in `src/lib/aiGatewayUrl.ts`. */
function validateGatewayHeaders(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Headers must be an object.' };
  }
  const entries = Object.entries(input);
  if (entries.length > MAX_HEADERS) return { ok: false, error: `At most ${MAX_HEADERS} headers are allowed.` };
  const seen = new Set();
  const out = {};
  for (const [name, value] of entries) {
    if (!HEADER_NAME.test(name)) return { ok: false, error: `"${name}" is not a valid header name.` };
    const lower = name.toLowerCase();
    if (FORBIDDEN_HEADERS.has(lower)) {
      return { ok: false, error: `The "${name}" header is set by Cadence and cannot be overridden.` };
    }
    if (seen.has(lower)) return { ok: false, error: `The "${name}" header appears twice.` };
    seen.add(lower);
    // eslint-disable-next-line no-control-regex
    if (typeof value !== 'string' || value.length > MAX_HEADER_VALUE || /[\u0000-\u001f\u007f]/.test(value)) {
      return { ok: false, error: `The value of the "${name}" header is not valid.` };
    }
    out[name] = value;
  }
  return { ok: true, headers: out };
}

/**
 * Reads a response body as text, stopping as soon as it exceeds `maxChars`
 * instead of buffering all of it first. Returns `null` when it is too large.
 * Falls back to `res.text()` for responses without a readable stream.
 *
 * @param {Response} res
 * @param {number} maxChars
 * @returns {Promise<string | null>}
 */
async function readCapped(res, maxChars) {
  const declared = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxChars * 4) return null;
  const reader = res.body?.getReader?.();
  if (!reader) {
    const text = await res.text();
    return text.length > maxChars ? null : text;
  }
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > maxChars) {
      await reader.cancel().catch(() => {});
      return null;
    }
  }
  return text + decoder.decode();
}

/**
 * @param {{ fetch: typeof fetch; timeoutMs?: number }} deps
 */
function createGatewayClient(deps) {
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  /** @type {Map<string, AbortController>} */
  const inflight = new Map();

  /**
   * @param {{ requestId?: unknown; baseUrl?: unknown; path?: unknown; headers?: unknown; body?: unknown }} req
   * @returns {Promise<{ ok: true; status: number; text: string } | { ok: false; error: string; aborted?: boolean }>}
   */
  async function chat(req) {
    const base = normalizeGatewayBaseUrl(req?.baseUrl);
    if (!base.ok) return { ok: false, error: base.error };
    const path = validateGatewayPath(req.path);
    if (!path.ok) return { ok: false, error: path.error };
    const headers = validateGatewayHeaders(req.headers ?? {});
    if (!headers.ok) return { ok: false, error: headers.error };
    if (typeof req.body !== 'string' || !req.body) return { ok: false, error: 'Empty request body.' };
    const requestId = typeof req.requestId === 'string' ? req.requestId : '';

    const ctrl = new AbortController();
    if (requestId) inflight.set(requestId, ctrl);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    try {
      const res = await deps.fetch(`${base.url}${path.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers.headers },
        body: req.body,
        signal: ctrl.signal,
        // A redirect could carry the bearer token to another host.
        redirect: 'error',
      });
      const text = await readCapped(res, MAX_RESPONSE_CHARS);
      if (text === null) return { ok: false, error: 'The gateway response was too large.' };
      return { ok: true, status: res.status, text };
    } catch (err) {
      if (timedOut) {
        return { ok: false, error: `The gateway did not answer within ${Math.round(timeoutMs / 1000)} seconds.` };
      }
      if (ctrl.signal.aborted) return { ok: false, error: 'Request cancelled.', aborted: true };
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Could not reach the gateway (${reason}).` };
    } finally {
      clearTimeout(timer);
      if (requestId) inflight.delete(requestId);
    }
  }

  /** @param {unknown} requestId */
  function abort(requestId) {
    if (typeof requestId !== 'string') return false;
    const ctrl = inflight.get(requestId);
    if (!ctrl) return false;
    ctrl.abort();
    return true;
  }

  return { chat, abort };
}

module.exports = {
  normalizeGatewayBaseUrl,
  validateGatewayPath,
  validateGatewayHeaders,
  createGatewayClient,
};
