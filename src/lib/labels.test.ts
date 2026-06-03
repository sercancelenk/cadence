import { describe, expect, it } from 'vitest';
import type { ItemKind } from '../model';
import { kindLabel } from './labels';

const KINDS: ItemKind[] = ['task', 'note', 'goal', 'document', 'feedback'];

describe('kindLabel', () => {
  it('returns a label for each item kind', () => {
    expect(kindLabel('task')).toBe('Task');
    expect(kindLabel('note')).toBe('Note');
    expect(kindLabel('goal')).toBe('Goal');
    expect(kindLabel('document')).toBe('Document');
    expect(kindLabel('feedback')).toBe('Feedback');
  });

  it('covers all known kinds', () => {
    for (const k of KINDS) {
      expect(kindLabel(k)).toBeTruthy();
    }
  });

  it('returns the raw kind string for unknown values', () => {
    expect(kindLabel('custom-kind' as ItemKind)).toBe('custom-kind');
  });
});
