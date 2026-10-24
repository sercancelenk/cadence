import { describe, expect, it } from 'vitest';
import { emptyData, type AppData, type NoteGroup, type UtilityDocumentTab, type UtilityStructuredTab } from '../model';
import {
  addDocumentTab,
  closeDocumentTab,
  moveDocumentTabToNote,
  moveStructuredTabToNote,
  patchDocumentTab,
  renameDocumentTab,
  setActiveDocumentTab,
} from './index';

const TS = '2026-01-01T00:00:00.000Z';
const docTab = (id: string, over: Partial<UtilityDocumentTab> = {}): UtilityDocumentTab => ({
  id,
  title: id,
  body: `body of ${id}`,
  updatedAt: TS,
  ...over,
});
const jsonTab = (id: string, over: Partial<UtilityStructuredTab> = {}): UtilityStructuredTab => ({
  id,
  title: id,
  content: '{"a":1}',
  diffContentLeft: '{"left":1}',
  diffContent: '{"right":1}',
  language: 'json',
  mode: 'edit',
  updatedAt: TS,
  ...over,
});
const group = (id: string, over: Partial<NoteGroup> = {}): NoteGroup => ({ id, name: id, sortOrder: 0, createdAt: TS, ...over });
const withDocs = (tabs: UtilityDocumentTab[], active = tabs[0]?.id): AppData => ({
  ...emptyData(),
  utilityDocumentTabs: tabs,
  activeDocumentTabId: active,
});

describe('document tab reducers', () => {
  it('adds an Untitled tab and makes it active', () => {
    const d = addDocumentTab(withDocs([docTab('a')]), 'new');
    expect(d.utilityDocumentTabs!.map((t) => t.id)).toEqual(['a', 'new']);
    expect(d.utilityDocumentTabs![1]!.title).toBe('Untitled 2');
    expect(d.activeDocumentTabId).toBe('new');
  });

  it('adds the first tab when none exist yet', () => {
    const d = addDocumentTab(emptyData(), 'first');
    expect(d.utilityDocumentTabs).toHaveLength(1);
    expect(d.activeDocumentTabId).toBe('first');
  });

  it('closing the active tab activates its neighbour', () => {
    const d = closeDocumentTab(withDocs([docTab('a'), docTab('b'), docTab('c')], 'b'), 'b');
    expect(d.utilityDocumentTabs!.map((t) => t.id)).toEqual(['a', 'c']);
    expect(d.activeDocumentTabId).toBe('c');
  });

  it('closing the last tab leaves one fresh empty tab', () => {
    const d = closeDocumentTab(withDocs([docTab('a')]), 'a');
    expect(d.utilityDocumentTabs).toHaveLength(1);
    expect(d.utilityDocumentTabs![0]!.id).not.toBe('a');
    expect(d.utilityDocumentTabs![0]!.body).toBe('');
    expect(d.activeDocumentTabId).toBe(d.utilityDocumentTabs![0]!.id);
  });

  it('renames with trimming and ignores an empty title', () => {
    const base = withDocs([docTab('a')]);
    expect(renameDocumentTab(base, 'a', '  Plan  ').utilityDocumentTabs![0]!.title).toBe('Plan');
    expect(renameDocumentTab(base, 'a', '   ')).toBe(base);
  });

  it('patches only the target tab and bumps its updatedAt', () => {
    const base = withDocs([docTab('a'), docTab('b')]);
    const d = patchDocumentTab(base, 'a', { body: 'new', bodyFormat: 'prosemirror', bodyPlainText: 'new' });
    expect(d.utilityDocumentTabs![0]).toMatchObject({ body: 'new', bodyFormat: 'prosemirror', bodyPlainText: 'new' });
    expect(d.utilityDocumentTabs![0]!.updatedAt).not.toBe(TS);
    expect(d.utilityDocumentTabs![1]).toBe(base.utilityDocumentTabs![1]);
  });

  it('setActive ignores unknown ids', () => {
    const base = withDocs([docTab('a')]);
    expect(setActiveDocumentTab(base, 'nope')).toBe(base);
  });
});

