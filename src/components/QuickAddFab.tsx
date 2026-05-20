import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { PATH_LOGIN, PATH_NOTES, PATH_REGISTER, PATH_TODOS } from '../lib/routes';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { IcListTodo, IcPlus, IcStickyNote, IcX } from './icons';

const MarkdownEditor = lazy(() =>
  import('./ui/MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })),
);

type Mode = 'task' | 'note';

/**
 * Floating "+" button anchored to the bottom-right corner of the app
 * shell. Tapping it pops a small upward menu with shortcuts to create
 * a new task or note from anywhere — no need to navigate to /todos or
 * /notes first. Each shortcut opens a focused dialog that gathers
 * just enough fields to create the item, then drops the user on the
 * matching page so they can keep iterating.
 *
 * Design notes:
 *  - Mounted globally inside Layout, so the FAB rides above every
 *    protected route. Login/Register live outside Layout already.
 *  - The dialog re-uses the same MarkdownEditor lazy-loaded by the
 *    Todos and Notes pages, so first paint of the FAB itself stays
 *    cheap.
 *  - The menu / dialog state is kept locally — nothing about quick-add
 *    needs to persist across reloads.
 */
export function QuickAddFab() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Defensive: never render on auth pages even if somebody mounts this
  // component outside Layout in the future. Layout itself wraps only
  // protected routes today, so this is purely belt-and-braces.
  const onAuthPage =
    location.pathname.startsWith(PATH_LOGIN) || location.pathname.startsWith(PATH_REGISTER);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (onAuthPage) return null;

  const openMode = (m: Mode) => {
    setMode(m);
    setMenuOpen(false);
  };

  return (
    <div ref={rootRef} className="quick-fab">
      {menuOpen ? (
        <div className="quick-fab__menu" role="menu" aria-label="Quick add">
          <button
            type="button"
            role="menuitem"
            className="quick-fab__menu-item"
            onClick={() => openMode('task')}
          >
            <span className="quick-fab__menu-ic" aria-hidden>
              <IcListTodo size={16} />
            </span>
            <span>Add task</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="quick-fab__menu-item"
            onClick={() => openMode('note')}
          >
            <span className="quick-fab__menu-ic" aria-hidden>
              <IcStickyNote size={16} />
            </span>
            <span>Add note</span>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className={`quick-fab__btn${menuOpen ? ' quick-fab__btn--open' : ''}`}
        aria-label={menuOpen ? 'Close quick add menu' : 'Open quick add menu'}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <IcPlus size={26} strokeWidth={2.5} />
      </button>

      {mode ? <QuickAddDialog mode={mode} onClose={() => setMode(null)} /> : null}
    </div>
  );
}

type DialogProps = {
  mode: Mode;
  onClose: () => void;
};

const LAST_LIST_KEY = 'cadence.quickadd.lastList';
const NEW_LIST_TOKEN = '__new__';

function QuickAddDialog({ mode, onClose }: DialogProps) {
  const { data, addTodoGroup, addTodoItem, addNote, patchNote } = useAppData();
  const navigate = useNavigate();

  const activeGroups = useMemo(
    () => data.todoGroups.filter((g) => !g.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.todoGroups],
  );

  // Restore the most recent target list so a user that keeps adding tasks
  // into "Work" doesn't have to pick the same list every time. Fall back to
  // the first non-archived list, then to whatever exists. The token survives
  // across sessions but is harmless if the underlying list is deleted —
  // we just fall through to the default.
  const initialGroupId = useMemo(() => {
    try {
      const stored = localStorage.getItem(LAST_LIST_KEY);
      if (stored && activeGroups.some((g) => g.id === stored)) return stored;
    } catch {
      /* localStorage may be disabled (private windows) — ignore. */
    }
    return activeGroups[0]?.id ?? data.todoGroups[0]?.id ?? '';
  }, [activeGroups, data.todoGroups]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [groupId, setGroupId] = useState(initialGroupId);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const taskTargetReady =
    creatingList ? newListName.trim().length > 0 : !!groupId && groupId !== NEW_LIST_TOKEN;

  const canSubmit =
    mode === 'task'
      ? title.trim().length > 0 && taskTargetReady
      : title.trim().length > 0 || body.trim().length > 0;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    if (mode === 'task') {
      const trimmedTitle = title.trim();
      const trimmedBody = body.trim();
      const targetGroupId = creatingList
        ? addTodoGroup(newListName.trim())
        : groupId;
      addTodoItem(
        targetGroupId,
        trimmedTitle,
        trimmedBody ? { body: trimmedBody } : undefined,
      );
      try {
        localStorage.setItem(LAST_LIST_KEY, targetGroupId);
      } catch {
        /* ignore — see initialGroupId comment. */
      }
      onClose();
      navigate(PATH_TODOS);
      return;
    }
    const id = addNote();
    patchNote(id, {
      title: title.trim() || 'Untitled',
      body,
    });
    onClose();
    navigate(PATH_NOTES);
  };

  const isTask = mode === 'task';

  return (
    <div className="quick-add-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <form
        className="quick-add-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="quick-add-dialog__header">
          <span className="quick-add-dialog__icon" aria-hidden>
            {isTask ? <IcListTodo size={18} /> : <IcStickyNote size={18} />}
          </span>
          <h2 className="quick-add-dialog__title">
            {isTask ? 'New task' : 'New note'}
          </h2>
          <button
            type="button"
            className="quick-add-dialog__close"
            aria-label="Close"
            onClick={onClose}
          >
            <IcX size={18} />
          </button>
        </header>

        <div className="quick-add-dialog__body">
          {isTask ? (
            <>
              <label className="quick-add-dialog__field">
                <span className="quick-add-dialog__label">Task</span>
                <AutoResizeTextarea
                  className="textarea quick-add-dialog__textarea"
                  placeholder="What needs to get done?"
                  value={title}
                  autoFocus
                  minRows={2}
                  maxRows={6}
                  ariaLabel="Task title"
                  onChange={setTitle}
                  onSubmit={() => submit()}
                  onCancel={onClose}
                />
              </label>
              <div className="quick-add-dialog__field">
                <span className="quick-add-dialog__label">List</span>
                {creatingList ? (
                  <div className="quick-add-dialog__new-list">
                    <input
                      className="input"
                      placeholder="New list name"
                      value={newListName}
                      autoFocus
                      onChange={(e) => setNewListName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setCreatingList(false);
                          setNewListName('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => {
                        setCreatingList(false);
                        setNewListName('');
                      }}
                      aria-label="Pick an existing list instead"
                      title="Pick an existing list instead"
                    >
                      Use existing
                    </button>
                  </div>
                ) : (
                  <select
                    className="select"
                    value={groupId}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === NEW_LIST_TOKEN) {
                        setCreatingList(true);
                        return;
                      }
                      setGroupId(v);
                    }}
                  >
                    {activeGroups.length === 0 ? (
                      <option value="" disabled>
                        No lists yet — create one
                      </option>
                    ) : null}
                    {activeGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                    <option value={NEW_LIST_TOKEN}>＋ New list…</option>
                  </select>
                )}
              </div>
              {showDetails ? (
                <label className="quick-add-dialog__field">
                  <span className="quick-add-dialog__label">Details</span>
                  <Suspense
                    fallback={
                      <div className="quick-add-dialog__loading muted small">Loading editor…</div>
                    }
                  >
                    <MarkdownEditor
                      value={body}
                      onChange={setBody}
                      placeholder="Optional details — notes, links, checklists, code… markdown supported."
                      rows={6}
                      initialMode="edit"
                    />
                  </Suspense>
                </label>
              ) : null}
            </>
          ) : (
            <>
              <label className="quick-add-dialog__field">
                <span className="quick-add-dialog__label">Title</span>
                <input
                  className="input"
                  placeholder="Untitled"
                  value={title}
                  autoFocus
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="quick-add-dialog__field">
                <span className="quick-add-dialog__label">Body</span>
                <Suspense
                  fallback={
                    <div className="quick-add-dialog__loading muted small">Loading editor…</div>
                  }
                >
                  <MarkdownEditor
                    value={body}
                    onChange={setBody}
                    placeholder="Write here — markdown, checklists, links…"
                    rows={8}
                    initialMode="edit"
                  />
                </Suspense>
              </label>
              {data.notesLock ? (
                <p className="quick-add-dialog__hint muted small">
                  Notes are encrypted. This note will be added unlocked; you can lock it from the
                  Notes page after it's created.
                </p>
              ) : null}
            </>
          )}
        </div>

        <footer className="quick-add-dialog__footer">
          {isTask ? (
            <button
              type="button"
              className="quick-add-dialog__details-toggle"
              aria-expanded={showDetails}
              onClick={() => setShowDetails((v) => !v)}
            >
              <IcStickyNote size={14} />
              <span>{showDetails ? 'Hide details' : 'Add details'}</span>
            </button>
          ) : (
            <span />
          )}
          <div className="quick-add-dialog__actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!canSubmit}
            >
              {isTask ? 'Add task' : 'Add note'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
