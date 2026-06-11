import type { Note } from '../../model';

export type NoteRevisionTrigger =
  | 'autosave'
  | 'manual'
  | 'pre-restore'
  | 'lock'
  | 'session-end';

export type NoteRevisionMeta = {
  id: string;
  noteId: string;
  createdAt: string;
  trigger: NoteRevisionTrigger;
  title: string;
  summary: string;
  locked: boolean;
  label?: string;
};

export type NoteRevisionPayload = NoteRevisionMeta & {
  body?: string;
  bodyFormat?: 'markdown' | 'prosemirror';
  bodyPlainText?: string;
  cipher?: { ivB64: string; cipherB64: string };
  attachmentIds?: string[];
  plainContentSignature?: string;
};

export type NoteRevisionWriteInput = {
  noteId: string;
  trigger: NoteRevisionTrigger;
  title: string;
  summary: string;
  locked: boolean;
  label?: string;
  body?: string;
  bodyFormat?: 'markdown' | 'prosemirror';
  bodyPlainText?: string;
  cipher?: { ivB64: string; cipherB64: string };
  attachmentIds?: string[];
  plainContentSignature?: string;
};

/** Fields needed to compare and persist a note revision. */
export type NoteRevisionSnapshot = Pick<
  Note,
  'id' | 'title' | 'body' | 'bodyFormat' | 'bodyPlainText' | 'locked' | 'cipher' | 'attachmentRefs' | 'lockedBodySignature'
>;