describe('moveDocumentTabToNote', () => {
  const rich = docTab('b', { title: 'Plan', body: '{"type":"doc"}', bodyFormat: 'prosemirror', bodyPlainText: 'Plan text' });
  const base = (): AppData => ({ ...withDocs([docTab('a'), rich, docTab('c')], 'b'), noteGroups: [group('g1')] });

  it('creates the note from the tab and removes the tab', () => {
    const before = base();
    const d = moveDocumentTabToNote(before, { tabId: 'b', noteId: 'n1', groupId: 'g1' });
    expect(d.notes.find((n) => n.id === 'n1')).toMatchObject({
      title: 'Plan', body: '{"type":"doc"}', bodyFormat: 'prosemirror', bodyPlainText: 'Plan text', groupId: 'g1', locked: false,
    });
    expect(d.utilityDocumentTabs!.map((t) => t.id)).toEqual(['a', 'c']);
    expect(d.activeDocumentTabId).toBe('c');
    expect(d.utilityDocumentTabs![0]).toBe(before.utilityDocumentTabs![0]);
  });

  it('makes a root note when the list is missing or unknown', () => {
    expect(moveDocumentTabToNote(base(), { tabId: 'b', noteId: 'n1' }).notes[0]!.groupId).toBeUndefined();
    expect(moveDocumentTabToNote(base(), { tabId: 'b', noteId: 'n1', groupId: 'ghost' }).notes[0]!.groupId).toBeUndefined();
  });

  it('is idempotent for the same note id', () => {
    const once = moveDocumentTabToNote(base(), { tabId: 'b', noteId: 'n1' });
    expect(moveDocumentTabToNote(once, { tabId: 'b', noteId: 'n1' })).toBe(once);
    expect(moveDocumentTabToNote(once, { tabId: 'a', noteId: 'n1' })).toBe(once);
  });

  it('is a no-op for an unknown tab', () => {
    const d = base();
    expect(moveDocumentTabToNote(d, { tabId: 'ghost', noteId: 'n1' })).toBe(d);
  });

  it('moving the only tab leaves an empty array, never undefined', () => {
    const d = moveDocumentTabToNote(withDocs([docTab('a')]), { tabId: 'a', noteId: 'n1' });
    expect(d.utilityDocumentTabs).toEqual([]);
    expect(d.notes).toHaveLength(1);
  });

  it('does not touch the legacy document', () => {
    const legacy = { body: 'legacy', updatedAt: TS };
    const d = moveDocumentTabToNote({ ...base(), utilityDocument: legacy }, { tabId: 'a', noteId: 'n1' });
    expect(d.utilityDocument).toBe(legacy);
  });
});

describe('moveStructuredTabToNote', () => {
  const fields = { title: 'config', body: '{"type":"doc"}', bodyFormat: 'prosemirror' as const, bodyPlainText: '{"a":1}' };
  const base = (): AppData => ({
    ...emptyData(),
    utilityStructuredTabs: [jsonTab('x'), jsonTab('y')],
    activeStructuredTabId: 'x',
    noteGroups: [group('g1')],
  });

  it('creates the note from the given fields and removes the tab without copying diff panes', () => {
    const d = moveStructuredTabToNote(base(), { tabId: 'x', noteId: 'n1', groupId: 'g1', fields });
    expect(d.notes[0]).toMatchObject({ id: 'n1', title: 'config', body: fields.body, bodyFormat: 'prosemirror', bodyPlainText: '{"a":1}', groupId: 'g1' });
    expect(JSON.stringify(d.notes[0])).not.toContain('left');
    expect(d.utilityStructuredTabs!.map((t) => t.id)).toEqual(['y']);
    expect(d.activeStructuredTabId).toBe('y');
  });

  it('moving the only tab leaves an empty array and keeps the legacy buffer untouched', () => {
    const legacy = { content: '{}', language: 'json' as const, updatedAt: TS };
    const one: AppData = { ...emptyData(), utilityStructuredText: legacy, utilityStructuredTabs: [jsonTab('x')], activeStructuredTabId: 'x' };
    const d = moveStructuredTabToNote(one, { tabId: 'x', noteId: 'n1', fields });
    expect(d.utilityStructuredTabs).toEqual([]);
    expect(d.utilityStructuredText).toBe(legacy);
  });

  it('is idempotent and ignores unknown tabs', () => {
    const once = moveStructuredTabToNote(base(), { tabId: 'x', noteId: 'n1', fields });
    expect(moveStructuredTabToNote(once, { tabId: 'x', noteId: 'n1', fields })).toBe(once);
    const d = base();
    expect(moveStructuredTabToNote(d, { tabId: 'ghost', noteId: 'n2', fields })).toBe(d);
  });
});
