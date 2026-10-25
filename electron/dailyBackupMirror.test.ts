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
  planDailyMirrorTrim,
  writeDailyFullExport,
  maybeRunDailyBackupMirror,
} = require('./dailyBackupMirror.cjs');
const { DEFAULT_MIRROR_KEEP } = require('./persistence/retentionPolicy.cjs');

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

  it('normalizePrefs reads a prefs file written before keepFolders existed', () => {
    const legacy = { version: 1, mirrorDir: '/x', lastDailyDate: '2026-01-02' };
    expect(normalizePrefs(legacy).keepFolders).toBeNull();
    expect(normalizePrefs({ ...legacy, keepFolders: 7 }).keepFolders).toBe(7);
    expect(normalizePrefs({ ...legacy, keepFolders: 5 }).keepFolders).toBeNull();
    expect(normalizePrefs({ ...legacy, keepFolders: '7' }).keepFolders).toBeNull();
  });
});

/** A folder `isDailyFolderComplete` accepts: parseable data.json + bundle manifest. */
function makeCompleteFolder(root: string, name: string) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ notes: [{ id: 'n' }] }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ format: 'cadence-bundle-v2' }));
}

const day = (user: string, d: number) => `cadence-daily-${user}-2026-07-${String(d).padStart(2, '0')}`;
const prune = (root: string, keepFolders?: number | null, removeStrays?: boolean) =>
  pruneDailyMirrorFolders({ fs, path, mirrorDir: root, appSlug: 'cadence', userId: USER, keepFolders, removeStrays });

