import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  localDateKey,
  dailyFolderName,
  userIdFolderSegment,
  shouldRunDailyMirror,
  isDailyFolderComplete,
  normalizePrefs,
  pruneDailyMirrorFolders,
  writeDailyFullExport,
  maybeRunDailyBackupMirror,
  DEFAULT_KEEP_DAYS,
} = require('./dailyBackupMirror.cjs');

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function writeJsonText(filePath: string, text: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
  return { ok: true as const };
}

describe('dailyBackupMirror helpers', () => {
  it('formats local date keys and per-user folder names', () => {
    expect(localDateKey(new Date(2026, 6, 23))).toBe('2026-07-23');
    expect(userIdFolderSegment(USER)).toBe('aaaaaaaa');
    expect(dailyFolderName('cadence', USER, '2026-07-23')).toBe(
      'cadence-daily-aaaaaaaa-2026-07-23',
    );
  });

  it('shouldRunDailyMirror is no-op without path or when already done today', () => {
    expect(shouldRunDailyMirror(null, null, '2026-07-23')).toBe(false);
    expect(shouldRunDailyMirror('', null, '2026-07-23')).toBe(false);
    expect(shouldRunDailyMirror('/backups', '2026-07-23', '2026-07-23')).toBe(false);
    expect(shouldRunDailyMirror('/backups', '2026-07-22', '2026-07-23')).toBe(true);
    expect(shouldRunDailyMirror('/backups', null, '2026-07-23')).toBe(true);
  });

  it('normalizePrefs defaults safely for corrupt / empty input', () => {
    expect(normalizePrefs(null).mirrorDir).toBeNull();
    expect(normalizePrefs({ mirrorDir: '  /x  ', lastDailyDate: 'nope' }).mirrorDir).toBe('/x');
    expect(normalizePrefs({ lastDailyDate: 'nope' }).lastDailyDate).toBeNull();
    expect(normalizePrefs({ lastDailyDate: '2026-01-02' }).lastDailyDate).toBe('2026-01-02');
  });
});

