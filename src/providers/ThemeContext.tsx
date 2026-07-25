/**
 * Theme API is backed by AppearanceProvider (theme + UI scale + editor font).
 * Import AppearanceProvider / useAppearance for the full surface; useTheme
 * remains for TopBar and canvas consumers.
 */
export {
  AppearanceProvider as ThemeProvider,
  AppearanceProvider,
  useAppearance,
  useTheme,
  type AppearancePrefs,
  type EditorFontFamily,
  type EditorFontSize,
  type ThemeMode,
  type ThemePreference,
  type UiScale,
} from './AppearanceContext';
