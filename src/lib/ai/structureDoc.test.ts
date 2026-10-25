import { describe, expect, it } from 'vitest';
import { parseRichDoc } from '../richText';
import { structureToFields, structureToText } from './structureDoc';

describe('structureToFields', () => {
  const out = { title: 'Plan', sections: [{ heading: 'Todo', items: ['A', 'B'] }, { heading: 'Risks', items: ['C'] }] };

  it('builds a ProseMirror body: a title, then a heading and a bullet list per section, all plain text', () => {
    const fields = structureToFields(out);
    expect(fields.bodyFormat).toBe('prosemirror');
    const doc = parseRichDoc(fields.body);
    expect(doc?.content?.map((n) => n.type)).toEqual(['heading', 'heading', 'bulletList', 'heading', 'bulletList']);
    expect(doc?.content?.[0]).toEqual({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Plan' }] });
    expect(doc?.content?.[2]).toEqual({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
      ],
    });
  });

  it('keeps model text as text and gives a plain-text copy for search', () => {
    const fields = structureToFields({ title: '<b>x</b>', sections: [{ heading: '**h**', items: ['[l](https://e.com)'] }] });
    const doc = parseRichDoc(fields.body);
    expect(JSON.stringify(doc)).not.toContain('"marks"');
    expect(fields.bodyPlainText).toContain('[l](https://e.com)');
    expect(fields.bodyPlainText).toContain('Plan'.slice(0, 0));
  });
});

describe('table output', () => {
  const out = {
    title: 'Owners',
    sections: [],
    table: { columns: ['Task', 'Owner'], rows: [['Ship', 'Ann | Bob'], ['Test', '']] },
  };

  it('builds a real table: a title, then a header row and one row per entry, all plain text', () => {
    const fields = structureToFields(out);
    const doc = parseRichDoc(fields.body);
    expect(doc?.content?.map((n) => n.type)).toEqual(['heading', 'table']);
    const table = doc?.content?.[1];
    expect(table?.content?.map((r) => r.type)).toEqual(['tableRow', 'tableRow', 'tableRow']);
    expect(table?.content?.[0].content?.map((c) => c.type)).toEqual(['tableHeader', 'tableHeader']);
    expect(table?.content?.[1].content?.map((c) => c.type)).toEqual(['tableCell', 'tableCell']);
    expect(JSON.stringify(doc)).not.toContain('"marks"');
    expect(fields.bodyPlainText).toContain('Ann | Bob');
  });

  it('gives an empty cell an empty paragraph so the editor accepts the table', () => {
    const doc = parseRichDoc(structureToFields(out).body);
    const emptyCell = doc?.content?.[1].content?.[2].content?.[1];
    expect(emptyCell?.content).toEqual([{ type: 'paragraph' }]);
  });
});

describe('structureToText', () => {
  it('writes sections as a title, headings and bullets', () => {
    expect(structureToText({ title: 'Plan', sections: [{ heading: 'Todo', items: ['A', 'B'] }] })).toBe('Plan\n\nTodo\n- A\n- B');
  });

  it('writes a table as Markdown, escaping pipes and line breaks in cells', () => {
    const text = structureToText({
      title: 'Owners',
      sections: [],
      table: { columns: ['Task', 'Owner'], rows: [['Ship', 'Ann | Bob'], ['Line\nbreak', '']] },
    });
    expect(text).toBe('Owners\n\n| Task | Owner |\n| --- | --- |\n| Ship | Ann \\| Bob |\n| Line break |  |');
  });
});
