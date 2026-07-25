/**
 * Device-local appearance preferences (theme, UI scale, editor font).
 * Stored in localStorage — never in AppData / workspace JSON (zero-data-loss:
 * look-and-feel must not ride backup/import/sync or bump DATA_VERSION).
 */
import { STORAGE_PREFIX } from './appBranding';

export const APPEARANCE_STORAGE_KEY = `${STORAGE_PREFIX}.appearance.v1`;
/** Legacy single-key theme from ThemeContext — migrated into the blob once. */
export const LEGACY_THEME_STORAGE_KEY = `${STORAGE_PREFIX}-theme`;

/** Stored preference (may be system). */
export type ThemePreference = 'system' | 'dark' | 'light';
/** Resolved theme written to `data-theme` / consumed by canvases. */
export type ThemeMode = 'dark' | 'light';
export type UiScale = 90 | 100 | 110 | 125;
export type EditorFontSize = 14 | 15 | 16 | 18;
export type EditorFontFamily = 'default' | 'system' | 'serif' | 'mono';

export type AppearancePrefs = {
  theme: ThemePreference;
  uiScale: UiScale;
  editorFontSize: EditorFontSize;
  editorFontFamily: EditorFontFamily;
};

/**
 * How the provider may touch localStorage after a read.
 * - ok: blob was valid (extras preserved on write)
 * - migrate-legacy: no blob; seed from legacy theme key
 * - hold-corrupt: blob unreadable — apply in-memory defaults, do not overwrite
 *   until the user explicitly changes a preference
 * - ephemeral: storage unavailable
 */
export type AppearancePersistPolicy = 'ok' | 'migrate-legacy' | 'hold-corrupt' | 'ephemeral';

export type AppearanceStorageRead = {
  prefs: AppearancePrefs;
  /** Unknown keys from a newer schema — round-tripped on write. */
  extras: Record<string, unknown>;
  persistPolicy: AppearancePersistPolicy;
};

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: 'dark',
  uiScale: 100,
  editorFontSize: 15,
  editorFontFamily: 'default',
};

export const UI_SCALE_OPTIONS: readonly UiScale[] = [90, 100, 110, 125];
export const EDITOR_FONT_SIZE_OPTIONS: readonly EditorFontSize[] = [14, 15, 16, 18];
export const EDITOR_FONT_FAMILY_OPTIONS: readonly {
  value: EditorFontFamily;
  label: string;
}[] = [
  { value: 'default', label: 'Cadence' },
  { value: 'system', label: 'System' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
];

const KNOWN_APPEARANCE_KEYS = new Set([
  'theme',
  'uiScale',
  'editorFontSize',
  'editorFontFamily',
]);

function isThemePreference(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'dark' || v === 'light';
}

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'dark' || v === 'light';
}

function isUiScale(v: unknown): v is UiScale {
  return v === 90 || v === 100 || v === 110 || v === 125;
}

function isEditorFontSize(v: unknown): v is EditorFontSize {
  return v === 14 || v === 15 || v === 16 || v === 18;
}

function isEditorFontFamily(v: unknown): v is EditorFontFamily {
  return v === 'default' || v === 'system' || v === 'serif' || v === 'mono';
}

export function prefersDarkColorScheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

export function resolveThemeMode(
  pref: ThemePreference,
  systemPrefersDark: boolean = prefersDarkColorScheme(),
): ThemeMode {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

function collectExtras(input: Record<string, unknown>): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (KNOWN_APPEARANCE_KEYS.has(key)) continue;
    extras[key] = value;
  }
  return extras;
}

/**
 * True when a known key is present with a value this build cannot apply.
 * Newer builds may store e.g. `uiScale: 140` — we must not persist defaults
 * over that blob on mount (forward-compat / zero-data-loss for device prefs).
 */
export function hasUnrecognizedKnownAppearanceFields(input: Record<string, unknown>): boolean {
  if ('theme' in input && input.theme !== undefined && !isThemePreference(input.theme)) {
    return true;
  }
  if ('uiScale' in input && input.uiScale !== undefined && !isUiScale(input.uiScale)) {
    return true;
  }
  if (
    'editorFontSize' in input &&
    input.editorFontSize !== undefined &&
    !isEditorFontSize(input.editorFontSize)
  ) {
    return true;
  }
  if (
    'editorFontFamily' in input &&
    input.editorFontFamily !== undefined &&
    !isEditorFontFamily(input.editorFontFamily)
  ) {
    return true;
  }
  return false;
}

/** Normalize a partial/unknown object into a valid prefs record + unknown extras. */
export function normalizeAppearancePrefs(input: unknown): {
  prefs: AppearancePrefs;
  extras: Record<string, unknown>;
} {
  if (!input || typeof input !== 'object') {
    return { prefs: { ...DEFAULT_APPEARANCE }, extras: {} };
  }
  const o = input as Record<string, unknown>;
  return {
    prefs: {
      theme: isThemePreference(o.theme) ? o.theme : DEFAULT_APPEARANCE.theme,
      uiScale: isUiScale(o.uiScale) ? o.uiScale : DEFAULT_APPEARANCE.uiScale,
      editorFontSize: isEditorFontSize(o.editorFontSize)
        ? o.editorFontSize
        : DEFAULT_APPEARANCE.editorFontSize,
      editorFontFamily: isEditorFontFamily(o.editorFontFamily)
        ? o.editorFontFamily
        : DEFAULT_APPEARANCE.editorFontFamily,
    },
    extras: collectExtras(o),
  };
}

