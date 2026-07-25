import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  LEGACY_THEME_STORAGE_KEY,
  applyAppearanceToDocument,
  editorFontFamilyToCss,
  hasUnrecognizedKnownAppearanceFields,
  normalizeAppearancePrefs,
  parseAppearancePrefs,
  parseAppearanceStorage,
  prefersDarkColorScheme,
  readAppearanceFromStorage,
  readAppearanceStorage,
  resolveThemeMode,
  serializeAppearancePrefs,
  uiScaleToCssFactor,
  editorFontSizeToCss,
  writeAppearanceToStorage,
} from './appearancePrefs';

describe('appearancePrefs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--ui-scale');
    document.documentElement.style.removeProperty('--editor-font-size');
    document.documentElement.style.removeProperty('--editor-font-family');
  });

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
    expect(editorFontFamilyToCss('system')).toContain('system-ui');
    expect(editorFontFamilyToCss('serif')).toContain('Georgia');
    expect(editorFontFamilyToCss('mono')).toContain('monospace');
  });

  it('detects unrecognized known-field values for forward-compat hold', () => {
    expect(hasUnrecognizedKnownAppearanceFields({ theme: 'neon' })).toBe(true);
    expect(hasUnrecognizedKnownAppearanceFields({ editorFontSize: 20 })).toBe(true);
    expect(hasUnrecognizedKnownAppearanceFields({ editorFontFamily: 'comic' })).toBe(true);
    expect(hasUnrecognizedKnownAppearanceFields({ theme: 'dark', uiScale: 100 })).toBe(false);
  });

  it('reads matchMedia for system preference and applies document CSS vars', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal('matchMedia', matchMedia);
    expect(prefersDarkColorScheme()).toBe(false);
    matchMedia.mockReturnValue({ matches: true });
    expect(prefersDarkColorScheme()).toBe(true);
    matchMedia.mockImplementation(() => {
      throw new Error('no media');
    });
    expect(prefersDarkColorScheme()).toBe(true);

    applyAppearanceToDocument({
      theme: 'light',
      uiScale: 110,
      editorFontSize: 16,
      editorFontFamily: 'serif',
    });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.1');
    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('16px');
  });

  it('reads and writes localStorage with legacy theme mirror', () => {
    localStorage.clear();
    expect(readAppearanceStorage().persistPolicy).toBe('migrate-legacy');
    writeAppearanceToStorage(
      {
        theme: 'system',
        uiScale: 125,
        editorFontSize: 14,
        editorFontFamily: 'mono',
      },
      true,
      { future: 1 },
    );
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toContain('"uiScale":125');
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBe('dark');
    expect(readAppearanceFromStorage().uiScale).toBe(125);
    expect(readAppearanceStorage().extras).toEqual({ future: 1 });
  });
});

describe('appearancePrefs storage edge cases', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('returns ephemeral when localStorage throws on read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    expect(readAppearanceStorage().persistPolicy).toBe('ephemeral');
  });
});
