import { Editor } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';
import { describe, expect, it } from 'vitest';
import type { Node as PmNode } from '@tiptap/pm/model';
import { createRichTextExtensions, isSafeEditorLinkUrl } from './richTextEditorExtensions';

describe('isSafeEditorLinkUrl', () => {
  it('allows http(s) and mailto links', () => {
    expect(isSafeEditorLinkUrl('https://example.com')).toBe(true);
    expect(isSafeEditorLinkUrl('http://example.com/x?y=1')).toBe(true);
    expect(isSafeEditorLinkUrl('mailto:user@example.com')).toBe(true);
  });

  it('rejects script and other dangerous protocols', () => {
    expect(isSafeEditorLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeEditorLinkUrl('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeEditorLinkUrl('data:text/html,<script>1</script>')).toBe(false);
    expect(isSafeEditorLinkUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeEditorLinkUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeEditorLinkUrl('')).toBe(false);
    expect(isSafeEditorLinkUrl(null)).toBe(false);
    expect(isSafeEditorLinkUrl('not a url')).toBe(false);
  });
});

describe('Link sanitization in pasted/imported HTML', () => {
  it('drops javascript: hrefs but keeps safe links when parsing HTML', () => {
    const json = generateJSON(
      '<p><a href="javascript:alert(1)">evil</a> <a href="https://ok.com">good</a></p>',
      createRichTextExtensions(),
    );
    const marks: string[] = [];
    const walk = (node: { marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: unknown[] }) => {
      for (const m of node.marks ?? []) {
        if (m.type === 'link') marks.push(String(m.attrs?.href ?? ''));
      }
      for (const c of node.content ?? []) walk(c as typeof node);
    };
    walk(json as never);
    expect(marks).toContain('https://ok.com');
    expect(marks.some((h) => h.startsWith('javascript:'))).toBe(false);
  });
});

describe('createRichTextExtensions', () => {
  it('builds a non-empty extension list with default placeholder', () => {
    const exts = createRichTextExtensions();
    expect(exts.length).toBeGreaterThan(5);
  });

  it('accepts a custom placeholder', () => {
    const exts = createRichTextExtensions('Type here…');
    expect(exts.length).toBeGreaterThan(0);
  });

  it('parses rich HTML into the same node types the live editor uses', () => {
    const html =
      '<p>Hello</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true">Done</li></ul>' +
      '<time data-date-chip data-iso="2026-05-31" data-label="May 31, 2026">May 31, 2026</time>' +
      '<img src="https://example.com/x.png" data-attachment-id="att-1" width="120" height="80" />';
    const json = generateJSON(html, createRichTextExtensions());
    expect(json.type).toBe('doc');
    expect(json.content?.some((n: { type: string }) => n.type === 'paragraph')).toBe(true);
  });
});

describe('RichTextImage', () => {
  it('parses attachment id and dimensions from HTML attributes', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content:
        '<img src="x" data-attachment-id="id-9" data-width="200" data-height="100" class="rich-editor-image" />',
    });
    let imageNode: PmNode | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') imageNode = node;
    });
    const attrs = (imageNode as PmNode | null)?.attrs as Record<string, unknown> | undefined;
    expect(attrs?.attachmentId).toBe('id-9');
    expect(attrs?.width).toBe(200);
    expect(attrs?.height).toBe(100);
    editor.destroy();
  });

  it('renderHTML includes attachment and size attrs when present', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: '<img src="x" data-attachment-id="a1" width="50" height="40" class="rich-editor-image" />',
    });
    const html = editor.getHTML();
    expect(html).toContain('data-attachment-id="a1"');
    expect(html).toContain('width="50"');
    editor.destroy();
  });

  it('parses a minimal image without optional sidecar attrs', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: '<img src="https://example.com/p.png" class="rich-editor-image" />',
    });
    let imageNode: PmNode | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') imageNode = node;
    });
    const attrs = (imageNode as PmNode | null)?.attrs as Record<string, unknown> | undefined;
    expect(attrs?.attachmentId).toBeNull();
    expect(attrs?.width).toBeNull();
    expect(attrs?.height).toBeNull();
    const html = editor.getHTML();
    expect(html).not.toContain('data-attachment-id');
    expect(html).not.toContain('data-width');
    editor.destroy();
  });

  it('reads width and height from width/height attributes when data-* attrs are absent', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: '<img src="x" width="64" height="32" class="rich-editor-image" />',
    });
    let imageNode: PmNode | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') imageNode = node;
    });
    const attrs = (imageNode as PmNode | null)?.attrs as Record<string, unknown> | undefined;
    expect(attrs?.width).toBe(64);
    expect(attrs?.height).toBe(32);
    editor.destroy();
  });
});

describe('save-to-file shortcut vs. strikethrough', () => {
  function press(editor: Editor, init: KeyboardEventInit) {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    editor.view.dom.dispatchEvent(event);
    return event;
  }
  function makeEditor() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = new Editor({
      element: host,
      extensions: createRichTextExtensions(),
      content: '<p>hello world</p>',
    });
    editor.commands.selectAll();
    return editor;
  }

  it('does not strike the selection when Shift+Mod+S is pressed (that key saves to a file)', () => {
    const editor = makeEditor();
    press(editor, { key: 'S', code: 'KeyS', keyCode: 83, ctrlKey: true, shiftKey: true });
    expect(editor.isActive('strike')).toBe(false);
    editor.destroy();
  });

  it('leaves the keystroke to the window listener, which saves the file', () => {
    const editor = makeEditor();
    let reachedWindow = false;
    const onKey = () => {
      reachedWindow = true;
    };
    window.addEventListener('keydown', onKey);
    press(editor, { key: 'S', code: 'KeyS', keyCode: 83, ctrlKey: true, shiftKey: true });
    window.removeEventListener('keydown', onKey);
    expect(reachedWindow).toBe(true);
    editor.destroy();
  });

  it('still strikes through with Shift+Mod+X', () => {
    const editor = makeEditor();
    press(editor, { key: 'X', code: 'KeyX', keyCode: 88, ctrlKey: true, shiftKey: true });
    expect(editor.isActive('strike')).toBe(true);
    editor.destroy();
  });

  it('keeps the toolbar strikethrough command working', () => {
    const editor = makeEditor();
    editor.commands.toggleStrike();
    expect(editor.isActive('strike')).toBe(true);
    editor.destroy();
  });
});
