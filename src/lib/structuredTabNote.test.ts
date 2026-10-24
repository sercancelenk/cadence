import { describe, expect, it } from 'vitest';
import { structuredTabNoteFields } from './structuredTabNote';

describe('structuredTabNoteFields', () => {
  it('uses the tab title and turns the content into a labelled code block', () => {
    const f = structuredTabNoteFields({ title: 'config', content: '{\n  "a": 1\n}', language: 'json' });
    expect(f.title).toBe('config');
    expect(f.bodyFormat).toBe('prosemirror');
    expect(f.body).toContain('"codeBlock"');
    expect(f.body).toContain('"language":"json"');
    expect(f.bodyPlainText).toContain('"a": 1');
  });

  it('labels YAML content', () => {
    const f = structuredTabNoteFields({ title: 'k8s', content: 'a: 1\nb: [x, y]', language: 'yaml' });
    expect(f.body).toContain('"language":"yaml"');
    expect(f.bodyPlainText).toContain('b: [x, y]');
  });

  it('survives content that contains a code fence', () => {
    const content = 'before\n```\ninside\n```\nafter';
    const f = structuredTabNoteFields({ title: 't', content, language: 'yaml' });
    expect(f.bodyPlainText).toContain('```\ninside\n```');
    expect(f.bodyPlainText).toContain('after');
  });

  it('keeps an empty buffer as an empty note body, not an error', () => {
    const f = structuredTabNoteFields({ title: 'empty', content: '', language: 'json' });
    expect(f.title).toBe('empty');
    expect(typeof f.body).toBe('string');
  });
});
