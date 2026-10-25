import { describe, expect, it } from 'vitest';
import { AI_ACTIONS, aiIntentFromSearch, availableAiActions, feedbackAiAvailable, notesAiRequest, peopleAiAvailable } from './entryPoints';

describe('availableAiActions', () => {
  it('is empty when AI is not enabled, whatever the surface', () => {
    for (const surface of ['slash', 'bubble', 'palette', 'taskRow'] as const) {
      expect(availableAiActions(surface, { aiEnabled: false })).toEqual([]);
    }
  });

  it('filters by surface for the notes editor', () => {
    const ids = (s: Parameters<typeof availableAiActions>[0]) => availableAiActions(s, { aiEnabled: true }).map((a) => a.id);
    expect(ids('slash')).toEqual(['extract-tasks', 'visualize', 'challenge-idea']);
    expect(ids('bubble')).toEqual(['extract-tasks', 'visualize', 'challenge-idea']);
    expect(ids('palette')).toEqual(['extract-tasks', 'weekly-digest', 'screenshot-to-diagram', 'ask-workspace', 'draw-from-description']);
    expect(ids('taskRow')).toEqual(['ask-ai', 'break-down']);
  });

  it('the tool pages and the planning hub get their own actions', () => {
    const ids = availableAiActions('tool', { aiEnabled: true }).map((a) => a.id);
    expect(ids).toEqual([
      'classify-eisenhower',
      'structure-document',
      'mock-data',
      'erd-from-text',
      'sketch-to-mermaid',
      'one-on-one-prep',
      'screenshot-to-diagram',
      'draw-from-description',
    ]);
    expect(availableAiActions('tool', { aiEnabled: false })).toEqual([]);
  });

  it('every action has a distinct id and a task id that is registered', async () => {
    const { PROMPTS } = await import('./prompts');
    const seen = new Set<string>();
    for (const a of AI_ACTIONS) {
      expect(seen.has(a.id), a.id).toBe(false);
      seen.add(a.id);
      expect(Object.keys(PROMPTS), a.id).toContain(a.taskId);
    }
  });

  it('the feedback editor gets only the SBI rewrite, in the selection menu', () => {
    const ids = (s: Parameters<typeof availableAiActions>[0]) =>
      availableAiActions(s, { aiEnabled: true, host: 'feedback' }).map((a) => a.id);
    expect(ids('bubble')).toEqual(['feedback-sbi']);
    expect(ids('slash')).toEqual([]);
  });

  it('the notes editor never offers the SBI rewrite, and no host means notes', () => {
    const all = availableAiActions('bubble', { aiEnabled: true, host: 'notes' }).map((a) => a.id);
    expect(all).not.toContain('feedback-sbi');
    expect(availableAiActions('bubble', { aiEnabled: true })).toEqual(availableAiActions('bubble', { aiEnabled: true, host: 'notes' }));
  });

  it('is empty for every host when AI is not enabled', () => {
    for (const host of ['notes', 'feedback'] as const) {
      expect(availableAiActions('bubble', { aiEnabled: false, host })).toEqual([]);
    }
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

describe('notesAiRequest with ids that exist on every object', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('returns null for %s', (id) => {
    expect(notesAiRequest(id, 'text', () => 'whole')).toBeNull();
  });
});

describe('notesAiRequest', () => {
  const whole = () => 'the whole note';

  it('maps each notes action to its dialog and uses the selection when there is one', () => {
    expect(notesAiRequest('extract-tasks', 'picked text', whole)).toEqual({ kind: 'extract', text: 'picked text' });
    expect(notesAiRequest('visualize', 'picked text', whole)).toEqual({ kind: 'visualize', text: 'picked text' });
    expect(notesAiRequest('challenge-idea', 'picked text', whole)).toEqual({ kind: 'challenge', text: 'picked text' });
  });

  it('falls back to the whole note only when the text is blank', () => {
    expect(notesAiRequest('visualize', '   ', whole)).toEqual({ kind: 'visualize', text: 'the whole note' });
    expect(notesAiRequest('visualize', '', whole)?.text).toBe('the whole note');
  });

  it('ignores actions that belong to other places', () => {
    for (const id of ['feedback-sbi', 'break-down', 'ask-ai', 'nonsense']) {
      expect(notesAiRequest(id, 'x', whole)).toBeNull();
    }
  });
});

describe('feedbackAiAvailable', () => {
  const on = { ai: true, aiPeople: true };

  it('is true only for a feedback item with AI allowed, people data allowed and a usable connection', () => {
    expect(feedbackAiAvailable({ itemKind: 'feedback', features: on, hasConnection: true })).toBe(true);
    expect(feedbackAiAvailable({ itemKind: 'feedback', features: { ...on, ai: false }, hasConnection: true })).toBe(false);
    expect(feedbackAiAvailable({ itemKind: 'feedback', features: { ...on, aiPeople: false }, hasConnection: true })).toBe(false);
    expect(feedbackAiAvailable({ itemKind: 'feedback', features: on, hasConnection: false })).toBe(false);
  });

  it('is false for every other kind of person item', () => {
    for (const itemKind of ['goal', 'task', 'note', 'document']) {
      expect(feedbackAiAvailable({ itemKind, features: on, hasConnection: true })).toBe(false);
    }
  });
});

describe('peopleAiAvailable', () => {
  it('needs AI, people data and a usable connection: Ask AI on a person is people data', () => {
    expect(peopleAiAvailable({ features: { ai: true, aiPeople: true }, hasConnection: true })).toBe(true);
    expect(peopleAiAvailable({ features: { ai: true, aiPeople: false }, hasConnection: true })).toBe(false);
    expect(peopleAiAvailable({ features: { ai: false, aiPeople: true }, hasConnection: true })).toBe(false);
    expect(peopleAiAvailable({ features: { ai: true, aiPeople: true }, hasConnection: false })).toBe(false);
  });
});
