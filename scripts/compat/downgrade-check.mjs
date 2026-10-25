#!/usr/bin/env node
/**
 * Release check: what happens to data written by the CURRENT code when an OLDER release opens it?
 *
 *   node scripts/compat/downgrade-check.mjs <git-ref-of-older-release>
 *
 * The current build seeds a data folder; the older build (checked out into a throwaway worktree) opens a copy.
 * Notes, tasks, teams and the images notes use MUST be identical (exit code 1 otherwise). Note history is only
 * reported: docs/COMPATIBILITY.md lists what an older build is known to hide or replace there.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EMAIL, PASSWORD, readBack, seed, wait } from './seed.mjs';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ref = process.argv[2];
if (!ref) {
  console.error('Usage: node scripts/compat/downgrade-check.mjs <git-ref-of-older-release>');
  process.exit(1);
}
const { loadMain } = require(path.join(root, 'electron', 'testing', 'mainHarness.cjs'));

const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-downgrade-'));
const worktree = path.join(scratch, 'wt');
execFileSync('git', ['worktree', 'add', '--detach', worktree, commit], { cwd: root, stdio: 'ignore' });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(worktree, 'node_modules'));

let current;
let older;
let failed = false;
try {
  // 1. The current build writes the data, then the user changes the password (the case that seals history).
  current = loadMain(path.join(root, 'electron', 'main.cjs'));
  await seed(current);
  const changed = await current.invoke('account:changePassword', { oldPassword: PASSWORD, newPassword: 'compat-new-password-2' });
  if (!changed.ok) throw new Error(`password change failed: ${changed.error}`);
  const before = await readBack(current);
  await wait(800);
  const copy = path.join(scratch, 'userData');
  fs.cpSync(current.userDataDir, copy, { recursive: true });

  // 2. The older build opens the copy.
  const mainJs = fs.readFileSync(path.join(worktree, 'electron', 'main.cjs'), 'utf8');
  const needsLegacyInit = !mainJs.includes("initNoteHistory(() => app.getPath('userData'), (uid)");
  older = loadMain(path.join(worktree, 'electron', 'main.cjs'), { userDataDir: copy, legacyHistoryInit: needsLegacyInit });
  const login = await older.invoke('account:login', { email: EMAIL, password: 'compat-new-password-2' });
  if (!login.ok) throw new Error(`the older build cannot sign in: ${login.error}`);
  const after = await readBack(older);

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const must = [
    ['notes', same(before.notes, after.notes)],
    ['tasks', same(before.todos, after.todos)],
    ['teams', same(before.teams, after.teams)],
    ['images', same(before.images, after.images)],
  ];
  for (const [name, ok] of must) {
    console.log(`${ok ? '✓' : '✗'} ${name} ${ok ? 'identical' : 'DIFFER'}`);
    if (!ok) failed = true;
  }
  const revs = (x) => Object.values(x.history).flat().length;
  console.log(`  note history: ${revs(before)} revisions written by the current build, ${revs(after)} visible to ${commit.slice(0, 7)} (reported, not a failure)`);
} catch (err) {
  console.error('✗', err instanceof Error ? err.message : err);
  failed = true;
} finally {
  current?.dispose();
  older?.dispose();
  try {
    execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'ignore' });
  } catch {
    /* removed with the scratch folder below */
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
