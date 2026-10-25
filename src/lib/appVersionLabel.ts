/**
 * App version presentation.
 *
 * The version string embedded in the build (and read by `electron-updater`)
 * is a plain, monotonic semver. Releases use CalVer: `YYYY.M.<build>` (e.g.
 * `2026.7.72`), where the year is the major, the month (1–12, no padding) is
 * the minor and the CI run number is the patch/"build". This keeps the
 * updater's semver comparison trivially correct while letting us show the
 * user a friendly label instead of a long number.
 *
 * Non-CalVer strings (e.g. the dev `0.2.0` from package.json, or anything we
 * can't confidently parse) fall back to a plain `v<raw>` label so nothing
 * ever renders as blank or wrong.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Smallest major we treat as a CalVer year. Guards against `1.x` semver. */
const CALVER_MIN_YEAR = 2000;

/**
 * Produce the release version string from a date + build number.
 *
 * `YYYY.M.<build>` using UTC date fields (month 1–12, no padding). This is the
 * canonical scheme; `scripts/compute-version.mjs` mirrors this exact formula
 * for CI (kept intentionally in sync, verified by the round-trip test).
 */
export function computeCalVerVersion(date: Date, build: number, channel?: 'beta'): string {
  if (!Number.isInteger(build) || build < 0) {
    throw new Error(`build must be a non-negative integer, got: ${build}`);
  }
  if (channel !== undefined && channel !== 'beta') {
    throw new Error(`unknown release channel: ${String(channel)}`);
  }
  const core = `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${build}`;
  // A beta is the same build number with a semver prerelease tag: it sorts below its own stable release and
  // above every earlier build, which is what the updater needs (see docs/RELEASING.md).
  return channel === 'beta' ? `${core}-beta.1` : core;
}

export interface AppVersionLabel {
  /** Human-facing label, e.g. "July 2026" (CalVer) or "v0.2.0" (fallback). */
  label: string;
  /** Build number (CalVer patch) when applicable, else null. */
  build: number | null;
  /** The semver prerelease channel ("beta"), or null for a stable build. */
  channel: string | null;
  /** The raw semver string as embedded in the build. */
  raw: string;
  /** True when `raw` parsed as a CalVer `YYYY.M.build` triple. */
  isCalVer: boolean;
}

/**
 * Format a raw semver version string for display.
 *
 * Pure and defensive: never throws, always returns a usable `label`.
 */
export function formatAppVersion(raw: string | null | undefined): AppVersionLabel {
  const safeRaw = typeof raw === 'string' ? raw.trim() : '';
  if (!safeRaw) {
    return { label: '—', build: null, channel: null, raw: '', isCalVer: false };
  }

  // Strip a leading "v" and any build-metadata/prerelease suffix before parsing
  // the numeric core (e.g. "2026.7.72+abc" or "2026.7.72-beta" -> "2026.7.72").
  const withoutV = safeRaw.replace(/^v/i, '');
  const core = withoutV.split(/[-+]/)[0] ?? '';
  // `2026.10.150-beta.1+abc` -> "beta"; build metadata (`+abc`) is not a channel.
  const channel = /^[^-+]+-([0-9A-Za-z]+)/.exec(withoutV.split('+')[0] ?? '')?.[1]?.toLowerCase() ?? null;
  const parts = core.split('.');

  if (parts.length === 3) {
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const build = Number(parts[2]);
    const isCalVer =
      Number.isInteger(year) &&
      year >= CALVER_MIN_YEAR &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12 &&
      Number.isInteger(build) &&
      build >= 0;
    if (isCalVer) {
      return {
        label: `${MONTHS[month - 1]} ${year}${channel ? ` (${channel})` : ''}`,
        build,
        channel,
        raw: safeRaw,
        isCalVer: true,
      };
    }
  }

  return { label: `v${core || safeRaw}`, build: null, channel, raw: safeRaw, isCalVer: false };
}
