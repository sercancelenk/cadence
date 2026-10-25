import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createRichTextExtensions } from '../richTextEditorExtensions';
import { createEditorTarget } from './editorTarget';

const para = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const mermaidBlock: JSONContent = {
  type: 'codeBlock',
  attrs: { language: 'mermaid' },
  content: [{ type: 'text', text: 'flowchart TD\n  A --> B' }],
};

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(paragraphs: string[], editable = true): Editor {
  editor = new Editor({
    extensions: createRichTextExtensions(),
    editable,
    content: { type: 'doc', content: paragraphs.map(para) },
  });
  return editor;
}

/** The range of `needle` inside the document, as ProseMirror positions. */
function rangeOf(ed: Editor, needle: string): { from: number; to: number } {
  let found: { from: number; to: number } | null = null;
  ed.state.doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return;
    const i = node.text.indexOf(needle);
    if (i !== -1) found = { from: pos + i, to: pos + i + needle.length };
  });
  if (!found) throw new Error(`"${needle}" not in the document`);
  return found;
}

const topLevelTypes = (ed: Editor) => (ed.getJSON().content ?? []).map((n) => n.type);
const plain = (ed: Editor) => ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n');

describe('createEditorTarget.insertBlocks', () => {
  it('puts the block after the paragraph that holds the selection and keeps everything else', () => {
    const ed = open(['first', 'second', 'third']);
    const target = createEditorTarget(ed, rangeOf(ed, 'second'), 'second');
    expect(target.insertBlocks([mermaidBlock], 'after-selection')).toBe('after-selection');
    expect(topLevelTypes(ed)).toEqual(['paragraph', 'paragraph', 'codeBlock', 'paragraph']);
    expect(plain(ed)).toBe('first\nsecond\nflowchart TD\n  A --> B\nthird');
  });

  it('appends at the end of the note when asked to', () => {
    const ed = open(['first', 'second']);
    const target = createEditorTarget(ed, rangeOf(ed, 'first'), 'first');
    expect(target.insertBlocks([para('added')], 'end')).toBe('end');
    expect(plain(ed)).toBe('first\nsecond\nadded');
  });

  it('falls back to the end of the note, and says so, once the document has changed', () => {
    const ed = open(['first', 'second']);
    const target = createEditorTarget(ed, rangeOf(ed, 'first'), 'first');
    ed.commands.insertContentAt(1, 'Z');
    expect(target.isCurrent()).toBe(false);
    expect(target.insertBlocks([para('added')], 'after-selection')).toBe('end');
    expect(plain(ed)).toBe('Zfirst\nsecond\nadded');
  });

  it('is one undo step', () => {
    const ed = open(['first', 'second']);
    const before = plain(ed);
    createEditorTarget(ed, rangeOf(ed, 'first'), 'first').insertBlocks([para('a'), para('b')], 'end');
    ed.commands.undo();
    expect(plain(ed)).toBe(before);
  });

  it('changes nothing in a read-only editor or for an empty block list', () => {
    const ro = open(['first'], false);
    expect(createEditorTarget(ro, { from: 1, to: 1 }, '').insertBlocks([para('x')], 'end')).toBeNull();
    expect(plain(ro)).toBe('first');
    ro.destroy();
    const ed = open(['first']);
    expect(createEditorTarget(ed, { from: 1, to: 1 }, '').insertBlocks([], 'end')).toBeNull();
    expect(plain(ed)).toBe('first');
  });
});

