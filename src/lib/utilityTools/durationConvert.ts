/**
 * Duration unit converter (ephemeral Tools helper).
 * Month / year use mean Gregorian lengths — not calendar months.
 */

export type DurationUnit = 'ms' | 's' | 'min' | 'h' | 'd' | 'w' | 'mo' | 'y';

export type DurationUnitMeta = {
  id: DurationUnit;
  label: string;
  shortLabel: string;
  /** True when the factor is an average, not an exact SI multiple. */
  approximate: boolean;
};

/** Mean Gregorian year (days). */
const DAYS_PER_YEAR = 365.2425;
/** Mean Gregorian month (days). */
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

const MS_PER: Record<DurationUnit, number> = {
  ms: 1,
  s: 1000,
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  mo: DAYS_PER_MONTH * 86_400_000,
  y: DAYS_PER_YEAR * 86_400_000,
};

export const DURATION_UNITS: DurationUnitMeta[] = [
  { id: 'ms', label: 'Milliseconds', shortLabel: 'ms', approximate: false },
  { id: 's', label: 'Seconds', shortLabel: 's', approximate: false },
  { id: 'min', label: 'Minutes', shortLabel: 'min', approximate: false },
  { id: 'h', label: 'Hours', shortLabel: 'h', approximate: false },
  { id: 'd', label: 'Days', shortLabel: 'd', approximate: false },
  { id: 'w', label: 'Weeks', shortLabel: 'w', approximate: false },
  { id: 'mo', label: 'Months', shortLabel: 'mo', approximate: true },
  { id: 'y', label: 'Years', shortLabel: 'y', approximate: true },
];

export type DurationParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export type DurationRow = {
  unit: DurationUnit;
  label: string;
  shortLabel: string;
  approximate: boolean;
  value: number;
  display: string;
};

/** Reject absurd magnitudes that lose integer ms precision or overflow. */
const MAX_ABS_MS = Number.MAX_SAFE_INTEGER;

export function parseDurationAmount(raw: string): DurationParseResult {
  const t = raw.trim().replace(/,/g, '');
  if (!t) return { ok: false, error: 'Enter a duration amount.' };
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) {
    return { ok: false, error: 'Amount must be a number.' };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: 'Amount is not a finite number.' };
  return { ok: true, value: n };
}

export function isDurationUnit(value: string): value is DurationUnit {
  return Object.prototype.hasOwnProperty.call(MS_PER, value);
}

export function toMilliseconds(amount: number, unit: DurationUnit): number {
  return amount * MS_PER[unit];
}

export function fromMilliseconds(ms: number, unit: DurationUnit): number {
  return ms / MS_PER[unit];
}

/**
 * Format for display / copy: integers stay clean; fractions trim trailing zeros.
 */
export function formatDurationValue(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Object.is(n, -0)) return '0';
  if (Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) {
    return String(n);
  }
  // Up to 12 significant digits, strip trailing zeros from fixed expansion.
  const fixed = n.toPrecision(12);
  const asNum = Number(fixed);
  if (!Number.isFinite(asNum)) return String(n);
  if (Number.isInteger(asNum) && Math.abs(asNum) <= Number.MAX_SAFE_INTEGER) {
    return String(asNum);
  }
  return String(asNum);
}

export function convertDurationAll(
  amount: number,
  from: DurationUnit,
): { ok: true; ms: number; rows: DurationRow[] } | { ok: false; error: string } {
  if (!Number.isFinite(amount)) {
    return { ok: false, error: 'Amount is not a finite number.' };
  }
  const ms = toMilliseconds(amount, from);
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_ABS_MS) {
    return { ok: false, error: 'Duration is too large to convert safely.' };
  }
  const rows: DurationRow[] = DURATION_UNITS.map((meta) => {
    const value = fromMilliseconds(ms, meta.id);
    return {
      unit: meta.id,
      label: meta.label,
      shortLabel: meta.shortLabel,
      approximate: meta.approximate,
      value,
      display: formatDurationValue(value),
    };
  });
  return { ok: true, ms, rows };
}
