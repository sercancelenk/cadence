import { describe, expect, it } from 'vitest';
import { clip, isBlankText } from './shared';

describe('clip', () => {
  it('returns short text unchanged and cuts long text by characters', () => {
    expect(clip('abc', 5)).toBe('abc');
    expect(clip('abcdef', 3)).toBe('abc');
  });

  it('never cuts a surrogate pair', () => {
    expect(clip('😀😀😀', 2)).toBe('😀😀');
  });

  it('never cuts inside a ZWJ emoji, a flag or a base letter with its combining marks', () => {
    const family = '👨‍👩‍👧';
    expect(clip(`ab${family}cd`, 3)).toBe(`ab${family}`); // the family counts as one character
    expect(clip(`ab${family}cd`, 2)).toBe('ab');
    expect(clip(`a${family}b`, 2)).toBe(`a${family}`);
    expect(clip('🇹🇷🇩🇪', 1)).toBe('🇹🇷');
    expect(clip('éé', 1)).toBe('é');
  });
});

describe('isBlankText', () => {
  it.each(['', '  \n', '​‍', '­', '͏', 'ㅤ', 'ᅟ', '️', '᠎', '­ ㅤ️'])(
    'treats %j as blank',
    (text) => {
      expect(isBlankText(text)).toBe(true);
    },
  );
  it('keeps real text', () => {
    expect(isBlankText('a')).toBe(false);
    expect(isBlankText('­a')).toBe(false);
  });
});
