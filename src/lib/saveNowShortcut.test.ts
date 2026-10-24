import { describe, expect, it } from 'vitest';
import { isSaveNowShortcut } from './saveNowShortcut';

const ev = (o: Partial<KeyboardEvent>) => o as KeyboardEvent;

describe('isSaveNowShortcut', () => {
  it('matches Cmd+S and Ctrl+S, case-insensitively', () => {
    expect(isSaveNowShortcut(ev({ key: 's', metaKey: true }))).toBe(true);
    expect(isSaveNowShortcut(ev({ key: 'S', ctrlKey: true }))).toBe(true);
  });

  it('matches on the physical S key so non-Latin layouts work too', () => {
    expect(isSaveNowShortcut(ev({ key: 'ы', code: 'KeyS', metaKey: true }))).toBe(true);
  });

  it('leaves Shift+Cmd+S to save-to-file, and ignores plain s and Alt combos', () => {
    expect(isSaveNowShortcut(ev({ key: 'S', metaKey: true, shiftKey: true }))).toBe(false);
    expect(isSaveNowShortcut(ev({ key: 's' }))).toBe(false);
    expect(isSaveNowShortcut(ev({ key: 's', metaKey: true, altKey: true }))).toBe(false);
  });
});
