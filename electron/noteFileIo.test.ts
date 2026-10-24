import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  NOTE_FILE_MAX_BYTES,
  validateNoteSavePayload,
  checkOpenableNoteFile,
  decodeNoteFileText,
} = require('./noteFileIo.cjs');

describe('validateNoteSavePayload', () => {
  it('accepts a well-formed payload', () => {
    const r = validateNoteSavePayload({ suggestedName: 'a.md', format: 'md', content: '# hi' });
    expect(r).toEqual({ ok: true, suggestedName: 'a.md', format: 'md', content: '# hi' });
  });

  it('rejects unknown formats, non-string content and missing payloads', () => {
    expect(validateNoteSavePayload({ suggestedName: 'a', format: 'pdf', content: 'x' }).ok).toBe(false);
    expect(validateNoteSavePayload({ suggestedName: 'a', format: 'md', content: 5 }).ok).toBe(false);
    expect(validateNoteSavePayload(null).ok).toBe(false);
  });

  it('rejects content larger than the size cap', () => {
    const big = 'x'.repeat(NOTE_FILE_MAX_BYTES + 1);
    expect(validateNoteSavePayload({ suggestedName: 'a', format: 'txt', content: big }).ok).toBe(false);
  });

  it('strips directory parts and control characters from the suggested name', () => {
    const r = validateNoteSavePayload({ suggestedName: '../../etc/pass\u0000wd.md', format: 'md', content: '' });
    expect(r.ok).toBe(true);
    expect(r.suggestedName).toBe('pass-wd.md');
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