describe('pruneDailyMirrorFolders', () => {
  it('keeps the newest N complete folders of this account and nothing else is touched', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-prune-'));
    for (let d = 1; d <= 10; d += 1) makeCompleteFolder(root, day('aaaaaaaa', d));
    makeCompleteFolder(root, day('bbbbbbbb', 1));
    makeCompleteFolder(root, 'cadence-daily-2026-01-01'); // legacy: no user segment
    fs.mkdirSync(path.join(root, 'something-else.partial'));
    fs.mkdirSync(path.join(root, 'unrelated-folder'));

    expect(prune(root, 7)).toBe(3);

    for (const d of [1, 2, 3]) expect(fs.existsSync(path.join(root, day('aaaaaaaa', d)))).toBe(false);
    for (const d of [4, 5, 6, 7, 8, 9, 10]) expect(fs.existsSync(path.join(root, day('aaaaaaaa', d)))).toBe(true);
    expect(fs.existsSync(path.join(root, day('bbbbbbbb', 1)))).toBe(true);
    expect(fs.existsSync(path.join(root, 'cadence-daily-2026-01-01'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'something-else.partial'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'unrelated-folder'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('drops this account’s stray .partial / .displaced dirs unless told not to', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-stray-'));
    makeCompleteFolder(root, day('aaaaaaaa', 20));
    fs.mkdirSync(path.join(root, `${day('aaaaaaaa', 23)}.partial`));
    fs.mkdirSync(path.join(root, `${day('aaaaaaaa', 22)}.displaced`));
    fs.mkdirSync(path.join(root, `${day('bbbbbbbb', 23)}.partial`));

    expect(prune(root, 30, false)).toBe(0);
    expect(fs.existsSync(path.join(root, `${day('aaaaaaaa', 23)}.partial`))).toBe(true);

    expect(prune(root, 30)).toBe(2);
    expect(fs.existsSync(path.join(root, `${day('aaaaaaaa', 23)}.partial`))).toBe(false);
    expect(fs.existsSync(path.join(root, `${day('aaaaaaaa', 22)}.displaced`))).toBe(false);
    expect(fs.existsSync(path.join(root, `${day('bbbbbbbb', 23)}.partial`))).toBe(true);
    expect(fs.existsSync(path.join(root, day('aaaaaaaa', 20)))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('never counts or deletes a damaged folder, and it cannot cost a good one its place', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-damaged-'));
    makeCompleteFolder(root, day('aaaaaaaa', 1));
    makeCompleteFolder(root, day('aaaaaaaa', 2));
    makeCompleteFolder(root, day('aaaaaaaa', 3));
    fs.mkdirSync(path.join(root, day('aaaaaaaa', 9))); // newest, but an empty stub
    fs.mkdirSync(path.join(root, day('aaaaaaaa', 8)));
    fs.writeFileSync(path.join(root, day('aaaaaaaa', 8), 'data.json'), '{ not json');

    expect(prune(root, 3)).toBe(0);
    expect(fs.readdirSync(root)).toHaveLength(5);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps the only complete folder under the smallest setting, and works on a missing dir', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-one-'));
    makeCompleteFolder(root, day('aaaaaaaa', 5));
    expect(prune(root, 3)).toBe(0);
    expect(fs.existsSync(path.join(root, day('aaaaaaaa', 5)))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
    expect(prune(path.join(root, 'gone'), 3)).toBe(0);
  });

  it('planDailyMirrorTrim lists what pruning would delete and deletes nothing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-plan-'));
    for (let d = 1; d <= 5; d += 1) makeCompleteFolder(root, day('aaaaaaaa', d));
    const plan = planDailyMirrorTrim({ fs, path, mirrorDir: root, appSlug: 'cadence', userId: USER, keepFolders: 3 });
    expect(plan).toEqual([day('aaaaaaaa', 1), day('aaaaaaaa', 2)]);
    expect(fs.readdirSync(root)).toHaveLength(5);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('folders dated in the future are neither ranked nor deleted, so today’s backup always stays', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-future-'));
    for (const d of [1, 2, 3]) makeCompleteFolder(root, day('aaaaaaaa', d));
    for (const d of [20, 21, 22, 23]) makeCompleteFolder(root, day('aaaaaaaa', d)); // clock was wrong
    const pruneAt = (todayKey: string) =>
      pruneDailyMirrorFolders({ fs, path, mirrorDir: root, appSlug: 'cadence', userId: USER, keepFolders: 3, todayKey });

    expect(pruneAt('2026-07-04')).toBe(0);

    for (const d of [1, 2, 3, 20, 21, 22, 23]) expect(fs.existsSync(path.join(root, day('aaaaaaaa', d)))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('upgrade safety: at the default, 30 complete folders next to strays, legacy and other accounts lose nothing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-upgrade-'));
    for (let d = 1; d <= 30; d += 1) makeCompleteFolder(root, `cadence-daily-aaaaaaaa-2026-06-${String(d).padStart(2, '0')}`);
    makeCompleteFolder(root, 'cadence-daily-bbbbbbbb-2026-06-01');
    makeCompleteFolder(root, 'cadence-daily-2026-01-01');
    fs.mkdirSync(path.join(root, 'cadence-daily-aaaaaaaa-2026-05-09')); // damaged stub
    const before = fs.readdirSync(root).sort();

    expect(
      pruneDailyMirrorFolders({ fs, path, mirrorDir: root, appSlug: 'cadence', userId: USER, removeStrays: false, todayKey: '2026-06-30' }),
    ).toBe(0);
    expect(fs.readdirSync(root).sort()).toEqual(before);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('an unset or unknown keepFolders keeps the long-standing default', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-default-'));
    for (let d = 1; d <= DEFAULT_MIRROR_KEEP + 1; d += 1) {
      makeCompleteFolder(root, `cadence-daily-aaaaaaaa-2026-06-${String(d).padStart(2, '0')}`);
    }
    expect(prune(root, null)).toBe(1);
    expect(prune(root, 2)).toBe(0); // 2 is not an offered choice → default, nothing more to trim
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

  it('writes no AI keys or header tokens into the mirror, and leaves notes and the rest of the settings alone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-secrets-'));
    const payload = {
      notes: [{ id: 'n1', title: 'keep me' }],
      todoItems: [],
      aiSettings: {
        provider: 'openai',
        model: 'm',
        apiKey: 'sk-top-secret',
        extraHeaders: [{ name: 'X-Token', value: 'hdr-secret' }],
        connections: [
          { id: 'c1', name: 'Gateway', provider: 'custom', apiKey: 'sk-conn-secret', baseUrl: 'https://u:pw-secret@gw.example.com/v1?token=url-secret', requestPath: '/v1/x?api_key=lit-secret&api-version=1' },
        ],
        unreadConnections: [{ id: 'c2', baseUrl: 'https://x:unread-pw@h.example.com', apiKey: 'sk-unread-secret', extraHeaders: [{ name: 'A', value: 'unread-hdr' }] }],
      },
    };
    const ran = writeDailyFullExport({
      fs,
      path,
      mirrorDir: root,
      appSlug: 'cadence',
      userId: USER,
      dateKey: '2026-07-24',
      workspacePayload: payload,
      writeJsonText,
      exportAttachments: () => 0,
      exportNoteHistory: () => {},
      countNoteHistoryRevisions: () => 0,
    });
    expect(ran.ok).toBe(true);
    if (!ran.ok) return;
    const text = fs.readFileSync(path.join(ran.path, 'data.json'), 'utf8');
    for (const secret of ['sk-top-secret', 'hdr-secret', 'sk-conn-secret', 'lit-secret', 'sk-unread-secret', 'unread-hdr', 'pw-secret', 'url-secret', 'unread-pw']) {
      expect(text).not.toContain(secret);
    }
    const saved = JSON.parse(text);
    expect(saved.notes).toEqual([{ id: 'n1', title: 'keep me' }]);
    expect(saved.aiSettings.provider).toBe('openai');
    expect(saved.aiSettings.connections[0].requestPath).toBe('/v1/x?api-version=1');
    expect(saved.aiSettings.unreadConnections[0].id).toBe('c2');
    expect(saved.aiSettings.connections[0].baseUrl).toBe('https://gw.example.com/v1');
    // The caller's object is not mutated.
    expect(payload.aiSettings.apiKey).toBe('sk-top-secret');
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
