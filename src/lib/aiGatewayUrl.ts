/**
 * Validation for the user-supplied base URL of an OpenAI-compatible gateway.
 *
 * The Electron main process re-validates with the same rules
 * (`electron/aiGateway.cjs`); this copy gives the Settings form and the web
 * build immediate feedback. Keep the two in sync — both are covered by the same
 * case table in their tests.
 *
 * Rules:
 *  - `https:` is accepted for any host.
 *  - `http:` is accepted only for hosts that never leave the local network:
 *    loopback, RFC 1918 private ranges, and `.local` names. A bearer token sent
 *    over plain HTTP across the internet would be readable on the wire.
 *  - No embedded credentials, query string or fragment.
 */

import type { AISettings, GatewayFormat, GatewayHeader } from '../model';

export type GatewayUrlResult = { ok: true; url: string } | { ok: false; error: string };

function isPrivateHttpHost(hostname: string): boolean {
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

export function normalizeGatewayBaseUrl(raw: string): GatewayUrlResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'Enter the gateway base URL, e.g. http://localhost:20128/v1.' };
  let u: URL;
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
      error: 'Plain http:// is only allowed for localhost and private-network addresses. Use https:// for remote gateways.',
    };
  }
  return { ok: true, url: `${u.origin}${u.pathname.replace(/\/+$/, '')}` };
}

/** `<base>/chat/completions` for a validated base URL. */
export function gatewayChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

// ---------- request path, headers and per-format defaults ----------------------

export type GatewayPathResult = { ok: true; path: string } | { ok: false; error: string };

/** `.` or `..`, also when written percent-encoded (`%2e%2e`), which URL parsing collapses. */
function isDotSegment(seg: string): boolean {
  let decoded = seg;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    return true; // malformed escape: refuse rather than guess
  }
  return decoded === '.' || decoded === '..';
}

/**
 * A path appended to the (already validated) base URL. It must stay a plain
 * path: no query or fragment, no `..` segments, no backslashes, no scheme.
 * `{model}` is allowed as a placeholder and replaced before this runs.
 */
export function validateGatewayPath(raw: string): GatewayPathResult {
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//')) {
    return { ok: false, error: 'The request path must start with a single "/", e.g. /chat/completions.' };
  }
  if (/[?#\\\s]/.test(path)) {
    return { ok: false, error: 'The request path must not contain "?", "#", "\\" or spaces.' };
  }
  if (path.split('/').some(isDotSegment)) {
    return { ok: false, error: 'The request path must not contain "." or ".." segments.' };
  }
  if (!/^[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(path)) {
    return { ok: false, error: 'The request path contains characters that are not allowed.' };
  }
  return { ok: true, path };
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MAX_HEADERS = 20;
const MAX_HEADER_VALUE = 4096;

/** Headers the transport sets itself or that could redirect or smuggle a request. */
export const FORBIDDEN_GATEWAY_HEADERS = new Set([
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

export type GatewayHeadersResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; error: string };

export function validateGatewayHeaders(input: Record<string, string>): GatewayHeadersResult {
  const entries = Object.entries(input);
  if (entries.length > MAX_HEADERS) {
    return { ok: false, error: `At most ${MAX_HEADERS} headers are allowed.` };
  }
  const seen = new Set<string>();
  const out: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (!HEADER_NAME.test(name)) return { ok: false, error: `"${name}" is not a valid header name.` };
    const lower = name.toLowerCase();
    if (FORBIDDEN_GATEWAY_HEADERS.has(lower)) {
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

type FormatDefaults = {
  path: string;
  authHeader: string;
  /** Headers the format requires regardless of the user's settings. */
  headers: Record<string, string>;
};

export function gatewayFormatDefaults(format: GatewayFormat): FormatDefaults {
  switch (format) {
    case 'openai-responses':
      return { path: '/responses', authHeader: 'Authorization', headers: {} };
    case 'anthropic':
      return { path: '/messages', authHeader: 'x-api-key', headers: { 'anthropic-version': '2023-06-01' } };
    case 'gemini':
      return { path: '/models/{model}:generateContent', authHeader: 'x-goog-api-key', headers: {} };
    case 'openai-chat':
    default:
      return { path: '/chat/completions', authHeader: 'Authorization', headers: {} };
  }
}

export type ResolvedGatewayRequest =
  | { ok: true; url: string; baseUrl: string; path: string; headers: Record<string, string>; authHeader: string }
  | { ok: false; error: string };

/**
 * Turns the saved gateway settings into the URL and headers of one request.
 * Precedence for headers: format defaults < user extra headers < auth header.
 */
export function resolveGatewayRequest(
  settings: Pick<
    AISettings,
    'baseUrl' | 'gatewayFormat' | 'authHeader' | 'authScheme' | 'extraHeaders' | 'requestPath'
  >,
  model: string,
  apiKey: string,
): ResolvedGatewayRequest {
  const base = normalizeGatewayBaseUrl(settings.baseUrl ?? '');
  if (!base.ok) return base;
  const defaults = gatewayFormatDefaults(settings.gatewayFormat ?? 'openai-chat');

  const rawPath = (settings.requestPath?.trim() || defaults.path).replace(/\{model\}/g, encodeURIComponent(model));
  const path = validateGatewayPath(rawPath);
  if (!path.ok) return path;

  const authHeader = settings.authHeader?.trim() || defaults.authHeader;
  const merged = new Map<string, [string, string]>(); // lower-case name -> [name, value]
  const put = (name: string, value: string) => merged.set(name.toLowerCase(), [name, value]);
  for (const [n, v] of Object.entries(defaults.headers)) put(n, v);
  for (const h of settings.extraHeaders ?? []) put(h.name, h.value);
  if (apiKey) {
    const scheme = settings.authScheme ?? (authHeader.toLowerCase() === 'authorization' ? 'bearer' : 'raw');
    put(authHeader, scheme === 'bearer' ? `Bearer ${apiKey}` : apiKey);
  }
  const headers = validateGatewayHeaders(Object.fromEntries([...merged.values()]));
  if (!headers.ok) return headers;
  return {
    ok: true,
    url: `${base.url}${path.path}`,
    baseUrl: base.url,
    path: path.path,
    headers: headers.headers,
    authHeader,
  };
}

// ---------- "Name: value" lines <-> header list (Settings textarea) -------------

export type HeaderLinesResult =
  | { ok: true; headers: GatewayHeader[] }
  | { ok: false; error: string };

/** One `Name: value` per line; blank lines are skipped. */
export function parseHeaderLines(text: string): HeaderLinesResult {
  const headers: GatewayHeader[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) {
      return { ok: false, error: `Line ${i + 1}: write each header as "Name: value".` };
    }
    headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() });
  }
  return { ok: true, headers };
}

export function formatHeaderLines(headers: GatewayHeader[] | undefined): string {
  return (headers ?? []).map((h) => `${h.name}: ${h.value}`).join('\n');
}
