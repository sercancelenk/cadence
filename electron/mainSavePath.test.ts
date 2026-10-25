import { EventEmitter } from 'node:events';
import Module from 'node:module';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseBundleEntries } from '../src/lib/backupBundle/parse';
import { zipStoreUnpack } from '../src/lib/backupBundle/zipStore';

/**
 * Loads the real `electron/main.cjs` against a stubbed Electron and drives its
 * `data:save` IPC handler over a temporary userData directory.
 *
 * Everything else in this folder tests a piece of the save path in isolation.
 * This is the one test that runs the whole of it — guards, write generation,
 * snapshot policy, sharding, staging and commit — the way the app does, and
 * runs it with `CADENCE_ASYNC_PERSIST` both off and on so the flag cannot
 * change what ends up on disk.
 */

const require = createRequire(import.meta.url);

type SaveResult = { ok: boolean; reason?: string; error?: string; writeGeneration?: number };
type Handler = (event: unknown, ...args: unknown[]) => unknown;

const handlers = new Map<string, Handler>();
const listeners = new Map<string, Handler>();

let userDataDir: string;
let appDataDir: string;
let forkedWorkers = 0;

/** Runs the real worker handler in-process, so main's composition is what is under test. */
class StubWorker extends EventEmitter {
  constructor() {
    super();
    lastWorker = this;
  }

  postMessage(request: { id: number }) {
    if (holdWorkerReplies) {
      // A wedged worker: the request arrives and nothing ever comes back.
      heldRequest = request;
      return;
    }
    const { handlePersistRequest } = require('./persistence/persistRequest.cjs') as {
      handlePersistRequest: (r: unknown) => unknown;
    };
    const response = handlePersistRequest(request);
    if (crashWorkerAfterStaging) {
      // Bytes reached disk as tmp files, but the answer never arrives.
      setImmediate(() => this.emit('exit', 1));
      return;
    }
    setImmediate(() => this.emit('message', response));
  }

  kill() {
    this.emit('exit', 0);
  }
}

let pickedFolder: { canceled: boolean; filePaths: string[] } = { canceled: true, filePaths: [] };
let pickedSave: { canceled: boolean; filePath?: string } = { canceled: true };
let crashWorkerAfterStaging = false;
let holdWorkerReplies = false;
let heldRequest: { id: number } | null = null;
let lastWorker: StubWorker | null = null;

const electronStub = {
  app: {
    getPath: (name: string) => (name === 'appData' ? appDataDir : userDataDir),
    setPath: (_name: string, value: string) => {
      userDataDir = value;
    },
    setName: () => undefined,
    getName: () => 'Cadence',
    getVersion: () => '0.0.0-test',
    setAppUserModelId: () => undefined,
    requestSingleInstanceLock: () => true,
    on: () => undefined,
    once: () => undefined,
    quit: () => undefined,
    isPackaged: false,
    // Never resolves: keeps the whole `app.whenReady()` bootstrap — windows,
    // tray, auto-updater, protocol handlers — out of this test.
    whenReady: () => new Promise(() => undefined),
    setAsDefaultProtocolClient: () => true,
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings: () => undefined,
    commandLine: { appendSwitch: () => undefined },
    dock: { setBadge: () => undefined },
  },
  BrowserWindow: Object.assign(
    class {
      static getAllWindows() {
        return [];
      }
      static getFocusedWindow() {
        return null;
      }
    },
    {},
  ),
  Menu: { buildFromTemplate: () => ({ popup: () => undefined }), setApplicationMenu: () => undefined },
  Tray: class {},
  Notification: Object.assign(
    class {
      show() {}
    },
    { isSupported: () => false },
  ),
  dialog: {
    showOpenDialog: async () => pickedFolder,
    showSaveDialog: async () => pickedSave,
  },
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
    on: (channel: string, handler: Handler) => listeners.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  shell: { openExternal: async () => undefined, showItemInFolder: () => undefined },
  session: { defaultSession: { clearCache: async () => undefined, getCacheSize: async () => 0 } },
  safeStorage: { isEncryptionAvailable: () => false },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  net: { isOnline: () => false },
  crashReporter: { start: () => undefined },
  utilityProcess: {
    fork: () => {
      forkedWorkers += 1;
      return new StubWorker();
    },
  },
  powerMonitor: new EventEmitter(),
};

const originalLoad = (Module as unknown as { _load: Function })._load;

beforeAll(() => {
  appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-appdata-'));
  userDataDir = path.join(appDataDir, 'Cadence');
  fs.mkdirSync(userDataDir, { recursive: true });

  (Module as unknown as { _load: Function })._load = function patched(
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === 'electron') return electronStub;
    return originalLoad.call(this, request, parent, isMain);
  };

  require('./main.cjs');
});

afterAll(() => {
  (Module as unknown as { _load: Function })._load = originalLoad;
  fs.rmSync(appDataDir, { recursive: true, force: true });
});

const USER_ID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  delete process.env.CADENCE_ASYNC_PERSIST;
  for (const name of fs.readdirSync(userDataDir)) {
    fs.rmSync(path.join(userDataDir, name), { recursive: true, force: true });
  }
  // A plaintext account: no `encSalt`, so no session key is needed to write.
  fs.writeFileSync(
    path.join(userDataDir, 'cadence-accounts.json'),
    JSON.stringify({ users: [{ id: USER_ID, email: 'bench@example.com' }] }),
  );
  fs.writeFileSync(
    path.join(userDataDir, 'cadence-session.json'),
    JSON.stringify({ userId: USER_ID }),
  );
});

afterEach(() => {
  delete process.env.CADENCE_ASYNC_PERSIST;
  crashWorkerAfterStaging = false;
  holdWorkerReplies = false;
  heldRequest = null;
  pickedFolder = { canceled: true, filePaths: [] };
  pickedSave = { canceled: true };
});

function workspace(notes: { id: string; title: string; updatedAt: string }[]) {
  return {
    version: 3,
    people: [],
    teams: [],
    items: [],
    todoItems: [],
    notes,
    noteGroups: [],
  };
}

function note(id: string, title: string, updatedAt = '2026-01-15T10:00:00.000Z') {
  return { id, title, updatedAt };
}

function save(payload: unknown, expectedGeneration?: number) {
  const handler = handlers.get('data:save');
  if (!handler) throw new Error('data:save handler was never registered');
  return Promise.resolve(handler({}, payload, USER_ID, expectedGeneration) as SaveResult);
}

function flushSync(payload: unknown, expectedGeneration?: number) {
  const handler = listeners.get('data:flushSync');
  if (!handler) throw new Error('data:flushSync handler was never registered');
  const event: { returnValue?: SaveResult } = {};
  handler(event, { payload, expectedUid: USER_ID, expectedGeneration });
  return event.returnValue as SaveResult;
}

function load() {
  const handler = handlers.get('data:load');
  if (!handler) throw new Error('data:load handler was never registered');
  return handler({}) as { notes?: { id: string; title: string }[] } | null;
}

function dataFiles() {
  return fs.readdirSync(userDataDir).filter((name) => name.startsWith('cadence-data-'));
}

