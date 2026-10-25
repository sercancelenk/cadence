import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const history = require('./noteHistory.cjs');
const {
  initNoteHistory,
  appendNoteRevision,
  listNoteRevisions,
  readNoteRevision,
  importNoteHistoryFromDir,
  exportNoteHistoryToDir,
  exportNoteHistoryToDirAsync,
  countNoteHistoryRevisions,
  collectReferencedAttachmentsFromNoteHistory,
  upgradeNoteHistoryToEncrypted,
  listNoteHistoryFiles,
} = history;

const userId = 'user-test';
const noteId = 'note-abc123456789';
const keyA = crypto.randomBytes(32);
const keyB = crypto.randomBytes(32);
const MARK_TITLE = 'TITLE-MARKER-QQ';
const MARK_SUMMARY = 'SUMMARY-MARKER-QQ';
const MARK_BODY = 'BODY-MARKER-QQ';

let root: string;
let key: Buffer | null;

function unlockedRevision(extra: Record<string, unknown> = {}) {
  return {
    noteId,
    trigger: 'manual',
    title: MARK_TITLE,
    summary: MARK_SUMMARY,
    locked: false,
    body: MARK_BODY,
    bodyPlainText: MARK_BODY,
    bodyFormat: 'markdown',
    ...extra,
  };
}

function lockedRevision() {
  return {
    noteId,
    trigger: 'lock',
    title: MARK_TITLE,
    summary: MARK_SUMMARY,
    locked: true,
    cipher: { ivB64: 'iv', cipherB64: 'cipher' },
    bodyFormat: 'markdown',
  };
}

function allFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? allFiles(p) : [p];
  });
}

function historyFiles() {
  return allFiles(path.join(root, 'note-history'));
}

