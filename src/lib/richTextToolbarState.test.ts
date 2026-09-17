import { Editor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import { createRichTextExtensions } from './richTextEditorExtensions';
import {
  readRichTextBubbleToolbarState,
  readRichTextToolbarState,
  toolbarStateKey,
} from './richTextToolbarState';

function editorWith(text = 'hello world') {
  return new Editor({
    extensions: createRichTextExtensions(),
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  });
}

function key(editor: Editor) {
  return toolbarStateKey(readRichTextToolbarState(editor));
}

describe('readRichTextToolbarState', () => {
  it('reflects the active mark after a format command', () => {
    const editor = editorWith();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(readRichTextToolbarState(editor).bold).toBe(false);

    editor.chain().setTextSelection({ from: 1, to: 6 }).toggleBold().run();
    expect(readRichTextToolbarState(editor).bold).toBe(true);

    editor.destroy();
  });

  it('reports undo as available only after an edit', () => {
    const editor = editorWith();
    expect(readRichTextToolbarState(editor).canUndo).toBe(false);

    editor.commands.insertContent('!');
    expect(readRichTextToolbarState(editor).canUndo).toBe(true);

    editor.destroy();
  });

  it('tracks heading level and list membership', () => {
    const editor = editorWith();
    editor.chain().setTextSelection(2).toggleHeading({ level: 2 }).run();
    const state = readRichTextToolbarState(editor);
    expect(state.heading2).toBe(true);
    expect(state.heading1).toBe(false);
    expect(state.paragraph).toBe(false);

    editor.chain().setParagraph().toggleBulletList().run();
    expect(readRichTextToolbarState(editor).bulletList).toBe(true);

    editor.destroy();
  });
});

describe('toolbarStateKey', () => {
  it('changes when a format command changes what the toolbar shows', () => {
    const editor = editorWith();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const before = key(editor);

    editor.chain().setTextSelection({ from: 1, to: 6 }).toggleBold().run();

    expect(key(editor)).not.toBe(before);
    editor.destroy();
  });

  it('changes when the first edit enables undo', () => {
    const editor = editorWith();
    const before = key(editor);
    editor.commands.insertContent('x');
    expect(key(editor)).not.toBe(before);
    editor.destroy();
  });

  it('stays the same while typing plain text in the same block', () => {
    const editor = editorWith();
    editor.commands.insertContent('a');
    const afterFirstKeystroke = key(editor);

    editor.commands.insertContent('b');
    editor.commands.insertContent('c');

    expect(key(editor)).toBe(afterFirstKeystroke);
    editor.destroy();
  });
});

describe('readRichTextBubbleToolbarState', () => {
  it('reports a task title only for a non-empty selection', () => {
    const editor = editorWith();
    editor.commands.setTextSelection(2);
    expect(readRichTextBubbleToolbarState(editor).hasTaskTitle).toBe(false);

    editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(readRichTextBubbleToolbarState(editor).hasTaskTitle).toBe(true);

    editor.destroy();
  });

  it('key changes when the selection gains usable text', () => {
    const editor = editorWith();
    editor.commands.setTextSelection(2);
    const collapsed = toolbarStateKey(
      readRichTextBubbleToolbarState(editor),
    );

    editor.commands.setTextSelection({ from: 1, to: 6 });
    const ranged = toolbarStateKey(readRichTextBubbleToolbarState(editor));

    expect(ranged).not.toBe(collapsed);
    editor.destroy();
  });
});
