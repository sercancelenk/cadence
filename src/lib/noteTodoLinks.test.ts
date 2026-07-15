import { describe, expect, it } from 'vitest';
import type { NoteTodoLink } from '../core/model';
import {
  linksForNote,
  linksForTodo,
  noteIdsLinkedToTodo,
  noteTodoLinksOf,
  todoIdsLinkedToNote,
  truncateEntityLinkLabel,
} from './noteTodoLinks';

const links: NoteTodoLink[] = [
  { id: 'l1', noteId: 'n1', todoId: 't1', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'l2', noteId: 'n1', todoId: 't2', createdAt: '2026-01-02T00:00:00.000Z' },
  { id: 'l3', noteId: 'n2', todoId: 't1', createdAt: '2026-01-03T00:00:00.000Z' },
];

describe('noteTodoLinks helpers', () => {
  it('noteTodoLinksOf defaults undefined to an empty array', () => {
    expect(noteTodoLinksOf(undefined)).toEqual([]);
    expect(noteTodoLinksOf(links)).toBe(links);
  });

  it('filters links by note or todo id', () => {
    expect(linksForNote(links, 'n1').map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(linksForNote(undefined, 'n1')).toEqual([]);
    expect(linksForTodo(links, 't1').map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(linksForTodo(undefined, 't1')).toEqual([]);
  });

  it('maps linked ids for note / todo pills', () => {
    expect(todoIdsLinkedToNote(links, 'n1')).toEqual(['t1', 't2']);
    expect(todoIdsLinkedToNote(undefined, 'n1')).toEqual([]);
    expect(noteIdsLinkedToTodo(links, 't1')).toEqual(['n1', 'n2']);
    expect(noteIdsLinkedToTodo(undefined, 't9')).toEqual([]);
  });

  it('truncateEntityLinkLabel trims, defaults, and ellipsizes', () => {
    expect(truncateEntityLinkLabel('Short')).toBe('Short');
    expect(truncateEntityLinkLabel('   ')).toBe('Untitled');
    expect(truncateEntityLinkLabel('')).toBe('Untitled');
    expect(truncateEntityLinkLabel('abcdefghijklmnopqrstuvwxyz0123456789', 10)).toBe(
      'abcdefghi…',
    );
    expect(truncateEntityLinkLabel('exactly-twenty-eight-chars!!', 28)).toBe(
      'exactly-twenty-eight-chars!!',
    );
  });
});
