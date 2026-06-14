import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Note } from '../../model';
import {
  flushNoteRevisionSession,
  listNoteRevisions,
  noteRevisionAvailable,
  noteSnapshotFromNote,
  purgeNoteRevisionHistory,
  readNoteRevision,
  revisionToNotePatch,
  tryAppendNoteRevision,
} from './noteRevisionStore';
import { resetNoteRevisionPolicyForTests } from './noteRevisionPolicy';

describe('noteRevisionStore', () => {
  afterEach(() => {
    resetNoteRevisionPolicyForTests();
    delete (window as { cadence?: unknown }).cadence;
  });

  const note: Note = {
    id: 'note-abc123456789',
    title: 'Title',
    body: '{"type":"doc","content":[]}',
    bodyFormat: 'prosemirror',
    locked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('detects desktop availability from cadence bridge', () => {
    expect(noteRevisionAvailable()).toBe(false);
    (window as { cadence?: { noteHistoryAppend?: ReturnType<typeof vi.fn> } }).cadence = {
      noteHistoryAppend: vi.fn(),
    };
    expect(noteRevisionAvailable()).toBe(true);
  });

  it('never throws when append IPC fails', async () => {
    (window as { cadence?: { noteHistoryAppend?: ReturnType<typeof vi.fn> } }).cadence = {
      noteHistoryAppend: vi.fn().mockRejectedValue(new Error('disk full')),
    };
    await expect(
      tryAppendNoteRevision(noteSnapshotFromNote(note), noteSnapshotFromNote(note), 'manual', {
        force: true,
      }),
    ).resolves.toBe(false);
  });

  it('returns true when append succeeds', async () => {
    (window as { cadence?: { noteHistoryAppend?: ReturnType<typeof vi.fn> } }).cadence = {
      noteHistoryAppend: vi.fn().mockResolvedValue({ ok: true }),
    };
    await expect(
      tryAppendNoteRevision(noteSnapshotFromNote(note), noteSnapshotFromNote(note), 'manual', {
        force: true,
      }),
    ).resolves.toBe(true);
  });

  it('lists and reads revisions via IPC', async () => {
    const revision = {
      id: 'rev-1',
      noteId: note.id,
      createdAt: note.createdAt,
      trigger: 'manual' as const,
      title: note.title,
      summary: 'Snapshot',
      locked: false,
      body: note.body,
    };
    (window as { cadence?: Record<string, ReturnType<typeof vi.fn>> }).cadence = {
      noteHistoryList: vi.fn().mockResolvedValue({ ok: true, revisions: [revision] }),
      noteHistoryRead: vi.fn().mockResolvedValue({ ok: true, revision }),
    };
    await expect(listNoteRevisions(note.id)).resolves.toEqual([revision]);
    await expect(readNoteRevision(note.id, 'rev-1')).resolves.toEqual(revision);
  });

  it('purges note history best-effort', async () => {
    (window as { cadence?: { noteHistoryPurge?: ReturnType<typeof vi.fn> } }).cadence = {
      noteHistoryPurge: vi.fn().mockResolvedValue({ ok: true }),
    };
    await expect(purgeNoteRevisionHistory(note.id)).resolves.toBeUndefined();
  });

  it('flushes a throttled session revision', async () => {
    const append = vi.fn().mockResolvedValue({ ok: true });
    (window as { cadence?: { noteHistoryAppend?: typeof append } }).cadence = {
      noteHistoryAppend: append,
    };
    const prev = noteSnapshotFromNote(note);
    const next = { ...prev, title: 'Changed once' };
    await tryAppendNoteRevision(prev, next, 'autosave');
    expect(append).toHaveBeenCalledTimes(1);
    const next2 = { ...next, title: 'Changed twice' };
    await tryAppendNoteRevision(next, next2, 'autosave');
    expect(append).toHaveBeenCalledTimes(1);
    await flushNoteRevisionSession(prev, next2);
    expect(append).toHaveBeenCalledTimes(2);
  });

  it('maps unlocked revisions to note patches', () => {
    const patch = revisionToNotePatch({
      id: 'r1',
      noteId: note.id,
      createdAt: note.createdAt,
      trigger: 'manual',
      title: 'Old title',
      summary: 'Title updated',
      locked: false,
      body: 'hello',
      bodyFormat: 'markdown',
      bodyPlainText: 'hello',
    });
    expect(patch).toEqual({
      title: 'Old title',
      body: 'hello',
      locked: false,
      cipher: undefined,
      bodyFormat: 'markdown',
      bodyPlainText: 'hello',
      attachmentRefs: undefined,
      lockedBodySignature: undefined,
    });
  });

  it('returns false when a forced locked snapshot lacks cipher material', async () => {
    (window as { cadence?: { noteHistoryAppend?: ReturnType<typeof vi.fn> } }).cadence = {
      noteHistoryAppend: vi.fn().mockResolvedValue({ ok: true }),
    };
    const locked = { ...noteSnapshotFromNote(note), locked: true, cipher: undefined };
    await expect(
      tryAppendNoteRevision(null, locked, 'manual', { force: true }),
    ).resolves.toBe(false);
  });

  it('returns empty lists when IPC reports failure', async () => {
    (window as { cadence?: { noteHistoryList?: ReturnType<typeof vi.fn> } }).cadence = {
      noteHistoryList: vi.fn().mockResolvedValue({ ok: false }),
    };
    await expect(listNoteRevisions(note.id)).resolves.toEqual([]);
  });

  it('returns null when read IPC reports failure', async () => {
    (window as { cadence?: { noteHistoryRead?: ReturnType<typeof vi.fn> } }).cadence = {
      noteHistoryRead: vi.fn().mockResolvedValue({ ok: false }),
    };
    await expect(readNoteRevision(note.id, 'rev-1')).resolves.toBeNull();
  });

  it('swallows purge IPC failures', async () => {
    (window as { cadence?: { noteHistoryPurge?: ReturnType<typeof vi.fn> } }).cadence = {
      noteHistoryPurge: vi.fn().mockRejectedValue(new Error('ipc down')),
    };
    await expect(purgeNoteRevisionHistory(note.id)).resolves.toBeUndefined();
  });

  it('appends locked revisions with cipher metadata', async () => {
    const append = vi.fn().mockResolvedValue({ ok: true });
    (window as { cadence?: { noteHistoryAppend?: typeof append } }).cadence = {
      noteHistoryAppend: append,
    };
    const locked = {
      ...noteSnapshotFromNote(note),
      locked: true,
      cipher: { ivB64: 'iv', cipherB64: 'cipher' },
      attachmentRefs: ['att-1'],
      lockedBodySignature: 'sig',
    };
    await tryAppendNoteRevision(null, locked, 'lock', { force: true });
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentIds: ['att-1'],
        plainContentSignature: 'sig',
        cipher: locked.cipher,
      }),
    );
  });

  it('maps locked revisions to cipher patches', () => {
    const patch = revisionToNotePatch({
      id: 'r2',
      noteId: note.id,
      createdAt: note.createdAt,
      trigger: 'lock',
      title: 'Secret',
      summary: 'Locked',
      locked: true,
      cipher: { ivB64: 'iv', cipherB64: 'cipher' },
      bodyFormat: 'prosemirror',
    });
    expect(patch.locked).toBe(true);
    expect(patch.body).toBe('');
    expect(patch.cipher?.cipherB64).toBe('cipher');
  });
});
