import { parseRichDoc } from '../richText';
import type { NoteRevisionSnapshot } from './types';

function countImagesInBody(body: string, bodyFormat?: 'markdown' | 'prosemirror'): number {
  if (bodyFormat !== 'prosemirror' || !body.trim()) return 0;
  try {
    const doc = parseRichDoc(body);
    let count = 0;
    const walk = (node: { type?: string; content?: unknown[] }) => {
      if (node.type === 'image') count += 1;
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          if (child && typeof child === 'object') walk(child as { type?: string; content?: unknown[] });
        }
      }
    };
    if (doc?.content) {
      for (const node of doc.content) walk(node as { type?: string; content?: unknown[] });
    }
    return count;
  } catch {
    return 0;
  }
}

function plainLength(note: NoteRevisionSnapshot): number {
  return (note.bodyPlainText ?? note.body ?? '').trim().length;
}

/** Human-readable one-liner for the version timeline. */
export function buildNoteRevisionSummary(
  prev: NoteRevisionSnapshot | null,
  next: NoteRevisionSnapshot,
): string {
  const parts: string[] = [];

  if (prev && prev.title.trim() !== next.title.trim()) {
    parts.push('Title updated');
  }

  if (prev) {
    const delta = plainLength(next) - plainLength(prev);
    if (delta > 0) parts.push(`+${delta} characters`);
    else if (delta < 0) parts.push(`${delta} characters`);

    const prevImages = countImagesInBody(prev.body, prev.bodyFormat);
    const nextImages = countImagesInBody(next.body, next.bodyFormat);
    if (nextImages > prevImages) {
      const added = nextImages - prevImages;
      parts.push(added === 1 ? 'Image added' : `${added} images added`);
    }
  } else {
    parts.push('Snapshot saved');
  }

  if (next.locked && (!prev || !prev.locked)) {
    parts.push('Locked');
  }

  return parts.length ? parts.join(' · ') : 'Content updated';
}
