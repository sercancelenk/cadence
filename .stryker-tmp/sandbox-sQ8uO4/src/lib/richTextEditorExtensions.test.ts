// @ts-nocheck
import { Editor } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';
import { describe, expect, it } from 'vitest';
import { createRichTextExtensions, RichTextImage } from './richTextEditorExtensions';

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
    expect(json.content?.some((n) => n.type === 'paragraph')).toBe(true);
  });
});

describe('RichTextImage', () => {
  it('parses attachment id and dimensions from HTML attributes', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content:
        '<img src="x" data-attachment-id="id-9" data-width="200" data-height="100" class="rich-editor-image" />',
    });
    let imageNode: { attrs: Record<string, unknown> } | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') imageNode = node;
    });
    expect(imageNode?.attrs.attachmentId).toBe('id-9');
    expect(imageNode?.attrs.width).toBe(200);
    expect(imageNode?.attrs.height).toBe(100);
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
    let imageNode: { attrs: Record<string, unknown> } | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') imageNode = node;
    });
    expect(imageNode?.attrs.attachmentId).toBeNull();
    expect(imageNode?.attrs.width).toBeNull();
    expect(imageNode?.attrs.height).toBeNull();
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
    let imageNode: { attrs: Record<string, unknown> } | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') imageNode = node;
    });
    expect(imageNode?.attrs.width).toBe(64);
    expect(imageNode?.attrs.height).toBe(32);
    editor.destroy();
  });
});
