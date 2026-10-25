import { describe, expect, it } from 'vitest';
import { emptyData } from '../model';
import type { AppData } from '../model';
import { addDocumentTab, addDocumentTabWithContent, addNoteGroup, addStructuredTab, addStructuredTabWithContent, createNoteWithContent } from './index';

const base = (): AppData => addNoteGroup({ ...emptyData() }, 'Ideas', 'g1');

describe('addDocumentTabWithContent', () => {
  it('adds a new active tab with the content and keeps every existing tab as it was', () => {
    const before = addDocumentTab(emptyData(), 'd1');
    const out = addDocumentTabWithContent(before, 'd2', { title: 'Structured: Plan', body: '{"type":"doc"}', bodyFormat: 'prosemirror', bodyPlainText: 'Plan' });
    expect(out.utilityDocumentTabs).toHaveLength(2);
    expect(out.utilityDocumentTabs?.[0]).toBe(before.utilityDocumentTabs?.[0]);
    expect(out.utilityDocumentTabs?.[1]).toMatchObject({ id: 'd2', title: 'Structured: Plan', body: '{"type":"doc"}', bodyFormat: 'prosemirror', bodyPlainText: 'Plan' });
    expect(out.activeDocumentTabId).toBe('d2');
  });

  it('trims and caps the title, and never reuses an id that exists', () => {
    const before = addDocumentTab(emptyData(), 'd1');
    const out = addDocumentTabWithContent(before, 'd2', { title: `  ${'t'.repeat(200)}  `, body: 'x' });
    expect(out.utilityDocumentTabs?.[1].title.length).toBe(60);
    expect(addDocumentTabWithContent(before, 'd1', { title: 'dup', body: 'x' })).toBe(before);
  });

  it('falls back to an Untitled title when the title is blank', () => {
    const out = addDocumentTabWithContent(emptyData(), 'd1', { title: '   ', body: 'x' });
    expect(out.utilityDocumentTabs?.[0].title).toMatch(/^Untitled \d+$/);
  });
});

describe('addStructuredTabWithContent', () => {
  it('adds a new active JSON tab with the content, and leaves the others alone', () => {
    const before = addStructuredTab(emptyData(), 's1');
    const out = addStructuredTabWithContent(before, 's2', { title: 'Mock users', content: '[{"a":1}]', language: 'json' });
    expect(out.utilityStructuredTabs).toHaveLength(2);
    expect(out.utilityStructuredTabs?.[0]).toBe(before.utilityStructuredTabs?.[0]);
    expect(out.utilityStructuredTabs?.[1]).toMatchObject({ id: 's2', title: 'Mock users', content: '[{"a":1}]', language: 'json', mode: 'edit' });
    expect(out.activeStructuredTabId).toBe('s2');
  });
});

describe('createNoteWithContent', () => {
  it('creates a note at the top with the title and body, in the given list when it exists', () => {
    const out = createNoteWithContent(base(), 'n1', { title: 'Digest', body: '{"type":"doc"}', bodyFormat: 'prosemirror', bodyPlainText: 'Digest text', groupId: 'g1' });
    expect(out.notes[0]).toMatchObject({ id: 'n1', title: 'Digest', body: '{"type":"doc"}', bodyFormat: 'prosemirror', bodyPlainText: 'Digest text', groupId: 'g1', locked: false });
  });

  it('puts it at the top level when the list is gone, and never replaces an existing note', () => {
    const data = createNoteWithContent(base(), 'n1', { title: 'A', body: 'x', groupId: 'missing' });
    expect(data.notes[0].groupId).toBeUndefined();
    const again = createNoteWithContent(data, 'n1', { title: 'B', body: 'y' });
    expect(again).toBe(data);
    expect(again.notes).toHaveLength(1);
  });

  it('trims and caps the title', () => {
    const out = createNoteWithContent(base(), 'n1', { title: `  ${'t'.repeat(300)}`, body: 'x' });
    expect(out.notes[0].title.length).toBe(120);
  });
});
