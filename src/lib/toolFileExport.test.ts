import { describe, expect, it } from 'vitest';
import { documentTabFile, structuredTabFile } from './toolFileExport';

const prosemirror = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Merhaba dünya' }] }],
});

describe('documentTabFile', () => {
  it('offers md, txt and html with Markdown as the default', () => {
    const f = documentTabFile({ title: 'Plan', body: prosemirror, bodyFormat: 'prosemirror' });
    expect(f.suggestedName).toBe('Plan.md');
    expect(f.defaultExt).toBe('md');
    expect(f.extensions).toEqual(['md', 'txt', 'html']);
    expect(f.variants.md.startsWith('# Plan')).toBe(true);
    expect(f.variants.md).toContain('Merhaba dünya');
    expect(f.variants.txt).toContain('Merhaba dünya');
    expect(f.variants.html).toContain('<h1>Plan</h1>');
  });

  it('reads a legacy markdown body and cleans an unsafe title', () => {
    const f = documentTabFile({ title: 'a/b:c', body: '# Hello' });
    expect(f.suggestedName).toBe('a-b-c.md');
    expect(f.variants.md).toContain('Hello');
  });
});

describe('structuredTabFile', () => {
  it('writes the buffer verbatim and suggests an extension for its language', () => {
    const json = structuredTabFile({ title: 'config', content: '{\n  "a": 1\n}\n', language: 'json' });
    expect(json.suggestedName).toBe('config.json');
    expect(json.defaultExt).toBe('json');
    expect(json.variants).toEqual({ '*': '{\n  "a": 1\n}\n' });
    expect(json.extensions[0]).toBe('json');

    const yaml = structuredTabFile({ title: 'k8s', content: 'a: 1\n', language: 'yaml' });
    expect(yaml.suggestedName).toBe('k8s.yaml');
    expect(yaml.extensions).toEqual(['yaml', 'yml', 'txt']);
  });
});
