import { useEffect, useMemo, useRef, useState } from 'react';
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

function RowMenu({
  title,
  onRename,
  onDelete,
}: {
  title: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="utility-saved__menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="utility-saved__menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${title}`}
        title="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        <IcMoreVertical size={16} />
      </button>
      {open ? (
        <div className="utility-saved__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="utility-saved__menu-item"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="utility-saved__menu-item utility-saved__menu-item--danger"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
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
