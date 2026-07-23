import { describe, expect, it } from 'vitest';
import {
  hasSemanticRichHtml,
  looksLikeMarkdown,
  markdownPasteContent,
  shouldPasteClipboardAsMarkdown,
} from './richTextPaste';

describe('richTextPaste', () => {
  describe('looksLikeMarkdown', () => {
    it('detects headings, lists, and task items', () => {
      expect(looksLikeMarkdown('# Title')).toBe(true);
      expect(looksLikeMarkdown('## Section\n\nParagraph')).toBe(true);
      expect(looksLikeMarkdown('- item one\n- item two')).toBe(true);
      expect(looksLikeMarkdown('- [ ] todo\n- [x] done')).toBe(true);
    });

    it('detects inline markdown on multi-line paste', () => {
      expect(looksLikeMarkdown('Intro\n\n**bold** and `code`')).toBe(true);
    });

    it('detects single-line inline markdown with markers', () => {
      expect(looksLikeMarkdown('**bold** text')).toBe(true);
      expect(looksLikeMarkdown('[link](https://example.com)')).toBe(true);
    });

    it('does not treat plain prose as markdown', () => {
      expect(looksLikeMarkdown('Hello world')).toBe(false);
      expect(looksLikeMarkdown('Meeting at 3pm — bring notes')).toBe(false);
    });
  });

  describe('hasSemanticRichHtml', () => {
    it('recognises rich editor HTML', () => {
      expect(hasSemanticRichHtml('<h1>Title</h1><p>Text</p>')).toBe(true);
      expect(hasSemanticRichHtml('<ul><li>a</li></ul>')).toBe(true);
      expect(hasSemanticRichHtml('<p><strong>bold</strong></p>')).toBe(true);
      expect(hasSemanticRichHtml('<p>intro</p><pre><code># comment\nx = 1</code></pre>')).toBe(
        true,
      );
    });

    it('ignores syntax-highlighter wrappers from code editors', () => {
      expect(
        hasSemanticRichHtml(
          "<meta charset='utf-8'><div style='color:#ccc'># Heading</div>",
        ),
      ).toBe(false);
    });
  });

  describe('shouldPasteClipboardAsMarkdown', () => {
    it('prefers markdown when plain is GFM and HTML is not semantic', () => {
      const dt = {
        getData: (type: string) => {
          if (type === 'text/plain') return '## Hello\n\n**world**';
          if (type === 'text/html') return "<meta charset='utf-8'><div># Hello</div>";
          return '';
        },
      } as DataTransfer;
      expect(shouldPasteClipboardAsMarkdown(dt)).toBe(true);
    });

    it('defers to native paste when semantic HTML is present', () => {
      const dt = {
        getData: (type: string) => {
          if (type === 'text/plain') return '## Hello';
          if (type === 'text/html') return '<h2>Hello</h2><p><strong>world</strong></p>';
          return '';
        },
      } as DataTransfer;
      expect(shouldPasteClipboardAsMarkdown(dt)).toBe(false);
    });

    it('never markdown-parses Cadence code-only clipboard HTML (even if plain looks like MD)', () => {
      const dt = {
        getData: (type: string) => {
          if (type === 'text/plain') return '# comment\nx = 1';
          if (type === 'text/html') {
            return '<!--cadence-clipboard:plain--><div><p># comment</p><p>x = 1</p></div>';
          }
          return '';
        },
      } as DataTransfer;
      expect(shouldPasteClipboardAsMarkdown(dt)).toBe(false);
    });

    it('defers to native paste for mixed prose+code HTML (plain may look like markdown)', () => {
      const dt = {
        getData: (type: string) => {
          if (type === 'text/plain') return 'intro\n# comment\nx = 1';
          if (type === 'text/html') {
            return '<p>intro</p><pre><code># comment\nx = 1</code></pre>';
          }
          return '';
        },
      } as DataTransfer;
      expect(shouldPasteClipboardAsMarkdown(dt)).toBe(false);
    });
  });

  describe('markdownPasteContent', () => {
    it('returns ProseMirror nodes for valid markdown', () => {
      const nodes = markdownPasteContent('## Title\n\nParagraph');
      expect(nodes?.length).toBeGreaterThan(0);
      expect(JSON.stringify(nodes)).toContain('heading');
    });

    it('returns null for blank markdown', () => {
      expect(markdownPasteContent('   ')).toBeNull();
    });
  });
});
