export type EpochParseResult =
  | {
      ok: true;
      ms: number;
      unit: 's' | 'ms';
    }
  | { ok: false; error: string };

export type EpochViews = {
  local: string;
  utc: string;
  iso: string;
  seconds: number;
  millis: number;
};

/** ECMAScript Date absolute limit (±100_000_000 days from epoch). */
export const MAX_EPOCH_MS = 8.64e15;

function inDateRange(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_EPOCH_MS;
}

/**
 * Parse a Unix timestamp (seconds or milliseconds).
 * Heuristic: absolute value with ≥13 digits (or ≥1e12) → ms; else seconds.
 */
export function parseEpochInput(raw: string): EpochParseResult {
  const t = raw.trim();
  if (!t) return { ok: false, error: 'Enter a Unix timestamp (seconds or milliseconds).' };
  if (!/^-?\d+(\.\d+)?$/.test(t)) {
    return { ok: false, error: 'Timestamp must be a number (optional fractional seconds).' };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: 'Timestamp is not a finite number.' };

  const abs = Math.abs(n);
  const digits = t.replace(/^-/, '').split('.')[0]?.length ?? 0;
  const asMs = digits >= 13 || abs >= 1e12;
  const ms = asMs ? Math.trunc(n) : Math.trunc(n * 1000);
  if (!inDateRange(ms)) {
    return { ok: false, error: 'Timestamp is outside the valid Date range.' };
  }
  return { ok: true, ms, unit: asMs ? 'ms' : 's' };
}

/** Format an epoch ms value. Returns null if outside the Date range (never throws). */
export function formatEpochViews(ms: number): EpochViews | null {
  if (!inDateRange(ms)) return null;
  const d = new Date(ms);
  let iso: string;
  try {
    iso = d.toISOString();
  } catch {
    return null;
  }
  return {
    local: d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' }),
    utc: d.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' }) + ' UTC',
    iso,
    seconds: Math.trunc(ms / 1000),
    millis: ms,
  };
}

export function isoToEpochMs(iso: string): EpochParseResult {
  const t = iso.trim();
  if (!t) return { ok: false, error: 'Enter an ISO-8601 datetime.' };
  const ms = Date.parse(t);
  if (!inDateRange(ms)) return { ok: false, error: 'Could not parse that datetime.' };
  return { ok: true, ms, unit: 'ms' };
}
