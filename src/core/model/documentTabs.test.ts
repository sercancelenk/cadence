/**
 * Tools → Document tabs: migration from the single legacy document, the
 * "tabs array present means migrated" marker, and recovery of edits an older
 * build made to the legacy field. The legacy field is never written.
 */

import { describe, expect, it } from 'vitest';
import { compactAppDataForPersist, normalizeData, utilityDocumentHasContent, type AppData } from './index';

const T1 = '2026-05-20T09:00:00.000Z';
const T2 = '2026-06-20T09:00:00.000Z';

const legacy = (over: Record<string, unknown> = {}) => ({
  body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Taslak 🚀' }] }] }),
  bodyFormat: 'prosemirror',
  bodyPlainText: 'Taslak 🚀',
  updatedAt: T1,
  ...over,
});

const tab = (over: Record<string, unknown> = {}) => ({
  id: 'tab-1',
  title: 'Draft',
  body: 'merhaba',
  updatedAt: T1,
  ...over,
});

const load = (raw: Record<string, unknown>): AppData => normalizeData({ version: 3, ...raw });
const roundTrip = (d: AppData): AppData =>
  normalizeData(JSON.parse(JSON.stringify(compactAppDataForPersist(d))));

describe('document tabs migration', () => {
  it('migrates the legacy document into tab 1 verbatim', () => {
    const l = legacy();
    const d = load({ utilityDocument: l });
    const tabs = d.utilityDocumentTabs!;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ title: 'Document', body: l.body, bodyFormat: 'prosemirror', bodyPlainText: l.bodyPlainText, updatedAt: T1 });
    expect(d.activeDocumentTabId).toBe(tabs[0]!.id);
    expect(d.utilityDocumentLegacySeenAt).toBe(T1);
    expect(d.utilityDocument).toEqual(l);
  });

  it('does not re-migrate when the tabs array exists but is empty', () => {
    const d = load({ utilityDocument: legacy(), utilityDocumentTabs: [], utilityDocumentLegacySeenAt: T1 });
    expect(d.utilityDocumentTabs).toEqual([]);
    const disk = JSON.parse(JSON.stringify(compactAppDataForPersist(d)));
    expect(disk.utilityDocumentTabs).toEqual([]);
    expect(roundTrip(d).utilityDocumentTabs).toEqual([]);
  });

  it('keeps existing tabs authoritative and repairs a dangling active id', () => {
    const d = load({ utilityDocument: legacy(), utilityDocumentTabs: [tab(), tab({ id: 'tab-2', title: 'Two' })], activeDocumentTabId: 'gone', utilityDocumentLegacySeenAt: T1 });
    expect(d.utilityDocumentTabs!.map((t) => t.id)).toEqual(['tab-1', 'tab-2']);
    expect(d.activeDocumentTabId).toBe('tab-1');
  });

  it('adds a recovery tab when an older build edited the legacy document', () => {
    const edited = legacy({ body: 'edited in an older build', bodyFormat: undefined, bodyPlainText: undefined, updatedAt: T2 });
    const d = load({ utilityDocument: edited, utilityDocumentTabs: [tab()], utilityDocumentLegacySeenAt: T1 });
    expect(d.utilityDocumentTabs).toHaveLength(2);
    expect(d.utilityDocumentTabs![1]).toMatchObject({ title: 'Document (from older version)', body: 'edited in an older build' });
    expect(d.utilityDocumentLegacySeenAt).toBe(T2);
    expect(d.utilityDocument).toEqual({ body: 'edited in an older build', updatedAt: T2 });
    expect(roundTrip(d).utilityDocumentTabs).toHaveLength(2);
  });

  it('does not add a recovery tab when the legacy body already exists in a tab', () => {
    const d = load({ utilityDocument: legacy({ body: 'same', bodyFormat: undefined, updatedAt: T2 }), utilityDocumentTabs: [tab({ body: 'same' })], utilityDocumentLegacySeenAt: T1 });
    expect(d.utilityDocumentTabs).toHaveLength(1);
    expect(d.utilityDocumentLegacySeenAt).toBe(T2);
  });

  it('never recovers from an unparsable legacy timestamp', () => {
    const d = load({ utilityDocument: legacy({ body: 'x', updatedAt: 'not-a-date' }), utilityDocumentTabs: [tab()], utilityDocumentLegacySeenAt: T1 });
    expect(d.utilityDocumentTabs).toHaveLength(1);
  });

  it('recovers a legacy document an older build wrote when tabs exist but nothing was ever recorded as seen', () => {
    // Tab seeded lazily (no legacy at the time), then a downgrade wrote the first legacy document.
    const d = load({ utilityDocument: legacy({ body: 'written in an older build', bodyFormat: undefined, bodyPlainText: undefined }), utilityDocumentTabs: [tab()] });
    expect(d.utilityDocumentTabs).toHaveLength(2);
    expect(d.utilityDocumentTabs![1]).toMatchObject({ title: 'Document (from older version)', body: 'written in an older build' });
    expect(d.utilityDocumentLegacySeenAt).toBe(T1);
    expect(roundTrip(d).utilityDocumentTabs).toHaveLength(2);
  });

  it('does not recover an empty or already-present legacy document when nothing was recorded as seen', () => {
    expect(load({ utilityDocument: legacy({ body: '   ', bodyFormat: undefined }), utilityDocumentTabs: [tab()] }).utilityDocumentTabs).toHaveLength(1);
    expect(load({ utilityDocument: legacy({ body: 'merhaba', bodyFormat: undefined }), utilityDocumentTabs: [tab({ body: 'merhaba' })] }).utilityDocumentTabs).toHaveLength(1);
  });

  it('does not recover a legacy rich document that holds no text', () => {
    const empty = legacy({ body: '{"type":"doc","content":[{"type":"paragraph"}]}', bodyPlainText: '' });
    expect(load({ utilityDocument: empty, utilityDocumentTabs: [tab()] }).utilityDocumentTabs).toHaveLength(1);
  });

  it('leaves a workspace with neither field untouched', () => {
    const d = load({});
    expect(d.utilityDocumentTabs).toBeUndefined();
    expect(d.activeDocumentTabId).toBeUndefined();
    expect(d.utilityDocumentLegacySeenAt).toBeUndefined();
  });

  it('ignores a non-array utilityDocumentTabs and falls back to migrating', () => {
    const d = load({ utilityDocument: legacy(), utilityDocumentTabs: 'garbage' });
    expect(d.utilityDocumentTabs).toHaveLength(1);
  });

  it('keeps unknown keys on a tab', () => {
    const d = load({ utilityDocumentTabs: [tab({ pinnedBy: 'future', nested: { a: 1 } })], utilityDocumentLegacySeenAt: T1 });
    expect(roundTrip(d).utilityDocumentTabs![0]).toMatchObject({ pinnedBy: 'future', nested: { a: 1 } });
  });
});

