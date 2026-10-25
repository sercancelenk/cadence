import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  NOTE_FILE_MAX_BYTES,
  checkOpenableNoteFile,
  decodeNoteFileText,
  checkSaveTargetFree,
  validateToolSavePayload,
  pickSaveVariant,
} = require('./noteFileIo.cjs');

describe('validateToolSavePayload as used for notes', () => {
  const note = (over: Record<string, unknown> = {}) => ({
    suggestedName: 'Plan.md',
    defaultExt: 'md',
    extensions: ['md', 'txt', 'html'],
    variants: { md: '# hi', txt: 'hi', html: '<p>hi</p>' },
    ...over,
  });

  it('accepts a note sent in all three formats', () => {
    const r = validateToolSavePayload(note());
    expect(r.ok).toBe(true);
    expect(r.variants).toEqual({ md: '# hi', txt: 'hi', html: '<p>hi</p>' });
  });

  it('strips directory parts and control characters from the suggested name', () => {
    const r = validateToolSavePayload(note({ suggestedName: '../../etc/pass\u0000wd.md' }));
    expect(r.ok).toBe(true);
    expect(r.suggestedName).toBe('pass-wd.md');
  });

  it('rejects a note whose any format is larger than the size cap', () => {
    const big = 'x'.repeat(NOTE_FILE_MAX_BYTES + 1);
    expect(validateToolSavePayload(note({ variants: { md: '# hi', txt: big } })).ok).toBe(false);
  });
});

describe('checkOpenableNoteFile', () => {
  it('allows md, markdown, txt, html and htm case-insensitively', () => {
    for (const name of ['a.md', 'a.MARKDOWN', 'a.txt', 'a.Html', 'a.htm']) {
      expect(checkOpenableNoteFile(name, 10).ok).toBe(true);
    }
  });

  it('rejects other extensions and oversized files with a message', () => {
    expect(checkOpenableNoteFile('a.pdf', 10)).toMatchObject({ ok: false });
    const tooBig = checkOpenableNoteFile('a.md', NOTE_FILE_MAX_BYTES + 1);
    expect(tooBig.ok).toBe(false);
    expect(tooBig.error).toMatch(/too large/i);
  });

  it('reports the normalized extension without the dot', () => {
    expect(checkOpenableNoteFile('Notes.MD', 1)).toEqual({ ok: true, ext: 'md' });
  });
});

describe('decodeNoteFileText', () => {
  it('strips a UTF-8 BOM and normalizes CRLF', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\r\nb')]);
    expect(decodeNoteFileText(buf)).toBe('a\nb');
  });

  it('decodes UTF-16 LE with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf16le')]);
    expect(decodeNoteFileText(buf)).toBe('hi');
  });
});

describe('checkSaveTargetFree', () => {
  it('passes when no sibling .tmp file exists', () => {
    expect(checkSaveTargetFree('/docs/note.md', () => false)).toEqual({ ok: true });
  });

  it('refuses to save over a user file that the staged write would truncate', () => {
    const seen: string[] = [];
    const r = checkSaveTargetFree('/docs/note.md', (p: string) => {
      seen.push(p);
      return true;
    });
    expect(seen).toEqual(['/docs/note.md.tmp']);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('note.md.tmp');
  });
});

describe('validateToolSavePayload', () => {
  const good = () => ({
    suggestedName: 'Plan.md',
    defaultExt: 'md',
    extensions: ['md', 'txt', 'html'],
    variants: { md: '# Plan', txt: 'Plan', html: '<h1>Plan</h1>' },
  });

  it('accepts a well-formed payload and derives dialog filters, default first', () => {
    const r = validateToolSavePayload(good());
    expect(r.ok).toBe(true);
    expect(r.suggestedName).toBe('Plan.md');
    expect(r.filters.map((f: { extensions: string[] }) => f.extensions[0])).toEqual(['md', 'txt', 'html', '*']);
  });

  it('accepts one verbatim variant for any extension', () => {
    const r = validateToolSavePayload({ suggestedName: 'a.json', defaultExt: 'json', extensions: ['json', 'txt'], variants: { '*': '{}' } });
    expect(r.ok).toBe(true);
  });

  it('rejects missing or empty variants, non-string values and unknown keys', () => {
    expect(validateToolSavePayload(null).ok).toBe(false);
    expect(validateToolSavePayload({ ...good(), variants: {} }).ok).toBe(false);
    expect(validateToolSavePayload({ ...good(), variants: { md: 5 } }).ok).toBe(false);
    expect(validateToolSavePayload({ ...good(), variants: { exe: 'x' } }).ok).toBe(false);
  });

  it('rejects an oversized variant', () => {
    const big = 'x'.repeat(NOTE_FILE_MAX_BYTES + 1);
    expect(validateToolSavePayload({ ...good(), variants: { md: big } }).ok).toBe(false);
  });

  it('rejects a default extension that no variant can serve', () => {
    expect(validateToolSavePayload({ ...good(), defaultExt: 'html', variants: { md: 'x' } }).ok).toBe(false);
  });

  it('does not treat inherited object properties as a variant', () => {
    expect(validateToolSavePayload({ ...good(), defaultExt: 'toString', variants: { md: 'x' } }).ok).toBe(false);
    expect(validateToolSavePayload({ ...good(), defaultExt: 'valueOf', extensions: ['md', 'valueOf'], variants: { md: 'x' } }).ok).toBe(false);
  });

  it('rejects unsafe extensions and cleans the file name', () => {
    expect(validateToolSavePayload({ ...good(), extensions: ['md', '../x'] }).ok).toBe(false);
    const r = validateToolSavePayload({ ...good(), suggestedName: '../../etc/pass\u0000wd.md' });
    expect(r.ok).toBe(true);
    expect(r.suggestedName).not.toMatch(/[\\/]/);
    expect(r.suggestedName).not.toContain('\u0000');
  });
});

describe('pickSaveVariant', () => {
  const variants = { md: 'MD', txt: 'TXT', html: 'HTML' };

  it('picks the variant that matches the extension the user typed, ignoring case', () => {
    expect(pickSaveVariant(variants, '/tmp/a.md', 'md')).toBe('MD');
    expect(pickSaveVariant(variants, '/tmp/a.TXT', 'md')).toBe('TXT');
    expect(pickSaveVariant(variants, 'C:\\docs\\a.html', 'md')).toBe('HTML');
  });

  it('falls back to the default variant for an unknown or missing extension', () => {
    expect(pickSaveVariant(variants, '/tmp/a.docx', 'md')).toBe('MD');
    expect(pickSaveVariant(variants, '/tmp/notes', 'md')).toBe('MD');
    expect(pickSaveVariant(variants, '/tmp/.hidden', 'txt')).toBe('TXT');
  });

  it('writes a verbatim variant for any extension', () => {
    expect(pickSaveVariant({ '*': 'RAW' }, '/tmp/a.yml', 'json')).toBe('RAW');
    expect(pickSaveVariant({ '*': 'RAW' }, '/tmp/a', 'json')).toBe('RAW');
  });

  it('only ever returns text, even when the typed extension names an inherited property', () => {
    expect(pickSaveVariant(variants, '/tmp/a.constructor', 'md')).toBe('MD');
    expect(pickSaveVariant(variants, '/tmp/a.tostring', 'md')).toBe('MD');
  });

  it('never alters or inspects anything but the extension', () => {
    expect(pickSaveVariant(variants, '/tmp/dir.md/file', 'txt')).toBe('TXT');
  });
});

