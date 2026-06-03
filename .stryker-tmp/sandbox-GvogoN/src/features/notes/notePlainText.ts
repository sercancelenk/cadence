// @ts-nocheck
import { plainTextFromBodyFields, type RichTextBodyFields } from '../../lib/richTextBody';
import type { Note } from '../../model';

export type DecryptedNoteBody = { noteId: string } & RichTextBodyFields;

export function notePlainText(n: Note, decryptedBody?: DecryptedNoteBody | null): string {
  if (n.locked) {
    if (decryptedBody?.noteId === n.id) {
      return plainTextFromBodyFields(decryptedBody);
    }
    return '';
  }
  return plainTextFromBodyFields(n);
}
