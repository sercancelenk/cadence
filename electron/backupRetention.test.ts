import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { changeRetention, getRetentionState } = require('./backupRetention.cjs');
const { prefsPathForUser, readPrefs, writePrefs } = require('./dailyBackupMirror.cjs');
const { readSnapshotPrefs } = require('./persistence/snapshotRetention.cjs');

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let root: string;
let userData: string;
let mirrorDir: string;
let backupsDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-retention-'));
  userData = path.join(root, 'userData');
  mirrorDir = path.join(root, 'mirror');
  backupsDir = path.join(userData, 'backups', USER);
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(mirrorDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const writeJsonText = (file: string, text: string) => {
  fs.writeFileSync(file, text);
  return { ok: true as const };
};
const deps = (over: Record<string, unknown> = {}) => ({
  fs,
  path,
  userDataDir: userData,
  filePrefix: 'cadence',
  userId: USER,
  appSlug: 'cadence',
  backupsDir,
  writeJsonText,
  ...over,
});

function dailyFolder(owner: string, d: number) {
  const dir = path.join(mirrorDir, `cadence-daily-${owner}-2026-07-${String(d).padStart(2, '0')}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ notes: [{ id: 'n' }] }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ format: 'cadence-bundle-v2' }));
  return dir;
}

function snapshot(label: string, n: number) {
  const stamp = `2026-05-${String(n).padStart(2, '0')}T10-00-00-000Z`;
  const file = path.join(backupsDir, `data-${label}-${stamp}.json`);
  fs.writeFileSync(file, '{}');
  const when = new Date(2026, 4, n);
  fs.utimesSync(file, when, when);
  return file;
}

/** What the renderer does: ask, then repeat the request with the counts it was shown. */
function changeConfirmed(d: ReturnType<typeof deps>, request: Record<string, unknown>) {
  const asked = changeRetention(d, request);
  if (asked.ok || !asked.needsConfirm) return asked;
  return changeRetention(d, { ...request, confirmed: true, expectedWillDelete: asked.willDelete });
}

const chooseMirror = () => writePrefs(deps(), { mirrorDir });
const dailyNames = () => fs.readdirSync(mirrorDir).filter((n) => n.includes('-daily-'));

describe('getRetentionState', () => {
  it('offers today and yesterday for a daily folder that is not set up yet, and the long-standing snapshot size', () => {
    const s = getRetentionState(deps());
    expect(s.mirrorKeep).toBe(2);
    expect(s.mirrorKeepDefault).toBe(2);
    expect(s.mirrorKeepChoices).toEqual([2, 3, 7, 14, 30]);
    expect(s.snapshotRoutineKeep).toBe(50);
    expect(s.mirrorDirConfigured).toBe(false);
  });

  it('keeps the long-standing 30 for a folder that was already set up without a choice', () => {
    chooseMirror();
    const s = getRetentionState(deps());
    expect(s.mirrorKeep).toBe(30);
    expect(s.mirrorKeepDefault).toBe(30);
  });

  it('reports an explicit choice as it is', () => {
    writePrefs(deps(), { mirrorDir, keepFolders: 7 });
    expect(getRetentionState(deps()).mirrorKeep).toBe(7);
  });
});

describe('changeRetention', () => {
  it('lowering asks first, shows the numbers, and changes nothing until confirmed', () => {
    chooseMirror();
    for (let d = 1; d <= 10; d += 1) dailyFolder('aaaaaaaa', d);
    for (let n = 1; n <= 14; n += 1) snapshot('pre-save', n);

    const asked = changeRetention(deps(), { mirrorKeep: 7, snapshotRoutineKeep: 10 });

    expect(asked).toEqual({ ok: false, needsConfirm: true, willDelete: { mirrorFolders: 3, snapshotSets: 4 } });
    expect(dailyNames()).toHaveLength(10);
    expect(fs.readdirSync(backupsDir)).toHaveLength(14);
    expect(readPrefs(deps()).keepFolders).toBeNull();
    expect(readSnapshotPrefs(deps()).routineKeep).toBe(50);
  });

  it('once confirmed it stores the choice and trims oldest first, newest survive', () => {
    chooseMirror();
    for (let d = 1; d <= 10; d += 1) dailyFolder('aaaaaaaa', d);
    for (let n = 1; n <= 14; n += 1) snapshot('pre-save', n);

    const done = changeConfirmed(deps(), { mirrorKeep: 7, snapshotRoutineKeep: 10 });

    expect(done).toMatchObject({ ok: true, deleted: { mirrorFolders: 3, snapshotSets: 4 }, mirrorDeferred: false });
    expect(dailyNames()).toEqual(
      [4, 5, 6, 7, 8, 9, 10].map((d) => `cadence-daily-aaaaaaaa-2026-07-${String(d).padStart(2, '0')}`),
    );
    expect(fs.readdirSync(backupsDir)).toHaveLength(10);
    expect(fs.existsSync(path.join(backupsDir, 'data-pre-save-2026-05-14T10-00-00-000Z.json'))).toBe(true);
    expect(fs.existsSync(path.join(backupsDir, 'data-pre-save-2026-05-01T10-00-00-000Z.json'))).toBe(false);
    expect(readPrefs(deps()).keepFolders).toBe(7);
    expect(readSnapshotPrefs(deps()).routineKeep).toBe(10);
    expect(readPrefs(deps()).mirrorDir).toBe(mirrorDir);
  });

  it('raising, or choosing a value that already fits, deletes nothing and needs no confirmation', () => {
    chooseMirror();
    for (let d = 1; d <= 5; d += 1) dailyFolder('aaaaaaaa', d);
    for (let n = 1; n <= 5; n += 1) snapshot('launch', n);

    const result = changeRetention(deps(), { mirrorKeep: 14, snapshotRoutineKeep: 20 });

    expect(result).toMatchObject({ ok: true, deleted: { mirrorFolders: 0, snapshotSets: 0 } });
    expect(dailyNames()).toHaveLength(5);
    expect(fs.readdirSync(backupsDir)).toHaveLength(5);
  });

  it('a restore point is never traded for routine history', () => {
    snapshot('pre-restore', 1);
    for (let n = 2; n <= 20; n += 1) snapshot('pre-save', n);

    changeConfirmed(deps(), { snapshotRoutineKeep: 10 });

    expect(fs.existsSync(path.join(backupsDir, 'data-pre-restore-2026-05-01T10-00-00-000Z.json'))).toBe(true);
  });

  it('with one complete folder the smallest setting leaves it alone', () => {
    chooseMirror();
    dailyFolder('aaaaaaaa', 9);
    expect(changeRetention(deps(), { mirrorKeep: 3 })).toMatchObject({ ok: true, deleted: { mirrorFolders: 0 } });
    expect(dailyNames()).toHaveLength(1);
  });

  it('another account’s folders in the same mirror directory are never touched', () => {
    chooseMirror();
    for (let d = 1; d <= 6; d += 1) dailyFolder('aaaaaaaa', d);
    for (let d = 1; d <= 6; d += 1) dailyFolder('bbbbbbbb', d);

    changeConfirmed(deps(), { mirrorKeep: 3 });

    expect(dailyNames().filter((n) => n.includes('bbbbbbbb'))).toHaveLength(6);
    expect(dailyNames().filter((n) => n.includes('aaaaaaaa'))).toHaveLength(3);
  });

  it('an unplugged mirror drive still saves the choice and defers the trim', () => {
    writePrefs(deps(), { mirrorDir: path.join(root, 'unplugged') });
    for (let n = 1; n <= 3; n += 1) snapshot('launch', n);

    const result = changeRetention(deps(), { mirrorKeep: 3 });

    expect(result).toMatchObject({ ok: true, mirrorDeferred: true, deleted: { mirrorFolders: 0 } });
    expect(readPrefs(deps()).keepFolders).toBe(3);
    expect(getRetentionState(deps()).mirrorDirAvailable).toBe(false);
  });

  it('rejects values that are not offered, without touching anything', () => {
    chooseMirror();
    for (let d = 1; d <= 5; d += 1) dailyFolder('aaaaaaaa', d);

    expect(changeRetention(deps(), { mirrorKeep: 1, confirmed: true })).toMatchObject({ ok: false });
    expect(changeRetention(deps(), { mirrorKeep: '7', confirmed: true })).toMatchObject({ ok: false });
    expect(changeRetention(deps(), { snapshotRoutineKeep: 5, confirmed: true })).toMatchObject({ ok: false });
    expect(dailyNames()).toHaveLength(5);
  });

  it('confirmation must carry the counts the user was shown, and cover what would go now', () => {
    chooseMirror();
    for (let d = 1; d <= 10; d += 1) dailyFolder('aaaaaaaa', d);

    const without = changeRetention(deps(), { mirrorKeep: 7, confirmed: true });
    expect(without).toMatchObject({ ok: false, needsConfirm: true });

    const tooFew = changeRetention(deps(), {
      mirrorKeep: 7,
      confirmed: true,
      expectedWillDelete: { mirrorFolders: 1, snapshotSets: 0 },
    });
    expect(tooFew).toMatchObject({ ok: false, needsConfirm: true, willDelete: { mirrorFolders: 3 } });
    expect(dailyNames()).toHaveLength(10);

    for (const bad of ['3', -1, null, { mirrorFolders: '3', snapshotSets: 0 }]) {
      expect(
        changeRetention(deps(), { mirrorKeep: 7, confirmed: true, expectedWillDelete: bad }),
      ).toMatchObject({ needsConfirm: true });
    }
    expect(dailyNames()).toHaveLength(10);
  });

  it('does not overwrite an unreadable daily-backup prefs file, and deletes nothing', () => {
    chooseMirror();
    for (let d = 1; d <= 6; d += 1) dailyFolder('aaaaaaaa', d);
    const prefsFile = prefsPathForUser(userData, 'cadence', USER);
    fs.writeFileSync(prefsFile, '{ corrupt');

    const result = changeConfirmed(deps(), { mirrorKeep: 3 });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('unreadable') });
    expect(fs.readFileSync(prefsFile, 'utf8')).toBe('{ corrupt');
    expect(dailyNames()).toHaveLength(6);
  });

  it('a snapshot-only change never rewrites the daily-backup prefs', () => {
    chooseMirror();
    const prefsFile = prefsPathForUser(userData, 'cadence', USER);
    const before = fs.readFileSync(prefsFile, 'utf8');
    changeRetention(deps(), { snapshotRoutineKeep: 20 });
    expect(fs.readFileSync(prefsFile, 'utf8')).toBe(before);
  });

  it('only a literal true counts as confirmation', () => {
    chooseMirror();
    for (let d = 1; d <= 5; d += 1) dailyFolder('aaaaaaaa', d);
    for (const confirmed of ['true', 1, {}, null]) {
      expect(changeRetention(deps(), { mirrorKeep: 3, confirmed })).toMatchObject({ needsConfirm: true });
    }
    expect(dailyNames()).toHaveLength(5);
  });

  it('if the choice cannot be stored, nothing is deleted', () => {
    chooseMirror();
    for (let d = 1; d <= 5; d += 1) dailyFolder('aaaaaaaa', d);

    const failing = deps({ writeJsonText: () => ({ ok: false as const, error: 'disk full' }) });
    const result = changeConfirmed(failing, { mirrorKeep: 3 });

    expect(result).toEqual({ ok: false, error: 'disk full' });
    expect(dailyNames()).toHaveLength(5);
  });
});
