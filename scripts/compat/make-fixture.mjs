#!/usr/bin/env node
/**
 * Builds a frozen compatibility fixture from a PAST build of the app.
 *
 *   node scripts/compat/make-fixture.mjs <label> <git-ref>
 *
 * It checks the ref out into a throwaway worktree, runs that build's real main process (against a stubbed
 * Electron, see electron/testing/mainHarness.cjs) to create the data in scripts/compat/seed.mjs, and stores the
 * resulting data folder plus what it should contain (`expected.json`) under electron/compat/fixtures/<label>/.
 *
 * `electron/compat/compat.test.ts` then proves the CURRENT build opens every fixture without loss.
 * docs/COMPATIBILITY.md explains when to add one.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EMAIL, PASSWORD, PIN, readBack, seed, wait } from './seed.mjs';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [label, ref] = process.argv.slice(2);
if (!label || !ref || !/^[a-z0-9._-]+$/i.test(label)) {
  console.error('Usage: node scripts/compat/make-fixture.mjs <label> <git-ref>');
  process.exit(1);
}

const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-compat-'));
const worktree = path.join(scratch, 'wt');
execFileSync('git', ['worktree', 'add', '--detach', worktree, commit], { cwd: root, stdio: 'ignore' });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(worktree, 'node_modules'));

const { loadMain } = require(path.join(root, 'electron', 'testing', 'mainHarness.cjs'));
// Builds before the key-sealed history set the history store up inside app.whenReady; this stub never fires it.
const mainJs = fs.readFileSync(path.join(worktree, 'electron', 'main.cjs'), 'utf8');
const needsLegacyInit = !mainJs.includes("initNoteHistory(() => app.getPath('userData'), (uid)");
const h = loadMain(path.join(worktree, 'electron', 'main.cjs'), { legacyHistoryInit: needsLegacyInit });

try {
  const { uid, recoveryCodes } = await seed(h);
  const { loaded, ...held } = await readBack(h);
  const expected = { email: EMAIL, password: PASSWORD, pin: PIN, userId: uid, recoveryCodes, ...held };

  // The backups this build could write: a full backup folder and a JSON export.
  const exportsDir = path.join(scratch, 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  if (h.has('data:exportBundle')) {
    h.pickOpen([exportsDir]);
    const r = await h.invoke('data:exportBundle', { data: loaded });
    if (!r.ok) throw new Error(`exportBundle failed: ${r.error}`);
    expected.exportFolder = path.basename(r.path);
  }
  fs.writeFileSync(path.join(exportsDir, 'workspace.json'), JSON.stringify(loaded, null, 2));

  await wait(800); // let background clean-up of this build settle before the folder is copied
  const dest = path.join(root, 'electron', 'compat', 'fixtures', label);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(h.userDataDir, path.join(dest, 'userData'), { recursive: true });
  fs.cpSync(exportsDir, path.join(dest, 'exports'), { recursive: true });
  expected.snapshots = fs
    .readdirSync(path.join(dest, 'userData', 'backups', uid))
    .filter((n) => /^data-.*\.json$/.test(n) && !n.includes('-shard-'))
    .sort();
  fs.writeFileSync(path.join(dest, 'expected.json'), JSON.stringify(expected, null, 2));
  fs.writeFileSync(path.join(dest, 'meta.json'), JSON.stringify({ label, ref, commit, createdAt: new Date().toISOString() }, null, 2));
  console.log(
    `fixture ${label} (${commit.slice(0, 7)}): ${expected.notes.length} notes, ${Object.keys(expected.images).length} images, ` +
      `${Object.values(expected.history).flat().length} history revisions, ${expected.snapshots.length} snapshots`,
  );
} finally {
  h.dispose();
  try {
    execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'ignore' });
  } catch {
    /* removed with the scratch folder below */
  }
  fs.rmSync(scratch, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}