describe.each([
  ['in-process', undefined],
  ['worker', '1'],
])('data:save (%s)', (_label, flag) => {
  beforeEach(() => {
    if (flag) process.env.CADENCE_ASYNC_PERSIST = flag;
  });

  it('writes a workspace that reads back with every note', async () => {
    const result = await save(workspace([note('n1', 'First'), note('n2', 'Second')]));

    expect(result.ok).toBe(true);
    expect(load()?.notes?.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
    expect(dataFiles().some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('advances the write generation on every save', async () => {
    const first = await save(workspace([note('n1', 'First')]));
    const second = await save(workspace([note('n1', 'Edited')]), first.writeGeneration);

    expect(second.ok).toBe(true);
    expect(second.writeGeneration).toBe((first.writeGeneration ?? 0) + 1);
    expect(load()?.notes?.[0]?.title).toBe('Edited');
  });

  it('refuses a save built on a generation that has moved on', async () => {
    const first = await save(workspace([note('n1', 'First')]));
    await save(workspace([note('n1', 'Second')]), first.writeGeneration);

    const stale = await save(workspace([note('n1', 'Third')]), first.writeGeneration);

    expect(stale.ok).toBe(false);
    expect(stale.reason).toBe('write-conflict');
    expect(load()?.notes?.[0]?.title).toBe('Second');
  });

  it('refuses to replace a populated workspace with an empty one', async () => {
    await save(workspace([note('n1', 'Precious')]));

    const wiped = await save(workspace([]));

    expect(wiped.ok).toBe(false);
    expect(wiped.reason).toBe('suspicious-empty-overwrite');
    expect(load()?.notes?.map((n) => n.id)).toEqual(['n1']);
  });

  it('refuses a payload that is not a workspace at all', async () => {
    await save(workspace([note('n1', 'Precious')]));

    const garbage = await save({ nonsense: true });

    expect(garbage.ok).toBe(false);
    expect(garbage.reason).toBe('invalid-payload');
    expect(load()?.notes?.map((n) => n.id)).toEqual(['n1']);
  });

  it('keeps notes from months that this save did not touch', async () => {
    await save(
      workspace([
        note('old', 'Last year', '2025-03-02T10:00:00.000Z'),
        note('new', 'This month', '2026-01-15T10:00:00.000Z'),
      ]),
    );

    await save(
      workspace([
        note('old', 'Last year', '2025-03-02T10:00:00.000Z'),
        note('new', 'This month, edited', '2026-01-15T10:00:00.000Z'),
      ]),
      2,
    );

    const notes = load()?.notes ?? [];
    expect(notes.map((n) => n.id).sort()).toEqual(['new', 'old']);
    expect(notes.find((n) => n.id === 'old')?.title).toBe('Last year');
  });

  /**
   * Emptying a month deletes its shard. The read path treats shards as
   * canonical, so a shard that survives the delete would hand every deleted
   * note straight back on the next load.
   */
  it('does not resurrect deleted notes when a stale shard cannot be unlinked', async () => {
    const first = await save(
      workspace([
        note('old', 'Last year', '2025-03-02T10:00:00.000Z'),
        note('new', 'This month', '2026-01-15T10:00:00.000Z'),
      ]),
    );
    const stalePath = path.join(userDataDir, `cadence-data-${USER_ID}-2025-03.json`);
    expect(fs.existsSync(stalePath)).toBe(true);

    const realUnlink = fs.unlinkSync;
    fs.unlinkSync = ((target: fs.PathLike, ...rest: unknown[]) => {
      if (target === stalePath) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      return (realUnlink as (...a: unknown[]) => void)(target, ...rest);
    }) as typeof fs.unlinkSync;

    let deleted: SaveResult;
    try {
      deleted = await save(
        workspace([note('new', 'This month', '2026-01-15T10:00:00.000Z')]),
        first.writeGeneration,
      );
    } finally {
      fs.unlinkSync = realUnlink;
    }

    expect(deleted.ok).toBe(true);
    expect(load()?.notes?.map((n) => n.id)).toEqual(['new']);
  });

  it('leaves nothing staged behind after a run of saves', async () => {
    let generation: number | undefined;
    for (let i = 0; i < 5; i += 1) {
      const result = await save(workspace([note('n1', `Edit ${i}`)]), generation);
      expect(result.ok).toBe(true);
      generation = result.writeGeneration;
    }

    expect(fs.readdirSync(userDataDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(load()?.notes?.[0]?.title).toBe('Edit 4');
  });
});

describe('pre-save snapshot policy', () => {
  function preSaveSnapshots() {
    const dir = path.join(userDataDir, 'backups', USER_ID);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((n) => n.startsWith('data-pre-save-') && n.endsWith('.json') && !n.includes('-shard-'));
  }

  /**
   * Routine saves are time-bucketed, and counting entities cannot see a body
   * being emptied. Todo, item and utility-document bodies have no revision
   * history, so a throttled save is the difference between recoverable and
   * gone for good.
   */
  it('snapshots when a todo body is wiped without changing any collection length', async () => {
    const todo = (body: string) => ({
      id: 't1',
      title: 'Task',
      body,
      updatedAt: '2026-01-15T10:00:00.000Z',
    });
    const first = await save({ ...workspace([]), todoItems: [todo('a'.repeat(4000))] });
    expect(first.ok, first.error).toBe(true);
    const before = preSaveSnapshots().length;

    const wiped = await save({ ...workspace([]), todoItems: [todo('')] }, first.writeGeneration);

    expect(wiped.ok).toBe(true);
    expect(preSaveSnapshots().length).toBeGreaterThan(before);
  });

  it('still throttles a burst of ordinary edits', async () => {
    const body = (n: number) => 'a'.repeat(4000 + n);
    const first = await save({
      ...workspace([]),
      todoItems: [{ id: 't1', title: 'Task', body: body(0), updatedAt: '2026-01-15T10:00:00.000Z' }],
    });
    expect(first.ok).toBe(true);
    const before = preSaveSnapshots().length;

    let generation = first.writeGeneration;
    for (let i = 1; i <= 6; i += 1) {
      const r = await save(
        {
          ...workspace([]),
          todoItems: [
            { id: 't1', title: 'Task', body: body(i), updatedAt: '2026-01-15T10:00:00.000Z' },
          ],
        },
        generation,
      );
      expect(r.ok, r.error).toBe(true);
      generation = r.writeGeneration;
    }

    expect(preSaveSnapshots().length).toBe(before);
  });

  /**
   * The counterpart to the burst test above: a deletion does not have to
   * happen in one save. Holding backspace erases a body a few hundred bytes at
   * a time, and every one of those steps is an "ordinary edit" on its own.
   */
  it('snapshots a body erased a little at a time across many saves', async () => {
    const todo = (body: string) => ({
      id: 't1',
      title: 'Task',
      body,
      updatedAt: '2026-01-15T10:00:00.000Z',
    });
    let body = 'a'.repeat(9000);
    const first = await save({
      ...workspace([note('scratch', 'Scratch')]),
      todoItems: [todo(body)],
    });
    expect(first.ok, first.error).toBe(true);

    // Deleting the note forces a snapshot, which is what fixes the size the
    // erasing below is measured against. Without it the baseline would be
    // whatever an earlier test in this file left behind.
    const seeded = await save(
      { ...workspace([]), todoItems: [todo(body)] },
      first.writeGeneration,
    );
    expect(seeded.ok, seeded.error).toBe(true);
    const before = preSaveSnapshots().length;
    expect(before).toBeGreaterThan(0);

    let generation = seeded.writeGeneration;
    for (let i = 0; i < 10; i += 1) {
      body = body.slice(0, Math.max(0, body.length - 300));
      const r = await save({ ...workspace([]), todoItems: [todo(body)] }, generation);
      expect(r.ok, r.error).toBe(true);
      generation = r.writeGeneration;
    }

    // The pre-deletion body must still be recoverable from a snapshot taken
    // after the erasing started, not only from whatever predates it.
    expect(preSaveSnapshots().length).toBeGreaterThan(before);
  });
});

describe('monthly shard reuse', () => {
  function shardPath(monthKey: string) {
    return path.join(userDataDir, `cadence-data-${USER_ID}-${monthKey}.json`);
  }

  /**
   * A save may leave a month's file alone when it can prove the file is the one
   * it last wrote. "Provably untouched" has to mean it: anything else writing
   * to that file — a sync client, a second instance — invalidates the claim.
   */
  it('rewrites a month that something else changed behind our back', async () => {
    const old = note('old', 'Last year', '2025-03-02T10:00:00.000Z');
    const recent = note('new', 'This month', '2026-01-15T10:00:00.000Z');
    const first = await save(workspace([old, recent]));
    const second = await save(workspace([old, recent]), first.writeGeneration);
    expect(second.ok).toBe(true);

    fs.writeFileSync(
      shardPath('2025-03'),
      JSON.stringify({
        magic: 'CDNC-SHARD1',
        month: '2025-03',
        notes: [{ ...old, title: 'CLOBBERED' }],
        todoItems: [],
        items: [],
      }),
    );

    // Touches only the 2026-01 note, so 2025-03 is the month a stale committed
    // record would happily skip.
    const third = await save(
      workspace([old, { ...recent, title: 'This month, edited' }]),
      second.writeGeneration,
    );

    expect(third.ok, third.error).toBe(true);
    const notes = load()?.notes ?? [];
    expect(notes.find((n) => n.id === 'old')?.title).toBe('Last year');
    expect(notes.find((n) => n.id === 'new')?.title).toBe('This month, edited');
  });

  it('does not duplicate an entity that moves to a different month', async () => {
    // No `createdAt`, so the month is derived from `updatedAt` and moves with
    // every edit that crosses a month boundary.
    const july = note('n1', 'July', '2026-07-31T10:00:00.000Z');
    const anchor = note('k', 'Keep', '2026-07-01T10:00:00.000Z');
    const first = await save(workspace([july, anchor]));
    expect(first.ok).toBe(true);

    const august = note('n1', 'August', '2026-08-01T10:00:00.000Z');
    const second = await save(workspace([august, anchor]), first.writeGeneration);
    expect(second.ok).toBe(true);

    const notes = load()?.notes ?? [];
    expect(notes.filter((n) => n.id === 'n1')).toHaveLength(1);
    expect(notes.find((n) => n.id === 'n1')?.title).toBe('August');
    expect(notes.map((n) => n.id).sort()).toEqual(['k', 'n1']);
  });

  it('persists a change to a collection that no shard holds', async () => {
    // `teams` never reaches a shard file. When no month's bytes differ, the
    // base file is the only document written — and it must still be written.
    const notes = [note('old', 'Old', '2025-03-02T10:00:00.000Z')];
    const teams = [{ id: 't1', name: 'One' }];
    const first = await save({ ...workspace(notes), teams });
    const second = await save({ ...workspace(notes), teams }, first.writeGeneration);
    expect(second.ok).toBe(true);

    const third = await save(
      { ...workspace(notes), teams: [{ id: 't1', name: 'Renamed' }, { id: 't2', name: 'Two' }] },
      second.writeGeneration,
    );

    expect(third.ok, third.error).toBe(true);
    const after = load() as { teams?: { id: string; name: string }[] } | null;
    expect(after?.teams).toEqual([
      { id: 't1', name: 'Renamed' },
      { id: 't2', name: 'Two' },
    ]);
  });

  it('recovers in full from a save whose commit half-failed', async () => {
    const old = note('old', 'Last year', '2025-03-02T10:00:00.000Z');
    const recent = note('new', 'This month', '2026-01-15T10:00:00.000Z');
    const first = await save(workspace([old, recent]));
    const second = await save(workspace([old, recent]), first.writeGeneration);
    expect(second.ok).toBe(true);

    const realRename = fs.renameSync;
    fs.renameSync = ((from: fs.PathLike, to: fs.PathLike, ...rest: unknown[]) => {
      if (to === shardPath('2026-01')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      return (realRename as (...a: unknown[]) => void)(from, to, ...rest);
    }) as typeof fs.renameSync;

    let broken: SaveResult;
    try {
      broken = await save(
        workspace([old, { ...recent, title: 'Half written' }]),
        second.writeGeneration,
      );
    } finally {
      fs.renameSync = realRename;
    }
    expect(broken.ok).toBe(false);
    expect((load()?.notes ?? []).map((n) => n.id).sort()).toEqual(['new', 'old']);

    // The failed save must not leave a committed record that lets the next one
    // skip a month it never actually wrote.
    const healed = await save(workspace([old, { ...recent, title: 'Recovered' }]));
    expect(healed.ok, healed.error).toBe(true);
    const notes = load()?.notes ?? [];
    expect(notes.map((n) => n.id).sort()).toEqual(['new', 'old']);
    expect(notes.find((n) => n.id === 'new')?.title).toBe('Recovered');
    expect(notes.find((n) => n.id === 'old')?.title).toBe('Last year');
    expect(fs.readdirSync(userDataDir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  /**
   * The base file normally holds the full monolithic workspace, so an
   * unreadable month is healed from it. When it cannot be — the base is gone —
   * the merge is the only thing left and it has a hole in it. Serving that hole
   * would let the next autosave write the smaller workspace back and unlink the
   * shard the notes are still sitting in, turning a recoverable read error into
   * permanent loss.
   */
  it('refuses to load or save when a month is unreadable and the base cannot cover it', async () => {
    const old = note('old', 'Last year', '2025-03-02T10:00:00.000Z');
    const recent = note('new', 'This month', '2026-01-15T10:00:00.000Z');
    const first = await save(workspace([old, recent]));
    expect(first.ok).toBe(true);

    fs.rmSync(path.join(userDataDir, `cadence-data-${USER_ID}.json`));
    fs.writeFileSync(shardPath('2025-03'), 'not json at all');

    expect(load()).toBeNull();

    const attempted = await save(workspace([recent]));

    expect(attempted.ok).toBe(false);
    // Still on disk, still holding the only copy of March, still recoverable.
    expect(fs.existsSync(shardPath('2025-03'))).toBe(true);
    expect(fs.readFileSync(shardPath('2025-03'), 'utf8')).toBe('not json at all');
  });

  it('leaves the workspace byte-identical when staging cannot start', async () => {
    const old = note('old', 'Old', '2025-03-02T10:00:00.000Z');
    const first = await save(workspace([old]));
    expect(first.ok).toBe(true);
    const basePath = path.join(userDataDir, `cadence-data-${USER_ID}.json`);
    const before = fs.readFileSync(basePath, 'utf8');

    const realOpen = fs.openSync;
    fs.openSync = ((p: fs.PathLike, flags: unknown, ...rest: unknown[]) => {
      if (typeof p === 'string' && p.endsWith('.tmp') && p.includes('cadence-data-')) {
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      }
      return (realOpen as (...a: unknown[]) => number)(p, flags, ...rest);
    }) as typeof fs.openSync;

    let failed: SaveResult;
    try {
      failed = await save(workspace([old, note('n2', 'Second')]), first.writeGeneration);
    } finally {
      fs.openSync = realOpen;
    }

    expect(failed.ok).toBe(false);
    expect(fs.readFileSync(basePath, 'utf8')).toBe(before);
    expect(load()?.notes?.map((n) => n.id)).toEqual(['old']);
    expect(fs.readdirSync(userDataDir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});

describe('data:restoreFromSource', () => {
  const ATTACHMENT_ID = 'aaaaaaaa';

  function attachmentsDir() {
    return path.join(userDataDir, 'attachments', USER_ID);
  }

  function backupsDir() {
    return path.join(userDataDir, 'backups', USER_ID);
  }

  /** The same tmp + rename shape `writeBinaryFile` uses for a real attachment. */
  function putAttachment(bytes: string) {
    fs.mkdirSync(attachmentsDir(), { recursive: true });
    const live = path.join(attachmentsDir(), `${ATTACHMENT_ID}.bin`);
    fs.writeFileSync(`${live}.tmp`, bytes);
    fs.renameSync(`${live}.tmp`, live);
  }

  function readAttachment(dir: string) {
    return fs.readFileSync(path.join(dir, `${ATTACHMENT_ID}.bin`), 'utf8');
  }

  function noteHoldingAttachment(id: string, title: string) {
    return { ...note(id, title), body: `cadence-attachment://${ATTACHMENT_ID}` };
  }

  function attachmentSnapshots() {
    return fs
      .readdirSync(backupsDir())
      .filter((name) => name.startsWith('attachments-pre-save-'))
      .sort()
      .map((name) => path.join(backupsDir(), name));
  }

  /**
   * Snapshots hardlink the live attachment rather than copying its bytes.
   * Restoring an older backup must therefore replace the live file, not write
   * through it — otherwise every newer snapshot pointing at the same inode is
   * silently rewritten, and restoring one backup destroys the others.
   */
  it('leaves newer attachment snapshots untouched when an older one is restored', async () => {
    // Each save drops a note. A shrinking collection is the one shape the
    // pre-save snapshot policy never throttles away, so both snapshots land.
    const first = await save(
      workspace([noteHoldingAttachment('n1', 'One'), note('n2', 'Two'), note('n3', 'Three')]),
    );
    putAttachment('version-one');
    const second = await save(
      workspace([noteHoldingAttachment('n1', 'One'), note('n2', 'Two')]),
      first.writeGeneration,
    );
    putAttachment('version-two');
    await save(workspace([noteHoldingAttachment('n1', 'One')]), second.writeGeneration);

    const [older, newer] = attachmentSnapshots();
    expect(attachmentSnapshots()).toHaveLength(2);
    expect(readAttachment(older!)).toBe('version-one');
    expect(readAttachment(newer!)).toBe('version-two');

    const restore = handlers.get('data:restoreFromSource');
    if (!restore) throw new Error('data:restoreFromSource handler was never registered');
    const restored = restore({}, {
      filePath: path.join(backupsDir(), `${path.basename(older!).replace('attachments-', 'data-')}.json`),
    }) as { ok: boolean; error?: string };

    expect(restored.ok, restored.error).toBe(true);
    expect(readAttachment(attachmentsDir())).toBe('version-one');
    expect(readAttachment(newer!)).toBe('version-two');
  });
});

/**
 * The 25 MB cap is an OOM defence against renderer IPC payloads. It must not
 * reach the paths a user with an oversized workspace depends on to get their
 * data back — restoring a backup is the documented remedy for exactly that
 * situation, so capping it would lock the data away for good.
 */
describe('payload size cap', () => {
  const OVERSIZED_BYTES = 26 * 1024 * 1024;

  function oversizedWorkspace() {
    return workspace([{ ...note('big', 'Big'), body: 'a'.repeat(OVERSIZED_BYTES) } as never]);
  }

  it('refuses an oversized renderer save', async () => {
    const result = await save(oversizedWorkspace());

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('too-large');
  });

  it('restores an oversized backup', () => {
    const backupsDir = path.join(userDataDir, 'backups', USER_ID);
    fs.mkdirSync(backupsDir, { recursive: true });
    const backupPath = path.join(backupsDir, 'data-pre-restore-oversized.json');
    // A plaintext account, so the backup is the workspace JSON as-is.
    fs.writeFileSync(backupPath, JSON.stringify(oversizedWorkspace()));

    const restore = handlers.get('data:restoreFromSource');
    if (!restore) throw new Error('data:restoreFromSource handler was never registered');
    const restored = restore({}, { filePath: backupPath }) as { ok: boolean; error?: string };

    expect(restored.ok, restored.error).toBe(true);
    expect(load()?.notes?.map((n) => n.id)).toEqual(['big']);
  });
});

describe('account:changePassword', () => {
  const { decryptPayload } = require('./persistence/dataEnvelope.cjs') as {
    decryptPayload: (envelope: string, key: Buffer) => string | null;
  };

  function call<T>(channel: string, payload: unknown): T {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  function shardFiles() {
    return fs
      .readdirSync(userDataDir)
      .filter((name) => /^cadence-data-.+-\d{4}-\d{2}\.json$/.test(name));
  }

  /**
   * Rotating the password re-encrypts the whole workspace. A save that skips
   * shards it believes are unchanged must not skip them here: the bytes it
   * would leave alone are ciphertext under a key that no longer exists.
   */
  it('re-encrypts every monthly shard under the new key', () => {
    const registered = call<{ ok: boolean; user?: { id: string } }>('account:register', {
      email: 'rotate@example.com',
      password: 'old-password-1',
    });
    expect(registered.ok).toBe(true);
    const uid = registered.user?.id as string;

    const populated = workspace([
      note('old', 'Last year', '2025-03-02T10:00:00.000Z'),
      note('new', 'This month', '2026-01-15T10:00:00.000Z'),
    ]);
    // Two saves: the second is what leaves a committed record behind claiming
    // the untouched month's shard needs no rewrite.
    const first = handlers.get('data:save')?.({}, populated, uid, undefined) as SaveResult;
    expect(first.ok).toBe(true);
    const second = handlers.get('data:save')?.(
      {},
      populated,
      uid,
      first.writeGeneration,
    ) as SaveResult;
    expect(second.ok).toBe(true);
    expect(shardFiles().length).toBeGreaterThan(1);

    const changed = call<{ ok: boolean; error?: string }>('account:changePassword', {
      oldPassword: 'old-password-1',
      newPassword: 'new-password-2',
    });
    expect(changed.ok).toBe(true);

    const accounts = JSON.parse(
      fs.readFileSync(path.join(userDataDir, 'cadence-accounts.json'), 'utf8'),
    ) as { users: { id: string; encSalt: string }[] };
    const encSalt = accounts.users.find((u) => u.id === uid)?.encSalt as string;
    const newKey = crypto.scryptSync('new-password-2', Buffer.from(encSalt, 'hex'), 32);

    for (const name of shardFiles()) {
      const envelope = fs.readFileSync(path.join(userDataDir, name), 'utf8');
      expect(decryptPayload(envelope, newKey), `${name} is unreadable`).not.toBeNull();
    }
    expect(load()?.notes?.map((n) => n.id).sort()).toEqual(['new', 'old']);
  });
});

describe('attachments across a key change', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

  function call<T>(channel: string, payload: unknown): T {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  function writeImage(id: string) {
    const r = call<{ ok: boolean }>('attachment:write', { attachmentId: id, dataBase64: PNG.toString('base64') });
    expect(r.ok).toBe(true);
  }

  function readImage(id: string) {
    const r = call<{ ok: boolean; dataBase64?: string }>('attachment:read', { attachmentId: id });
    return r.ok ? Buffer.from(r.dataBase64 as string, 'base64') : null;
  }

  /** Images are encrypted under the password-derived key, so a new key must carry them along. */
  it('still reads every image after the password changes', () => {
    expect(call<{ ok: boolean }>('account:register', { email: 'img@example.com', password: 'old-password-1' }).ok).toBe(true);
    writeImage('attachment-0001');
    writeImage('attachment-0002');

    const changed = call<{ ok: boolean; error?: string }>('account:changePassword', {
      oldPassword: 'old-password-1',
      newPassword: 'new-password-2',
    });
    expect(changed.ok).toBe(true);

    expect(readImage('attachment-0001')?.equals(PNG)).toBe(true);
    expect(readImage('attachment-0002')?.equals(PNG)).toBe(true);
  });

  it('still reads every image after a reset with recovery codes', () => {
    const reg = call<{ ok: boolean; recoveryCodes?: string[] }>('account:register', {
      email: 'rec@example.com',
      password: 'old-password-1',
    });
    expect(reg.ok).toBe(true);
    writeImage('attachment-0003');

    const reset = call<{ ok: boolean; error?: string }>('account:recoverWithCodes', {
      email: 'rec@example.com',
      codes: reg.recoveryCodes,
      newPassword: 'brand-new-pass-3',
    });
    expect(reset.ok).toBe(true);

    expect(readImage('attachment-0003')?.equals(PNG)).toBe(true);
  });

  it('leaves no staging files behind after a password change', () => {
    expect(call<{ ok: boolean }>('account:register', { email: 'tidy@example.com', password: 'old-password-1' }).ok).toBe(true);
    writeImage('attachment-0010');
    expect(
      call<{ ok: boolean }>('account:changePassword', { oldPassword: 'old-password-1', newPassword: 'new-password-2' }).ok,
    ).toBe(true);
    const leftovers: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.rekey')) leftovers.push(p);
      }
    };
    walk(userDataDir);
    expect(leftovers).toEqual([]);
  });

  it('changes nothing when the copies cannot be written', () => {
    const reg = call<{ ok: boolean; user?: { id: string } }>('account:register', { email: 'ro@example.com', password: 'old-password-1' });
    expect(reg.ok).toBe(true);
    writeImage('attachment-0011');
    const dir = path.join(userDataDir, 'attachments', reg.user?.id as string);
    fs.chmodSync(dir, 0o500);
    try {
      const changed = call<{ ok: boolean; error?: string }>('account:changePassword', {
        oldPassword: 'old-password-1',
        newPassword: 'new-password-2',
      });
      expect(changed.ok).toBe(false);
    } finally {
      fs.chmodSync(dir, 0o700);
    }
    expect(readImage('attachment-0011')?.equals(PNG)).toBe(true);
    call('account:logout', {});
    expect(call<{ ok: boolean }>('account:login', { email: 'ro@example.com', password: 'old-password-1' }).ok).toBe(true);
    expect(readImage('attachment-0011')?.equals(PNG)).toBe(true);
  });

  it('finishes a swap that a crash cut short when the user signs in with the new password', () => {
    const reg = call<{ ok: boolean; user?: { id: string } }>('account:register', { email: 'cut@example.com', password: 'old-password-1' });
    writeImage('attachment-0012');
    const file = path.join(userDataDir, 'attachments', reg.user?.id as string, 'attachment-0012.cadenc');
    const beforeChange = fs.readFileSync(file);
    expect(
      call<{ ok: boolean }>('account:changePassword', { oldPassword: 'old-password-1', newPassword: 'new-password-2' }).ok,
    ).toBe(true);
    // The state a crash right after the account record was saved would leave: the live file still
    // under the old key, the copy under the new one.
    fs.writeFileSync(`${file}.rekey`, fs.readFileSync(file));
    fs.writeFileSync(file, beforeChange);
    call('account:logout', {});

    expect(call<{ ok: boolean }>('account:login', { email: 'cut@example.com', password: 'new-password-2' }).ok).toBe(true);

    expect(readImage('attachment-0012')?.equals(PNG)).toBe(true);
    expect(fs.existsSync(`${file}.rekey`)).toBe(false);
  });

  it('leaves an image it cannot read with the old key exactly as it was', () => {
    expect(call<{ ok: boolean }>('account:register', { email: 'odd@example.com', password: 'old-password-1' }).ok).toBe(true);
    writeImage('attachment-0004');
    const dir = path.join(userDataDir, 'attachments');
    const userDir = path.join(dir, fs.readdirSync(dir)[0] as string);
    const stray = path.join(userDir, 'attachment-0005.cadenc');
    fs.writeFileSync(stray, 'not-an-envelope');

    expect(
      call<{ ok: boolean }>('account:changePassword', { oldPassword: 'old-password-1', newPassword: 'new-password-2' }).ok,
    ).toBe(true);

    expect(fs.readFileSync(stray, 'utf8')).toBe('not-an-envelope');
    expect(readImage('attachment-0004')?.equals(PNG)).toBe(true);
  });
});

describe('auth guesses', () => {
  function call<T>(channel: string, payload: unknown): T {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  type Reply = { ok: boolean; error?: string; lockedOut?: boolean };

  function signUp(email = 'guess@example.com') {
    expect(call<Reply>('account:register', { email, password: 'right-password-1' }).ok).toBe(true);
  }

  /** Six wrong guesses is one past the free budget. */
  function guessWrong(channel: string, payload: unknown) {
    let last: Reply = { ok: true };
    for (let i = 0; i < 6; i += 1) last = call<Reply>(channel, payload);
    return last;
  }

  it('locks PIN removal after repeated wrong PINs, even for the right one', () => {
    signUp();
    expect(call<Reply>('auth:setPin', { pin: '1234' }).ok).toBe(true);

    guessWrong('auth:clear', { pin: '0000' });

    const right = call<Reply>('auth:clear', { pin: '1234' });
    expect(right.ok).toBe(false);
    expect(right.error).toMatch(/too many attempts/i);
    expect(call<{ enabled: boolean }>('auth:status', {}).enabled).toBe(true);
  });

  it('counts wrong PINs from unlock and removal against the same budget', () => {
    signUp();
    call('auth:setPin', { pin: '1234' });
    for (let i = 0; i < 3; i += 1) call('auth:verify', { pin: '0000' });
    for (let i = 0; i < 3; i += 1) call('auth:clear', { pin: '0000' });

    expect(call<Reply>('auth:verify', { pin: '1234' }).lockedOut).toBe(true);
  });

  it('will not replace an existing PIN without the current one', () => {
    signUp();
    expect(call<Reply>('auth:setPin', { pin: '1234' }).ok).toBe(true);

    expect(call<Reply>('auth:setPin', { pin: '9999' }).ok).toBe(false);
    expect(call<Reply>('auth:setPin', { pin: '9999', currentPin: '0000' }).ok).toBe(false);
    expect(call<Reply>('auth:verify', { pin: '1234' }).ok).toBe(true);

    expect(call<Reply>('auth:setPin', { pin: '9999', currentPin: '1234' }).ok).toBe(true);
    expect(call<Reply>('auth:verify', { pin: '9999' }).ok).toBe(true);
  });

  it('locks password checks after repeated wrong passwords', () => {
    signUp();
    const last = guessWrong('account:changePassword', {
      oldPassword: 'wrong-password-9',
      newPassword: 'another-password-2',
    });
    expect(last.ok).toBe(false);

    const right = call<Reply>('account:changePassword', {
      oldPassword: 'right-password-1',
      newPassword: 'another-password-2',
    });
    expect(right.ok).toBe(false);
    expect(right.error).toMatch(/too many attempts/i);
  });

  it('shares one password budget across the checks that take the account password', () => {
    signUp();
    for (let i = 0; i < 3; i += 1) call('account:verifyPassword', { password: 'wrong-password-9' });
    for (let i = 0; i < 3; i += 1) call('account:setupRecovery', { password: 'wrong-password-9' });

    const right = call<Reply>('account:verifyPassword', { password: 'right-password-1' });
    expect(right.ok).toBe(false);
    expect(right.error).toMatch(/too many attempts/i);
  });

  it('clears the PIN lockout when the PIN is reset with the account password', () => {
    signUp();
    call('auth:setPin', { pin: '1234' });
    guessWrong('auth:verify', { pin: '0000' });
    expect(call<Reply>('auth:verify', { pin: '1234' }).lockedOut).toBe(true);

    expect(call<Reply>('auth:resetWithAccountPassword', { password: 'right-password-1' }).ok).toBe(true);
    expect(call<Reply>('auth:setPin', { pin: '5678' }).ok).toBe(true);

    expect(call<Reply>('auth:verify', { pin: '5678' }).ok).toBe(true);
  });

  it('keeps the PIN reset available when other password checks have used up their budget', () => {
    signUp();
    call('auth:setPin', { pin: '1234' });
    guessWrong('account:verifyPassword', { password: 'wrong-password-9' });
    expect(call<Reply>('account:verifyPassword', { password: 'right-password-1' }).ok).toBe(false);

    expect(call<Reply>('auth:resetWithAccountPassword', { password: 'right-password-1' }).ok).toBe(true);
  });

  it('lets the right PIN in when a lock is dated further ahead than any lock can last (clock set ahead, then corrected)', () => {
    signUp();
    call('auth:setPin', { pin: '1234' });
    const year = 365 * 24 * 60 * 60 * 1000;
    fs.writeFileSync(
      path.join(userDataDir, 'auth-throttle.json'),
      JSON.stringify({ pin: { fails: 9, lockedUntil: Date.now() + year, lastAttempt: Date.now() + year } }),
    );

    expect(call<Reply>('auth:verify', { pin: '1234' }).ok).toBe(true);
  });

  it('still honours a real lock that is within the cap', () => {
    signUp();
    call('auth:setPin', { pin: '1234' });
    fs.writeFileSync(
      path.join(userDataDir, 'auth-throttle.json'),
      JSON.stringify({ pin: { fails: 6, lockedUntil: Date.now() + 10 * 60 * 1000, lastAttempt: Date.now() } }),
    );
    expect(call<Reply & { retryAfterMs?: number }>('auth:verify', { pin: '1234' })).toMatchObject({ ok: false, lockedOut: true });
  });

  it('keeps the PIN and password counters when a flood of made-up emails fills the file', () => {
    signUp();
    const now = Date.now();
    const map: Record<string, unknown> = { pin: { fails: 5, lockedUntil: 0, lastAttempt: now - 10 * 60 * 1000 } };
    for (let i = 0; i < 300; i += 1) map[`acct:flood${i}@example.com`] = { fails: 1, lockedUntil: 0, lastAttempt: now - 60 * 1000 + i };
    fs.writeFileSync(path.join(userDataDir, 'auth-throttle.json'), JSON.stringify(map));

    call('account:login', { email: 'another-made-up@example.com', password: 'whatever-password' });

    const stored = JSON.parse(fs.readFileSync(path.join(userDataDir, 'auth-throttle.json'), 'utf8')) as Record<string, { fails: number }>;
    expect(stored.pin?.fails).toBe(5);
    expect(Object.keys(stored).length).toBeLessThanOrEqual(256);
  });

  it('forgets a failure record dated in the future so it can cool down', () => {
    signUp();
    call('auth:setPin', { pin: '1234' });
    const hour = 60 * 60 * 1000;
    fs.writeFileSync(
      path.join(userDataDir, 'auth-throttle.json'),
      JSON.stringify({ pin: { fails: 9, lockedUntil: 0, lastAttempt: Date.now() + 10 * hour } }),
    );
    call('auth:verify', { pin: '0000' });
    const stored = JSON.parse(fs.readFileSync(path.join(userDataDir, 'auth-throttle.json'), 'utf8')) as Record<string, { fails: number }>;
    expect(stored.pin?.fails).toBe(1);
  });

  it('keeps the lockout across an app restart', () => {
    signUp();
    guessWrong('account:verifyPassword', { password: 'wrong-password-9' });

    const file = path.join(userDataDir, 'auth-throttle.json');
    expect(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).length).toBeGreaterThan(0);
  });

  it('does not write the stored hash or salt to the log on a wrong PIN', () => {
    signUp();
    call('auth:setPin', { pin: '1234' });
    const stored = JSON.parse(fs.readFileSync(path.join(userDataDir, 'auth-lock.json'), 'utf8')) as {
      salt: string;
      hash: string;
    };
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      call('auth:verify', { pin: '0000' });
    } finally {
      console.warn = original;
    }
    const logged = lines.join('\n');
    expect(logged).not.toContain(stored.hash.slice(0, 8));
    expect(logged).not.toContain(stored.salt.slice(0, 6));
  });
});

describe('note history across a key change', () => {
  const NOTE = 'note-hist-000001';
  const MARK = 'HISTORY-BODY-MARKER';

  function call<T>(channel: string, payload: unknown): T {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  function append() {
    const r = call<{ ok: boolean; revisionId?: string }>('noteHistory:append', {
      noteId: NOTE,
      trigger: 'manual',
      title: 'History title',
      summary: 'History summary',
      locked: false,
      body: MARK,
      bodyFormat: 'markdown',
    });
    expect(r.ok).toBe(true);
    return r.revisionId as string;
  }

  function readBody(revisionId: string) {
    const r = call<{ ok: boolean; revision?: { body?: string } }>('noteHistory:read', { noteId: NOTE, revisionId });
    return r.ok ? r.revision?.body : null;
  }

  function onDisk() {
    const root = path.join(userDataDir, 'note-history');
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else out.push(fs.readFileSync(p, 'utf8'));
      }
    };
    if (fs.existsSync(root)) walk(root);
    return out.join('\n');
  }

  it('is sealed on disk for a signed-in account', () => {
    call('account:register', { email: 'h1@example.com', password: 'old-password-1' });
    append();
    expect(onDisk()).not.toContain(MARK);
    expect(onDisk()).not.toContain('History title');
  });

  it('is still readable after the password changes', () => {
    call('account:register', { email: 'h2@example.com', password: 'old-password-1' });
    const id = append();
    expect(
      call<{ ok: boolean }>('account:changePassword', { oldPassword: 'old-password-1', newPassword: 'new-password-2' }).ok,
    ).toBe(true);
    expect(readBody(id)).toBe(MARK);
    expect(onDisk()).not.toContain(MARK);
  });

  it('is still readable after a reset with recovery codes', () => {
    const reg = call<{ ok: boolean; recoveryCodes?: string[] }>('account:register', {
      email: 'h3@example.com',
      password: 'old-password-1',
    });
    const id = append();
    expect(
      call<{ ok: boolean }>('account:recoverWithCodes', {
        email: 'h3@example.com',
        codes: reg.recoveryCodes,
        newPassword: 'brand-new-pass-3',
      }).ok,
    ).toBe(true);
    expect(readBody(id)).toBe(MARK);
  });

  it('seals history an older version left as plaintext when the user signs in', async () => {
    const reg = call<{ ok: boolean; user?: { id: string } }>('account:register', { email: 'h5@example.com', password: 'old-password-1' });
    const dir = path.join(userDataDir, 'note-history', reg.user?.id as string, NOTE);
    fs.mkdirSync(dir, { recursive: true });
    const rev = {
      id: 'legacy-rev-000001',
      noteId: NOTE,
      createdAt: new Date().toISOString(),
      trigger: 'manual',
      title: 'Legacy title',
      summary: 'Legacy summary',
      locked: false,
      body: MARK,
      bodyFormat: 'markdown',
    };
    fs.writeFileSync(path.join(dir, 'legacy-rev-000001.json'), JSON.stringify(rev));
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ version: 1, noteId: NOTE, revisions: [{ ...rev, body: undefined }] }));
    call('account:logout', {});

    expect(call<{ ok: boolean }>('account:login', { email: 'h5@example.com', password: 'old-password-1' }).ok).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onDisk()).not.toContain(MARK);
    expect(readBody('legacy-rev-000001')).toBe(MARK);
  });

  it('keeps an older user\'s plaintext history intact through sign-in, the upgrade and a password change', async () => {
    const reg = call<{ ok: boolean; user?: { id: string } }>('account:register', { email: 'h6@example.com', password: 'old-password-1' });
    const dir = path.join(userDataDir, 'note-history', reg.user?.id as string, NOTE);
    fs.mkdirSync(dir, { recursive: true });
    const rev = {
      id: 'legacy-rev-000009',
      noteId: NOTE,
      createdAt: new Date().toISOString(),
      trigger: 'manual',
      title: 'Legacy title',
      summary: 'Legacy summary',
      locked: false,
      body: MARK,
      bodyFormat: 'markdown',
    };
    fs.writeFileSync(path.join(dir, 'legacy-rev-000009.json'), JSON.stringify(rev));
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ version: 1, noteId: NOTE, revisions: [{ ...rev, body: undefined }] }));
    call('account:logout', {});
    call('account:login', { email: 'h6@example.com', password: 'old-password-1' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(
      call<{ ok: boolean }>('account:changePassword', { oldPassword: 'old-password-1', newPassword: 'new-password-2' }).ok,
    ).toBe(true);

    expect(readBody('legacy-rev-000009')).toBe(MARK);
    expect(onDisk()).not.toContain(MARK);
    const list = call<{ ok: boolean; revisions: Array<{ id: string; title: string }> }>('noteHistory:list', { noteId: NOTE });
    expect(list.revisions.map((r) => r.id)).toEqual(['legacy-rev-000009']);
  });

  it('does not let attachment cleanup delete images when a revision cannot be opened', () => {
    const reg4 = call<{ ok: boolean; user?: { id: string } }>('account:register', { email: 'h4@example.com', password: 'old-password-1' });
    const saved = handlers.get('data:save')?.({}, workspace([note('n1', 'First')]), reg4.user?.id, undefined) as SaveResult;
    expect(saved.ok).toBe(true);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
    expect(call<{ ok: boolean }>('attachment:write', { attachmentId: 'attachment-hist01', dataBase64: png }).ok).toBe(true);
    // A revision sealed under some other key: unreadable here.
    const dir = path.join(userDataDir, 'note-history', fs.readdirSync(path.join(userDataDir, 'attachments'))[0] as string, NOTE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'foreign-rev-000001.json'),
      JSON.stringify({ magic: 'LDMN1', v: 1, alg: 'AES-256-GCM', iv: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==', ct: 'AAAA' }),
    );

    const gc = call<{ ok: boolean; pruned?: number; skipped?: string; error?: string }>('attachment:gc', {});

    expect(gc).toMatchObject({ ok: true, pruned: 0, skipped: 'note-history-unreadable' });
    expect(call<{ ok: boolean }>('attachment:read', { attachmentId: 'attachment-hist01' }).ok).toBe(true);
  });
});

describe('daily backup without waiting for a save', () => {
  type Reply = { ok: boolean; started?: boolean; error?: string; user?: { id: string } };

  function call<T>(channel: string, payload?: unknown): T {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const NOTE = 'note-daily-00001';

  async function setup(email: string) {
    const reg = call<Reply>('account:register', { email, password: 'right-password-1' });
    const uid = reg.user?.id as string;
    const saved = handlers.get('data:save')?.({}, workspace([note('n1', 'Daily note')]), uid, undefined) as SaveResult;
    expect(saved.ok).toBe(true);
    expect(call<{ ok: boolean }>('attachment:write', { attachmentId: 'attachment-new-daily1', dataBase64: PNG.toString('base64') }).ok).toBe(true);
    expect(
      call<{ ok: boolean }>('noteHistory:append', { noteId: NOTE, trigger: 'manual', title: 'T', summary: 'S', locked: false, body: 'DAILY-HISTORY-BODY', bodyFormat: 'markdown' }).ok,
    ).toBe(true);
    // The save above queues its own (not-configured) backup check; let it finish before choosing a folder.
    await new Promise((r) => setTimeout(r, 50));
    const mirror = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-mirror-'));
    fs.writeFileSync(path.join(userDataDir, `cadence-daily-backup-${uid}.json`), JSON.stringify({ mirrorDir: mirror }));
    return { uid, mirror };
  }

  const dailyFolders = (mirror: string) => fs.readdirSync(mirror).filter((n) => n.includes('-daily-') && !n.endsWith('.partial'));

  async function until(check: () => boolean, ms = 4000) {
    const end = Date.now() + ms;
    while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
    return check();
  }

  const { localDateKey } = require('./dailyBackupMirror.cjs') as { localDateKey: (d?: Date) => string };
  const prefsFile = (uid: string) => path.join(userDataDir, `cadence-daily-backup-${uid}.json`);
  const recordedDone = (uid: string) => {
    try {
      return JSON.parse(fs.readFileSync(prefsFile(uid), 'utf8')).lastDailyDate === localDateKey();
    } catch {
      return false;
    }
  };

  it('makes today\'s backup, with readable images and history, when asked at startup or on return', async () => {
    const { mirror } = await setup('daily1@example.com');

    call<Reply>('backupMirror:ensureToday');

    expect(await until(() => dailyFolders(mirror).length === 1)).toBe(true);
    const folder = path.join(mirror, dailyFolders(mirror)[0] as string);
    expect(JSON.parse(fs.readFileSync(path.join(folder, 'data.json'), 'utf8')).notes[0].title).toBe('Daily note');
    expect(fs.readFileSync(path.join(folder, 'attachments', 'attachment-new-daily1.bin')).equals(PNG)).toBe(true);
    const historyFiles = fs.readdirSync(path.join(folder, 'note-history', NOTE));
    expect(historyFiles.length).toBeGreaterThan(0);
    const revisionFile = historyFiles.find((n) => n.endsWith('.json') && n !== 'index.json') as string;
    expect(fs.readFileSync(path.join(folder, 'note-history', NOTE, revisionFile), 'utf8')).toContain('DAILY-HISTORY-BODY');
  });

  it('does nothing the second time the same day, and starts again if the folder was removed', async () => {
    const { uid, mirror } = await setup('daily2@example.com');
    call<Reply>('backupMirror:ensureToday');
    expect(await until(() => recordedDone(uid))).toBe(true);

    expect(call<Reply>('backupMirror:ensureToday')).toMatchObject({ ok: true, started: false });

    for (const name of dailyFolders(mirror)) fs.rmSync(path.join(mirror, name), { recursive: true, force: true });
    expect(call<Reply>('backupMirror:ensureToday')).toMatchObject({ ok: true, started: true });
    expect(await until(() => dailyFolders(mirror).length === 1)).toBe(true);
  });

  it('starts the first backup as soon as a folder is chosen, without waiting for a later trigger', async () => {
    const { mirror } = await setup('daily5@example.com');
    fs.rmSync(path.join(userDataDir, `cadence-daily-backup-${(JSON.parse(fs.readFileSync(path.join(userDataDir, 'cadence-session.json'), 'utf8')) as { userId: string }).userId}.json`), { force: true });
    pickedFolder = { canceled: false, filePaths: [mirror] };

    const chosen = (await call<Promise<{ ok: boolean; error?: string }>>('backupMirror:chooseDir'));

    expect(chosen.ok, chosen.error).toBe(true);
    expect(await until(() => dailyFolders(mirror).length === 1)).toBe(true);
  });

  it('does nothing when no folder was chosen', () => {
    call<Reply>('account:register', { email: 'daily3@example.com', password: 'right-password-1' });
    expect(call<Reply>('backupMirror:ensureToday')).toMatchObject({ ok: true, started: false });
  });

  it('does nothing when nobody is signed in', () => {
    expect(call<Reply>('backupMirror:ensureToday')).toMatchObject({ ok: true, started: false });
  });
});

describe('CADENCE_ASYNC_PERSIST', () => {
  it('does not start a worker unless the flag is set', async () => {
    const before = forkedWorkers;
    await save(workspace([note('n1', 'First')]));
    expect(forkedWorkers).toBe(before);
  });

  it('starts one worker for the whole process, however many saves', async () => {
    process.env.CADENCE_ASYNC_PERSIST = '1';

    let generation: number | undefined;
    for (let i = 0; i < 3; i += 1) {
      generation = (await save(workspace([note('n1', `Edit ${i}`)]), generation)).writeGeneration;
    }

    // Counted across every flagged save in this file, not just this test.
    expect(forkedWorkers).toBe(1);
  });

  it('lets the synchronous exit flush win over a save still in the worker', async () => {
    process.env.CADENCE_ASYNC_PERSIST = '1';
    const first = await save(workspace([note('n1', 'Typed')]));

    // The renderer's pagehide flush lands while the next autosave is mid-flight.
    const inFlight = save(workspace([note('n1', 'Autosaved')]), first.writeGeneration);
    const flushed = flushSync(workspace([note('n1', 'Flushed')]), first.writeGeneration);
    const autosaved = await inFlight;

    expect(flushed.ok).toBe(true);
    // Whichever of the two lost, the file holds a whole workspace from one of
    // them — never a mix, and never the older one after the newer one landed.
    if (!autosaved.ok) {
      expect(autosaved.reason).toBe('write-conflict');
      expect(load()?.notes?.[0]?.title).toBe('Flushed');
    } else {
      expect(load()?.notes?.[0]?.title).toBe('Autosaved');
    }
    expect(fs.readdirSync(userDataDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('serializes overlapping saves for one account', async () => {
    process.env.CADENCE_ASYNC_PERSIST = '1';
    const first = await save(workspace([note('n1', 'Base')]));

    const results = await Promise.all([
      save(workspace([note('n1', 'A')]), first.writeGeneration),
      save(workspace([note('n1', 'B')]), (first.writeGeneration ?? 0) + 1),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[1]!.writeGeneration).toBe((results[0]!.writeGeneration ?? 0) + 1);
    expect(load()?.notes?.[0]?.title).toBe('B');
  });

  it('refuses a fallback save whose bytes were superseded while the worker was silent', async () => {
    process.env.CADENCE_ASYNC_PERSIST = '1';
    const first = await save(workspace([note('n1', 'Typed')]));

    holdWorkerReplies = true;
    const inFlight = save(workspace([note('n1', 'Autosaved')]), first.writeGeneration);
    await new Promise((resolve) => setImmediate(resolve));
    expect(heldRequest).not.toBeNull();

    // The renderer's pagehide flush commits while the worker is still silent.
    const flushed = flushSync(workspace([note('n1', 'Flushed')]), first.writeGeneration);
    expect(flushed.ok).toBe(true);

    // The bridge gives up on the worker, which sends main down the in-process
    // fallback — with a batch prepared against the pre-flush workspace.
    lastWorker?.emit('message', { id: heldRequest?.id, ok: false, reason: 'unavailable' });
    const autosaved = await inFlight;

    expect(autosaved.ok).toBe(false);
    expect(autosaved.reason).toBe('write-conflict');
    // The renderer blocks persistence on a conflict and resyncs from this
    // number. Without it every later edit is dropped until the app restarts.
    expect(autosaved.writeGeneration).toBe(flushed.writeGeneration);
    expect(load()?.notes?.[0]?.title).toBe('Flushed');
    expect(fs.readdirSync(userDataDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  /**
   * A conflicting batch is dropped by deleting the tmp files main told the
   * child to write — never the paths the reply names. Each one is a full copy
   * of the workspace, and a reply is not evidence of anything.
   */
  it('removes the staged tmp files of a conflicting batch even when the reply lies', async () => {
    process.env.CADENCE_ASYNC_PERSIST = '1';
    const first = await save(workspace([note('n1', 'Typed')]));

    holdWorkerReplies = true;
    const inFlight = save(workspace([note('n1', 'Autosaved')]), first.writeGeneration);
    await new Promise((resolve) => setImmediate(resolve));
    expect(heldRequest).not.toBeNull();

    // The staged bytes are real: run the held request for its side effects.
    const { handlePersistRequest } = require('./persistence/persistRequest.cjs') as {
      handlePersistRequest: (r: unknown) => { ok: boolean };
    };
    expect(handlePersistRequest(heldRequest).ok).toBe(true);
    expect(fs.readdirSync(userDataDir).some((name) => name.endsWith('.tmp'))).toBe(true);

    const flushed = flushSync(workspace([note('n1', 'Flushed')]), first.writeGeneration);
    expect(flushed.ok).toBe(true);

    // "Staged, and here is where" — pointing at a path that was never staged.
    lastWorker?.emit('message', {
      id: heldRequest?.id,
      ok: true,
      staged: [{ path: 'nowhere', tmp: 'nowhere.tmp' }],
    });
    const autosaved = await inFlight;

    expect(autosaved.ok).toBe(false);
    expect(autosaved.reason).toBe('write-conflict');
    expect(load()?.notes?.[0]?.title).toBe('Flushed');
    expect(fs.readdirSync(userDataDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  /**
   * The worker's reply is what main turns into `rename()` calls. An answer
   * that claims success for fewer documents than were sent would commit part
   * of the batch while main recorded all of it as durable — and the shards it
   * skipped would look unchanged to every later save and never be written.
   */
  it('writes in-process when the worker answers with a batch it was not given', async () => {
    process.env.CADENCE_ASYNC_PERSIST = '1';
    const first = await save(
      workspace([
        note('old', 'Last year', '2025-03-02T10:00:00.000Z'),
        note('new', 'This month', '2026-01-15T10:00:00.000Z'),
      ]),
    );

    holdWorkerReplies = true;
    const inFlight = save(
      workspace([
        note('old', 'Last year', '2025-03-02T10:00:00.000Z'),
        note('new', 'This month, edited', '2026-01-15T10:00:00.000Z'),
      ]),
      first.writeGeneration,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(heldRequest).not.toBeNull();

    // "Everything staged fine" — with nothing actually staged.
    lastWorker?.emit('message', { id: heldRequest?.id, ok: true, staged: [] });
    const result = await inFlight;

    expect(result.ok).toBe(true);
    const notes = load()?.notes ?? [];
    expect(notes.map((n) => n.id).sort()).toEqual(['new', 'old']);
    expect(notes.find((n) => n.id === 'new')?.title).toBe('This month, edited');
    expect(fs.readdirSync(userDataDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  // Last, deliberately: a crash puts the bridge into its respawn cooldown, so
  // any test after this one would silently be running the in-process path.
  it('still saves when the worker dies in the middle of the write', async () => {
    process.env.CADENCE_ASYNC_PERSIST = '1';
    const first = await save(workspace([note('n1', 'Before the crash')]));

    crashWorkerAfterStaging = true;
    const result = await save(workspace([note('n1', 'After the crash')]), first.writeGeneration);

    // The save is not lost, not half-applied, and not reported as an error:
    // main falls back to writing it in-process.
    expect(result.ok).toBe(true);
    expect(load()?.notes?.[0]?.title).toBe('After the crash');

    // The tmp files the dying child staged are named with a token main chose,
    // so the fallback deletes exactly those rather than leaving a full copy of
    // the workspace behind for the next launch to sweep.
    expect(fs.readdirSync(userDataDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(load()?.notes?.[0]?.title).toBe('After the crash');
  });
});

describe('snapshots across a key change', () => {
  function call<T>(channel: string, payload?: unknown): T {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  function sessionUid(): string {
    return JSON.parse(fs.readFileSync(path.join(userDataDir, 'cadence-session.json'), 'utf8')).userId as string;
  }

  /** Signs up, saves two notes, then drops one so a routine snapshot of the two-note state exists. */
  async function accountWithOlderSnapshot(email: string) {
    expect(call<{ ok: boolean }>('account:register', { email, password: 'old-password-1' }).ok).toBe(true);
    const uid = sessionUid();
    const handler = handlers.get('data:save') as Handler;
    const first = (await handler({}, workspace([note('n1', 'One'), note('n2', 'Two')]), uid)) as SaveResult;
    expect(first.ok).toBe(true);
    const second = (await handler({}, workspace([note('n1', 'One')]), uid, first.writeGeneration)) as SaveResult;
    expect(second.ok).toBe(true);
    const dir = path.join(userDataDir, 'backups', uid);
    const snapshots = fs.readdirSync(dir).filter((n) => n.startsWith('data-') && n.endsWith('.json'));
    expect(snapshots.length).toBeGreaterThan(0);
    return { uid, dir, snapshots };
  }

  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const HIST_NOTE = 'note-hist-000002';

  /** Like `accountWithOlderSnapshot`, with an image and a history entry in the snapshot. */
  async function accountWithImageAndHistory(email: string) {
    expect(call<{ ok: boolean }>('account:register', { email, password: 'old-password-1' }).ok).toBe(true);
    const uid = sessionUid();
    expect(call<{ ok: boolean }>('attachment:write', { attachmentId: 'attachment-new-0001', dataBase64: PNG.toString('base64') }).ok).toBe(true);
    const appended = call<{ ok: boolean; revisionId?: string }>('noteHistory:append', {
      noteId: HIST_NOTE,
      trigger: 'manual',
      title: 'Old title',
      summary: 'Old summary',
      locked: false,
      body: 'OLD-BODY',
      bodyFormat: 'markdown',
    });
    expect(appended.ok).toBe(true);
    const handler = handlers.get('data:save') as Handler;
    const first = (await handler({}, workspace([note('n1', 'One'), note('n2', 'Two')]), uid)) as SaveResult;
    const second = (await handler({}, workspace([note('n1', 'One')]), uid, first.writeGeneration)) as SaveResult;
    expect(second.ok).toBe(true);
    const dir = path.join(userDataDir, 'backups', uid);
    const snapshots = fs.readdirSync(dir).filter((n) => n.startsWith('data-') && n.endsWith('.json') && !n.includes('-shard-'));
    return { dir, snapshots, revisionId: appended.revisionId as string };
  }

  function restoreAll(dir: string, snapshots: string[]) {
    for (const name of snapshots) {
      const restored = call<{ ok: boolean; error?: string }>('data:restoreFromSource', { filePath: path.join(dir, name) });
      expect(restored.ok, `${name}: ${restored.error}`).toBe(true);
    }
  }

  function imageNow() {
    const r = call<{ ok: boolean; dataBase64?: string }>('attachment:read', { attachmentId: 'attachment-new-0001' });
    return r.ok ? Buffer.from(r.dataBase64 as string, 'base64') : null;
  }

  function historyBodyNow(revisionId: string) {
    const r = call<{ ok: boolean; revision?: { body?: string } }>('noteHistory:read', { noteId: HIST_NOTE, revisionId });
    return r.ok ? r.revision?.body : null;
  }

  it('brings back the images and history of an earlier snapshot after the password changes', async () => {
    const { dir, snapshots, revisionId } = await accountWithImageAndHistory('snap2@example.com');
    expect(
      call<{ ok: boolean }>('account:changePassword', { oldPassword: 'old-password-1', newPassword: 'new-password-2' }).ok,
    ).toBe(true);

    // The live history is carried to the new key, so only a history that is gone from the
    // live folder shows whether the snapshot's own copy can be opened.
    expect(call<{ ok: boolean }>('noteHistory:purge', { noteId: HIST_NOTE }).ok).toBe(true);
    expect(historyBodyNow(revisionId)).toBeFalsy();

    restoreAll(dir, snapshots);

    expect(imageNow()?.equals(PNG)).toBe(true);
    expect(historyBodyNow(revisionId)).toBe('OLD-BODY');
  });

  it('still opens a snapshot after two password changes in a row', async () => {
    const { dir, snapshots, revisionId } = await accountWithImageAndHistory('snap3@example.com');
    expect(call<{ ok: boolean }>('account:changePassword', { oldPassword: 'old-password-1', newPassword: 'new-password-2' }).ok).toBe(true);
    expect(call<{ ok: boolean }>('account:changePassword', { oldPassword: 'new-password-2', newPassword: 'third-password-3' }).ok).toBe(true);

    restoreAll(dir, snapshots);

    expect(imageNow()?.equals(PNG)).toBe(true);
    expect(historyBodyNow(revisionId)).toBe('OLD-BODY');
  });

  it('does not replace an image that opens today with a snapshot copy that opens under no key', async () => {
    const { dir, snapshots } = await accountWithImageAndHistory('snap5@example.com');
    const uid = sessionUid();
    // Damage the snapshot's copy (a new file, so the live image is not touched through the hardlink).
    const attBackup = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith('attachments-'))
      .map((n) => path.join(dir, n))
      .find((d) => fs.readdirSync(d).length > 0) as string;
    const file = path.join(attBackup, fs.readdirSync(attBackup)[0] as string);
    const good = fs.readFileSync(file, 'utf8');
    fs.rmSync(file);
    const envelope = JSON.parse(good) as { ct: string };
    envelope.ct = `${envelope.ct.slice(0, -6)}AAAAAA`; // still an envelope, but it no longer authenticates
    fs.writeFileSync(file, JSON.stringify(envelope));
    const live = path.join(userDataDir, 'attachments', uid, fs.readdirSync(attBackup)[0] as string);
    const liveBefore = fs.readFileSync(live, 'utf8');

    const restored = call<{ ok: boolean; attachmentsFailed?: number; error?: string }>('data:restoreFromSource', {
      filePath: path.join(dir, `${path.basename(attBackup).replace(/^attachments-/, 'data-')}.json`),
    });

    expect(snapshots.length).toBeGreaterThan(0);
    expect(restored.ok, restored.error).toBe(true);
    expect(restored.attachmentsFailed).toBe(1);
    expect(fs.readFileSync(live, 'utf8')).toBe(liveBefore);
    expect(imageNow()?.equals(PNG)).toBe(true);
  });

  it('opens a snapshot made before a reset with recovery codes', async () => {
    const reg = call<{ ok: boolean; recoveryCodes?: string[] }>('account:register', { email: 'snap4@example.com', password: 'old-password-1' });
    expect(reg.ok).toBe(true);
    const uid = sessionUid();
    const handler = handlers.get('data:save') as Handler;
    const first = (await handler({}, workspace([note('n1', 'One'), note('n2', 'Two')]), uid)) as SaveResult;
    await handler({}, workspace([note('n1', 'One')]), uid, first.writeGeneration);
    const dir = path.join(userDataDir, 'backups', uid);
    const snapshots = fs.readdirSync(dir).filter((n) => n.startsWith('data-') && n.endsWith('.json'));
    expect(call<{ ok: boolean }>('account:recoverWithCodes', { email: 'snap4@example.com', codes: reg.recoveryCodes, newPassword: 'brand-new-pass-3' }).ok).toBe(true);

    restoreAll(dir, snapshots);
  });

  it('lets an earlier snapshot be restored after the password changes', async () => {
    const { dir, snapshots } = await accountWithOlderSnapshot('snap1@example.com');
    expect(
      call<{ ok: boolean }>('account:changePassword', { oldPassword: 'old-password-1', newPassword: 'new-password-2' }).ok,
    ).toBe(true);

    for (const name of snapshots) {
      const restored = call<{ ok: boolean; error?: string }>('data:restoreFromSource', { filePath: path.join(dir, name) });
      expect(restored.ok, `${name}: ${restored.error}`).toBe(true);
    }
  });
});

describe('replacing the workspace needs a safety copy first', () => {
  function call<T>(channel: string, payload?: unknown): T {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  /** The disk refuses every write into backups/ (full, read-only, unplugged). */
  function withBackupsUnwritable<T>(run: () => T): T {
    const realCopy = fs.copyFileSync;
    fs.copyFileSync = ((src: fs.PathLike, dest: fs.PathLike, ...rest: unknown[]) => {
      if (String(dest).includes(`${path.sep}backups${path.sep}`)) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      return (realCopy as (...a: unknown[]) => void)(src, dest, ...rest);
    }) as typeof fs.copyFileSync;
    try {
      return run();
    } finally {
      fs.copyFileSync = realCopy;
    }
  }

  async function seed() {
    const first = await save(workspace([note('n1', 'Mine'), note('n2', 'Also mine')]));
    expect(first.ok).toBe(true);
    // A backup to restore from, taken while the disk still worked.
    const dir = path.join(userDataDir, 'backups', USER_ID);
    await save(workspace([note('n1', 'Mine')]), first.writeGeneration);
    return fs.readdirSync(dir).find((n) => n.startsWith('data-') && n.endsWith('.json') && !n.includes('-shard-')) as string;
  }

  it('does not import a JSON workspace when the safety copy cannot be made', async () => {
    await seed();
    const r = withBackupsUnwritable(() =>
      call<{ ok: boolean; error?: string }>('data:importWorkspace', workspace([note('x1', 'Foreign')])),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/safety copy/i);
    expect(load()?.notes?.map((n) => n.id)).toEqual(['n1']);
  });

  it('does not restore a snapshot when the safety copy cannot be made', async () => {
    const snapshot = await seed();
    const r = withBackupsUnwritable(() =>
      call<{ ok: boolean; error?: string }>('data:restoreFromSource', {
        filePath: path.join(userDataDir, 'backups', USER_ID, snapshot),
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/safety copy/i);
    expect(load()?.notes?.map((n) => n.id)).toEqual(['n1']);
  });

  it('goes ahead when the data copy was made and only the image part of the safety copy failed', async () => {
    await seed();
    expect(call<{ ok: boolean }>('attachment:write', { attachmentId: 'attachment-new-0009', dataBase64: 'iVBORw0KGgo=' }).ok).toBe(true);
    const realMkdir = fs.mkdirSync;
    fs.mkdirSync = ((target: fs.PathLike, ...rest: unknown[]) => {
      if (String(target).includes('attachments-pre-import')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      return (realMkdir as (...a: unknown[]) => unknown)(target, ...rest);
    }) as typeof fs.mkdirSync;
    let r: { ok: boolean; error?: string };
    try {
      r = call('data:importWorkspace', workspace([note('x1', 'Imported')]));
    } finally {
      fs.mkdirSync = realMkdir;
    }
    expect(r.ok, r.error).toBe(true);
    const copies = fs.readdirSync(path.join(userDataDir, 'backups', USER_ID));
    expect(copies.some((n) => n.startsWith('data-pre-import-'))).toBe(true);
  });

  it('still imports when there is no data file yet to copy', () => {
    const r = call<{ ok: boolean; error?: string }>('data:importWorkspace', workspace([note('x1', 'First import')]));
    expect(r.ok, r.error).toBe(true);
  });
});

describe('data:exportBundle', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

  function call<T>(channel: string, payload?: unknown): T | Promise<T> {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  it('says how many images it could not include', async () => {
    expect((call('account:register', { email: 'exp@example.com', password: 'old-password-1' }) as { ok: boolean }).ok).toBe(true);
    for (const id of ['attachment-new-0001', 'attachment-new-0002']) {
      expect((call('attachment:write', { attachmentId: id, dataBase64: PNG.toString('base64') }) as { ok: boolean }).ok).toBe(true);
    }
    // One image gets damaged on disk: it opens under no key.
    const uid = JSON.parse(fs.readFileSync(path.join(userDataDir, 'cadence-session.json'), 'utf8')).userId as string;
    const dir = path.join(userDataDir, 'attachments', uid);
    const victim = fs.readdirSync(dir).find((n) => n.startsWith('attachment-new-0002')) as string;
    fs.writeFileSync(path.join(dir, victim), 'CDNC1:not-a-real-envelope');

    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-export-'));
    pickedFolder = { canceled: false, filePaths: [target] };
    try {
      const r = (await call('data:exportBundle', { data: workspace([note('n1', 'One')]) })) as {
        ok: boolean;
        path?: string;
        attachmentsSkipped?: number;
        error?: string;
      };
      expect(r.ok, r.error).toBe(true);
      expect(r.attachmentsSkipped).toBe(1);
      const manifest = JSON.parse(fs.readFileSync(path.join(r.path as string, 'manifest.json'), 'utf8'));
      expect(manifest.attachmentCount).toBe(1);
      expect(manifest.attachmentsSkipped).toBe(1);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
});

describe('what a restore reports about the images and history it could not bring back', () => {
  function call<T>(channel: string, payload?: unknown): T {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  const IDS = ['aaaaaaaa', 'bbbbbbbb'];
  const attDir = () => path.join(userDataDir, 'attachments', USER_ID);
  const backups = () => path.join(userDataDir, 'backups', USER_ID);

  function put(id: string, bytes: string) {
    fs.mkdirSync(attDir(), { recursive: true });
    const live = path.join(attDir(), `${id}.bin`);
    fs.writeFileSync(`${live}.tmp`, bytes);
    fs.renameSync(`${live}.tmp`, live);
  }

  async function snapshotWithTwoImages() {
    const holding = (id: string, title: string) => ({ ...note(id, title), body: IDS.map((x) => `cadence-attachment://${x}`).join(' ') });
    const first = await save(workspace([holding('n1', 'One'), note('n2', 'Two'), note('n3', 'Three')]));
    IDS.forEach((id) => put(id, `bytes-of-${id}`));
    const second = await save(workspace([holding('n1', 'One'), note('n2', 'Two')]), first.writeGeneration);
    await save(workspace([holding('n1', 'One')]), second.writeGeneration);
    return fs
      .readdirSync(backups())
      .filter((n) => n.startsWith('data-pre-save-') && n.endsWith('.json') && !n.includes('-shard-'))
      .sort()
      .pop() as string;
  }

  it('counts the images it brought back', async () => {
    const snapshot = await snapshotWithTwoImages();
    fs.rmSync(attDir(), { recursive: true, force: true });
    const r = call<{ ok: boolean; attachmentsRestored?: number; attachmentsFailed?: number; error?: string }>(
      'data:restoreFromSource',
      { filePath: path.join(backups(), snapshot) },
    );
    expect(r.ok, r.error).toBe(true);
    expect(r.attachmentsRestored).toBe(2);
    expect(r.attachmentsFailed).toBe(0);
  });

  it('keeps going when one image cannot be copied, and says which count was lost', async () => {
    const snapshot = await snapshotWithTwoImages();
    fs.rmSync(attDir(), { recursive: true, force: true });
    const realCopy = fs.copyFileSync;
    fs.copyFileSync = ((src: fs.PathLike, dest: fs.PathLike, ...rest: unknown[]) => {
      if (String(src).endsWith('aaaaaaaa.bin')) throw Object.assign(new Error('EIO'), { code: 'EIO' });
      return (realCopy as (...a: unknown[]) => void)(src, dest, ...rest);
    }) as typeof fs.copyFileSync;
    let r: { ok: boolean; attachmentsRestored?: number; attachmentsFailed?: number; error?: string };
    try {
      r = call('data:restoreFromSource', { filePath: path.join(backups(), snapshot) });
    } finally {
      fs.copyFileSync = realCopy;
    }
    // The workspace was already replaced, so this is a finished restore with a gap, not a failure.
    expect(r.ok, r.error).toBe(true);
    expect(r.attachmentsRestored).toBe(1);
    expect(r.attachmentsFailed).toBe(1);
    expect(fs.existsSync(path.join(attDir(), 'bbbbbbbb.bin'))).toBe(true);
    expect(fs.readdirSync(attDir()).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});

describe('data:listSources', () => {
  function call<T>(channel: string, payload?: unknown): T {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }
  type Source = { name: string; counts: { notes: number } | null; decryptable: boolean };

  it('lists a snapshot with its counts, again from memory, and re-reads one that changed', async () => {
    const first = await save(workspace([note('n1', 'One'), note('n2', 'Two'), note('n3', 'Three')]));
    await save(workspace([note('n1', 'One'), note('n2', 'Two')]), first.writeGeneration);
    const listed = () => call<{ backups: Source[] }>('data:listSources').backups;

    const before = listed();
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((b) => b.decryptable && b.counts)).toBe(true);
    expect(listed()).toEqual(before);

    // A file rewritten under the same name must not be answered from memory.
    const dir = path.join(userDataDir, 'backups', USER_ID);
    const target = before[0]!.name;
    fs.writeFileSync(path.join(dir, target), JSON.stringify(workspace([note('only', 'Only')])));
    const after = listed().find((b) => b.name === target);
    expect(after?.counts?.notes).toBe(1);
  });
});

describe('backupArchive:export', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const NOTE = 'note-arch-000001';

  type ExportReply = {
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
    attachmentCount?: number;
    attachmentsSkipped?: number;
    noteHistoryRevisionCount?: number;
  };

  function call<T>(channel: string, payload?: unknown): T | Promise<T> {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }

  function signUp(email: string) {
    expect((call('account:register', { email, password: 'old-password-1' }) as { ok: boolean }).ok).toBe(true);
    return JSON.parse(fs.readFileSync(path.join(userDataDir, 'cadence-session.json'), 'utf8')).userId as string;
  }

  function writeImage(id: string) {
    expect((call('attachment:write', { attachmentId: id, dataBase64: PNG.toString('base64') }) as { ok: boolean }).ok).toBe(true);
  }

  function addHistory(body: string) {
    expect(
      (call('noteHistory:append', { noteId: NOTE, trigger: 'manual', title: 'T', summary: 'S', locked: false, body, bodyFormat: 'markdown' }) as { ok: boolean }).ok,
    ).toBe(true);
  }

  async function exportTo(target: string, payload = workspace([note('n1', 'One')])) {
    pickedSave = { canceled: false, filePath: target };
    return (await call('backupArchive:export', { data: payload })) as ExportReply;
  }

  let out: string;
  beforeEach(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-archive-'));
  });
  afterEach(() => fs.rmSync(out, { recursive: true, force: true }));

  it('does nothing when the save dialog is cancelled', async () => {
    signUp('arch0@example.com');
    pickedSave = { canceled: true };
    const r = (await call('backupArchive:export', { data: workspace([note('n1', 'One')]) })) as ExportReply;
    expect(r).toMatchObject({ ok: false, canceled: true });
  });

  it('puts the workspace, every image on disk, readable note history and a manifest into one ZIP', async () => {
    signUp('arch1@example.com');
    writeImage('attachment-new-0001');
    writeImage('attachment-new-0002'); // not referenced by any note: still part of a full backup
    addHistory('ARCHIVE-HISTORY-BODY');
    const target = path.join(out, 'backup.zip');

    const r = await exportTo(target, { ...workspace([note('n1', 'One')]), noteGroups: [] });

    expect(r.ok, r.error).toBe(true);
    expect(r.path).toBe(target);
    expect(r).toMatchObject({ attachmentCount: 2, attachmentsSkipped: 0, noteHistoryRevisionCount: 1 });
    const entries = zipStoreUnpack(new Uint8Array(fs.readFileSync(target)));
    const names = Object.keys(entries);
    expect(names).toContain('data.json');
    expect(names).toContain('manifest.json');
    expect(names.filter((n) => n.startsWith('attachments/')).sort()).toEqual([
      'attachments/attachment-new-0001.bin',
      'attachments/attachment-new-0002.bin',
    ]);
    expect(Buffer.from(entries['attachments/attachment-new-0001.bin']!).equals(PNG)).toBe(true);
    const historyText = names
      .filter((n) => n.startsWith(`note-history/${NOTE}/`))
      .map((n) => new TextDecoder().decode(entries[n]))
      .join('\n');
    expect(historyText).toContain('ARCHIVE-HISTORY-BODY');
    const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
    expect(manifest).toMatchObject({ format: 'cadence-bundle-v2', attachmentCount: 2, attachmentsSkipped: 0, noteHistoryRevisionCount: 1 });
  });

  it('is still read by the reader older builds use (extra folders are ignored)', async () => {
    signUp('arch2@example.com');
    writeImage('attachment-new-0001');
    addHistory('X');
    const target = path.join(out, 'backup.zip');
    expect((await exportTo(target)).ok).toBe(true);

    const bundle = parseBundleEntries(zipStoreUnpack(new Uint8Array(fs.readFileSync(target))));
    expect([...bundle.attachments.keys()]).toEqual(['attachment-new-0001']);
    expect(bundle.manifest?.format).toBe('cadence-bundle-v2');
  });

  it('carries no AI keys that the renderer left out, and does not add any', async () => {
    signUp('arch3@example.com');
    const target = path.join(out, 'backup.zip');
    await exportTo(target, { ...workspace([note('n1', 'One')]), aiSettings: { provider: 'openai', apiKey: '' } } as never);
    const text = new TextDecoder().decode(zipStoreUnpack(new Uint8Array(fs.readFileSync(target)))['data.json']);
    expect(text).not.toMatch(/sk-/);
  });

  it('says how many images it could not read, records it, and still writes the rest', async () => {
    const uid = signUp('arch4@example.com');
    writeImage('attachment-new-0001');
    writeImage('attachment-new-0002');
    const dir = path.join(userDataDir, 'attachments', uid);
    const victim = fs.readdirSync(dir).find((n) => n.startsWith('attachment-new-0002')) as string;
    fs.writeFileSync(path.join(dir, victim), '{"magic":"CDNC1","iv":"x","ct":"y"}');
    const target = path.join(out, 'backup.zip');

    const r = await exportTo(target);

    expect(r.ok, r.error).toBe(true);
    expect(r).toMatchObject({ attachmentCount: 1, attachmentsSkipped: 1 });
    const manifest = JSON.parse(new TextDecoder().decode(zipStoreUnpack(new Uint8Array(fs.readFileSync(target)))['manifest.json']));
    expect(manifest).toMatchObject({ attachmentCount: 1, attachmentsSkipped: 1 });
  });

  it('leaves no half-written file or temporary folder when the destination cannot be written', async () => {
    signUp('arch5@example.com');
    writeImage('attachment-new-0001');
    addHistory('X');
    const blocker = path.join(out, 'not-a-folder');
    fs.writeFileSync(blocker, 'file');
    const r = await exportTo(path.join(blocker, 'backup.zip'));
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(fs.readdirSync(userDataDir).filter((n) => n.startsWith('tmp-backup-'))).toEqual([]);
    expect(fs.readdirSync(out)).toEqual(['not-a-folder']);
  });

  it('works for a workspace with no images and no history', async () => {
    signUp('arch6@example.com');
    const target = path.join(out, 'backup.zip');
    const r = await exportTo(target);
    expect(r).toMatchObject({ ok: true, attachmentCount: 0, attachmentsSkipped: 0, noteHistoryRevisionCount: 0 });
    expect(Object.keys(zipStoreUnpack(new Uint8Array(fs.readFileSync(target)))).sort()).toEqual(['data.json', 'manifest.json']);
  });

  it('refuses when nobody is signed in', async () => {
    fs.rmSync(path.join(userDataDir, 'cadence-session.json'), { force: true });
    pickedSave = { canceled: false, filePath: path.join(out, 'backup.zip') };
    const r = (await call('backupArchive:export', { data: workspace([note('n1', 'One')]) })) as ExportReply;
    expect(r).toMatchObject({ ok: false, error: 'Not signed in.' });
    expect(fs.existsSync(path.join(out, 'backup.zip'))).toBe(false);
  });
});

describe('backupArchive:open and backupArchive:apply', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const NOTE = 'note-arch-000002';
  const { createZipWriter } = require('./persistence/zipWriter.cjs') as {
    createZipWriter: (f: string) => Promise<{ add: (n: string, b: Buffer) => Promise<void>; finish: () => Promise<unknown> }>;
  };

  type Preview = {
    ok: boolean;
    canceled?: boolean;
    error?: string;
    token?: string;
    kind?: 'zip' | 'json';
    fileName?: string;
    workspace?: { notes?: { id: string; title: string }[] };
    counts?: { notes: number; todoItems: number; teams: number };
    attachments?: { count: number; skippedAtExport: number };
    history?: { notes: number; revisions: number };
    exportedAt?: string;
  };
  type Applied = {
    ok: boolean;
    error?: string;
    attachmentsRestored?: number;
    attachmentsSkipped?: number;
    attachmentsFailed?: number;
    historyIncomplete?: boolean;
    writeGeneration?: number;
  };

  function call<T>(channel: string, payload?: unknown): T | Promise<T> {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`${channel} handler was never registered`);
    return handler({}, payload) as T;
  }
  const open = async (file: string) => {
    pickedFolder = { canceled: false, filePaths: [file] };
    return (await call('backupArchive:open')) as Preview;
  };
  const diskGeneration = () => (call('data:loadResult') as { writeGeneration: number }).writeGeneration;
  const apply = async (
    token: string | undefined,
    ws: unknown,
    extra: { mode?: 'merge' | 'replace'; expectedGeneration?: number | null } = {},
  ) => {
    const expectedGeneration = extra.expectedGeneration === null ? undefined : (extra.expectedGeneration ?? diskGeneration());
    return (await call('backupArchive:apply', { token, workspace: ws, mode: extra.mode ?? 'replace', expectedGeneration })) as Applied;
  };

  function signUp(email: string) {
    expect((call('account:register', { email, password: 'old-password-1' }) as { ok: boolean }).ok).toBe(true);
    return JSON.parse(fs.readFileSync(path.join(userDataDir, 'cadence-session.json'), 'utf8')).userId as string;
  }
  function writeImage(id: string) {
    expect((call('attachment:write', { attachmentId: id, dataBase64: PNG.toString('base64') }) as { ok: boolean }).ok).toBe(true);
  }
  const readImage = (id: string) => {
    const r = call('attachment:read', { attachmentId: id }) as { ok: boolean; dataBase64?: string };
    return r.ok ? Buffer.from(r.dataBase64 as string, 'base64') : null;
  };
  function addHistory(body: string) {
    const r = call('noteHistory:append', { noteId: NOTE, trigger: 'manual', title: 'T', summary: 'S', locked: false, body, bodyFormat: 'markdown' }) as { ok: boolean; revisionId?: string };
    expect(r.ok).toBe(true);
    return r.revisionId as string;
  }
  const readHistory = (revisionId: string) => {
    const r = call('noteHistory:read', { noteId: NOTE, revisionId }) as { ok: boolean; revision?: { body?: string } };
    return r.ok ? r.revision?.body : null;
  };
  async function makeBackup(target: string, payload = workspace([note('n1', 'One'), note('n2', 'Two')])) {
    pickedSave = { canceled: false, filePath: target };
    const r = (await call('backupArchive:export', { data: payload })) as { ok: boolean; error?: string };
    expect(r.ok, r.error).toBe(true);
  }

  let out: string;
  beforeEach(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-import-'));
  });
  afterEach(() => fs.rmSync(out, { recursive: true, force: true }));

  describe('open', () => {
    it('does nothing when the dialog is cancelled', async () => {
      signUp('imp0@example.com');
      pickedFolder = { canceled: true, filePaths: [] };
      expect(await call('backupArchive:open')).toMatchObject({ ok: false, canceled: true });
    });

    it('tells what is inside a backup before anything is changed', async () => {
      signUp('imp1@example.com');
      writeImage('attachment-new-0001');
      writeImage('attachment-new-0002');
      addHistory('H1');
      addHistory('H2');
      const file = path.join(out, 'b.zip');
      await makeBackup(file);

      const p = await open(file);

      expect(p.ok, p.error).toBe(true);
      expect(p).toMatchObject({ kind: 'zip', fileName: 'b.zip' });
      expect(p.counts?.notes).toBe(2);
      expect(p.attachments).toEqual({ count: 2, skippedAtExport: 0 });
      expect(p.history).toEqual({ notes: 1, revisions: 2 });
      expect(typeof p.exportedAt).toBe('string');
      expect(typeof p.token).toBe('string');
      expect(p.workspace?.notes?.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
      // Looking is not importing.
      expect((call('data:load') as { notes?: unknown[] } | null)?.notes ?? []).toHaveLength(0);
    });

    it('reads a backup folder that was compressed by the operating system, folder prefix and all', async () => {
      signUp('imp2@example.com');
      const body = Buffer.from(JSON.stringify(workspace([note('n1', 'One')])));
      const entries = [
        { name: 'cadence-backup-1/data.json', data: body },
        { name: 'cadence-backup-1/._data.json', data: Buffer.from('mac metadata') },
        { name: 'cadence-backup-1/attachments/attachment-new-0001.bin', data: PNG },
        { name: 'cadence-backup-1/attachments/._attachment-new-0001.bin', data: Buffer.from('mac metadata') },
        { name: '__MACOSX/cadence-backup-1/._data.json', data: Buffer.from('x') },
      ];
      // Deflated, like Finder's "Compress".
      const { crc32 } = require('./persistence/zipWriter.cjs') as { crc32: (b: Buffer) => number };
      const parts: Buffer[] = [];
      const centrals: Buffer[] = [];
      let offset = 0;
      for (const e of entries) {
        const comp = zlib.deflateRawSync(e.data);
        const nameBytes = Buffer.from(e.name);
        const local = Buffer.alloc(30 + nameBytes.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(8, 8);
        local.writeUInt32LE(crc32(e.data), 14);
        local.writeUInt32LE(comp.length, 18);
        local.writeUInt32LE(e.data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        nameBytes.copy(local, 30);
        const central = Buffer.alloc(46 + nameBytes.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(8, 10);
        central.writeUInt32LE(crc32(e.data), 16);
        central.writeUInt32LE(comp.length, 20);
        central.writeUInt32LE(e.data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        nameBytes.copy(central, 46);
        parts.push(local, comp);
        centrals.push(central);
        offset += local.length + comp.length;
      }
      const cd = Buffer.concat(centrals);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(entries.length, 8);
      end.writeUInt16LE(entries.length, 10);
      end.writeUInt32LE(cd.length, 12);
      end.writeUInt32LE(offset, 16);
      const file = path.join(out, 'Finder.zip');
      fs.writeFileSync(file, Buffer.concat([...parts, cd, end]));

      const p = await open(file);

      expect(p.ok, p.error).toBe(true);
      expect(p.counts?.notes).toBe(1);
      expect(p.attachments?.count).toBe(1);
    });

    it('reads a plain JSON workspace file', async () => {
      signUp('imp3@example.com');
      const file = path.join(out, 'w.json');
      fs.writeFileSync(file, JSON.stringify(workspace([note('n1', 'One')])));
      const p = await open(file);
      expect(p).toMatchObject({ ok: true, kind: 'json' });
      expect(p.attachments?.count).toBe(0);
      expect(p.history).toEqual({ notes: 0, revisions: 0 });
    });

    it.each([
      ['a ZIP without data.json', async (f: string) => { const w = await createZipWriter(f); await w.add('readme.txt', Buffer.from('x')); await w.finish(); }, /missing data\.json/i],
      ['a file that is not a ZIP', async (f: string) => fs.writeFileSync(f, 'plain text'), /not a valid zip/i],
      ['JSON that is not a workspace', async (f: string) => fs.writeFileSync(f, JSON.stringify({ hello: 'world' })), /does not look like a cadence/i],
      ['JSON that is not JSON', async (f: string) => fs.writeFileSync(f, '{oops'), /not valid json/i],
    ])('explains %s without changing anything', async (_label, make, message) => {
      signUp('imp4@example.com');
      const file = path.join(out, /^JSON/.test(_label) ? 'x.json' : 'x.zip');
      await make(file);
      const p = await open(file);
      expect(p.ok).toBe(false);
      expect(p.error).toMatch(message as RegExp);
    });

    it('refuses when nobody is signed in', async () => {
      fs.rmSync(path.join(userDataDir, 'cadence-session.json'), { force: true });
      expect(await open(path.join(out, 'x.zip'))).toMatchObject({ ok: false, error: 'Not signed in.' });
    });
  });

  describe('apply', () => {
    it('brings the workspace, the images and the note history into a different account', async () => {
      signUp('src@example.com');
      writeImage('attachment-new-0001');
      const rev = addHistory('FROM-ACCOUNT-A');
      const file = path.join(out, 'b.zip');
      await makeBackup(file);

      signUp('dest@example.com');
      expect(readImage('attachment-new-0001')).toBeNull();
      const p = await open(file);
      const applied = await apply(p.token, p.workspace);

      expect(applied.ok, applied.error).toBe(true);
      expect(applied).toMatchObject({ attachmentsRestored: 1, attachmentsSkipped: 0, attachmentsFailed: 0, historyIncomplete: false });
      expect((call('data:load') as { notes: { id: string }[] }).notes.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
      expect(readImage('attachment-new-0001')?.equals(PNG)).toBe(true);
      expect(readHistory(rev)).toBe('FROM-ACCOUNT-A');
    });

    it('takes a safety copy of what was there first', async () => {
      const uid = signUp('safe@example.com');
      const handler = handlers.get('data:save') as Handler;
      await handler({}, workspace([note('mine', 'Mine'), note('mine2', 'Mine too')]), uid, undefined);
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      expect((await apply(p.token, p.workspace)).ok).toBe(true);
      expect(fs.readdirSync(path.join(userDataDir, 'backups', uid)).some((n) => n.startsWith('data-pre-import-'))).toBe(true);
    });

    it('changes nothing, and keeps the file usable, when the safety copy cannot be made', async () => {
      const uid = signUp('nosafe@example.com');
      const handler = handlers.get('data:save') as Handler;
      await handler({}, workspace([note('mine', 'Mine'), note('mine2', 'Mine too')]), uid, undefined);
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);

      const realCopy = fs.copyFileSync;
      fs.copyFileSync = ((src: fs.PathLike, dest: fs.PathLike, ...rest: unknown[]) => {
        if (String(dest).includes(`${path.sep}backups${path.sep}`)) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
        return (realCopy as (...a: unknown[]) => void)(src, dest, ...rest);
      }) as typeof fs.copyFileSync;
      let failed: Applied;
      try {
        failed = await apply(p.token, p.workspace);
      } finally {
        fs.copyFileSync = realCopy;
      }
      expect(failed.ok).toBe(false);
      expect(failed.error).toMatch(/safety copy/i);
      expect((call('data:load') as { notes: { id: string }[] }).notes.map((n) => n.id).sort()).toEqual(['mine', 'mine2']);

      // Once the disk works again the same opened file can be applied.
      expect((await apply(p.token, p.workspace)).ok).toBe(true);
    });

    it('can be applied once; a second use of the same opening is refused', async () => {
      signUp('once@example.com');
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      expect((await apply(p.token, p.workspace)).ok).toBe(true);
      expect(await apply(p.token, p.workspace)).toMatchObject({ ok: false });
    });

    it('refuses an opening it does not know, and one made by another account', async () => {
      signUp('tok1@example.com');
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      expect(await apply('not-a-token', p.workspace)).toMatchObject({ ok: false });
      expect(await apply(undefined, p.workspace)).toMatchObject({ ok: false });
      signUp('tok2@example.com');
      expect(await apply(p.token, p.workspace)).toMatchObject({ ok: false });
    });

    it('refuses a file that changed after it was opened', async () => {
      signUp('chg@example.com');
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      fs.appendFileSync(file, 'tampered');
      const r = await apply(p.token, p.workspace);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/changed/i);
    });

    it('refuses a workspace that is not one', async () => {
      signUp('bad@example.com');
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      expect(await apply(p.token, { hello: 'world' })).toMatchObject({ ok: false });
    });

    it('imports the rest and reports the gap when one image in the archive is damaged', async () => {
      signUp('gap@example.com');
      const w = await createZipWriter(path.join(out, 'g.zip'));
      await w.add('data.json', Buffer.from(JSON.stringify(workspace([note('n1', 'One')]))));
      await w.add('attachments/attachment-new-0001.bin', PNG);
      await w.add('attachments/attachment-new-0002.bin', PNG);
      await w.finish();
      // Break the second image's bytes without touching its checksum record.
      const buf = fs.readFileSync(path.join(out, 'g.zip'));
      const at = buf.indexOf(PNG, buf.indexOf(PNG) + 1);
      buf[at + 3] = buf[at + 3]! ^ 0xff;
      fs.writeFileSync(path.join(out, 'g.zip'), buf);

      const p = await open(path.join(out, 'g.zip'));
      const r = await apply(p.token, p.workspace);

      expect(r.ok, r.error).toBe(true);
      expect(r).toMatchObject({ attachmentsRestored: 1, attachmentsFailed: 1 });
      expect(readImage('attachment-new-0001')?.equals(PNG)).toBe(true);
    });

    it('never writes outside its own folders, whatever the archive calls its files', async () => {
      const uid = signUp('evil@example.com');
      const w = await createZipWriter(path.join(out, 'e.zip'));
      await w.add('data.json', Buffer.from(JSON.stringify(workspace([note('n1', 'One')]))));
      await w.add('attachments/..%2f..%2fevil.bin', PNG);
      await w.add('note-history/..evil/index.json', Buffer.from('[]'));
      await w.add(`note-history/${NOTE}/..%2f..%2f..%2fevil.json`, Buffer.from('{}'));
      await w.finish();
      const p = await open(path.join(out, 'e.zip'));
      const r = await apply(p.token, p.workspace);
      expect(r.ok, r.error).toBe(true);
      expect(r.attachmentsRestored).toBe(0);
      const strays = [];
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const f = path.join(d, e.name);
          if (e.name.includes('evil')) strays.push(f);
          if (e.isDirectory()) walk(f);
        }
      };
      walk(userDataDir);
      expect(strays).toEqual([]);
      void uid;
    });

    it('refuses, and changes nothing, when the workspace changed after the merge was built', async () => {
      const uid = signUp('race@example.com');
      const handler = handlers.get('data:save') as Handler;
      const first = (await handler({}, workspace([note('mine', 'Mine'), note('mine2', 'Mine too')]), uid, undefined)) as SaveResult;
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      const seen = diskGeneration();
      // Another writer (a second window, a late autosave) moves the workspace on.
      await handler({}, workspace([note('mine', 'Mine'), note('mine2', 'Mine too'), note('late', 'Written meanwhile')]), uid, first.writeGeneration);

      const r = await apply(p.token, p.workspace, { mode: 'merge', expectedGeneration: seen });

      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/changed/i);
      expect((call('data:load') as { notes: { id: string }[] }).notes.map((n) => n.id).sort()).toEqual(['late', 'mine', 'mine2']);
      // The opening is still good: building the merge again from what is on disk now works.
      expect((await apply(p.token, p.workspace, { mode: 'merge' })).ok).toBe(true);
    });

    it('does not add to a workspace it cannot tell the generation of', async () => {
      signUp('nogen@example.com');
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      const r = await apply(p.token, p.workspace, { mode: 'merge', expectedGeneration: null });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/generation|changed|try again/i);
    });

    it('does not add to data it cannot read, but still lets that data be replaced from a backup', async () => {
      const uid = signUp('unreadable@example.com');
      const handler = handlers.get('data:save') as Handler;
      await handler({}, workspace([note('mine', 'Mine'), note('mine2', 'Mine too')]), uid, undefined);
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      const seen = diskGeneration();
      const live = path.join(userDataDir, fs.readdirSync(userDataDir).find((n) => n.startsWith('cadence-data-') && !n.includes('-20')) as string);
      const good = fs.readFileSync(live, 'utf8');
      const damaged = JSON.parse(good) as { ct: string };
      damaged.ct = `${damaged.ct.slice(0, -6)}AAAAAA`;
      fs.writeFileSync(live, JSON.stringify(damaged));

      const added = await apply(p.token, p.workspace, { mode: 'merge', expectedGeneration: seen });
      expect(added.ok).toBe(false);
      expect(added.error).toMatch(/could not be read/i);
      expect(fs.readFileSync(live, 'utf8')).toBe(JSON.stringify(damaged));

      expect((await apply(p.token, p.workspace, { mode: 'replace', expectedGeneration: null })).ok).toBe(true);
    });

    it('refuses a mode it does not know', async () => {
      signUp('mode@example.com');
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      const r = (await call('backupArchive:apply', { token: p.token, workspace: p.workspace, mode: 'wipe' })) as Applied;
      expect(r.ok).toBe(false);
    });

    it('leaves no scratch folder behind', async () => {
      signUp('tidy@example.com');
      addHistory('X');
      const file = path.join(out, 'b.zip');
      await makeBackup(file);
      const p = await open(file);
      await apply(p.token, p.workspace);
      expect(fs.readdirSync(userDataDir).filter((n) => n.startsWith('tmp-backup-'))).toEqual([]);
    });
  });
});