describe('JSON/YAML tabs keep the same migration marker', () => {
  const structuredLegacy = { content: '{"a":1}', language: 'json', updatedAt: T1 };

  it('keeps an empty tabs array and does not resurrect the legacy buffer', () => {
    const d = load({ utilityStructuredText: structuredLegacy, utilityStructuredTabs: [] });
    expect(d.utilityStructuredTabs).toEqual([]);
    expect(roundTrip(d).utilityStructuredTabs).toEqual([]);
  });

  it('still shows the legacy buffer when the tabs array holds only unreadable entries', () => {
    // Nothing usable in the array, so the buffer in the file must not stay hidden.
    const d = load({ utilityStructuredText: structuredLegacy, utilityStructuredTabs: [{ junk: true }, 'garbage'] });
    expect(d.utilityStructuredTabs).toHaveLength(1);
    expect(d.utilityStructuredTabs![0]!.content).toBe('{"a":1}');
  });

  it('still migrates the legacy buffer when no tabs array exists', () => {
    const d = load({ utilityStructuredText: structuredLegacy });
    expect(d.utilityStructuredTabs).toHaveLength(1);
    expect(d.utilityStructuredTabs![0]!.content).toBe('{"a":1}');
  });
});

describe('workspace with document tabs on disk', () => {
  it('round-trips the 12-document-tabs fixture without touching the legacy document', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const file = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'legacy', '12-document-tabs.json'), 'utf8'));
    const after = roundTrip(normalizeData(file));
    expect(after.utilityDocumentTabs).toEqual(file.utilityDocumentTabs);
    expect(after.activeDocumentTabId).toBe('doc-tab-2');
    expect(after.utilityDocument).toEqual(file.utilityDocument);
  });
});

describe('utilityDocumentHasContent', () => {
  const rich = (content: unknown[], plain = '') => ({
    body: JSON.stringify({ type: 'doc', content }),
    bodyFormat: 'prosemirror' as const,
    bodyPlainText: plain,
  });
  const para = (text?: string) => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) });

  it('is false for blank markdown and for empty rich documents', () => {
    expect(utilityDocumentHasContent({ body: '  \n' })).toBe(false);
    expect(utilityDocumentHasContent(rich([para(), para()]))).toBe(false);
    expect(utilityDocumentHasContent(rich([]))).toBe(false);
  });

  it('is true for text, in either format', () => {
    expect(utilityDocumentHasContent({ body: 'hello' })).toBe(true);
    expect(utilityDocumentHasContent(rich([para('hello')], 'hello'))).toBe(true);
  });

  it('is true for non-text structure the user built: images, tables, rules, code blocks, lists', () => {
    expect(utilityDocumentHasContent(rich([{ type: 'image', attrs: { src: 'cadence-attachment://img-12345678' } }]))).toBe(true);
    expect(utilityDocumentHasContent(rich([{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para()] }] }] }]))).toBe(true);
    expect(utilityDocumentHasContent(rich([{ type: 'horizontalRule' }]))).toBe(true);
    expect(utilityDocumentHasContent(rich([{ type: 'codeBlock', attrs: { language: 'mermaid' } }]))).toBe(true);
    expect(utilityDocumentHasContent(rich([{ type: 'bulletList', content: [{ type: 'listItem', content: [para()] }] }]))).toBe(true);
  });

  it('errs on the side of content when a rich body cannot be read', () => {
    expect(utilityDocumentHasContent({ body: '{not json', bodyFormat: 'prosemirror' })).toBe(true);
  });
});

describe('document tab ids', () => {
  it('keeps a tab that has no id by giving it one', () => {
    const d = load({ utilityDocumentTabs: [{ title: 'No id', body: 'precious', updatedAt: T1 }], utilityDocumentLegacySeenAt: T1 });
    expect(d.utilityDocumentTabs).toHaveLength(1);
    expect(d.utilityDocumentTabs![0]!.body).toBe('precious');
    expect(d.utilityDocumentTabs![0]!.id).toBeTruthy();
  });

  it('keeps both documents when two tabs share an id, so closing one cannot delete the other', () => {
    const d = load({ utilityDocumentTabs: [tab({ id: 'dup', body: 'first' }), tab({ id: 'dup', body: 'second' })], utilityDocumentLegacySeenAt: T1 });
    const ids = d.utilityDocumentTabs!.map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
    expect(d.utilityDocumentTabs!.map((t) => t.body)).toEqual(['first', 'second']);
    expect(ids[0]).toBe('dup');
  });
});

