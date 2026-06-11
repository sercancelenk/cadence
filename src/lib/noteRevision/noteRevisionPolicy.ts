import { canonicalDocSignature } from '../richTextBody';
import type { NoteRevisionSnapshot, NoteRevisionTrigger } from './types';

export const NOTE_REVISION_AUTOSAVE_MIN_MS = 3 * 60 * 1000;

type NoteRevisionTrack = {
  lastAutosaveAt: number;
  lastSignature: string;
  dirtySinceLastRevision: boolean;
};

const tracks = new Map<string, NoteRevisionTrack>();

export function resetNoteRevisionPolicyForTests(): void {
  tracks.clear();
}

function contentSignature(note: NoteRevisionSnapshot): string {
  const bodyKey = note.locked
    ? note.lockedBodySignature ??
      `locked:${note.cipher?.cipherB64 ?? ''}:${note.bodyFormat ?? ''}`
    : canonicalDocSignature(note.body, note.bodyFormat);
  return `${note.title.trim()}\n${bodyKey}`;
}

export function noteRevisionContentChanged(
  prev: NoteRevisionSnapshot | null,
  next: NoteRevisionSnapshot,
): boolean {
  if (!prev) return true;
  return contentSignature(prev) !== contentSignature(next);
}

export function shouldAppendNoteRevision(
  noteId: string,
  prev: NoteRevisionSnapshot | null,
  next: NoteRevisionSnapshot,
  trigger: NoteRevisionTrigger,
  options?: { force?: boolean },
): boolean {
  if (options?.force && (trigger === 'manual' || trigger === 'pre-restore')) return true;
  if (options?.force) return noteRevisionContentChanged(prev, next);

  if (!noteRevisionContentChanged(prev, next)) return false;

  if (trigger === 'manual' || trigger === 'pre-restore' || trigger === 'lock' || trigger === 'session-end') {
    return true;
  }

  const now = Date.now();
  const track = tracks.get(noteId) ?? {
    lastAutosaveAt: 0,
    lastSignature: '',
    dirtySinceLastRevision: false,
  };

  if (contentSignature(next) === track.lastSignature) return false;

  if (track.lastAutosaveAt > 0 && now - track.lastAutosaveAt < NOTE_REVISION_AUTOSAVE_MIN_MS) {
    track.dirtySinceLastRevision = true;
    tracks.set(noteId, track);
    return false;
  }

  return true;
}

export function markNoteRevisionAppended(noteId: string, note: NoteRevisionSnapshot): void {
  tracks.set(noteId, {
    lastAutosaveAt: Date.now(),
    lastSignature: contentSignature(note),
    dirtySinceLastRevision: false,
  });
}

/** Flush a pending edit session when leaving a note or closing history. */
export function shouldFlushSessionRevision(noteId: string): boolean {
  return tracks.get(noteId)?.dirtySinceLastRevision === true;
}

export function clearNoteRevisionTrack(noteId: string): void {
  tracks.delete(noteId);
}
