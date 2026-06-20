import type { Note } from '../../model';
import { notePlainText, type DecryptedNoteBody } from './notePlainText';
import { displayNoteTitle, PLACEHOLDER_TITLE } from './notePreferences';

/** Split plain note text into macOS-Notes-style title (first line) + remainder. */
export function splitNotePlainText(plainText: string): { titleLine: string; bodyText: string } {
  const normalized = plainText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return { titleLine: '', bodyText: '' };
  const breakAt = normalized.indexOf('\n');
  if (breakAt === -1) {
    return { titleLine: normalized.trim(), bodyText: '' };
  }
  return {
    titleLine: normalized.slice(0, breakAt).trim(),
    bodyText: normalized.slice(breakAt + 1).trim(),
  };
}

/** Title shown in the sidebar and chrome — first body line, else legacy stored title. */
export function noteDisplayTitle(
  note: Note,
  decryptedBody?: DecryptedNoteBody | null,
): string {
  const plain = notePlainText(note, decryptedBody);
  if (plain.trim()) {
    const { titleLine } = splitNotePlainText(plain);
    if (titleLine) return titleLine;
  }
  return displayNoteTitle(note.title);
}

/** Subtitle under the title in the sidebar — body after the first line. */
export function noteSidebarPreview(
  note: Note,
  decryptedBody?: DecryptedNoteBody | null,
): string {
  if (note.locked && decryptedBody?.noteId !== note.id) {
    return 'Locked note';
  }
  const plain = notePlainText(note, decryptedBody);
  if (plain.trim()) {
    const { bodyText } = splitNotePlainText(plain);
    return bodyText.replace(/\s+/g, ' ').trim();
  }
  return '';
}

/** Persisted `note.title` derived from editor plain text (first line only). */
export function deriveStoredTitleFromPlainText(plainText: string): string {
  const { titleLine } = splitNotePlainText(plainText.trim());
  return titleLine;
}

export function isPlaceholderNoteTitle(title: string): boolean {
  return !title.trim() || title.trim() === PLACEHOLDER_TITLE;
}
