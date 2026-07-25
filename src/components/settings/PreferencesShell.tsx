import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IcSearch } from '../icons';
import {
  categoryIdForHash,
  categoryMatchesQuery,
  defaultHashForCategory,
  SETTINGS_CATEGORIES,
  type SettingsCategoryId,
} from '../../lib/settingsNav';

export type PreferencesCategoryPanel = {
  id: SettingsCategoryId;
  /** When false, the category is hidden from the nav (e.g. empty integrations). */
  visible?: boolean;
  content: ReactNode;
};

export type PreferencesShellProps = {
  title?: string;
  lead?: string;
  panels: PreferencesCategoryPanel[];
};

/**
 * JetBrains-inspired Preferences chrome: search + left category list + detail pane.
 * Category bodies stay owned by Settings — this is layout only (no AppData).
 */
export function PreferencesShell({
  title = 'Settings',
  lead = 'Everything about Cadence lives on this device.',
  panels,
}: PreferencesShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const panelById = useMemo(() => {
    const map = new Map<SettingsCategoryId, PreferencesCategoryPanel>();
    for (const p of panels) map.set(p.id, p);
    return map;
  }, [panels]);

  const navItems = useMemo(() => {
    return SETTINGS_CATEGORIES.filter((cat) => {
      const panel = panelById.get(cat.id);
      if (!panel || panel.visible === false) return false;
      return categoryMatchesQuery(cat, query);
    });
  }, [panelById, query]);

  const hashCategory = categoryIdForHash(location.hash);
  const [activeId, setActiveId] = useState<SettingsCategoryId>(
    () => hashCategory ?? 'appearance',
  );

  useEffect(() => {
    if (hashCategory) setActiveId(hashCategory);
  }, [hashCategory]);

  useEffect(() => {
    if (navItems.length === 0) return;
    if (navItems.some((c) => c.id === activeId)) return;
    // Search hid the current category — fall back and keep the URL hash honest.
    const nextId = navItems[0]!.id;
    setActiveId(nextId);
    navigate(
      { pathname: location.pathname, hash: defaultHashForCategory(nextId) },
      { replace: true },
    );
  }, [navItems, activeId, navigate, location.pathname]);

  const selectCategory = (id: SettingsCategoryId) => {
    setActiveId(id);
    const hash = defaultHashForCategory(id);
    navigate({ pathname: location.pathname, hash }, { replace: true });
  };

  const activeDef = SETTINGS_CATEGORIES.find((c) => c.id === activeId) ?? SETTINGS_CATEGORIES[0]!;
  const activePanel = panelById.get(activeId);

  return (
    <div className="page page--wide settings-page preferences-shell">
      <header className="page-head settings-page__head preferences-shell__head">
        <h1>{title}</h1>
        <p className="muted">{lead}</p>
      </header>

      <div className="preferences-shell__frame">
        <aside className="preferences-shell__nav" aria-label="Settings categories">
          <label className="preferences-shell__search">
            <IcSearch size={16} aria-hidden />
            <span className="sr-only">Search settings</span>
            <input
              type="search"
              className="input preferences-shell__search-input"
              placeholder="Search settings…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </label>

          <nav className="preferences-shell__list" aria-label="Categories">
            {navItems.length === 0 ? (
              <p className="preferences-shell__empty muted small">No matching categories.</p>
            ) : (
              navItems.map((cat) => {
                const on = cat.id === activeId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`preferences-shell__nav-item${on ? ' preferences-shell__nav-item--on' : ''}`}
                    aria-current={on ? 'page' : undefined}
                    onClick={() => selectCategory(cat.id)}
                  >
                    <span className="preferences-shell__nav-label">{cat.label}</span>
                    <span className="preferences-shell__nav-hint muted">{cat.description}</span>
                  </button>
                );
              })
            )}
          </nav>
        </aside>

        <section
          className="preferences-shell__detail"
          aria-labelledby="preferences-detail-title"
        >
          <header className="preferences-shell__detail-head">
            <p className="preferences-shell__crumb muted small">
              Settings <span aria-hidden>›</span> {activeDef.label}
            </p>
            <h2 id="preferences-detail-title" className="preferences-shell__detail-title">
              {activeDef.label}
            </h2>
            <p className="preferences-shell__detail-desc muted">{activeDef.description}</p>
          </header>
          <div className="preferences-shell__detail-body">
            {activePanel?.content ?? (
              <p className="muted">This section is not available.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
