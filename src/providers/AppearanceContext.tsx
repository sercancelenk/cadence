import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  applyAppearanceToDocument,
  DEFAULT_APPEARANCE,
  prefersDarkColorScheme,
  readAppearanceStorage,
  resolveThemeMode,
  writeAppearanceToStorage,
  type AppearancePersistPolicy,
  type AppearancePrefs,
  type EditorFontFamily,
  type EditorFontSize,
  type ThemeMode,
  type ThemePreference,
  type UiScale,
} from '../lib/appearancePrefs';

export type {
  AppearancePrefs,
  EditorFontFamily,
  EditorFontSize,
  ThemeMode,
  ThemePreference,
  UiScale,
};

type AppearanceContextValue = {
  prefs: AppearancePrefs;
  /** Resolved dark/light (system preference applied). */
  theme: ThemeMode;
  setTheme: (t: ThemePreference) => void;
  toggle: () => void;
  setUiScale: (s: UiScale) => void;
  setEditorFontSize: (n: EditorFontSize) => void;
  setEditorFontFamily: (f: EditorFontFamily) => void;
  patchAppearance: (patch: Partial<AppearancePrefs>) => void;
  resetAppearance: () => void;
};

const Ctx = createContext<AppearanceContextValue | null>(null);

function canPersist(policy: AppearancePersistPolicy): boolean {
  return policy === 'ok' || policy === 'migrate-legacy';
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const extrasRef = useRef<Record<string, unknown>>({});
  const persistPolicyRef = useRef<AppearancePersistPolicy>('ok');

  const [prefs, setPrefs] = useState<AppearancePrefs>(() => {
    const read = readAppearanceStorage();
    extrasRef.current = read.extras;
    persistPolicyRef.current = read.persistPolicy;
    if (typeof document !== 'undefined') {
      applyAppearanceToDocument(read.prefs);
    }
    return read.prefs;
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(prefersDarkColorScheme);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemPrefersDark(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    applyAppearanceToDocument(prefs, systemPrefersDark);
    // hold-corrupt / ephemeral: never overwrite storage with scaffold defaults.
    // User setters flip the policy to ok before setPrefs so the next write is intentional.
    if (!canPersist(persistPolicyRef.current)) return;
    writeAppearanceToStorage(prefs, systemPrefersDark, extrasRef.current);
  }, [prefs, systemPrefersDark]);

  const resolvedTheme = resolveThemeMode(prefs.theme, systemPrefersDark);

  const markUserPersist = useCallback(() => {
    // Explicit UI change may replace a corrupt blob; that is intentional.
    persistPolicyRef.current = 'ok';
  }, []);

  const patchAppearance = useCallback(
    (patch: Partial<AppearancePrefs>) => {
      markUserPersist();
      setPrefs((prev) => ({ ...prev, ...patch }));
    },
    [markUserPersist],
  );

  const setTheme = useCallback(
    (t: ThemePreference) => {
      markUserPersist();
      setPrefs((prev) => ({ ...prev, theme: t }));
    },
    [markUserPersist],
  );

  const toggle = useCallback(() => {
    markUserPersist();
    setPrefs((prev) => {
      const current = resolveThemeMode(prev.theme, prefersDarkColorScheme());
      return { ...prev, theme: current === 'dark' ? 'light' : 'dark' };
    });
  }, [markUserPersist]);

  const setUiScale = useCallback(
    (s: UiScale) => {
      markUserPersist();
      setPrefs((prev) => ({ ...prev, uiScale: s }));
    },
    [markUserPersist],
  );

  const setEditorFontSize = useCallback(
    (n: EditorFontSize) => {
      markUserPersist();
      setPrefs((prev) => ({ ...prev, editorFontSize: n }));
    },
    [markUserPersist],
  );

  const setEditorFontFamily = useCallback(
    (f: EditorFontFamily) => {
      markUserPersist();
      setPrefs((prev) => ({ ...prev, editorFontFamily: f }));
    },
    [markUserPersist],
  );

  const resetAppearance = useCallback(() => {
    markUserPersist();
    extrasRef.current = {};
    setPrefs({ ...DEFAULT_APPEARANCE });
  }, [markUserPersist]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      prefs,
      theme: resolvedTheme,
      setTheme,
      toggle,
      setUiScale,
      setEditorFontSize,
      setEditorFontFamily,
      patchAppearance,
      resetAppearance,
    }),
    [
      prefs,
      resolvedTheme,
      setTheme,
      toggle,
      setUiScale,
      setEditorFontSize,
      setEditorFontFamily,
      patchAppearance,
      resetAppearance,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppearance outside AppearanceProvider');
  return v;
}

/** Theme-only API — same provider; keeps TopBar / canvases unchanged. */
export function useTheme(): Pick<AppearanceContextValue, 'theme' | 'setTheme' | 'toggle'> {
  const { theme, setTheme, toggle } = useAppearance();
  return { theme, setTheme, toggle };
}
