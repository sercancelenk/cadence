import { EventEmitter } from 'node:events';
import Module from 'node:module';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
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

  // Normally wired up in `app.whenReady()`, which this stub never resolves.
  // Without it the deferred attachment GC that follows every save throws.
  const { initNoteHistory } = require('./noteHistory.cjs') as {
    initNoteHistory: (getUserDataPath: () => string) => void;
  };
  initNoteHistory(() => userDataDir);
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
