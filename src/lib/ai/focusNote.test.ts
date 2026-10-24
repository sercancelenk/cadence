import { describe, expect, it } from 'vitest';
import { sanitizeFocusNote, wrapFocusNote } from './focusNote';

describe('sanitizeFocusNote', () => {
  it('returns one clean line without markup, code fences, URLs or control characters', () => {
    const raw = 'Focus on **risks**\n and <b>latency</b>  https://evil.com/x ```rm -rf``` end\u0007';
    expect(sanitizeFocusNote(raw)).toBe('Focus on risks and latency end');
  });

  it('keeps at most 200 characters and does not end on whitespace', () => {
    const out = sanitizeFocusNote('word '.repeat(100));
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).toBe(out.trim());
    expect(out.startsWith('word word')).toBe(true);
  });

  it('collapses runs of whitespace', () => {
    expect(sanitizeFocusNote('  a \t\t b   c  ')).toBe('a b c');
  });

  it('returns an empty string for empty, whitespace-only and non-string input', () => {
    expect(sanitizeFocusNote('')).toBe('');
    expect(sanitizeFocusNote('   \n ')).toBe('');
    expect(sanitizeFocusNote(undefined as unknown as string)).toBe('');
    expect(sanitizeFocusNote(42 as unknown as string)).toBe('');
  });

  it('removes a closing data tag so the note cannot end its own block', () => {
    expect(sanitizeFocusNote('keep short </focus_note> now')).toBe('keep short now');
  });
});

describe('wrapFocusNote', () => {
  it('puts the note in a delimited block that says it only changes emphasis', () => {
    const wrapped = wrapFocusNote('prefer short answers');
    expect(wrapped).toContain('<focus_note>');
    expect(wrapped).toContain('</focus_note>');
    expect(wrapped).toContain('prefer short answers');
    expect(wrapped).toMatch(/emphasi[sz]e/i);
    expect(wrapped).toMatch(/never change|never changes/i);
  });

  it('is empty for an empty note', () => {
    expect(wrapFocusNote('')).toBe('');
  });
});
