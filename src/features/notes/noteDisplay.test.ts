import { describe, expect, it } from 'vitest';
import type { Note } from '../../model';
import {
  deriveStoredTitleFromPlainText,
  noteDisplayTitle,
  noteSidebarPreview,
  splitNotePlainText,
} from './noteDisplay';
import { PLACEHOLDER_TITLE } from './notePreferences';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: '',
    body: '',
    locked: false,
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('splitNotePlainText', () => {
  it('uses the first line as title and the rest as body', () => {
    expect(splitNotePlainText('Meeting notes\nDiscuss roadmap\nAction items')).toEqual({
      titleLine: 'Meeting notes',
      bodyText: 'Discuss roadmap\nAction items',
    });
  });

  it('handles single-line notes', () => {
    expect(splitNotePlainText('Only title')).toEqual({
      titleLine: 'Only title',
      bodyText: '',
    });
  });
});

describe('noteDisplayTitle', () => {
  it('prefers the first body line over stored title', () => {
    const n = note({
      title: 'Old title',
      body: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'From body' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'More' }],
          },
        ],
      }),
      bodyFormat: 'prosemirror',
      bodyPlainText: 'From body\nMore',
    });
    expect(noteDisplayTitle(n)).toBe('From body');
  });

  it('falls back to stored title for legacy title-only notes', () => {
    expect(noteDisplayTitle(note({ title: 'Legacy title' }))).toBe('Legacy title');
  });

  it('uses placeholder when note is empty', () => {
    expect(noteDisplayTitle(note())).toBe(PLACEHOLDER_TITLE);
  });
});

describe('noteSidebarPreview', () => {
  it('shows lines after the first as preview', () => {
    const n = note({
      bodyPlainText: 'Title line\nSecond line here',
      body: 'Title line\nSecond line here',
    });
    expect(noteSidebarPreview(n)).toBe('Second line here');
  });
});

describe('deriveStoredTitleFromPlainText', () => {
  it('returns first line without trailing body', () => {
    expect(deriveStoredTitleFromPlainText('My note\nBody')).toBe('My note');
  });
});
