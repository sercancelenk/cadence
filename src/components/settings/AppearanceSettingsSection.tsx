import type { ReactNode } from 'react';
import { useAppearance } from '../../providers/ThemeContext';
import {
  EDITOR_FONT_FAMILY_OPTIONS,
  EDITOR_FONT_SIZE_OPTIONS,
  UI_SCALE_OPTIONS,
  type EditorFontFamily,
  type EditorFontSize,
  type ThemePreference,
  type UiScale,
} from '../../lib/appearancePrefs';

function SegGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="appearance-settings__block">
      <div className="appearance-settings__block-head">
        <span className="appearance-settings__label">{label}</span>
        {hint ? <span className="appearance-settings__hint muted small">{hint}</span> : null}
      </div>
      <div className="seg" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/**
 * Device-local look-and-feel controls. Persisted via AppearanceProvider
 * (localStorage) — never written into the workspace JSON.
 */
export function AppearanceSettingsSection() {
  const {
    prefs,
    theme: resolvedTheme,
    setTheme,
    setUiScale,
    setEditorFontSize,
    setEditorFontFamily,
    resetAppearance,
  } = useAppearance();

  return (
    <section id="appearance" className="appearance-settings-panel card" aria-label="Appearance">
      <p className="muted">
        Look-and-feel on this device only — not included in backups or sync.{' '}
        <span className="card__badge">This device</span>
      </p>

      <div className="appearance-settings">
        <SegGroup
          label="Theme"
          hint={
            prefs.theme === 'system'
              ? `Following OS (${resolvedTheme})`
              : 'Light, dark, or match the operating system'
          }
        >
          {(['system', 'dark', 'light'] as const satisfies readonly ThemePreference[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`seg__btn${prefs.theme === mode ? ' seg__btn--on' : ''}`}
              aria-pressed={prefs.theme === mode}
              onClick={() => setTheme(mode)}
            >
              {mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </SegGroup>

        <SegGroup
          label="App & menus"
          hint="Top bar, nav, notes/todos lists, toolbars — not the note body text"
        >
          {UI_SCALE_OPTIONS.map((scale: UiScale) => (
            <button
              key={scale}
              type="button"
              className={`seg__btn${prefs.uiScale === scale ? ' seg__btn--on' : ''}`}
              aria-pressed={prefs.uiScale === scale}
              onClick={() => setUiScale(scale)}
            >
              {scale}%
            </button>
          ))}
        </SegGroup>

        <SegGroup
          label="Editor size"
          hint="Only the note/document writing area (independent of App & menus)"
        >
          {EDITOR_FONT_SIZE_OPTIONS.map((size: EditorFontSize) => (
            <button
              key={size}
              type="button"
              className={`seg__btn${prefs.editorFontSize === size ? ' seg__btn--on' : ''}`}
              aria-pressed={prefs.editorFontSize === size}
              onClick={() => setEditorFontSize(size)}
            >
              {size}px
            </button>
          ))}
        </SegGroup>

        <SegGroup label="Editor font" hint="Typeface for note and document bodies">
          {EDITOR_FONT_FAMILY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`seg__btn${prefs.editorFontFamily === opt.value ? ' seg__btn--on' : ''}`}
              aria-pressed={prefs.editorFontFamily === opt.value}
              onClick={() => setEditorFontFamily(opt.value as EditorFontFamily)}
            >
              {opt.label}
            </button>
          ))}
        </SegGroup>

        <p
          className="appearance-settings__preview muted small"
          aria-live="polite"
          style={{ fontFamily: 'var(--editor-font-family)', fontSize: 'var(--editor-font-size)' }}
        >
          Menus {prefs.uiScale}% · editor {prefs.editorFontSize}px ·{' '}
          {EDITOR_FONT_FAMILY_OPTIONS.find((o) => o.value === prefs.editorFontFamily)?.label} ·{' '}
          {prefs.theme === 'system' ? `system → ${resolvedTheme}` : prefs.theme}
        </p>

        <div className="row" style={{ marginTop: 4 }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => resetAppearance()}>
            Reset to defaults
          </button>
        </div>
      </div>
    </section>
  );
}
