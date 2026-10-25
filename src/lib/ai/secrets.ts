import type { AIConnection, AISettings, AppData } from '../../core/model';

/**
 * Exported files (JSON, portable ZIP) leave the encrypted data file, so they carry no API keys
 * and no extra-header values (those can hold tokens). Everything else about a connection is
 * kept, so a restore only needs the keys typed again; `restoreAiSecrets` puts back the ones
 * this device already has.
 */

const SECRET_KEYS = ['apiKey', 'extraHeaders'] as const;

/** Query parameters that look like they carry a credential, in a request path. */
const SECRET_PARAM = /key|token|secret|auth|sig|pass|credential/i;

/**
 * A request path may carry a `?query`. The `{apiKey}` placeholder is not a secret and stays; a
 * literal value in a parameter that looks like a credential is dropped. Harmless parameters
 * (an API version, say) stay so a restored gateway still works.
 */
function scrubRequestPath(path: string): string {
  const q = path.indexOf('?');
  if (q === -1) return path;
  const kept = path
    .slice(q + 1)
    .split('&')
    .filter((pair) => {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      return !(SECRET_PARAM.test(name) && value !== '' && value !== '{apiKey}');
    });
  return kept.length ? `${path.slice(0, q)}?${kept.join('&')}` : path.slice(0, q);
}

/**
 * An address can carry a login (`user:password@host`) or a key in its query. Both are dropped; the
 * scheme, host, port, path and harmless parameters stay, and an ordinary address comes back unchanged.
 */
export function scrubBaseUrl(url: string): string {
  const m = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/i.exec(url);
  if (!m) return scrubRequestPath(url);
  const authority = m[2]!;
  const at = authority.lastIndexOf('@');
  return `${m[1]}${at === -1 ? authority : authority.slice(at + 1)}${scrubRequestPath(m[3]!)}`;
}

function withoutSecrets<T extends object>(value: T): T {
  const copy = { ...value } as Record<string, unknown>;
  for (const key of SECRET_KEYS) delete copy[key];
  if (typeof copy.baseUrl === 'string') copy.baseUrl = scrubBaseUrl(copy.baseUrl);
  if (typeof copy.requestPath === 'string') copy.requestPath = scrubRequestPath(copy.requestPath);
  return copy as T;
}

export function stripAiSecrets(data: AppData): AppData {
  const ai = data.aiSettings;
  if (!ai) return data;
  const next: AISettings = withoutSecrets(ai);
  if (ai.connections) next.connections = ai.connections.map((c) => withoutSecrets(c));
  if (ai.unreadConnections) next.unreadConnections = ai.unreadConnections.map((c) => withoutSecrets(c));
  return { ...data, aiSettings: next };
}

const sameDestination = (
  a: { provider?: string; baseUrl?: string },
  b: { provider?: string; baseUrl?: string },
): boolean =>
  // Compared without logins and keys, so a backup (which has them removed) still matches this device.
  !!a.provider && a.provider === b.provider && scrubBaseUrl(a.baseUrl ?? '') === scrubBaseUrl(b.baseUrl ?? '');

/**
 * After a full restore, gives back the keys this device already holds, but only to a connection
 * with the same provider and address (and, for extra connections, the same id). A key is never
 * attached to a destination it was not saved for, so an edited backup cannot redirect it.
 */
export function restoreAiSecrets(imported: AppData, local: AppData): AppData {
  const inc = imported.aiSettings;
  const mine = local.aiSettings;
  if (!inc || !mine) return imported;

  const next: AISettings = { ...inc };
  if (!inc.apiKey && mine.apiKey && sameDestination(inc, mine)) next.apiKey = mine.apiKey;
  if (!inc.extraHeaders?.length && mine.extraHeaders?.length && sameDestination(inc, mine)) {
    next.extraHeaders = mine.extraHeaders;
  }
  if (inc.connections && mine.connections) {
    next.connections = inc.connections.map((c): AIConnection => {
      const own = mine.connections?.find((m) => m.id === c.id);
      if (!own || !sameDestination(c, own)) return c;
      return {
        ...c,
        ...(!c.apiKey && own.apiKey ? { apiKey: own.apiKey } : {}),
        ...(!c.extraHeaders?.length && own.extraHeaders?.length ? { extraHeaders: own.extraHeaders } : {}),
      };
    });
  }
  if (inc.unreadConnections || mine.unreadConnections) {
    const localUnread = mine.unreadConnections ?? [];
    const idOf = (c: Record<string, unknown>) => String(c.id ?? '').trim();
    const knownIds = new Set([...(inc.connections ?? []).map((c) => c.id), ...(inc.unreadConnections ?? []).map(idOf)]);
    // Entries in the file get their keys back when they match a local one; local entries the file
    // does not have at all are kept, with their keys.
    const refilled = (inc.unreadConnections ?? []).map((c) => {
      const own = localUnread.find((m) => idOf(m) === idOf(c));
      if (!own || !sameDestination(c as { provider?: string; baseUrl?: string }, own as { provider?: string; baseUrl?: string })) return c;
      return {
        ...c,
        ...(!c.apiKey && own.apiKey ? { apiKey: own.apiKey } : {}),
        ...(!c.extraHeaders && own.extraHeaders ? { extraHeaders: own.extraHeaders } : {}),
      };
    });
    const carried = localUnread.filter((m) => !knownIds.has(idOf(m)));
    const all = [...refilled, ...carried].slice(0, 20);
    next.unreadConnections = all.length ? all : undefined;
  }
  return { ...imported, aiSettings: next };
}
