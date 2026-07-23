import { Editor } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';
import { describe, expect, it } from 'vitest';
import { applyCodeBlockLanguage } from './richTextCodeBlock';
import { createRichTextExtensions } from './richTextEditorExtensions';
import { isMermaidLanguage, RICH_TEXT_CODE_LANGUAGES } from './richTextLowlight';

describe('rich text code languages', () => {
  it('includes mermaid in the picker list', () => {
    expect(RICH_TEXT_CODE_LANGUAGES.some((l) => l.value === 'mermaid')).toBe(true);
  });

  it('detects mermaid language case-insensitively', () => {
    expect(isMermaidLanguage('mermaid')).toBe(true);
    expect(isMermaidLanguage('Mermaid')).toBe(true);
    expect(isMermaidLanguage('javascript')).toBe(false);
    expect(isMermaidLanguage(null)).toBe(false);
  });
});

describe('RichTextCodeBlock persistence', () => {
  it('parses HTML pre/code into a codeBlock node', () => {
    const json = generateJSON(
      '<pre><code>const x: number = 1;</code></pre>',
      createRichTextExtensions(),
    );
    const block = (json.content ?? []).find((n: { type: string }) => n.type === 'codeBlock') as
      | { type: string; content?: { text?: string }[] }
      | undefined;
    expect(block?.type).toBe('codeBlock');
    expect(block?.content?.[0]?.text).toContain('const x');
  });

  it('sets language via updateAttributes and keeps source text', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'javascript' },
            content: [{ type: 'text', text: 'const answer = 42;' }],
          },
        ],
      },
    });
    editor.commands.updateAttributes('codeBlock', { language: 'typescript' });
    const block = editor.getJSON().content?.[0] as {
      attrs?: { language?: string };
      content?: { text?: string }[];
    };
    expect(block.attrs?.language).toBe('typescript');
    expect(block.content?.[0]?.text).toBe('const answer = 42;');
    editor.destroy();
  });

  it('persists collapsed without dropping source text (legacy default open)', () => {
    const source = 'line one\nline two\nline three';
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'python' },
            content: [{ type: 'text', text: source }],
          },
        ],
      },
    });
    const before = editor.getJSON().content?.[0] as {
      attrs?: { collapsed?: boolean; language?: string };
      content?: { text?: string }[];
    };
    expect(before.attrs?.collapsed).toBe(false);

    editor.commands.updateAttributes('codeBlock', { collapsed: true });
    const after = editor.getJSON().content?.[0] as typeof before;
    expect(after.attrs?.collapsed).toBe(true);
    expect(after.attrs?.language).toBe('python');
    expect(after.content?.[0]?.text).toBe(source);

    editor.commands.updateAttributes('codeBlock', { collapsed: false });
    const reopened = editor.getJSON().content?.[0] as typeof before;
    expect(reopened.attrs?.collapsed).toBe(false);
    expect(reopened.content?.[0]?.text).toBe(source);
    editor.destroy();
  });

  it('loads legacy codeBlock JSON that omits collapsed', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'go' },
            content: [{ type: 'text', text: 'package main' }],
          },
        ],
      },
    });
    const block = editor.getJSON().content?.[0] as {
      attrs?: { collapsed?: boolean };
      content?: { text?: string }[];
    };
    expect(block.attrs?.collapsed).toBe(false);
    expect(block.content?.[0]?.text).toBe('package main');
    editor.destroy();
  });

  it('round-trips mermaid source as codeBlock language without storing SVG', () => {
    const source = 'flowchart LR\n  A-->B';
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'mermaid' },
            content: [{ type: 'text', text: source }],
          },
        ],
      },
    });
    const json = editor.getJSON();
    const block = json.content?.[0] as {
      type: string;
      attrs?: { language?: string };
      content?: { text?: string }[];
    };
    expect(block.type).toBe('codeBlock');
    expect(block.attrs?.language).toBe('mermaid');
    expect(block.content?.[0]?.text).toBe(source);
    expect(JSON.stringify(json)).not.toContain('<svg');
    editor.destroy();
  });

  it('preserves legacy codeBlock nodes without language', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: null },
            content: [{ type: 'text', text: 'echo hi' }],
          },
        ],
      },
    });
    let found = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'codeBlock') {
        found = true;
        expect(node.textContent).toBe('echo hi');
      }
    });
    expect(found).toBe(true);
    editor.destroy();
  });

  it('applyCodeBlockLanguage switches mermaid ↔ js without unwrapping', () => {
    const source = 'flowchart LR\n  A-->B';
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'mermaid' },
            content: [{ type: 'text', text: source }],
          },
        ],
      },
    });
    editor.commands.focus('start');
    expect(applyCodeBlockLanguage(editor, 'javascript')).toBe(true);
    let block = editor.getJSON().content?.[0] as {
      type: string;
      attrs?: { language?: string };
      content?: { text?: string }[];
    };
    expect(block.type).toBe('codeBlock');
    expect(block.attrs?.language).toBe('javascript');
    expect(block.content?.[0]?.text).toBe(source);

    expect(applyCodeBlockLanguage(editor, 'mermaid')).toBe(true);
    block = editor.getJSON().content?.[0] as typeof block;
    expect(block.type).toBe('codeBlock');
    expect(block.attrs?.language).toBe('mermaid');
    expect(block.content?.[0]?.text).toBe(source);
    editor.destroy();
  });

  it('applyCodeBlockLanguage inserts a new code block when not already in one', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      },
    });
    editor.commands.setTextSelection(1);
    expect(applyCodeBlockLanguage(editor, 'python')).toBe(true);
    const block = editor.getJSON().content?.find((n) => n.type === 'codeBlock') as
      | { type: string; attrs?: { language?: string } }
      | undefined;
    expect(block?.type).toBe('codeBlock');
    expect(block?.attrs?.language).toBe('python');
    editor.destroy();
  });

  it('applyCodeBlockLanguage inserts a plaintext code block when language is null', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }],
      },
    });
    editor.commands.setTextSelection(1);
    expect(applyCodeBlockLanguage(editor, null)).toBe(true);
    const block = editor.getJSON().content?.find((n) => n.type === 'codeBlock') as
      | { type: string; attrs?: { language?: string | null } }
      | undefined;
    expect(block?.type).toBe('codeBlock');
    editor.destroy();
  });

  it('pastes HTML-looking plain as a text node without splitting the fence', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'javascript' },
            content: [{ type: 'text', text: 'before' }],
          },
        ],
      },
    });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    // Mirrors RichTextEditor codeBlock paste: text node, not string insertContent.
    editor.commands.insertContent({ type: 'text', text: '<div class="x">hi</div>' });
    const top = editor.getJSON().content ?? [];
    expect(top).toHaveLength(1);
    expect(top[0]?.type).toBe('codeBlock');
    const text = ((top[0] as { content?: { text?: string }[] }).content ?? [])
      .map((n) => n.text ?? '')
      .join('');
    expect(text).toContain('<div class="x">hi</div>');
    editor.destroy();
  });
});
