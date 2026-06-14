import { afterEach, describe, expect, it, vi } from 'vitest';
import * as richText from '../richText';
import { buildNoteRevisionSummary } from './noteRevisionSummary';
import type { NoteRevisionSnapshot } from './types';

describe('buildNoteRevisionSummary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('reports multiple images and locked state', () => {
    const withTwoImages = {
      ...base,
      body: JSON.stringify({
        type: 'doc',
        content: [
          { type: 'image', attrs: { src: 'cadence-attachment://note-a-123456789012' } },
          { type: 'image', attrs: { src: 'cadence-attachment://note-b-123456789012' } },
        ],
      }),
    };
    expect(buildNoteRevisionSummary(base, withTwoImages)).toContain('2 images added');
    expect(buildNoteRevisionSummary(base, { ...base, locked: true })).toContain('Locked');
  });

  it('tolerates invalid prosemirror bodies when diffing images', () => {
    vi.spyOn(richText, 'parseRichDoc').mockImplementation(() => {
      throw new Error('parse failed');
    });
    const prev = { ...base, body: '{"type":"doc","content":[]}', bodyFormat: 'prosemirror' as const };
    const next = { ...prev, title: 'Changed' };
    expect(buildNoteRevisionSummary(prev, next)).toContain('Title updated');
  });

  it('falls back when there are no specific diff parts', () => {
    expect(buildNoteRevisionSummary(base, { ...base })).toBe('Content updated');
  });

  it('returns snapshot label for first revision', () => {
    expect(buildNoteRevisionSummary(null, base)).toBe('Snapshot saved');
  });
});
