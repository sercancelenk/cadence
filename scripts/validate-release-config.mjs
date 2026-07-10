#!/usr/bin/env node
/**
 * Preflight checks for desktop release builds.
 * Run on macOS after build:reminder-helper; run on any OS before packaging.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minimatch } from 'minimatch';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkHelper = process.argv.includes('--check-helper');
const checkVersion = process.argv.includes('--check-version');

/** How many times to retry the "latest release" lookup on a transient error. */
const RELEASE_LOOKUP_RETRIES = 3;

let failed = false;
const fail = (msg) => {
  console.error('✗', msg);
  failed = true;
};
const ok = (msg) => console.log('✓', msg);

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

const MAC_HELPER_EXTRA_TO = 'MacOS/helpers/cadence-notify-schedule';
const MAC_HELPER_BINARY = 'Contents/MacOS/helpers/cadence-notify-schedule';

function validateMacBlock(label, mac) {
  if (!mac) {
    fail(`${label}: missing mac config`);
    return;
  }
  if (mac.bin) {
    fail(`${label}: mac.bin is invalid in electron-builder 25 — use extraFiles + binaries`);
  }
  const hasHelperExtra = mac.extraFiles?.some((f) => f.to === MAC_HELPER_EXTRA_TO);
  if (!hasHelperExtra) {
    fail(
      `${label}: mac.extraFiles must copy cadence-notify-schedule into ${MAC_HELPER_EXTRA_TO} (signing order)`,
    );
  }
  if (!mac.binaries?.includes(MAC_HELPER_BINARY)) {
    fail(`${label}: mac.binaries must list helper for signing/notarization`);
  }
  const pattern = mac.x64ArchFiles;
  if (!pattern) {
    fail(`${label}: mac.x64ArchFiles is required for universal packaging`);
  } else if (!minimatch(MAC_HELPER_BINARY, pattern, { matchBase: true })) {
    fail(`${label}: x64ArchFiles "${pattern}" does not match ${MAC_HELPER_BINARY}`);
  } else {
    ok(`${label}: mac universal helper config`);
  }
}

function validateWinBlock(label, win) {
  if (!win?.extraFiles?.some((f) => f.from?.includes('cadence-notify-schedule.exe'))) {
    fail(`${label}: win.extraFiles must bundle cadence-notify-schedule.exe`);
  } else {
    ok(`${label}: win helper extraFiles`);
  }
}

/**
 * The GitHub publish target is baked into `app-update.yml` and drives the
 * runtime auto-updater feed. A placeholder / mismatched owner ships a build
 * whose update checks 404 forever — validate it against the repository URL.
 */
function repoOwnerFromPackage(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(url ?? '');
  return m ? { owner: m[1], repo: m[2] } : null;
}

function validatePublishBlock(label, publish, expected) {
  const targets = Array.isArray(publish) ? publish : publish ? [publish] : [];
  const github = targets.filter((t) => t?.provider === 'github');
  if (github.length === 0) {
    fail(`${label}: no github publish target (auto-updater has no feed)`);
    return;
  }
  for (const t of github) {
    if (!t.owner || /YOUR_GITHUB_USERNAME/i.test(t.owner)) {
      fail(`${label}: publish.owner is a placeholder ("${t.owner}") — auto-updater will 404`);
    } else if (expected && t.owner !== expected.owner) {
      fail(`${label}: publish.owner "${t.owner}" != repository owner "${expected.owner}"`);
    } else if (expected && t.repo && t.repo !== expected.repo) {
      fail(`${label}: publish.repo "${t.repo}" != repository "${expected.repo}"`);
    } else {
      ok(`${label}: github publish target (${t.owner}/${t.repo}${t.channel ? `#${t.channel}` : ''})`);
    }
  }
}

const pkg = readJson('package.json');
const enterprise = readJson('electron-builder.enterprise.json');
const expectedRepo = repoOwnerFromPackage(pkg);

validateMacBlock('package.json', pkg.build?.mac);
validateWinBlock('package.json', pkg.build?.win);
validatePublishBlock('package.json', pkg.build?.publish, expectedRepo);
validateMacBlock('electron-builder.enterprise.json', enterprise.mac);
validateWinBlock('electron-builder.enterprise.json', enterprise.win);
validatePublishBlock('electron-builder.enterprise.json', enterprise.publish, expectedRepo);

const programCs = fs.readFileSync(
  path.join(root, 'electron/reminder/native-windows/Program.cs'),
  'utf8',
);
if (programCs.includes('GetFutureScheduledToastNotificationsCollection')) {
  fail('Program.cs uses unsupported GetFutureScheduledToastNotificationsCollection');
} else if (!programCs.includes('GetScheduledToastNotifications()')) {
  fail('Program.cs must list pending toasts via ToastNotifier.GetScheduledToastNotifications()');
} else {
  ok('Windows Program.cs toast APIs');
}

const scheduler = fs.readFileSync(
  path.join(root, 'electron/reminder/inProcessScheduler.cjs'),
  'utf8',
);
if (/^const \{ Notification \} = require\('electron'\)/m.test(scheduler)) {
  fail('inProcessScheduler.cjs eagerly requires electron — CI unit tests will fail');
} else {
  ok('inProcessScheduler lazy electron load');
}

if (!fs.existsSync(path.join(root, 'build/entitlements.mac.plist'))) {
  fail('build/entitlements.mac.plist missing');
} else {
  ok('mac entitlements plist');
}

if (checkHelper && process.platform === 'darwin') {
  const helper = path.join(root, 'electron/reminder/native/cadence-notify-schedule');
  if (!fs.existsSync(helper)) {
    fail('macOS helper missing — run npm run build:reminder-helper with CI=true');
  } else {
    try {
      const info = execFileSync('lipo', ['-info', helper], { encoding: 'utf8' }).trim();
      if (!info.includes('x86_64') || !info.includes('arm64')) {
        fail(`macOS helper must be a universal fat binary for release: ${info}`);
      } else {
        ok(`macOS helper binary: ${info}`);
      }
    } catch {
      fail('could not inspect macOS helper with lipo');
    }
  }
}

if (checkHelper && process.platform === 'win32') {
  const exe = path.join(root, 'electron/reminder/native-windows/out/cadence-notify-schedule.exe');
  if (!fs.existsSync(exe)) {
    fail('Windows helper missing — run npm run build:reminder-helper-win');
  } else {
    ok('Windows helper exe present');
  }
}

/**
 * Compare two dot-separated numeric versions (e.g. "2026.7.72" vs "0.3.71").
 * Both the CalVer and the legacy lines are plain numeric triples, so a simple
 * field-by-field numeric comparison is exact — no semver dependency needed.
 * @returns {number} >0 if a>b, <0 if a<b, 0 if equal.
 */
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split(/[-+]/)[0].split('.').map(Number);
  const pb = String(b).replace(/^v/i, '').split(/[-+]/)[0].split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (Number.isNaN(na) || Number.isNaN(nb)) return NaN;
    if (na !== nb) return na - nb;
  }
  return 0;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Look up the latest *published* (non-draft, non-prerelease) release tag.
 * @returns {Promise<{ outcome: 'found'; tag: string } | { outcome: 'none' } | { outcome: 'inconclusive'; reason: string }>}
 *   - 'found'        the newest release tag was retrieved
 *   - 'none'         the repo has no releases yet (first release) — 404
 *   - 'inconclusive' we could not determine it (network/rate-limit) — fail-open
 */
