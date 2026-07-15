import { describe, expect, it } from 'vitest';
import type { RichTextDoc } from './richText';
import {
  compactClipboardHtml,
  serializeRichNodesToClipboardPlainText,
  wrapHtmlForClipboard,
} from './richTextClipboard';

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
        ],
      },
    ];
    expect(serializeRichNodesToClipboardPlainText(nodes)).toBe('1. one\n2. two\n☑ done');
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
});

describe('compactClipboardHtml', () => {
  it('adds margin resets so HTML pastes stay compact', () => {
    const html = compactClipboardHtml('<h2>Title</h2><ul><li><p>Item</p></li></ul>');
    expect(html).toContain('margin:0');
    expect(html).toContain('<h2 style=');
    expect(html).toContain('<li style=');
    expect(wrapHtmlForClipboard(html)).toContain('StartFragment');
  });
});
