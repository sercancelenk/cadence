import { describe, expect, it, beforeEach } from 'vitest';
import {
  NOTE_REVISION_AUTOSAVE_MIN_MS,
  noteRevisionContentChanged,
  resetNoteRevisionPolicyForTests,
  shouldAppendNoteRevision,
  shouldFlushSessionRevision,
  markNoteRevisionAppended,
} from './noteRevisionPolicy';
import type { NoteRevisionSnapshot } from './types';

describe('noteRevisionPolicy', () => {
  beforeEach(() => {
    resetNoteRevisionPolicyForTests();
  });

  const note: NoteRevisionSnapshot = {
    id: 'note-1',
    title: 'A',
    body: '{"type":"doc","content":[]}',
    bodyFormat: 'prosemirror',
    locked: false,
  };

  it('skips when content is unchanged', () => {
    expect(noteRevisionContentChanged(note, { ...note })).toBe(false);
    expect(shouldAppendNoteRevision('note-1', note, { ...note }, 'autosave')).toBe(false);
  });

  it('allows manual and pre-restore immediately', () => {
    const next = { ...note, title: 'B' };
    expect(shouldAppendNoteRevision('note-1', note, next, 'manual')).toBe(true);
    expect(shouldAppendNoteRevision('note-1', note, next, 'pre-restore')).toBe(true);
  });

  it('dedupes locked revisions by plaintext signature not cipher', () => {
    const lockedA: NoteRevisionSnapshot = {
      id: 'note-1',
      title: 'Secret',
      body: '',
      locked: true,
      cipher: { ivB64: 'iv1', cipherB64: 'cipher-a' },
      lockedBodySignature: 'same-plaintext',
    };
    const lockedB: NoteRevisionSnapshot = {
      ...lockedA,
      cipher: { ivB64: 'iv2', cipherB64: 'cipher-b' },
    };
    expect(noteRevisionContentChanged(lockedA, lockedB)).toBe(false);
    expect(shouldAppendNoteRevision('note-1', lockedA, lockedB, 'autosave')).toBe(false);
  });

  it('throttles autosave within the window', () => {
    const next = { ...note, title: 'B' };
    expect(shouldAppendNoteRevision('note-1', note, next, 'autosave')).toBe(true);
    markNoteRevisionAppended('note-1', next);
    const next2 = { ...note, title: 'C' };
    expect(shouldAppendNoteRevision('note-1', next, next2, 'autosave')).toBe(false);
    expect(shouldFlushSessionRevision('note-1')).toBe(true);
  });

  it('exposes autosave throttle constant', () => {
    expect(NOTE_REVISION_AUTOSAVE_MIN_MS).toBeGreaterThan(60_000);
  });
});
