import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { IcChevronDown, IcMoreVertical, IcSearch } from '../../components/icons';
import { formatShort } from '../../lib/datetime';
import {
  parseUtilityLibrarySort,
  prepareUtilityLibraryDocs,
  readUtilityLibraryOpen,
  utilityLibraryOpenStorageKey,
  writeUtilityLibraryOpen,
  type UtilityLibrarySort,
} from '../../lib/utilitySavedLibrary';

export type UtilitySavedDocListItem = {
  id: string;
  title: string;
  updatedAt: string;
};

export type UtilitySavedDocsPanelProps = {
  /** Stable id for localStorage open state (`erd` / `sketch`). */
  libraryId: string;
  kindLabel: string;
  docs: UtilitySavedDocListItem[];
  activeId: string | null;
  dirty: boolean;
  /** Disables New/Save/Save as while a save is in flight. */
  busy?: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

/** Two items plus padding; used only to decide whether the menu fits below the button. */
const MENU_HEIGHT = 92;
const MENU_GAP = 2;

/**
 * The menu is drawn in the page body at a fixed position next to its button. Inside the scrolling
 * list it was clipped by the list edge and covered by the header above it, so Delete could not be reached.
 */
function menuPlacement(button: HTMLElement): CSSProperties {
  const r = button.getBoundingClientRect();
  const right = Math.max(8, window.innerWidth - r.right);
  const fitsBelow = window.innerHeight - r.bottom >= MENU_HEIGHT + 8;
  return fitsBelow
    ? { position: 'fixed', right, top: r.bottom + MENU_GAP }
    : { position: 'fixed', right, bottom: window.innerHeight - r.top + MENU_GAP };
}

function RowMenu({
  title,
  onRename,
  onDelete,
}: {
  title: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const open = style !== null;

  // Opening moves focus to the first item, so the keyboard can reach Rename and Delete.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setStyle(null);
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      btnRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    // A fixed menu would drift away from its row, so any scroll or resize just closes it.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setStyle(null);
    btnRef.current?.focus();
    action();
  };

  /** Arrow keys, Home and End cycle through the items; Tab leaves the menu and closes it. */
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      setStyle(null);
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    items[next]!.focus();
  };

  return (
    <div className="utility-saved__menu-wrap">
      <button
        ref={btnRef}
        type="button"
        className="utility-saved__menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${title}`}
        title="More actions"
        onClick={() => setStyle(open || !btnRef.current ? null : menuPlacement(btnRef.current))}
      >
        <IcMoreVertical size={16} />
      </button>
      {open
        ? createPortal(
            <div className="utility-saved__menu" role="menu" ref={menuRef} style={style} onKeyDown={onMenuKeyDown}>
              <button type="button" role="menuitem" className="utility-saved__menu-item" onClick={choose(onRename)}>
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="utility-saved__menu-item utility-saved__menu-item--danger"
                onClick={choose(onDelete)}
              >
                Delete
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Shared chrome for Tools → ERD / Sketch named libraries (explicit Save).
 * Collapsible library + search keeps the canvas primary as the list grows.
 */
export function UtilitySavedDocsPanel({
  libraryId,
  kindLabel,
  docs,
  activeId,
  dirty,
  busy = false,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onRename,
  onDelete,
}: UtilitySavedDocsPanelProps) {
  const [libraryOpen, setLibraryOpen] = useState(() =>
    readUtilityLibraryOpen(libraryId, docs.length),
  );
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<UtilityLibrarySort>('updated');

  // If the user never set a preference and the library goes from empty → first
  // save (or hydrates non-empty), collapse so the canvas stays primary.
  // Do not write localStorage here — only an explicit toggle persists preference.
  useEffect(() => {
    try {
      if (localStorage.getItem(utilityLibraryOpenStorageKey(libraryId)) != null) return;
    } catch {
      return;
    }
    if (docs.length > 0 && libraryOpen) {
      setLibraryOpen(false);
    }
  }, [docs.length, libraryId, libraryOpen]);

  const activeDoc = useMemo(
    () => (activeId ? docs.find((d) => d.id === activeId) : undefined),
    [activeId, docs],
  );

  const visible = useMemo(
    () => prepareUtilityLibraryDocs(docs, query, sort),
    [docs, query, sort],
  );

  const setOpen = (next: boolean) => {
    setLibraryOpen(next);
    writeUtilityLibraryOpen(libraryId, next);
  };

  return (
    <section
      className={`utility-saved${libraryOpen ? ' is-open' : ' is-collapsed'}`}
      aria-label={`Saved ${kindLabel}`}
    >
      <div className="utility-saved__head">
        <div className="utility-saved__identity">
          <button
            type="button"
            className="utility-saved__toggle"
            aria-expanded={libraryOpen}
            onClick={() => setOpen(!libraryOpen)}
            title={libraryOpen ? 'Hide library' : 'Show library'}
          >
            <IcChevronDown
              size={16}
              className={`utility-saved__chevron${libraryOpen ? ' is-open' : ''}`}
            />
            <span className="utility-saved__title">
              Library
              <span className="utility-saved__count">{docs.length}</span>
            </span>
          </button>
          {dirty ? <span className="utility-saved__dirty">Unsaved</span> : null}
          {!libraryOpen && activeDoc ? (
            <span className="utility-saved__active muted small" title={activeDoc.title}>
              {activeDoc.title}
            </span>
          ) : null}
          {!libraryOpen && !activeDoc && docs.length > 0 ? (
            <span className="utility-saved__active muted small">Untitled draft</span>
          ) : null}
        </div>
        <div className="utility-saved__actions">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onNew}
            disabled={busy}
          >
            New
          </button>
          <button
            type="button"
            className="btn btn--primary btn--small"
            onClick={onSave}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onSaveAs}
            disabled={busy}
          >
            Save as…
          </button>
        </div>
      </div>

      {libraryOpen ? (
        <div className="utility-saved__body">
          {docs.length === 0 ? (
            <p className="muted small utility-saved__empty">
              No saved {kindLabel} yet. Draw, then Save to keep a named copy in your workspace.
            </p>
          ) : (
            <>
              <div className="utility-saved__filters">
                <label className="utility-saved__search">
                  <IcSearch size={14} aria-hidden />
                  <input
                    type="search"
                    placeholder={`Search ${kindLabel}…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label={`Search saved ${kindLabel}`}
                  />
                </label>
                <select
                  className="utility-saved__sort"
                  value={sort}
                  aria-label="Sort library"
                  onChange={(e) => setSort(parseUtilityLibrarySort(e.target.value))}
                >
                  <option value="updated">Recent</option>
                  <option value="title">A–Z</option>
                </select>
              </div>
              {visible.length === 0 ? (
                <p className="muted small utility-saved__empty">No matches for “{query.trim()}”.</p>
              ) : (
                <ul className="utility-saved__list">
                  {visible.map((d) => {
                    const active = d.id === activeId;
                    return (
                      <li
                        key={d.id}
                        className={`utility-saved__item${active ? ' is-active' : ''}`}
                      >
                        <button
                          type="button"
                          className="utility-saved__open"
                          onClick={() => onOpen(d.id)}
                          title={d.title}
                        >
                          <span className="utility-saved__name">{d.title}</span>
                          <span className="utility-saved__meta muted small">
                            {formatShort(d.updatedAt)}
                          </span>
                        </button>
                        <RowMenu
                          title={d.title}
                          onRename={() => onRename(d.id)}
                          onDelete={() => onDelete(d.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
