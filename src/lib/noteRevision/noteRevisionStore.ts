import type { Note } from '../../model';
import {
  markNoteRevisionAppended,
  shouldAppendNoteRevision,
  shouldFlushSessionRevision,
  clearNoteRevisionTrack,
} from './noteRevisionPolicy';
import { buildNoteRevisionSummary } from './noteRevisionSummary';
import { prepareStoredRichBodyForRevision } from '../richTextBody';
import type {
  NoteRevisionPayload,
  NoteRevisionSnapshot,
  NoteRevisionTrigger,
  NoteRevisionWriteInput,
} from './types';

export function noteRevisionAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.cadence?.noteHistoryAppend;
}

export function noteSnapshotFromNote(note: Note): NoteRevisionSnapshot {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    bodyFormat: note.bodyFormat,
    bodyPlainText: note.bodyPlainText,
    locked: note.locked,
    cipher: note.cipher,
    attachmentRefs: note.attachmentRefs,
    lockedBodySignature: note.lockedBodySignature,
  };
}

function writeInputFromSnapshot(
  snapshot: NoteRevisionSnapshot,
  trigger: NoteRevisionTrigger,
  summary: string,
  label?: string,
): NoteRevisionWriteInput {
  const base = {
    noteId: snapshot.id,
    trigger,
    title: snapshot.title,
    summary,
    locked: snapshot.locked,
    label,
  };
  if (snapshot.locked) {
    if (!snapshot.cipher) {
      throw new Error('Locked note revision requires cipher.');
    }
    return {
      ...base,
      cipher: snapshot.cipher,
      bodyFormat: snapshot.bodyFormat,
      ...(snapshot.attachmentRefs?.length ? { attachmentIds: snapshot.attachmentRefs } : {}),
      ...(snapshot.lockedBodySignature ? { plainContentSignature: snapshot.lockedBodySignature } : {}),
    };
  }
  return {
    ...base,
    body: prepareStoredRichBodyForRevision(snapshot.body, snapshot.bodyFormat),
    bodyFormat: snapshot.bodyFormat,
    bodyPlainText: snapshot.bodyPlainText,
  };
}

async function appendRevision(input: NoteRevisionWriteInput): Promise<boolean> {
  if (!noteRevisionAvailable()) return false;
  try {
    const result = await window.cadence!.noteHistoryAppend!(input);
    return !!result?.ok;
  } catch (err) {
    console.warn('[cadence] note revision append failed', err);
    return false;
  }
}

/**
 * Best-effort revision write — never throws for normal triggers.
 * Returns whether the revision was persisted (false when skipped or failed).
 */
export async function tryAppendNoteRevision(
  prev: NoteRevisionSnapshot | null,
  next: NoteRevisionSnapshot,
  trigger: NoteRevisionTrigger,
  options?: { force?: boolean; label?: string },
): Promise<boolean> {
  if (!noteRevisionAvailable()) return false;
  if (!shouldAppendNoteRevision(next.id, prev, next, trigger, options)) return false;

  const summary = buildNoteRevisionSummary(prev, next);
  try {
    const ok = await appendRevision(writeInputFromSnapshot(next, trigger, summary, options?.label));
    if (ok) markNoteRevisionAppended(next.id, next);
    return ok;
  } catch (err) {
    console.warn('[cadence] note revision skipped', err);
    return false;
  }
}

export async function flushNoteRevisionSession(
  prev: NoteRevisionSnapshot | null,
  next: NoteRevisionSnapshot,
): Promise<void> {
  if (!shouldFlushSessionRevision(next.id)) return;
  await tryAppendNoteRevision(prev, next, 'session-end', { force: true });
}

export async function listNoteRevisions(noteId: string): Promise<NoteRevisionPayload[]> {
  if (!window.cadence?.noteHistoryList) return [];
  const result = await window.cadence.noteHistoryList({ noteId });
  if (!result?.ok || !Array.isArray(result.revisions)) return [];
  return result.revisions as NoteRevisionPayload[];
}

export async function readNoteRevision(
  noteId: string,
  revisionId: string,
): Promise<NoteRevisionPayload | null> {
  if (!window.cadence?.noteHistoryRead) return null;
  const result = await window.cadence.noteHistoryRead({ noteId, revisionId });
  if (!result?.ok || !result.revision) return null;
  return result.revision as NoteRevisionPayload;
}

export async function purgeNoteRevisionHistory(noteId: string): Promise<void> {
  clearNoteRevisionTrack(noteId);
  if (!window.cadence?.noteHistoryPurge) return;
  try {
    await window.cadence.noteHistoryPurge({ noteId });
  } catch (err) {
    console.warn('[cadence] note history purge failed', err);
  }
}

export function revisionToNotePatch(revision: NoteRevisionPayload): Partial<Note> {
  if (revision.locked && revision.cipher) {
    return {
      title: revision.title,
      body: '',
      locked: true,
      cipher: revision.cipher,
      bodyFormat: revision.bodyFormat,
      bodyPlainText: undefined,
      attachmentRefs: revision.attachmentIds,
      lockedBodySignature: revision.plainContentSignature,
    };
  }
  return {
    title: revision.title,
    body: revision.body ?? '',
    locked: false,
    cipher: undefined,
    bodyFormat: revision.bodyFormat,
    bodyPlainText: revision.bodyPlainText,
    attachmentRefs: undefined,
    lockedBodySignature: undefined,
  };
}
