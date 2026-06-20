import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { createRichTextExtensions } from './richTextEditorExtensions';
import { insertMarkdownPaste } from './richTextPaste';

function createTestEditor(content?: object) {
  return new Editor({
    extensions: createRichTextExtensions(''),
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

describe('richTextPaste integration', () => {
  it('inserts markdown into empty doc and stays editable', () => {
    const editor = createTestEditor();
    editor.commands.focus('end');

    expect(insertMarkdownPaste(editor, '## Title\n\n**bold** text\n\n- item one')).toBe(true);
    expect(editor.isEditable).toBe(true);
    expect(editor.getText()).toContain('Title');
    expect(editor.getText()).toContain('bold');

    expect(editor.chain().focus().insertContent(' more typing').run()).toBe(true);
    expect(editor.getText()).toContain('more typing');

    editor.destroy();
  });

  it('supports toolbar formatting after markdown paste', () => {
    const editor = createTestEditor();
    editor.commands.focus('end');
    expect(insertMarkdownPaste(editor, '## Heading\n\nParagraph')).toBe(true);

    editor.commands.focus('end');
    expect(editor.chain().focus().toggleBold().run()).toBe(true);
    expect(editor.chain().focus().insertContent(' emphasis').run()).toBe(true);
    expect(editor.getText()).toContain('emphasis');

    editor.destroy();
  });

  it('inserts markdown mid-document without breaking structure', () => {
    const editor = createTestEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Before ' }],
        },
      ],
    });
    editor.commands.focus('end');

    expect(insertMarkdownPaste(editor, '**middle**')).toBe(true);
    expect(editor.getText()).toContain('Before');
    expect(editor.getText()).toContain('middle');

    expect(editor.chain().focus('end').insertContent(' after').run()).toBe(true);
    expect(editor.getText()).toContain('after');

    editor.destroy();
  });
});
