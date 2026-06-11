import { describe, expect, it } from 'vitest';
import { buildNoteRevisionSummary } from './noteRevisionSummary';
import type { NoteRevisionSnapshot } from './types';

describe('buildNoteRevisionSummary', () => {
  const base: NoteRevisionSnapshot = {
    id: 'n1',
    title: 'Hello',
    body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hi"}]}]}',
    bodyFormat: 'prosemirror',
    bodyPlainText: 'Hi',
    locked: false,
  };

  it('detects title changes', () => {
    const next = { ...base, title: 'Hello world' };
    expect(buildNoteRevisionSummary(base, next)).toContain('Title updated');
  });

  it('reports character delta', () => {
    const next = {
      ...base,
      bodyPlainText: 'Hi there',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hi there"}]}]}',
    };
    expect(buildNoteRevisionSummary(base, next)).toContain('+');
  });

  it('detects image additions', () => {
    const next = {
      ...base,
      body: JSON.stringify({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] },
          { type: 'image', attrs: { src: 'cadence-attachment://note-x-123456789012' } },
        ],
      }),
    };
    expect(buildNoteRevisionSummary(base, next)).toContain('Image added');
  });

  it('returns snapshot label for first revision', () => {
    expect(buildNoteRevisionSummary(null, base)).toBe('Snapshot saved');
  });
});
