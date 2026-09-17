import { act, renderHook } from '@testing-library/react';
import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRichTextExtensions } from '../lib/richTextEditorExtensions';
import { readRichTextToolbarState } from '../lib/richTextToolbarState';
import { useEditorToolbarState } from './useEditorToolbarState';

let editor: Editor | null = null;

function editorWith(text = 'hello world') {
  editor = new Editor({
    extensions: createRichTextExtensions(),
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('useEditorToolbarState', () => {
  it('reads the snapshot once per transaction', () => {
    const ed = editorWith();
    let reads = 0;
    const read = (e: Editor) => {
      reads += 1;
      return readRichTextToolbarState(e);
    };

    renderHook(() => useEditorToolbarState(ed, read));
    reads = 0;

    // A selection move dispatches a transaction and would previously also emit
    // `selectionUpdate`, running the whole snapshot twice for one keystroke.
    ed.commands.setTextSelection({ from: 1, to: 6 });
    expect(reads).toBe(1);

    ed.commands.insertContent('!');
    expect(reads).toBe(2);
  });

  it('re-renders only when the snapshot actually changes', () => {
    const ed = editorWith();
    const { result } = renderHook(() =>
      useEditorToolbarState(ed, readRichTextToolbarState),
    );

    act(() => {
      ed.commands.insertContent('a');
    });
    const afterFirstKeystroke = result.current;

    act(() => {
      ed.commands.insertContent('b');
    });
    expect(result.current).toBe(afterFirstKeystroke);

    act(() => {
      ed.chain().setTextSelection({ from: 1, to: 6 }).toggleBold().run();
    });
    expect(result.current).not.toBe(afterFirstKeystroke);
    expect(result.current.bold).toBe(true);
  });

  it('stops reading after unmount', () => {
    const ed = editorWith();
    let reads = 0;
    const read = (e: Editor) => {
      reads += 1;
      return readRichTextToolbarState(e);
    };

    const { unmount } = renderHook(() => useEditorToolbarState(ed, read));
    unmount();
    reads = 0;

    ed.commands.insertContent('!');
    expect(reads).toBe(0);
  });
});