async function fetchLatestReleaseTag(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cadence-release-guard',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let lastReason = 'unknown';
  for (let attempt = 1; attempt <= RELEASE_LOOKUP_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 404) return { outcome: 'none' };
      if (res.ok) {
        const body = await res.json();
        const tag = typeof body?.tag_name === 'string' ? body.tag_name : null;
        if (tag) return { outcome: 'found', tag };
        lastReason = 'response had no tag_name';
      } else if (res.status >= 500 || res.status === 403 || res.status === 429) {
        // Transient (server error) or rate-limited — worth retrying.
        lastReason = `HTTP ${res.status}`;
      } else {
        // Definite client error (401/422/…): retrying won't help.
        return { outcome: 'inconclusive', reason: `HTTP ${res.status}` };
      }
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
    }
    if (attempt < RELEASE_LOOKUP_RETRIES) {
      const backoff = 1000 * attempt;
      console.log(`  … retrying release lookup (${attempt}/${RELEASE_LOOKUP_RETRIES - 1}) after ${lastReason}`);
      await sleep(backoff);
    }
  }
  return { outcome: 'inconclusive', reason: lastReason };
}

if (checkVersion) {
  const newVersion = pkg.version;
  if (!expectedRepo) {
    // Can't determine the feed repo → can't compare. Fail-open with a warning.
    console.warn('⚠ version guard: could not resolve repository owner/repo — skipping (fail-open)');
  } else if (!/^\d+\.\d+\.\d+$/.test(String(newVersion))) {
    // A malformed version WOULD break the updater — this is a hard failure.
    fail(`version guard: package.json version "${newVersion}" is not a numeric semver triple`);
  } else {
    const result = await fetchLatestReleaseTag(expectedRepo.owner, expectedRepo.repo, process.env.GH_TOKEN);
    if (result.outcome === 'none') {
      ok(`version guard: no previous release found — ${newVersion} is the first (nothing to compare)`);
    } else if (result.outcome === 'inconclusive') {
      // Never block a legitimate release because we couldn't reach GitHub.
      console.warn(
        `⚠ version guard: could not verify against the latest release (${result.reason}) — proceeding (fail-open)`,
      );
    } else {
      const cmp = compareVersions(newVersion, result.tag);
      if (Number.isNaN(cmp)) {
        console.warn(
          `⚠ version guard: could not compare "${newVersion}" with "${result.tag}" — proceeding (fail-open)`,
        );
      } else if (cmp > 0) {
        ok(`version guard: ${newVersion} > ${result.tag} (latest release) — updater-safe`);
      } else {
        // Definite regression: shipping this would freeze auto-updates for
        // everyone already on the newer/equal version. Block hard.
        fail(
          `version guard: new version "${newVersion}" is not greater than the latest release "${result.tag}" — ` +
            'this would break auto-updates for current users. Release aborted.',
        );
      }
    }
  }
}

if (failed) {
  console.error('\nRelease preflight failed.');
  process.exit(1);
}

console.log('\nRelease preflight passed.');
