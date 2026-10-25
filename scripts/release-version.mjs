/**
 * Rules about release version strings, shared by the release guard and its tests.
 *
 * A release is a numeric triple (`2026.10.150`); a beta adds a semver prerelease tag (`2026.10.150-beta.1`).
 * electron-updater needs valid semver, and compares the prerelease tag below the plain number.
 */

export const RELEASE_VERSION_RE = /^\d+\.\d+\.\d+(-beta\.\d+)?$/;

/** @param {string} v */
export function isReleaseVersion(v) {
  return RELEASE_VERSION_RE.test(String(v));
}

/** @param {string} v */
export function isBetaVersion(v) {
  return /-beta\.\d+$/.test(String(v));
}

/**
 * Compare the numeric cores of two versions (the prerelease tag is ignored).
 * Both the CalVer and the legacy lines are numeric triples, so a field-by-field comparison is exact.
 * @returns {number} >0 if a>b, <0 if a<b, 0 if equal, NaN if either is not numeric.
 */
export function compareReleaseCores(a, b) {
  const core = (x) => String(x).replace(/^v/i, '').split(/[-+]/)[0].split('.').map(Number);
  const pa = core(a);
  const pb = core(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (Number.isNaN(na) || Number.isNaN(nb)) return NaN;
    if (na !== nb) return na - nb;
  }
  return 0;
}
