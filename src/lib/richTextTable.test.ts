import { Editor } from '@tiptap/core';
import { columnResizingPluginKey } from '@tiptap/pm/tables';
import { describe, expect, it } from 'vitest';
import { createRichTextExtensions } from './richTextEditorExtensions';

describe('RichTextTable column resize', () => {
  it('registers columnResizing even when the editor mounts non-editable', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      editable: false,
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(columnResizingPluginKey.getState(editor.state)).toBeTruthy();
    editor.setEditable(true);
    expect(columnResizingPluginKey.getState(editor.state)).toBeTruthy();
    editor.destroy();
  });

  it('preserves cell colwidth through JSON round-trip (legacy tables default null)', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    attrs: { colwidth: [140] },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                  },
                  {
                    type: 'tableHeader',
                    attrs: { colwidth: [220] },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    attrs: { colwidth: [140] },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }],
                  },
                  {
                    type: 'tableCell',
                    attrs: { colwidth: [220] },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const table = editor.getJSON().content?.[0] as {
      type: string;
      content?: Array<{
        content?: Array<{ attrs?: { colwidth?: number[] | null } }>;
      }>;
    };
    expect(table.type).toBe('table');
    expect(table.content?.[0]?.content?.[0]?.attrs?.colwidth).toEqual([140]);
    expect(table.content?.[0]?.content?.[1]?.attrs?.colwidth).toEqual([220]);
    expect(table.content?.[1]?.content?.[0]?.attrs?.colwidth).toEqual([140]);
    editor.destroy();
  });
});
