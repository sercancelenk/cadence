import { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import type { RichTextDoc } from './richText';
import {
  buildRichClipboardPayload,
  compactClipboardHtml,
  serializeRichNodesToClipboardPlainText,
  wrapHtmlForClipboard,
  writeRichClipboard,
} from './richTextClipboard';
import { createRichTextExtensions } from './richTextEditorExtensions';

describe('serializeRichNodesToClipboardPlainText', () => {
  it('emits one line per heading/list item without blank gaps', () => {
    const nodes: RichTextDoc[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'dasdasd' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'asedasdasd' }] },
            ],
          },
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'dadddads' }] },
            ],
          },
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'dasdasdasd' }] },
            ],
          },
        ],
      },
    ];

    const plain = serializeRichNodesToClipboardPlainText(nodes);
    expect(plain).toBe('dasdasd\n• asedasdasd\n• dadddads\n• dasdasdasd');
    expect(plain).not.toMatch(/\n\n/);
  });

  it('keeps ordered and task list markers', () => {
    const nodes: RichTextDoc[] = [
      {
        type: 'orderedList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
          },
        ],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
          },
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo' }] }],
          },
        ],
      },
    ];
    expect(serializeRichNodesToClipboardPlainText(nodes)).toBe(
      '1. one\n2. two\n☑ done\n☐ todo',
    );
  });

  it('preserves hard breaks inside a paragraph as a single visual line break', () => {
    const nodes: RichTextDoc[] = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a' },
          { type: 'hardBreak' },
          { type: 'text', text: 'b' },
        ],
      },
    ];
    expect(serializeRichNodesToClipboardPlainText(nodes)).toBe('a\nb');
  });

  it('serializes date chips, images, rules, code, quotes, tables, and nested lists', () => {
    const nodes: RichTextDoc[] = [
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Meet ' },
              {
                type: 'dateChip',
                attrs: { label: 'May 31', iso: '2026-05-31' },
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'dateChip', attrs: { iso: '2026-06-01' } }],
          },
          { type: 'horizontalRule' },
          {
            type: 'image',
            attrs: { alt: 'diagram' },
          },
          {
            type: 'image',
            attrs: {},
          },
          {
            type: 'codeBlock',
            attrs: { language: 'ts' },
            content: [{ type: 'text', text: 'const x = 1;\nconst y = 2;' }],
          },
          {
            type: 'blockquote',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] },
            ],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
                    ],
                  },
                  {
                    type: 'tableHeader',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
                    ],
                  },
                ],
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'skip' }] },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'parent' }] },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'second line' }],
                  },
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'child' }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'codeBlock',
                    content: [{ type: 'text', text: 'nested' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const plain = serializeRichNodesToClipboardPlainText(nodes);
    expect(plain).toContain('Meet May 31');
    expect(plain).toContain('2026-06-01');
    expect(plain).toContain('---');
    expect(plain).toContain('[image: diagram]');
    expect(plain).toContain('[image]');
    expect(plain).toContain('```ts');
    expect(plain).toContain('const x = 1;');
    expect(plain).toContain('> quoted');
    expect(plain).toContain('A\tB');
    expect(plain).toContain('• parent');
    expect(plain).toContain('  second line');
    expect(plain).toContain('  • child');
    expect(plain).toContain('  ```');
    expect(plain).toContain('  nested');
  });

  it('trims trailing blank lines from the serialized payload', () => {
    const nodes: RichTextDoc[] = [
      { type: 'paragraph', content: [{ type: 'text', text: 'ok' }] },
      { type: 'paragraph', content: [] },
    ];
    expect(serializeRichNodesToClipboardPlainText(nodes)).toBe('ok');
  });
});

describe('compactClipboardHtml', () => {
  it('adds margin resets so HTML pastes stay compact', () => {
    const html = compactClipboardHtml('<h2>Title</h2><ul><li><p>Item</p></li></ul>');
    expect(html).toContain('margin:0');
    expect(html).toContain('<h2 style=');
    expect(html).toContain('<li style=');
    expect(wrapHtmlForClipboard(html)).toContain('StartFragment');
  });

  it('merges into existing style attrs without duplicating margin', () => {
    const withColor = compactClipboardHtml('<p style="color:red">x</p>');
    expect(withColor).toContain('margin:0');
    expect(withColor).toContain('color:red');

    const already = compactClipboardHtml('<p style="margin:8px">y</p>');
    expect(already).toContain('style="margin:8px"');
    expect(already.match(/margin:/g)?.length).toBe(1);
  });
});

describe('buildRichClipboardPayload / writeRichClipboard', () => {
  function editorWithSelection(html: string): Editor {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: html,
    });
    editor.commands.selectAll();
    return editor;
  }

  it('returns null for an empty selection', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: '<p>hi</p>',
    });
    // Collapse selection to a caret.
    editor.commands.setTextSelection(1);
    expect(buildRichClipboardPayload(editor.view)).toBeNull();
    editor.destroy();
  });

  it('builds compact plain + HTML for a non-empty selection', () => {
    const editor = editorWithSelection('<h2>Title</h2><ul><li><p>Item</p></li></ul>');
    const payload = buildRichClipboardPayload(editor.view);
    expect(payload).not.toBeNull();
    expect(payload!.plain).toContain('Title');
    expect(payload!.plain).toContain('• Item');
    expect(payload!.html).toContain('StartFragment');
    expect(payload!.html).toContain('margin:0');
    editor.destroy();
  });

  it('writeRichClipboard writes both mime types and prevents default', () => {
    const editor = editorWithSelection('<p>Copy me</p>');
    const setData = vi.fn();
    const preventDefault = vi.fn();
    const event = {
      clipboardData: { setData },
      preventDefault,
    } as unknown as ClipboardEvent;

    expect(writeRichClipboard(editor.view, event)).toBe(true);
    expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('Copy me'));
    expect(setData).toHaveBeenCalledWith('text/html', expect.stringContaining('StartFragment'));
    expect(preventDefault).toHaveBeenCalled();
    editor.destroy();
  });

  it('writeRichClipboard returns false without clipboardData or selection', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: '<p>x</p>',
    });
    editor.commands.setTextSelection(1);
    expect(
      writeRichClipboard(editor.view, {
        clipboardData: null,
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent),
    ).toBe(false);

    const setData = vi.fn();
    expect(
      writeRichClipboard(editor.view, {
        clipboardData: { setData },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent),
    ).toBe(false);
    expect(setData).not.toHaveBeenCalled();
    editor.destroy();
  });
});