describe('createEditorTarget.replaceSelection', () => {
  it('replaces exactly the selection, turns new lines into hard breaks, and undoes in one step', () => {
    const ed = open(['keep this', 'replace me please', 'keep that']);
    const before = ed.getJSON();
    const target = createEditorTarget(ed, rangeOf(ed, 'replace me'), 'replace me');
    expect(target.replaceSelection('A\nB')).toBe(true);
    const paragraph = (ed.getJSON().content ?? [])[1];
    expect((paragraph.content ?? []).map((n) => n.type === 'text' ? n.text : n.type)).toEqual(['A', 'hardBreak', 'B please']);
    expect(topLevelTypes(ed)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    ed.commands.undo();
    expect(ed.getJSON()).toEqual(before);
  });

  it('refuses, and leaves the document alone, once the document has changed', () => {
    const ed = open(['keep this', 'replace me please']);
    const target = createEditorTarget(ed, rangeOf(ed, 'replace me'), 'replace me');
    ed.commands.insertContentAt(1, 'Z');
    const edited = ed.getJSON();
    expect(target.replaceSelection('new')).toBe(false);
    expect(ed.getJSON()).toEqual(edited);
  });

  it('refuses when the document is unchanged but the text in the range is not what the action started on', () => {
    const ed = open(['keep this', 'replace me please']);
    const range = rangeOf(ed, 'replace me');
    const target = createEditorTarget(ed, range, 'something else entirely');
    const before = ed.getJSON();
    expect(target.isCurrent()).toBe(true);
    expect(target.replaceSelection('rewritten')).toBe(false);
    expect(ed.getJSON()).toEqual(before);
  });

  it('refuses when the action started on the whole note (no selection)', () => {
    const ed = open(['only paragraph']);
    const target = createEditorTarget(ed, { from: 1, to: 1 }, '');
    expect(target.replaceSelection('new')).toBe(false);
    expect(plain(ed)).toBe('only paragraph');
  });

  it('refuses an empty replacement and a destroyed editor', () => {
    const ed = open(['replace me']);
    const target = createEditorTarget(ed, rangeOf(ed, 'replace me'), 'replace me');
    expect(target.replaceSelection('   ')).toBe(false);
    ed.destroy();
    expect(target.isCurrent()).toBe(false);
    expect(target.replaceSelection('new')).toBe(false);
    expect(target.insertBlocks([para('x')], 'end')).toBeNull();
  });
});

describe('createEditorTarget.replaceSelection keeps what it cannot rewrite', () => {
  const listDoc: JSONContent = {
    type: 'doc',
    content: [
      para('before'),
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [para('inside item')] }, { type: 'listItem', content: [para('second item')] }],
      },
      para('after'),
    ],
  };
  const imageDoc: JSONContent = {
    type: 'doc',
    content: [para('first'), { type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } }, para('second')],
  };
  const selectAll = (ed: Editor) => ({ from: 1, to: ed.state.doc.content.size - 1 });
  const textOf = (ed: Editor, r: { from: number; to: number }) => ed.state.doc.textBetween(r.from, r.to, '\n');

  it('refuses a selection that contains an image, and leaves the document alone', () => {
    editor = new Editor({ extensions: createRichTextExtensions(), content: imageDoc });
    const range = selectAll(editor);
    const target = createEditorTarget(editor, range, textOf(editor, range));
    const before = editor.getJSON();
    expect(target.replaceSelection('rewritten')).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it('refuses a selection that swallows whole list items', () => {
    editor = new Editor({ extensions: createRichTextExtensions(), content: listDoc });
    const range = selectAll(editor);
    const target = createEditorTarget(editor, range, textOf(editor, range));
    const before = editor.getJSON();
    expect(target.replaceSelection('rewritten')).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it('refuses a selection that runs from one list item into the next, so the items are not merged', () => {
    editor = new Editor({ extensions: createRichTextExtensions(), content: listDoc });
    const from = rangeOf(editor, 'item').from; // inside "inside item"
    const second = rangeOf(editor, 'second');
    const range = { from, to: second.from + 3 };
    const target = createEditorTarget(editor, range, textOf(editor, range));
    const before = editor.getJSON();
    expect(target.replaceSelection('rewritten')).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it('still rewrites text inside a single list item', () => {
    editor = new Editor({ extensions: createRichTextExtensions(), content: listDoc });
    const range = rangeOf(editor, 'inside item');
    const target = createEditorTarget(editor, range, 'inside item');
    expect(target.replaceSelection('rewritten')).toBe(true);
    expect(plain(editor)).toContain('rewritten');
    expect(plain(editor)).toContain('second item');
  });
});
