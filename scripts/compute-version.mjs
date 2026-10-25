#!/usr/bin/env node
/**
 * Compute the release version and write it into package.json.
 *
 * Scheme: CalVer `YYYY.M.<build>` (e.g. 2026.7.72), where:
 *   - YYYY  = current UTC year   (semver MAJOR)
 *   - M     = current UTC month, 1–12, no zero padding (semver MINOR)
 *   - build = the CI run number  (semver PATCH)
 *
 * Why this is safe for the auto-updater (electron-updater compares semver):
 *   - It is always valid semver (three numeric fields).
 *   - It is strictly monotonic: year dominates month dominates build, and the
 *     CI run number never decreases within a month. Every new release is
 *     therefore semver-greater than any previous one, so installed clients on
 *     older versions (including the legacy `0.3.x` line — 2026 > 0) always see
 *     the release as an upgrade.
 *
 * A beta build is the same number with a semver prerelease tag (`2026.10.150-beta.1`): it sorts below its own
 * stable release and above every earlier build. electron-updater ignores prereleases for stable installs and
 * offers them (and later stable releases) to installs that are themselves a beta.
 *
 * Run from CI:  node scripts/compute-version.mjs "<run_number>" [stable|beta]
 * The build argument is required so the value is explicit and reproducible.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pure version computation. Mirrors `computeCalVerVersion` in
 * `src/lib/appVersionLabel.ts` — the two are kept intentionally in sync and a
 * round-trip test asserts the UI formatter parses exactly what this produces.
 * @param {Date} date  Reference date (UTC fields are used).
 * @param {number} build  Non-negative integer build/run number.
 * @returns {string} `YYYY.M.build`
 */
export function computeVersion(date, build, channel) {
  if (!Number.isInteger(build) || build < 0) {
    throw new Error(`build must be a non-negative integer, got: ${build}`);
  }
  if (channel !== undefined && channel !== 'beta') {
    throw new Error(`unknown release channel: ${channel}`);
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1–12
  const core = `${year}.${month}.${build}`;
  return channel === 'beta' ? `${core}-beta.1` : core;
}

// Only touch the filesystem when invoked directly (not when imported).
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  const rawBuild = process.argv[2];
  if (rawBuild === undefined || rawBuild === '') {
    console.error('Usage: node scripts/compute-version.mjs <build-number> [stable|beta]');
    process.exit(1);
  }
  const build = Number(rawBuild);
  if (!Number.isInteger(build) || build < 0) {
    console.error(`Invalid build number: "${rawBuild}" (expected a non-negative integer)`);
    process.exit(1);
  }
  const rawChannel = process.argv[3] ?? 'stable';
  if (rawChannel !== 'stable' && rawChannel !== 'beta') {
    console.error(`Invalid channel: "${rawChannel}" (expected stable or beta)`);
    process.exit(1);
  }

  const version = computeVersion(new Date(), build, rawChannel === 'beta' ? 'beta' : undefined);

  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  console.log('version ->', version);
}
