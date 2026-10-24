import { describe, expect, it } from 'vitest';
import { AI_ACTIONS, aiIntentFromSearch, availableAiActions } from './entryPoints';

describe('availableAiActions', () => {
  it('is empty when AI is not enabled, whatever the surface', () => {
    for (const surface of ['slash', 'bubble', 'palette', 'taskRow'] as const) {
      expect(availableAiActions(surface, { aiEnabled: false })).toEqual([]);
    }
  });

  it('filters by surface', () => {
    const ids = (s: Parameters<typeof availableAiActions>[0]) => availableAiActions(s, { aiEnabled: true }).map((a) => a.id);
    expect(ids('slash')).toEqual(['extract-tasks']);
    expect(ids('bubble')).toEqual(['extract-tasks']);
    expect(ids('palette')).toEqual(['extract-tasks']);
    expect(ids('taskRow')).toEqual(['ask-ai']);
  });

  it('every action names its task and carries search keywords', () => {
    for (const a of AI_ACTIONS) {
      expect(a.taskId).toMatch(/^ai\./);
      expect(a.keywords).toMatch(/ai/);
      expect(a.surfaces.length).toBeGreaterThan(0);
    }
  });
});

describe('aiIntentFromSearch', () => {
  it.each([
    ['?ai=extract', 'extract'],
    ['ai=extract', 'extract'],
    ['?focus=abc&ai=extract', 'extract'],
    ['?ai=other', null],
    ['?ai=', null],
    ['', null],
    ['?focus=abc', null],
  ])('%s -> %s', (search, expected) => {
    expect(aiIntentFromSearch(search)).toBe(expected);
  });
});
