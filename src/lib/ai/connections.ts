import type { AICapability, AIConnection, AIProvider, AISettings } from '../../model';
import { AI_PROVIDER_OPTIONS, DEFAULT_CONNECTION_ID } from '../../model';
import { isAIConfigured } from '../ai';
import type { DataClass } from './types';

/** One usable connection, shaped for the request engine (`settings`) and for the UI. */
export type ConnectionView = {
  id: string;
  name: string;
  /** What `askAI` takes: no ids, names, routing or other bookkeeping. */
  settings: AISettings;
  capabilities: AICapability[];
  /** A capability probe has run, so an absent capability means "does not do it", not "unknown". */
  probed: boolean;
  allowsPeopleData: boolean;
  isDefault: boolean;
};

/** `localhost`, `127.x.x.x` and `::1` only. A LAN host or a shared proxy is somebody else's machine. */
export function isLoopbackAddress(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '[::1]') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return !!m && Number(m[1]) === 127 && m.slice(1).every((n) => Number(n) <= 255);
}

/**
 * Whether `people` data (1:1 notes, feedback) may go through this connection. An explicit
 * switch wins either way; without one, only a gateway on a loopback address qualifies.
 */
export function connectionAllowsPeopleData(c: {
  provider: AIProvider;
  baseUrl?: string;
  allowPeopleData?: boolean;
}): boolean {
  if (typeof c.allowPeopleData === 'boolean') return c.allowPeopleData;
  return c.provider === 'gateway' && isLoopbackAddress(c.baseUrl);
}

function providerLabel(p: AIProvider): string {
  return AI_PROVIDER_OPTIONS.find((o) => o.value === p)?.label ?? p;
}

function extraView(c: AIConnection): ConnectionView {
  const { id: _id, name: _name, capabilities: _caps, probedAt: _probed, allowPeopleData: _allow, ...engine } = c;
  return {
    id: c.id,
    name: c.name,
    settings: engine,
    capabilities: c.capabilities ?? [],
    probed: !!c.probedAt,
    allowsPeopleData: connectionAllowsPeopleData(c),
    isDefault: false,
  };
}

function defaultView(s: AISettings & { provider: AIProvider }): ConnectionView {
  const { connections: _c, routing: _r, defaultMeta, ...engine } = s;
  return {
    id: DEFAULT_CONNECTION_ID,
    name: defaultMeta?.name ?? providerLabel(s.provider),
    settings: engine,
    capabilities: defaultMeta?.capabilities ?? [],
    probed: !!defaultMeta?.probedAt,
    allowsPeopleData: connectionAllowsPeopleData({
      provider: s.provider,
      baseUrl: s.baseUrl,
      allowPeopleData: defaultMeta?.allowPeopleData,
    }),
    isDefault: true,
  };
}

/** The default connection first (when a provider is chosen), then the extras in stored order. */
export function listConnections(settings: AISettings | undefined): ConnectionView[] {
  if (!settings) return [];
  const out: ConnectionView[] = [];
  if (settings.provider) out.push(defaultView(settings as AISettings & { provider: AIProvider }));
  for (const c of settings.connections ?? []) out.push(extraView(c));
  return out;
}

/**
 * Whether any connection (the default or an extra) is complete enough to use. AI entry points
 * are shown on this, so extra connections keep working after the default was removed.
 */
export function hasUsableConnection(settings: AISettings | undefined): boolean {
  return listConnections(settings).some((c) => isAIConfigured(c.settings));
}

export type ResolvedConnection =
  | { ok: true; connection: ConnectionView; fellBack: boolean }
  | { ok: false; reason: 'not-configured' };

/**
 * Picks the connection for a task: its own route, else the route of its data class, else
 * the default, else (no default configured) the first usable extra, so the entry points that
 * `hasUsableConnection` shows always work. A route to a connection that is gone or unusable
 * falls back the same way and says so (`fellBack`), so the UI can tell the user instead of failing.
 * People data is still checked against the chosen connection by the caller.
 */
export function resolveConnection(
  settings: AISettings | undefined,
  dataClass: DataClass,
  taskId: string,
): ResolvedConnection {
  const all = listConnections(settings).filter((c) => isAIConfigured(c.settings));
  const fallback = all.find((c) => c.isDefault) ?? all[0];
  const routedId = settings?.routing?.tasks?.[taskId] ?? settings?.routing?.[dataClass];
  if (routedId) {
    const routed = all.find((c) => c.id === routedId);
    if (routed) return { ok: true, connection: routed, fellBack: false };
    if (fallback) return { ok: true, connection: fallback, fellBack: true };
    return { ok: false, reason: 'not-configured' };
  }
  if (fallback) return { ok: true, connection: fallback, fellBack: false };
  return { ok: false, reason: 'not-configured' };
}
