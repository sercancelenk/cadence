import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  editorFontFamilyToCss,
  normalizeAppearancePrefs,
  parseAppearancePrefs,
  parseAppearanceStorage,
  resolveThemeMode,
  serializeAppearancePrefs,
  uiScaleToCssFactor,
  editorFontSizeToCss,
} from './appearancePrefs';

describe('appearancePrefs', () => {
  it('defaults when input is null/invalid', () => {
    expect(parseAppearancePrefs(null, null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearancePrefs('{', null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearancePrefs({ theme: 'neon', uiScale: 200 }).prefs).toEqual(
      DEFAULT_APPEARANCE,
    );
  });

  it('hold-corrupt does not treat unreadable blob as a writable scaffold', () => {
    const read = parseAppearanceStorage('{', 'light');
    expect(read.persistPolicy).toBe('hold-corrupt');
    expect(read.prefs.theme).toBe('light');
    expect(read.extras).toEqual({});
  });

  it('hold-corrupt for newer enum values so mount cannot wipe forward-compat fields', () => {
    const raw = JSON.stringify({
      theme: 'light',
      uiScale: 140,
      editorFontSize: 15,
      editorFontFamily: 'default',
      futureAccent: 'teal',
    });
    const read = parseAppearanceStorage(raw, null);
    expect(read.persistPolicy).toBe('hold-corrupt');
    expect(read.prefs.theme).toBe('light');
    expect(read.prefs.uiScale).toBe(100);
    expect(read.extras).toEqual({ futureAccent: 'teal' });
  });

  it('hold-corrupt for non-object JSON', () => {
    const read = parseAppearanceStorage('null', 'dark');
    expect(read.persistPolicy).toBe('hold-corrupt');
  });

  it('migrates legacy theme when appearance blob is missing', () => {
    const read = parseAppearanceStorage(null, 'light');
    expect(read.persistPolicy).toBe('migrate-legacy');
    expect(read.prefs).toEqual({
      ...DEFAULT_APPEARANCE,
      theme: 'light',
    });
  });

  it('preserves unknown extras across serialize/parse', () => {
    const raw = serializeAppearancePrefs(
      {
        theme: 'system',
        uiScale: 110,
        editorFontSize: 18,
        editorFontFamily: 'serif',
      },
      { futureAccent: 'teal', nested: { ok: true } },
    );
    const read = parseAppearanceStorage(raw, 'light');
    expect(read.persistPolicy).toBe('ok');
    expect(read.prefs).toEqual({
      theme: 'system',
      uiScale: 110,
      editorFontSize: 18,
      editorFontFamily: 'serif',
    });
    expect(read.extras).toEqual({ futureAccent: 'teal', nested: { ok: true } });
    expect(JSON.parse(serializeAppearancePrefs(read.prefs, read.extras))).toMatchObject({
      futureAccent: 'teal',
      nested: { ok: true },
      theme: 'system',
    });
  });

  it('accepts system theme and editor font family', () => {
    const raw = serializeAppearancePrefs({
      theme: 'system',
      uiScale: 110,
      editorFontSize: 18,
      editorFontFamily: 'serif',
    });
    expect(parseAppearancePrefs(raw, 'light')).toEqual({
      theme: 'system',
      uiScale: 110,
      editorFontSize: 18,
      editorFontFamily: 'serif',
    });
  });

  it('resolves system theme from OS preference', () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
    expect(resolveThemeMode('light', true)).toBe('light');
  });

  it('maps scale, size, and font family to CSS values', () => {
    expect(uiScaleToCssFactor(90)).toBe('0.9');
    expect(editorFontSizeToCss(15)).toBe('15px');
    expect(editorFontFamilyToCss('default')).toBe('var(--font)');
    expect(editorFontFamilyToCss('mono')).toContain('monospace');
  });
});
