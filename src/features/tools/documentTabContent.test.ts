import { describe, expect, it } from 'vitest';
import { documentTabHasContent } from './documentTabContent';

const tab = (over: Record<string, unknown>) => ({ id: 't', title: 'T', body: '', updatedAt: 'x', ...over }) as Parameters<typeof documentTabHasContent>[0];

describe('documentTabHasContent', () => {
  it('is false for an empty or whitespace tab', () => {
    expect(documentTabHasContent(tab({}))).toBe(false);
    expect(documentTabHasContent(tab({ body: '   \n' }))).toBe(false);
  });
  it('is false for a rich tab whose text is empty', () => {
    expect(documentTabHasContent(tab({ body: '{"type":"doc","content":[{"type":"paragraph"}]}', bodyFormat: 'prosemirror', bodyPlainText: '' }))).toBe(false);
  });
  it('is true for typed text in either format', () => {
    expect(documentTabHasContent(tab({ body: 'hello' }))).toBe(true);
    expect(documentTabHasContent(tab({ body: '{"type":"doc"}', bodyFormat: 'prosemirror', bodyPlainText: 'hello' }))).toBe(true);
  });
  it('is true for a rich tab that only holds an image', () => {
    const body = '{"type":"doc","content":[{"type":"image","attrs":{"src":"cadence-attachment://x-12345678"}}]}';
    expect(documentTabHasContent(tab({ body, bodyFormat: 'prosemirror', bodyPlainText: '' }))).toBe(true);
  });
  it('is true for a rich tab that only holds a table, a rule or a code block', () => {
    const body = (node: object) => JSON.stringify({ type: 'doc', content: [node] });
    for (const node of [{ type: 'table', content: [] }, { type: 'horizontalRule' }, { type: 'codeBlock', attrs: { language: 'mermaid' } }]) {
      expect(documentTabHasContent(tab({ body: body(node), bodyFormat: 'prosemirror', bodyPlainText: undefined }))).toBe(true);
    }
  });
});