function diskText() {
  return historyFiles().map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-hist-enc-'));
  key = keyA;
  initNoteHistory(() => root, () => key);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('note history at rest', () => {
  it('keeps title, summary and body out of every file for an unlocked note', () => {
    expect(appendNoteRevision(userId, unlockedRevision()).ok).toBe(true);
    const text = diskText();
    for (const marker of [MARK_TITLE, MARK_SUMMARY, MARK_BODY]) expect(text).not.toContain(marker);
  });

  it('keeps title and summary out of every file for a locked note too', () => {
    expect(appendNoteRevision(userId, lockedRevision()).ok).toBe(true);
    const text = diskText();
    expect(text).not.toContain(MARK_TITLE);
    expect(text).not.toContain(MARK_SUMMARY);
  });

  it('still lists and reads what it wrote', () => {
    const a = appendNoteRevision(userId, unlockedRevision());
    const list = listNoteRevisions(userId, noteId);
    expect(list.revisions[0]).toMatchObject({ title: MARK_TITLE, summary: MARK_SUMMARY });
    const read = readNoteRevision(userId, noteId, a.revisionId);
    expect(read.revision).toMatchObject({ title: MARK_TITLE, body: MARK_BODY });
    expect(countNoteHistoryRevisions(userId)).toBe(1);
  });

  it('keeps writing plaintext for an account that has no key', () => {
    key = null;
    appendNoteRevision(userId, unlockedRevision());
    expect(diskText()).toContain(MARK_BODY);
    expect(listNoteRevisions(userId, noteId).revisions).toHaveLength(1);
  });
});

describe('history written by an older version', () => {
  it('stays readable once the account has a key, and new revisions are added next to it', () => {
    key = null;
    const old = appendNoteRevision(userId, unlockedRevision({ title: 'Old title' }));
    key = keyA;

    expect(listNoteRevisions(userId, noteId).revisions).toHaveLength(1);
    expect(readNoteRevision(userId, noteId, old.revisionId).revision.title).toBe('Old title');

    appendNoteRevision(userId, unlockedRevision({ title: 'New title' }));
    expect(listNoteRevisions(userId, noteId).revisions.map((r: { title: string }) => r.title).sort()).toEqual([
      'New title',
      'Old title',
    ]);
  });

  it('is encrypted in place by the upgrade, with the same content, and a second run changes nothing', () => {
    key = null;
    const old = appendNoteRevision(userId, unlockedRevision());
    key = keyA;

    const first = upgradeNoteHistoryToEncrypted(userId);
    expect(first).toMatchObject({ ok: true });
    expect(first.upgraded).toBeGreaterThan(0);
    expect(diskText()).not.toContain(MARK_BODY);
    expect(readNoteRevision(userId, noteId, old.revisionId).revision.body).toBe(MARK_BODY);
    expect(listNoteRevisions(userId, noteId).revisions[0].title).toBe(MARK_TITLE);

    const snapshot = historyFiles().map((f) => fs.readFileSync(f, 'utf8'));
    expect(upgradeNoteHistoryToEncrypted(userId).upgraded).toBe(0);
    expect(historyFiles().map((f) => fs.readFileSync(f, 'utf8'))).toEqual(snapshot);
  });

  it('leaves a file it cannot parse exactly as it was', () => {
    key = null;
    appendNoteRevision(userId, unlockedRevision());
    const stray = path.join(root, 'note-history', userId, noteId, 'stray-file-0001.json');
    fs.writeFileSync(stray, '{not json');
    key = keyA;
    upgradeNoteHistoryToEncrypted(userId);
    expect(fs.readFileSync(stray, 'utf8')).toBe('{not json');
  });

  it('does nothing without a key', () => {
    key = null;
    appendNoteRevision(userId, unlockedRevision());
    const before = diskText();
    expect(upgradeNoteHistoryToEncrypted(userId)).toMatchObject({ ok: true, upgraded: 0 });
    expect(diskText()).toBe(before);
  });
});

describe('history that cannot be opened with the key in hand', () => {
  it('is reported as unreadable, never as empty', () => {
    const a = appendNoteRevision(userId, unlockedRevision());
    key = keyB;
    expect(readNoteRevision(userId, noteId, a.revisionId).ok).toBe(false);
    expect(listNoteRevisions(userId, noteId).ok).toBe(false);
    expect(countNoteHistoryRevisions(userId)).toBe(0);
  });

  it('refuses a new revision and leaves the existing index byte for byte', () => {
    appendNoteRevision(userId, unlockedRevision());
    const indexPath = path.join(root, 'note-history', userId, noteId, 'index.json');
    const before = fs.readFileSync(indexPath, 'utf8');
    const filesBefore = historyFiles().length;

    key = keyB;
    expect(appendNoteRevision(userId, unlockedRevision()).ok).toBe(false);

    expect(fs.readFileSync(indexPath, 'utf8')).toBe(before);
    expect(historyFiles().length).toBe(filesBefore);
  });
});

describe('attachment references inside history', () => {
  const ATT = 'attachment-aaaa1111';

  it('are found inside encrypted revisions', () => {
    appendNoteRevision(userId, unlockedRevision({ body: `![](cadence-attachment://${ATT})` }));
    const r = collectReferencedAttachmentsFromNoteHistory(userId);
    expect(r.complete).toBe(true);
    expect([...r.ids]).toContain(ATT);
  });

  it('are reported as incomplete when a revision cannot be opened, so nothing gets deleted on a guess', () => {
    appendNoteRevision(userId, unlockedRevision({ body: `![](cadence-attachment://${ATT})` }));
    key = keyB;
    expect(collectReferencedAttachmentsFromNoteHistory(userId).complete).toBe(false);
  });

  it('still work through the older Set-returning function', () => {
    appendNoteRevision(userId, unlockedRevision({ body: `![](cadence-attachment://${ATT})` }));
    expect([...history.collectReferencedAttachmentIdsFromNoteHistory(userId)]).toContain(ATT);
  });
});

describe('moving history between folders', () => {
  it('encrypts plaintext history it imports', () => {
    key = null;
    appendNoteRevision(userId, unlockedRevision());
    const src = path.join(root, 'note-history', userId);
    const staged = path.join(root, 'staged');
    fs.cpSync(src, staged, { recursive: true });
    fs.rmSync(path.join(root, 'note-history'), { recursive: true, force: true });

    key = keyA;
    expect(importNoteHistoryFromDir(userId, staged)).toMatchObject({ ok: true });
    expect(diskText()).not.toContain(MARK_BODY);
    expect(listNoteRevisions(userId, noteId).revisions).toHaveLength(1);
  });

  it('skips history sealed under another key and leaves its source untouched', () => {
    appendNoteRevision(userId, unlockedRevision());
    const staged = path.join(root, 'staged');
    fs.cpSync(path.join(root, 'note-history', userId), staged, { recursive: true });
    const before = allFiles(staged).map((f) => fs.readFileSync(f, 'utf8'));
    fs.rmSync(path.join(root, 'note-history'), { recursive: true, force: true });

    key = keyB;
    // Reported as not brought back, so a restore can say its history is incomplete.
    expect(importNoteHistoryFromDir(userId, staged)).toMatchObject({ ok: true, merged: 0, skipped: 1 });
    expect(listNoteRevisions(userId, noteId).revisions).toHaveLength(0);
    expect(allFiles(staged).map((f) => fs.readFileSync(f, 'utf8'))).toEqual(before);
  });

  it('reports no skipped notes when everything was brought back', () => {
    appendNoteRevision(userId, unlockedRevision());
    const staged = path.join(root, 'staged');
    fs.cpSync(path.join(root, 'note-history', userId), staged, { recursive: true });
    fs.rmSync(path.join(root, 'note-history'), { recursive: true, force: true });
    expect(importNoteHistoryFromDir(userId, staged)).toMatchObject({ ok: true, merged: 1, skipped: 0 });
  });

  it('exports the same readable files without holding up the event loop', async () => {
    for (let i = 0; i < 45; i += 1) appendNoteRevision(userId, unlockedRevision({ noteId: `note-abcdef${String(100000 + i)}` }));
    let turns = 0;
    let done = false;
    const spin = () => {
      turns += 1;
      if (!done) setImmediate(spin);
    };
    setImmediate(spin);
    const out = path.join(root, 'export-async');
    expect(await exportNoteHistoryToDirAsync(userId, out)).toMatchObject({ ok: true, copied: true });
    done = true;
    expect(turns).toBeGreaterThanOrEqual(2);
    const exported = allFiles(out).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(exported).toContain(MARK_BODY);
    expect(exported).toContain(MARK_TITLE);
    const syncOut = path.join(root, 'export-sync');
    exportNoteHistoryToDir(userId, syncOut);
    expect(allFiles(out).length).toBe(allFiles(syncOut).length);
  });

  it('exports readable files, like the rest of a full backup', () => {
    appendNoteRevision(userId, unlockedRevision());
    const out = path.join(root, 'export');
    expect(exportNoteHistoryToDir(userId, out)).toMatchObject({ ok: true });
    const exported = allFiles(out).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(exported).toContain(MARK_BODY);
    expect(exported).toContain(MARK_TITLE);
  });
});

describe('a sealed file that opens but is not JSON', () => {
  it('counts as unreadable, so nothing is overwritten or deleted on the strength of it', () => {
    appendNoteRevision(userId, unlockedRevision());
    const { encryptPayload } = require('./persistence/dataEnvelope.cjs') as { encryptPayload: (t: string, k: Buffer) => string };
    const indexPath = path.join(root, 'note-history', userId, noteId, 'index.json');
    fs.writeFileSync(indexPath, encryptPayload('this is not json', keyA));
    const before = fs.readFileSync(indexPath, 'utf8');

    expect(listNoteRevisions(userId, noteId).ok).toBe(false);
    expect(appendNoteRevision(userId, unlockedRevision()).ok).toBe(false);
    expect(fs.readFileSync(indexPath, 'utf8')).toBe(before);
  });

  it('makes attachment references incomplete', () => {
    appendNoteRevision(userId, unlockedRevision());
    const { encryptPayload } = require('./persistence/dataEnvelope.cjs') as { encryptPayload: (t: string, k: Buffer) => string };
    const rev = historyFiles().find((f) => !f.endsWith('index.json')) as string;
    fs.writeFileSync(rev, encryptPayload('this is not json', keyA));
    expect(collectReferencedAttachmentsFromNoteHistory(userId).complete).toBe(false);
  });
});

describe('leftovers next to history files', () => {
  it('are not copied into an export (staged copies, temp files)', async () => {
    appendNoteRevision(userId, unlockedRevision());
    const dir = path.join(root, 'note-history', userId, noteId);
    fs.writeFileSync(path.join(dir, 'abc.json.rekey'), 'sealed-leftover');
    fs.writeFileSync(path.join(dir, 'abc.json.123.456.tmp'), 'half-written');

    const syncOut = path.join(root, 'out-sync');
    exportNoteHistoryToDir(userId, syncOut);
    const asyncOut = path.join(root, 'out-async');
    await exportNoteHistoryToDirAsync(userId, asyncOut);

    for (const out of [syncOut, asyncOut]) {
      const names = allFiles(out).map((f) => path.basename(f));
      expect(names.some((n) => n.endsWith('.rekey') || n.endsWith('.tmp'))).toBe(false);
      expect(names.length).toBeGreaterThan(0);
    }
  });
});

describe('listNoteHistoryFiles', () => {
  it('lists every history json file for the user', () => {
    appendNoteRevision(userId, unlockedRevision());
    expect(listNoteHistoryFiles(userId).sort()).toEqual(historyFiles().filter((f) => f.endsWith('.json')).sort());
  });
});
