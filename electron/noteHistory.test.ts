import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  initNoteHistory,
  appendNoteRevision,
  listNoteRevisions,
  readNoteRevision,
  purgeNoteHistory,
  importNoteHistoryFromDir,
  collectReferencedAttachmentIdsFromNoteHistory,
} = require('./noteHistory.cjs');

describe('noteHistory', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-note-history-'));
    initNoteHistory(() => tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const userId = 'user-test';
  const noteId = 'note-abc123456789';

  it('appends, lists, reads, and purges revisions', () => {
    const append = appendNoteRevision(userId, {
      noteId,
      trigger: 'manual',
      title: 'Hello',
      summary: 'Snapshot saved',
      locked: false,
      body: '{"type":"doc","content":[]}',
      bodyFormat: 'prosemirror',
    });
    expect(append.ok).toBe(true);

    const list = listNoteRevisions(userId, noteId);
    expect(list.ok).toBe(true);
    expect(list.revisions).toHaveLength(1);

    const read = readNoteRevision(userId, noteId, list.revisions[0].id);
    expect(read.ok).toBe(true);
    expect(read.revision.title).toBe('Hello');

    const purge = purgeNoteHistory(userId, noteId);
    expect(purge.ok).toBe(true);
    expect(listNoteRevisions(userId, noteId).revisions).toHaveLength(0);
  });

  it('stores locked revisions with cipher only', () => {
    const append = appendNoteRevision(userId, {
      noteId,
      trigger: 'lock',
      title: 'Secret',
      summary: 'Locked',
      locked: true,
      cipher: { ivB64: 'iv', cipherB64: 'cipher' },
      bodyFormat: 'prosemirror',
    });
    expect(append.ok).toBe(true);
    const read = readNoteRevision(userId, noteId, append.revisionId);
    expect(read.revision.locked).toBe(true);
    expect(read.revision.cipher.cipherB64).toBe('cipher');
    expect(read.revision.body).toBeUndefined();
  });

  it('merges imported note history without deleting live revisions', () => {
    appendNoteRevision(userId, {
      noteId,
      trigger: 'manual',
      title: 'Live',
      summary: 'Live copy',
      locked: false,
      body: 'live',
    });

    const importRoot = path.join(tmpRoot, 'import-src', userId, noteId);
    fs.mkdirSync(importRoot, { recursive: true });
    const importedId = '11111111-1111-4111-8111-111111111111';
    const importedMeta = {
      id: importedId,
      noteId,
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      trigger: 'manual',
      title: 'Imported',
      summary: 'From backup',
      locked: false,
    };
    fs.writeFileSync(
      path.join(importRoot, 'index.json'),
      JSON.stringify({ version: 1, noteId, revisions: [importedMeta] }),
    );
    fs.writeFileSync(
      path.join(importRoot, `${importedId}.json`),
      JSON.stringify({ ...importedMeta, body: 'imported-body' }),
    );

    const merged = importNoteHistoryFromDir(userId, path.join(tmpRoot, 'import-src', userId));
    expect(merged.ok).toBe(true);
    const list = listNoteRevisions(userId, noteId);
    expect(list.revisions.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects oversized revision payloads', () => {
    const hugeBody = 'x'.repeat(3 * 1024 * 1024);
    const append = appendNoteRevision(userId, {
      noteId,
      trigger: 'manual',
      title: 'Huge',
      summary: 'Too big',
      locked: false,
      body: hugeBody,
    });
    expect(append.ok).toBe(false);
  });

  it('collects attachment ids from locked revision metadata', () => {
    appendNoteRevision(userId, {
      noteId,
      trigger: 'lock',
      title: 'Locked image',
      summary: 'Locked',
      locked: true,
      cipher: { ivB64: 'iv', cipherB64: 'cipher' },
      bodyFormat: 'prosemirror',
      attachmentIds: ['note-doc1-abc123456789'],
    });
    const ids = collectReferencedAttachmentIdsFromNoteHistory(userId);
    expect(ids.has('note-doc1-abc123456789')).toBe(true);
  });

  it('collects attachment ids referenced in note history bodies', () => {
    appendNoteRevision(userId, {
      noteId,
      trigger: 'autosave',
      title: 'With image',
      summary: 'Image added',
      locked: false,
      body: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              attachmentId: 'note-doc1-abc123456789',
              src: 'cadence-attachment://note-doc1-abc123456789',
            },
          },
        ],
      }),
      bodyFormat: 'prosemirror',
    });
    const ids = collectReferencedAttachmentIdsFromNoteHistory(userId);
    expect(ids.has('note-doc1-abc123456789')).toBe(true);
  });
});