describe('pruneDailyMirrorFolders', () => {
  it('removes only this account’s old daily folders and matching .partial dirs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-prune-'));
    fs.mkdirSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-06-01'));
    fs.mkdirSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-07-20'));
    fs.mkdirSync(path.join(root, 'cadence-daily-bbbbbbbb-2026-06-01'));
    fs.mkdirSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-07-23.partial'));
    fs.mkdirSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-07-22.displaced'));
    // Legacy (no user segment) must never be pruned — shared-dir multi-account risk.
    fs.mkdirSync(path.join(root, 'cadence-daily-2026-01-01'));
    fs.mkdirSync(path.join(root, 'something-else.partial'));
    fs.mkdirSync(path.join(root, 'unrelated-folder'));

    const removed = pruneDailyMirrorFolders({
      fs,
      path,
      mirrorDir: root,
      appSlug: 'cadence',
      userId: USER,
      keepDays: 7,
      todayKey: '2026-07-23',
    });

    expect(removed).toBeGreaterThanOrEqual(3);
    expect(fs.existsSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-06-01'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-07-23.partial'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-07-22.displaced'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-07-20'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'cadence-daily-bbbbbbbb-2026-06-01'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'cadence-daily-2026-01-01'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'something-else.partial'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'unrelated-folder'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('writeDailyFullExport / maybeRunDailyBackupMirror', () => {
  it('writes a full-export shaped folder and is idempotent the same day', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-write-'));
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-ud-'));
    const payload = { notes: [{ id: 'n1' }], todoItems: [] };

    const first = writeDailyFullExport({
      fs,
      path,
      mirrorDir: root,
      appSlug: 'cadence',
      userId: USER,
      dateKey: '2026-07-23',
      workspacePayload: payload,
      writeJsonText,
      exportAttachments: (dest: string) => {
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, 'att.bin'), Buffer.from([1, 2, 3]));
        return 1;
      },
      exportNoteHistory: (folder: string) => {
        fs.mkdirSync(path.join(folder, 'note-history'), { recursive: true });
      },
      countNoteHistoryRevisions: () => 2,
    });

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.path).toContain('cadence-daily-aaaaaaaa-2026-07-23');
    expect(fs.existsSync(path.join(first.path, 'data.json'))).toBe(true);
    expect(fs.existsSync(path.join(first.path, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(first.path, 'attachments', 'att.bin'))).toBe(true);

    const again = maybeRunDailyBackupMirror({
      fs,
      path,
      userDataDir: userData,
      filePrefix: 'cadence',
      userId: USER,
      appSlug: 'cadence',
      workspacePayload: payload,
      writeJsonText,
      exportAttachments: () => 0,
      exportNoteHistory: () => {},
      countNoteHistoryRevisions: () => 0,
      now: new Date(2026, 6, 23),
    });
    expect(again.ran).toBe(false);
    expect(again.skipped).toBe('not-configured');

    fs.writeFileSync(
      path.join(userData, `cadence-daily-backup-${USER}.json`),
      JSON.stringify({ mirrorDir: root }),
    );
    const ran = maybeRunDailyBackupMirror({
      fs,
      path,
      userDataDir: userData,
      filePrefix: 'cadence',
      userId: USER,
      appSlug: 'cadence',
      workspacePayload: payload,
      writeJsonText,
      exportAttachments: () => 0,
      exportNoteHistory: () => {},
      countNoteHistoryRevisions: () => 0,
      now: new Date(2026, 6, 23),
      keepDays: DEFAULT_KEEP_DAYS,
    });
    expect(ran.ran).toBe(true);
    expect(ran.ok).toBe(true);

    const skipped = maybeRunDailyBackupMirror({
      fs,
      path,
      userDataDir: userData,
      filePrefix: 'cadence',
      userId: USER,
      appSlug: 'cadence',
      workspacePayload: payload,
      writeJsonText,
      exportAttachments: () => {
        throw new Error('should not export twice same day');
      },
      exportNoteHistory: () => {},
      countNoteHistoryRevisions: () => 0,
      now: new Date(2026, 6, 23),
    });
    expect(skipped.ran).toBe(false);
    expect(skipped.skipped).toBe('already-today');

    // force replaces without deleting final first (displaced swap).
    const forced = maybeRunDailyBackupMirror({
      fs,
      path,
      userDataDir: userData,
      filePrefix: 'cadence',
      userId: USER,
      appSlug: 'cadence',
      workspacePayload: { notes: [{ id: 'n2' }] },
      writeJsonText,
      exportAttachments: () => 0,
      exportNoteHistory: () => {},
      countNoteHistoryRevisions: () => 0,
      now: new Date(2026, 6, 23),
      force: true,
    });
    expect(forced.ran).toBe(true);
    expect(forced.ok).toBe(true);
    const data = JSON.parse(
      fs.readFileSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-07-23', 'data.json'), 'utf8'),
    );
    expect(data.notes[0].id).toBe('n2');

    // Force must refuse empty overwrite of a populated daily folder.
    const emptyForce = maybeRunDailyBackupMirror({
      fs,
      path,
      userDataDir: userData,
      filePrefix: 'cadence',
      userId: USER,
      appSlug: 'cadence',
      workspacePayload: { notes: [], todoItems: [], items: [] },
      writeJsonText,
      exportAttachments: () => 0,
      exportNoteHistory: () => {},
      countNoteHistoryRevisions: () => 0,
      now: new Date(2026, 6, 23),
      force: true,
    });
    expect(emptyForce.ran).toBe(true);
    expect(emptyForce.ok).toBe(false);
    const still = JSON.parse(
      fs.readFileSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-07-23', 'data.json'), 'utf8'),
    );
    expect(still.notes[0].id).toBe('n2');

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  });

  it('rewrites when lastDailyDate says done but today’s folder is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-retry-'));
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-ud-'));
    fs.writeFileSync(
      path.join(userData, `cadence-daily-backup-${USER}.json`),
      JSON.stringify({ mirrorDir: root, lastDailyDate: '2026-07-23' }),
    );

    expect(
      isDailyFolderComplete({
        fs,
        path,
        mirrorDir: root,
        appSlug: 'cadence',
        userId: USER,
        dateKey: '2026-07-23',
      }),
    ).toBe(false);

    const ran = maybeRunDailyBackupMirror({
      fs,
      path,
      userDataDir: userData,
      filePrefix: 'cadence',
      userId: USER,
      appSlug: 'cadence',
      workspacePayload: { notes: [{ id: 'n-retry' }], todoItems: [] },
      writeJsonText,
      exportAttachments: () => 0,
      exportNoteHistory: () => {},
      countNoteHistoryRevisions: () => 0,
      now: new Date(2026, 6, 23),
    });
    expect(ran.ran).toBe(true);
    expect(ran.ok).toBe(true);
    expect(
      isDailyFolderComplete({
        fs,
        path,
        mirrorDir: root,
        appSlug: 'cadence',
        userId: USER,
        dateKey: '2026-07-23',
      }),
    ).toBe(true);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  });
});