/**
 * Read prefs from the appearance blob, falling back to legacy `cadence-theme`
 * for theme only. Corrupt JSON → defaults with hold-corrupt (never throw).
 */
export function parseAppearanceStorage(
  appearanceRaw: string | null,
  legacyThemeRaw: string | null = null,
): AppearanceStorageRead {
  if (appearanceRaw) {
    try {
      const parsed: unknown = JSON.parse(appearanceRaw);
      if (!parsed || typeof parsed !== 'object') {
        const base = { ...DEFAULT_APPEARANCE };
        if (isThemeMode(legacyThemeRaw)) base.theme = legacyThemeRaw;
        return { prefs: base, extras: {}, persistPolicy: 'hold-corrupt' };
      }
      const o = parsed as Record<string, unknown>;
      const { prefs, extras } = normalizeAppearancePrefs(o);
      // Parseable JSON with a newer/unknown enum value: apply safe defaults in
      // memory but do not overwrite storage until the user explicitly edits.
      if (hasUnrecognizedKnownAppearanceFields(o)) {
        return { prefs, extras, persistPolicy: 'hold-corrupt' };
      }
      return { prefs, extras, persistPolicy: 'ok' };
    } catch {
      const base = { ...DEFAULT_APPEARANCE };
      if (isThemeMode(legacyThemeRaw)) base.theme = legacyThemeRaw;
      return { prefs: base, extras: {}, persistPolicy: 'hold-corrupt' };
    }
  }

  const base = { ...DEFAULT_APPEARANCE };
  if (isThemeMode(legacyThemeRaw)) {
    base.theme = legacyThemeRaw;
    return { prefs: base, extras: {}, persistPolicy: 'migrate-legacy' };
  }
  return { prefs: base, extras: {}, persistPolicy: 'migrate-legacy' };
}

/** @deprecated Prefer parseAppearanceStorage — kept for tests that only need prefs. */
export function parseAppearancePrefs(
  appearanceRaw: string | null,
  legacyThemeRaw: string | null = null,
): AppearancePrefs {
  return parseAppearanceStorage(appearanceRaw, legacyThemeRaw).prefs;
}

export function serializeAppearancePrefs(
  prefs: AppearancePrefs,
  extras: Record<string, unknown> = {},
): string {
  const { prefs: normalized } = normalizeAppearancePrefs(prefs);
  // Known keys win over extras so a newer schema cannot clobber this build's fields.
  return JSON.stringify({ ...extras, ...normalized });
}

export function uiScaleToCssFactor(scale: UiScale): string {
  return String(scale / 100);
}

export function editorFontSizeToCss(size: EditorFontSize): string {
  return `${size}px`;
}

export function editorFontFamilyToCss(family: EditorFontFamily): string {
  switch (family) {
    case 'system':
      return 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    case 'serif':
      return 'Iowan Old Style, "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    case 'default':
    default:
      return 'var(--font)';
  }
}

/** Apply prefs to the document root (resolved theme dataset + CSS variables). */
export function applyAppearanceToDocument(
  prefs: AppearancePrefs,
  systemPrefersDark: boolean = prefersDarkColorScheme(),
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = resolveThemeMode(prefs.theme, systemPrefersDark);
  root.dataset.theme = resolved;
  root.style.setProperty('--ui-scale', uiScaleToCssFactor(prefs.uiScale));
  root.style.setProperty('--editor-font-size', editorFontSizeToCss(prefs.editorFontSize));
  root.style.setProperty('--editor-font-family', editorFontFamilyToCss(prefs.editorFontFamily));
}

export function readAppearanceStorage(): AppearanceStorageRead {
  if (typeof localStorage === 'undefined') {
    return { prefs: { ...DEFAULT_APPEARANCE }, extras: {}, persistPolicy: 'ephemeral' };
  }
  try {
    return parseAppearanceStorage(
      localStorage.getItem(APPEARANCE_STORAGE_KEY),
      localStorage.getItem(LEGACY_THEME_STORAGE_KEY),
    );
  } catch {
    return { prefs: { ...DEFAULT_APPEARANCE }, extras: {}, persistPolicy: 'ephemeral' };
  }
}

/** Convenience for callers that only need the prefs object. */
export function readAppearanceFromStorage(): AppearancePrefs {
  return readAppearanceStorage().prefs;
}

/**
 * Persist prefs. Mirrors *resolved* theme to the legacy key so older readers
 * that only understand dark/light stay consistent. Preserves unknown extras.
 */
export function writeAppearanceToStorage(
  prefs: AppearancePrefs,
  systemPrefersDark: boolean = prefersDarkColorScheme(),
  extras: Record<string, unknown> = {},
): void {
  if (typeof localStorage === 'undefined') return;
  const { prefs: next } = normalizeAppearancePrefs(prefs);
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearancePrefs(next, extras));
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, resolveThemeMode(next.theme, systemPrefersDark));
  } catch {
    /* quota / private mode — keep in-memory apply only */
  }
}
