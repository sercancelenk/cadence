import { formatShort } from '../../lib/datetime';

export type UtilitySavedDocListItem = {
  id: string;
  title: string;
  updatedAt: string;
};

export type UtilitySavedDocsPanelProps = {
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

/**
 * Shared chrome for Tools → ERD / Sketch named libraries (explicit Save).
 */
export function UtilitySavedDocsPanel({
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
  const sorted = [...docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <section className="utility-saved" aria-label={`Saved ${kindLabel}`}>
      <div className="utility-saved__head">
        <h3 className="utility-saved__title">
          Saved {kindLabel}
          {dirty ? <span className="utility-saved__dirty">Unsaved</span> : null}
        </h3>
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
      {sorted.length === 0 ? (
        <p className="muted small utility-saved__empty">
          No saved {kindLabel.toLowerCase()} yet. Draw, then Save to keep a named copy in your workspace.
        </p>
      ) : (
        <ul className="utility-saved__list">
          {sorted.map((d) => {
            const active = d.id === activeId;
            return (
              <li key={d.id} className={`utility-saved__item${active ? ' is-active' : ''}`}>
                <button
                  type="button"
                  className="utility-saved__open"
                  onClick={() => onOpen(d.id)}
                  title={d.title}
                >
                  <span className="utility-saved__name">{d.title}</span>
                  <span className="utility-saved__meta muted small">{formatShort(d.updatedAt)}</span>
                </button>
                <div className="utility-saved__row-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => onRename(d.id)}
                    title="Rename"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => onDelete(d.id)}
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
