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
  prefsAfterChoosingMirrorDir,
  dailyBackupDue,
  listDailyMirrorFolders,
  readPrefs,
  writePrefs,
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
    expect(prune(root, 5)).toBe(0); // 5 is not an offered choice → default, nothing more to trim
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('writeDailyFullExport / maybeRunDailyBackupMirror', () => {
  it('writes a full-export shaped folder and is idempotent the same day', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-write-'));
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-ud-'));
    const payload = { notes: [{ id: 'n1' }], todoItems: [] };

    const first = await writeDailyFullExport({
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

    const again = await maybeRunDailyBackupMirror({
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
    const ran = await maybeRunDailyBackupMirror({
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

    const skipped = await maybeRunDailyBackupMirror({
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
    const forced = await maybeRunDailyBackupMirror({
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
    const emptyForce = await maybeRunDailyBackupMirror({
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

  it('writes no AI keys or header tokens into the mirror, and leaves notes and the rest of the settings alone', async () => {
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
    const ran = await writeDailyFullExport({
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

  it('rewrites when lastDailyDate says done but today’s folder is missing', async () => {
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

    const ran = await maybeRunDailyBackupMirror({
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

describe('prefsAfterChoosingMirrorDir', () => {
  const base = normalizePrefs({});

  it('sets up a first-time folder to keep today and yesterday', async () => {
    const next = prefsAfterChoosingMirrorDir(base, '/backups');
    expect(next).toMatchObject({ mirrorDir: '/backups', keepFolders: 2, lastDailyDate: null, lastError: null });
  });

  it('leaves the size alone for a folder that was already set up without a choice, so nothing gets trimmed', async () => {
    const existing = { ...base, mirrorDir: '/old', lastDailyDate: '2026-01-01' };
    const next = prefsAfterChoosingMirrorDir(existing, '/new');
    expect(next.keepFolders).toBeNull();
    expect(next.mirrorDir).toBe('/new');
  });

  it('keeps an explicit choice', async () => {
    const next = prefsAfterChoosingMirrorDir({ ...base, keepFolders: 14 }, '/backups');
    expect(next.keepFolders).toBe(14);
  });
});

describe('daily backup running without getting in the way', () => {
  const deps = (userData: string) => ({ fs, path, userDataDir: userData, filePrefix: 'cadence', userId: USER, appSlug: 'cadence', writeJsonText });
  const payload = { notes: [{ id: 'n1' }], todoItems: [] };

  async function runExport(root: string, extra: Record<string, unknown> = {}) {
    return writeDailyFullExport({
      fs,
      path,
      mirrorDir: root,
      appSlug: 'cadence',
      userId: USER,
      dateKey: '2026-07-23',
      workspacePayload: payload,
      writeJsonText,
      exportAttachments: () => 0,
      exportNoteHistory: () => {},
      countNoteHistoryRevisions: () => 0,
      ...extra,
    });
  }

  it('waits for attachment and history exports that work asynchronously', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-async-'));
    let historyDone = false;
    const r = await runExport(root, {
      exportAttachments: async (dest: string) => {
        fs.mkdirSync(dest, { recursive: true });
        await new Promise((res) => setImmediate(res));
        fs.writeFileSync(path.join(dest, 'a.bin'), Buffer.from([1]));
        return 1;
      },
      exportNoteHistory: async (folder: string) => {
        await new Promise((res) => setImmediate(res));
        fs.mkdirSync(path.join(folder, 'note-history'), { recursive: true });
        historyDone = true;
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attachmentCount).toBe(1);
    expect(historyDone).toBe(true);
    expect(fs.existsSync(path.join(r.path, 'attachments', 'a.bin'))).toBe(true);
    expect(fs.existsSync(path.join(r.path, 'note-history'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lets the event loop run between its steps, so the app stays responsive', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-yield-'));
    let turns = 0;
    let done = false;
    const spin = () => {
      turns += 1;
      if (!done) setImmediate(spin);
    };
    setImmediate(spin);
    await runExport(root);
    done = true;
    expect(turns).toBeGreaterThanOrEqual(2);
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('dailyBackupDue', () => {
    const TODAY = new Date(2026, 6, 23);
    const setup = () => {
      const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-due-ud-'));
      const mirror = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-due-'));
      return { userData, mirror };
    };

    it('is false when no folder was chosen', () => {
      const { userData } = setup();
      expect(dailyBackupDue({ ...deps(userData), now: TODAY })).toBe(false);
    });

    it('is true when a folder is chosen and nothing was backed up yet', () => {
      const { userData, mirror } = setup();
      writePrefs(deps(userData), { mirrorDir: mirror });
      expect(dailyBackupDue({ ...deps(userData), now: TODAY })).toBe(true);
    });

    it('is true after days of not opening the app', () => {
      const { userData, mirror } = setup();
      writePrefs(deps(userData), { mirrorDir: mirror, lastDailyDate: '2026-07-10' });
      expect(dailyBackupDue({ ...deps(userData), now: TODAY })).toBe(true);
    });

    it('is false once today is done and its folder is complete', async () => {
      const { userData, mirror } = setup();
      writePrefs(deps(userData), { mirrorDir: mirror });
      const ran = await maybeRunDailyBackupMirror({
        ...deps(userData),
        workspacePayload: payload,
        exportAttachments: () => 0,
        exportNoteHistory: () => {},
        countNoteHistoryRevisions: () => 0,
        now: TODAY,
      });
      expect(ran.ok).toBe(true);
      expect(dailyBackupDue({ ...deps(userData), now: TODAY })).toBe(false);
    });

    it('is true when today was recorded as done but its folder is gone', async () => {
      const { userData, mirror } = setup();
      writePrefs(deps(userData), { mirrorDir: mirror, lastDailyDate: '2026-07-23' });
      expect(dailyBackupDue({ ...deps(userData), now: TODAY })).toBe(true);
      expect(readPrefs(deps(userData)).mirrorDir).toBe(mirror);
    });
  });
});

describe('a daily backup that is cut short or changed under it', () => {
  const NOW = new Date(2026, 6, 23);
  const mk = () => ({
    userData: fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-x-ud-')),
    mirror: fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-x-')),
  });
  const base = (userData: string) => ({ fs, path, userDataDir: userData, filePrefix: 'cadence', userId: USER, appSlug: 'cadence', writeJsonText });
  const run = (userData: string, over: Record<string, unknown> = {}) =>
    maybeRunDailyBackupMirror({
      ...base(userData),
      workspacePayload: { notes: [{ id: 'n1' }], todoItems: [] },
      exportAttachments: () => 0,
      exportNoteHistory: () => {},
      countNoteHistoryRevisions: () => 0,
      now: NOW,
      ...over,
    });

  it('keeps the older backups when some images could not be read, since this one is missing them', async () => {
    const { userData, mirror } = mk();
    writePrefs(base(userData), { mirrorDir: mirror, keepFolders: 2 });
    for (const d of [18, 19, 20, 21]) makeCompleteFolder(mirror, day(USER.slice(0, 8), d));

    const r = await run(userData, { exportAttachments: async () => ({ count: 3, skipped: 2 }) });

    expect(r.ok).toBe(true);
    expect(fs.readdirSync(mirror).filter((n) => n.includes('-daily-') && !n.endsWith('.partial'))).toHaveLength(5);
    const manifest = JSON.parse(fs.readFileSync(path.join(r.path as string, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ attachmentCount: 3, attachmentsSkipped: 2 });
  });

  it('still trims to the chosen size when every image was copied', async () => {
    const { userData, mirror } = mk();
    writePrefs(base(userData), { mirrorDir: mirror, keepFolders: 2 });
    for (const d of [18, 19, 20, 21]) makeCompleteFolder(mirror, day(USER.slice(0, 8), d));

    const r = await run(userData, { exportAttachments: async () => ({ count: 3, skipped: 0 }) });

    expect(r.ok).toBe(true);
    expect(fs.readdirSync(mirror).filter((n) => n.includes('-daily-') && !n.endsWith('.partial'))).toHaveLength(2);
  });

  it('leaves no folder and records the failure when the export stops half way', async () => {
    const { userData, mirror } = mk();
    writePrefs(base(userData), { mirrorDir: mirror });

    const r = await run(userData, {
      exportAttachments: async () => {
        throw new Error('Signed out during the backup.');
      },
    });

    expect(r).toMatchObject({ ran: true, ok: false });
    expect(fs.readdirSync(mirror)).toEqual([]);
    expect(readPrefs(base(userData)).lastError).toMatch(/Signed out/);
    expect(readPrefs(base(userData)).lastDailyDate).toBeNull();
  });

  it('does not overwrite settings the user changed while the backup was running', async () => {
    const { userData, mirror } = mk();
    writePrefs(base(userData), { mirrorDir: mirror, keepFolders: 2 });
    for (const d of [18, 19, 20, 21]) makeCompleteFolder(mirror, day(USER.slice(0, 8), d));

    const r = await run(userData, {
      exportAttachments: async () => {
        // The user raises the number to keep while the export is in progress.
        writePrefs(base(userData), { ...readPrefs(base(userData)), keepFolders: 30 });
        return 0;
      },
    });

    expect(r.ok).toBe(true);
    expect(readPrefs(base(userData)).keepFolders).toBe(30);
    expect(fs.readdirSync(mirror).filter((n) => n.includes('-daily-') && !n.endsWith('.partial'))).toHaveLength(5);
  });

  it('does not mark today as done for a folder the user switched to mid-run', async () => {
    const { userData, mirror } = mk();
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-other-'));
    writePrefs(base(userData), { mirrorDir: mirror });

    await run(userData, {
      exportAttachments: async () => {
        writePrefs(base(userData), { ...readPrefs(base(userData)), mirrorDir: other });
        return 0;
      },
    });

    const prefs = readPrefs(base(userData));
    expect(prefs.mirrorDir).toBe(other);
    expect(prefs.lastDailyDate).toBeNull();
    expect(dailyBackupDue({ ...base(userData), now: NOW })).toBe(true);
  });

  describe('dailyBackupDue after trouble', () => {
    it('waits a while after a failure instead of retrying on every focus and timer tick', () => {
      const { userData, mirror } = mk();
      writePrefs(base(userData), { mirrorDir: mirror, lastError: 'disk full', lastErrorAt: new Date(NOW.getTime() - 60_000).toISOString() });
      expect(dailyBackupDue({ ...base(userData), now: NOW })).toBe(false);
    });

    it('tries again once the wait is over', () => {
      const { userData, mirror } = mk();
      writePrefs(base(userData), { mirrorDir: mirror, lastError: 'disk full', lastErrorAt: new Date(NOW.getTime() - 20 * 60_000).toISOString() });
      expect(dailyBackupDue({ ...base(userData), now: NOW })).toBe(true);
    });

    it('does not create a stray folder where an unplugged drive should be', () => {
      const { userData } = mk();
      writePrefs(base(userData), { mirrorDir: path.join(os.tmpdir(), 'cadence-no-such-drive-xyz', 'Backups') });
      expect(dailyBackupDue({ ...base(userData), now: NOW })).toBe(false);
    });

    it('still makes the folder when only the backup folder itself was deleted', () => {
      const { userData } = mk();
      writePrefs(base(userData), { mirrorDir: path.join(os.tmpdir(), 'cadence-deleted-backups-xyz') });
      expect(dailyBackupDue({ ...base(userData), now: NOW })).toBe(true);
    });
  });
});

describe('listDailyMirrorFolders (existing backups of this account)', () => {
  it('lists this account\'s daily folders', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-daily-list-'));
    makeCompleteFolder(root, day(USER.slice(0, 8), 1));
    makeCompleteFolder(root, day('bbbbbbbb', 1));
    const r = listDailyMirrorFolders({ fs, path, mirrorDir: root, appSlug: 'cadence', userId: USER });
    expect(r.folders).toHaveLength(1);
  });
});
