import { extractPlainText, serializeRichDoc, type RichTextDoc } from '../richText';
import type { RichTextBodyFields } from '../richTextBody';
import type { StructureOut } from './prompts/structure';

/** The body for a structured copy: a title, then a heading and a bullet list per section. Plain text only. */
export function structureToFields(out: StructureOut): RichTextBodyFields {
  const text = (t: string) => [{ type: 'text', text: t }];
  const content: NonNullable<RichTextDoc['content']> = [{ type: 'heading', attrs: { level: 1 }, content: text(out.title) }];
  if (out.table) {
    const cell = (type: 'tableHeader' | 'tableCell', t: string) => ({
      type,
      content: [t ? { type: 'paragraph', content: text(t) } : { type: 'paragraph' }],
    });
    content.push({
      type: 'table',
      content: [
        { type: 'tableRow', content: out.table.columns.map((c) => cell('tableHeader', c)) },
        ...out.table.rows.map((row) => ({ type: 'tableRow', content: row.map((c) => cell('tableCell', c)) })),
      ],
    });
  }
  for (const s of out.sections) {
    content.push(
      { type: 'heading', attrs: { level: 2 }, content: text(s.heading) },
      {
        type: 'bulletList',
        content: s.items.map((item) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: text(item) }],
        })),
      },
    );
  }
  const doc: RichTextDoc = { type: 'doc', content };
  return { body: serializeRichDoc(doc), bodyFormat: 'prosemirror', bodyPlainText: extractPlainText(doc) || undefined };
}

const mdCell = (c: string) => c.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');

/** The plain-text form used by Copy: sections as bullets, a table as a Markdown table. */
export function structureToText(out: StructureOut): string {
  const parts = [out.title];
  if (out.table) {
    const { columns, rows } = out.table;
    parts.push(
      [
        `| ${columns.map(mdCell).join(' | ')} |`,
        `| ${columns.map(() => '---').join(' | ')} |`,
        ...rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`),
      ].join('\n'),
    );
  }
  for (const s of out.sections) parts.push(`${s.heading}\n${s.items.map((i) => `- ${i}`).join('\n')}`);
  return parts.join('\n\n');
}
