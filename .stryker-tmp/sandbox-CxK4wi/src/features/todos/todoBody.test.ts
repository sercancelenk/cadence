// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  emptyInlineAddDraft,
  itemToBodyFields,
  legacyBodyPlainText,
  schedulePatchToTodoPatch,
  todoBodyPatchFromFields,
  todoHasBody,
} from './todoBody';
import type { TodoItem } from '../../model';

function todo(
  overrides: Partial<Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText' | 'title'>> = {},
): Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'> {
  return { body: '', bodyFormat: undefined, bodyPlainText: undefined, ...overrides };
}

describe('schedulePatchToTodoPatch', () => {
  it('omits untouched tri-state fields', () => {
    expect(schedulePatchToTodoPatch({})).toEqual({});
  });

  it.each([
    { field: 'dueAt' as const, patch: { dueAt: '2026-06-01T10:00:00.000Z' }, expected: { dueAt: '2026-06-01T10:00:00.000Z' } },
    { field: 'remindAt' as const, patch: { remindAt: '2026-06-01T11:00:00.000Z' }, expected: { remindAt: '2026-06-01T11:00:00.000Z' } },
    { field: 'remindRepeat' as const, patch: { remindRepeat: 'daily' as const }, expected: { remindRepeat: 'daily' } },
  ])('includes only $field when set', ({ patch, expected }) => {
    expect(schedulePatchToTodoPatch(patch)).toEqual(expected);
  });

  it('maps null to undefined (clear)', () => {
    expect(
      schedulePatchToTodoPatch({
        dueAt: null,
        remindAt: null,
        remindRepeat: null,
      }),
    ).toEqual({
      dueAt: undefined,
      remindAt: undefined,
      remindRepeat: undefined,
    });
  });

  it('passes string values through', () => {
    expect(
      schedulePatchToTodoPatch({
        dueAt: '2026-06-01T10:00:00.000Z',
        remindAt: '2026-06-01T11:00:00.000Z',
        remindRepeat: 'daily',
      }),
    ).toEqual({
      dueAt: '2026-06-01T10:00:00.000Z',
      remindAt: '2026-06-01T11:00:00.000Z',
      remindRepeat: 'daily',
    });
  });
});

describe('legacyBodyPlainText', () => {
  it('uses bodyPlainText when set', () => {
    expect(legacyBodyPlainText(todo({ bodyPlainText: '  Hello  ' }))).toBe('Hello');
  });

  it('falls back to trimmed body for markdown', () => {
    expect(legacyBodyPlainText(todo({ body: '  Raw  ', bodyFormat: 'markdown' }))).toBe('Raw');
  });

  it('strips trailing markdown separators for legacy bodies', () => {
    const item = todo({
      body: 'Line one\n\n---',
      bodyFormat: 'markdown',
    });
    expect(legacyBodyPlainText(item)).toBe('Line one');
  });

  it('strips trailing whitespace after separator removal', () => {
    expect(
      legacyBodyPlainText(
        todo({
          body: 'Keep\n\n----   ',
          bodyFormat: 'markdown',
        }),
      ),
    ).toBe('Keep');
  });

  it('does not strip separators for prosemirror format', () => {
    const item = todo({
      body: '{"type":"doc","content":[]}',
      bodyFormat: 'prosemirror',
      bodyPlainText: 'Keep --- as-is',
    });
    expect(legacyBodyPlainText(item)).toBe('Keep --- as-is');
  });
});

describe('todoHasBody', () => {
  it('is false for empty bodies', () => {
    expect(todoHasBody(todo())).toBe(false);
    expect(todoHasBody(todo({ bodyPlainText: '   ' }))).toBe(false);
    expect(todoHasBody(todo({ body: '   ' }))).toBe(false);
  });

  it('is true when plain text is present', () => {
    expect(todoHasBody(todo({ bodyPlainText: 'notes' }))).toBe(true);
    expect(todoHasBody(todo({ body: '# Title', bodyFormat: 'markdown' }))).toBe(true);
  });
});

describe('itemToBodyFields', () => {
  it('normalizes missing body to empty string', () => {
    expect(itemToBodyFields({} as Pick<TodoItem, 'body' | 'bodyFormat' | 'bodyPlainText'>)).toEqual({
      body: '',
      bodyFormat: undefined,
      bodyPlainText: undefined,
    });
  });

  it('preserves provided fields exactly', () => {
    expect(
      itemToBodyFields({
        body: '{"type":"doc"}',
        bodyFormat: 'prosemirror',
        bodyPlainText: 'Hi',
      }),
    ).toEqual({
      body: '{"type":"doc"}',
      bodyFormat: 'prosemirror',
      bodyPlainText: 'Hi',
    });
  });
});

describe('todoBodyPatchFromFields', () => {
  it('clears to empty body when no plain text', () => {
    expect(todoBodyPatchFromFields({ body: '', bodyFormat: undefined })).toEqual({ body: '' });
    expect(todoBodyPatchFromFields({ body: '   ', bodyFormat: 'markdown', bodyPlainText: '  ' })).toEqual({
      body: '',
    });
  });

  it('persists all fields when content exists', () => {
    const fields = {
      body: '{"type":"doc"}',
      bodyFormat: 'prosemirror' as const,
      bodyPlainText: 'Hello',
    };
    expect(todoBodyPatchFromFields(fields)).toEqual(fields);
  });
});

describe('emptyInlineAddDraft', () => {
  it('returns empty title and body', () => {
    expect(emptyInlineAddDraft()).toEqual({
      title: '',
      body: { body: '', bodyFormat: undefined, bodyPlainText: undefined },
    });
  });
});
