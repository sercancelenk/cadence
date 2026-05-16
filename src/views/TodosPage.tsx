import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  IcCalendar,
  IcCheck,
  IcChevronDown,
  IcClock,
  IcGrip,
  IcLayoutGrid,
  IcListTodo,
  IcPlus,
  IcStar,
  IcTrash,
} from '../components/icons';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import { formatDateShort, formatTimeOnly, fromLocalDatetimeValue, isPast, toLocalDatetimeValue } from '../lib/datetime';
import type { TodoGroup, TodoItem } from '../model';

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

function tagColor(groupId: string): string {
  return `hsl(${hashHue(groupId)} 58% 40%)`;
}

function ringStyle(groupId: string): CSSProperties {
  return { ['--todo-ring' as string]: `hsl(${hashHue(groupId)} 62% 46%)` };
}

const LS_TODO_SECTIONS = 'leeadman.todos.sectionsOpen.v1';
const LS_TODO_SHOW_ARCHIVED = 'leeadman.todos.showArchived.v1';

function todoSectionsStorageKey(userId: string) {
  return `${LS_TODO_SECTIONS}:${userId}`;
}

function todoShowArchivedKey(userId: string) {
  return `${LS_TODO_SHOW_ARCHIVED}:${userId}`;
}

function isSectionOpen(map: Record<string, boolean>, groupId: string): boolean {
  return map[groupId] !== false;
}

/**
 * Sorts groups in the order they should be displayed:
 *   1. Pinned (sortOrder asc)
 *   2. Unpinned (sortOrder asc)
 *   3. Archived (sortOrder asc) — only when included
 */
function sortGroups(groups: TodoGroup[]): TodoGroup[] {
  return [...groups].sort((a, b) => {
    const ap = !!a.pinned;
    const bp = !!b.pinned;
    const aa = !!a.archived;
    const ba = !!b.archived;
    if (aa !== ba) return aa ? 1 : -1;
    if (ap !== bp) return ap ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

type TodoTaskRowProps = {
  item: TodoItem;
  group: TodoGroup;
  groups: TodoGroup[];
  compact: boolean;
  onPatch: (id: string, patch: Partial<Pick<TodoItem, 'title' | 'groupId' | 'dueAt'>>) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
};

/**
 * A few common quick-schedule presets relative to "now". The labels are short
 * so they fit in the inline toolbar without wrapping.
 */
function quickPresets(): { key: string; label: string; getDate: () => Date }[] {
  return [
    {
      key: 'today',
      label: 'Today 5pm',
      getDate: () => {
        const d = new Date();
        d.setHours(17, 0, 0, 0);
        return d;
      },
    },
    {
      key: 'tomorrow',
      label: 'Tomorrow 9am',
      getDate: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
    {
      key: 'in-3h',
      label: '+3h',
      getDate: () => {
        const d = new Date();
        d.setMinutes(0, 0, 0);
        d.setHours(d.getHours() + 3);
        return d;
      },
    },
    {
      key: 'next-mon',
      label: 'Next Mon 9am',
      getDate: () => {
        const d = new Date();
        const day = d.getDay();
        const offset = ((1 + 7 - day) % 7) || 7;
        d.setDate(d.getDate() + offset);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
  ];
}

function TodoTaskRow({ item, group, groups, compact, onPatch, onToggle, onRemove }: TodoTaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const dueLabel = item.dueAt ? formatTimeOnly(item.dueAt) : '';
  const dueDateShort = formatDateShort(item.dueAt);
  const overdue = item.dueAt && isPast(item.dueAt) && !item.done;
  const presets = useMemo(() => quickPresets(), []);

  const applyPreset = (when: Date) => {
    onPatch(item.id, { dueAt: when.toISOString() });
    setScheduleOpen(false);
  };

  return (
    <li
      className={`todos-row${compact ? ' todos-row--compact' : ''}${item.done ? ' todos-row--done' : ''}`}
      style={ringStyle(item.groupId)}
    >
      <button
        type="button"
        className={`todos-row__check${item.done ? ' todos-row__check--on' : ''}`}
        aria-checked={item.done}
        role="checkbox"
        title={item.done ? 'Undo' : 'Mark complete'}
        onClick={() => onToggle(item.id)}
      >
        {item.done ? <IcCheck size={14} strokeWidth={2.5} /> : null}
      </button>

      <div className="todos-row__mid">
        <div className="todos-row__topline">
          {editing ? (
            <input
              className="todos-row__title-input"
              value={draftTitle}
              autoFocus
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={() => {
                const t = draftTitle.trim();
                if (t && t !== item.title) onPatch(item.id, { title: t });
                else setDraftTitle(item.title);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setDraftTitle(item.title);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="todos-row__title"
              onDoubleClick={() => {
                setDraftTitle(item.title);
                setEditing(true);
              }}
            >
              {item.title}
            </button>
          )}

          <div className="todos-row__tag">
            <span className="todos-row__tag-name">{group.name}</span>
            <span className="todos-row__hash" style={{ color: tagColor(item.groupId) }}>
              #
            </span>
          </div>
        </div>

        <div className="todos-row__sub">
          <div className="todos-row__meta">
            {item.dueAt ? (
              <>
                <span className={`todos-row__meta-ic${overdue ? ' todos-row__meta-ic--warn' : ''}`} title="Due">
                  <IcCalendar size={14} />
                </span>
                <span className={overdue ? 'todos-row__meta-warn' : undefined}>
                  {dueDateShort}
                  {dueLabel ? ` · ${dueLabel}` : ''}
                </span>
                <span className="todos-row__meta-ic todos-row__meta-ic--muted" title="Time">
                  <IcClock size={14} />
                </span>
              </>
            ) : (
              <span className="todos-row__meta-placeholder">Not scheduled</span>
            )}
          </div>
          <div className="todos-row__toolbar">
            <div className="todos-row__sched">
              <button
                type="button"
                className={`todos-row__sched-btn${item.dueAt ? ' todos-row__sched-btn--set' : ''}`}
                aria-haspopup="true"
                aria-expanded={scheduleOpen}
                title={item.dueAt ? 'Reschedule' : 'Schedule'}
                onClick={() => setScheduleOpen((o) => !o)}
              >
                <IcCalendar size={14} />
                <span>{item.dueAt ? 'Reschedule' : 'Schedule'}</span>
              </button>
              {scheduleOpen ? (
                <div
                  className="todos-row__sched-pop"
                  role="dialog"
                  onMouseLeave={() => setScheduleOpen(false)}
                >
                  <div className="todos-row__sched-presets">
                    {presets.map((p) => (
                      <button
                        type="button"
                        key={p.key}
                        className="todos-row__sched-preset"
                        onClick={() => applyPreset(p.getDate())}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <label className="todos-row__sched-custom">
                    <span className="muted small">Custom date &amp; time</span>
                    <input
                      type="datetime-local"
                      className="todos-row__date"
                      defaultValue={toLocalDatetimeValue(item.dueAt)}
                      key={`due-${item.id}-${item.updatedAt}`}
                      onChange={(e) => {
                        const v = fromLocalDatetimeValue(e.target.value);
                        onPatch(item.id, { dueAt: v });
                      }}
                    />
                  </label>
                  {item.dueAt ? (
                    <button
                      type="button"
                      className="todos-row__sched-clear"
                      onClick={() => {
                        onPatch(item.id, { dueAt: undefined });
                        setScheduleOpen(false);
                      }}
                    >
                      Clear schedule
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <select
              className="todos-row__move"
              value={item.groupId}
              onChange={(e) => onPatch(item.id, { groupId: e.target.value })}
              aria-label="Move to list"
            >
              {groups.map((gr) => (
                <option key={gr.id} value={gr.id}>
                  {gr.name}
                </option>
              ))}
            </select>
            <button type="button" className="todos-row__icon-btn" title="Delete" onClick={() => onRemove(item.id)}>
              <IcTrash size={16} />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function TodosPage() {
  const { user } = useAccount();
  const userId = user?.id ?? '';
  const {
    data,
    addTodoGroup,
    removeTodoGroup,
    addTodoItem,
    updateTodoItem,
    toggleTodoItem,
    removeTodoItem,
    updateTodoGroup,
    moveTodoGroup,
    reorderTodoGroup,
    clearCompletedInGroup,
    markAllCompleteInGroup,
  } = useAppData();
  const [newGroupName, setNewGroupName] = useState('');
  const [newListOpen, setNewListOpen] = useState(false);
  const [draftByGroup, setDraftByGroup] = useState<Record<string, string>>({});
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [sectionOpenMap, setSectionOpenMap] = useState<Record<string, boolean>>({});
  const [sectionsHydrated, setSectionsHydrated] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const allGroupsSorted = useMemo(() => sortGroups(data.todoGroups), [data.todoGroups]);

  const visibleGroups = useMemo(
    () => allGroupsSorted.filter((g) => showArchived || !g.archived),
    [allGroupsSorted, showArchived],
  );

  useEffect(() => {
    if (!userId) {
      setSectionOpenMap({});
      setSectionsHydrated(true);
      return;
    }
    setSectionsHydrated(false);
    try {
      const raw = localStorage.getItem(todoSectionsStorageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setSectionOpenMap(parsed as Record<string, boolean>);
        } else {
          setSectionOpenMap({});
        }
      } else {
        setSectionOpenMap({});
      }
      const archivedRaw = localStorage.getItem(todoShowArchivedKey(userId));
      setShowArchived(archivedRaw === '1');
    } catch {
      setSectionOpenMap({});
    }
    setSectionsHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!sectionsHydrated || !userId) return;
    try {
      localStorage.setItem(todoSectionsStorageKey(userId), JSON.stringify(sectionOpenMap));
    } catch {
      /* ignore */
    }
  }, [sectionOpenMap, sectionsHydrated, userId]);

  useEffect(() => {
    if (!sectionsHydrated || !userId) return;
    try {
      localStorage.setItem(todoShowArchivedKey(userId), showArchived ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [showArchived, sectionsHydrated, userId]);

  const itemsByGroup = useMemo(() => {
    const m = new Map<string, TodoItem[]>();
    for (const g of data.todoGroups) m.set(g.id, []);
    for (const it of data.todoItems) {
      const arr = m.get(it.groupId) ?? [];
      arr.push(it);
      m.set(it.groupId, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
        const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
        if (ad !== bd) return ad - bd;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    }
    return m;
  }, [data.todoGroups, data.todoItems]);

  const groupById = useMemo(() => new Map(allGroupsSorted.map((g) => [g.id, g])), [allGroupsSorted]);

  const q = search.trim().toLowerCase();
  const matchesQuery = (it: TodoItem) => !q || it.title.toLowerCase().includes(q);

  return (
    <div className="page todos-route">
      <header className="page-head todos-route__head">
        <div className="todos-route__head-main">
          <h1>Today</h1>
          <p className="muted">
            Your personal tasks, organised by lists. Drag the
            <span className="todos-route__head-grip" aria-hidden> <IcGrip size={14} /> </span>
            handle to reorder lists.
          </p>
        </div>
        <div className="todos-route__head-actions">
          <button
            type="button"
            className="todos-route__display-btn"
            title={compact ? 'Switch to comfortable spacing' : 'Switch to compact spacing'}
            aria-pressed={compact}
            onClick={() => setCompact((c) => !c)}
          >
            {compact ? <IcLayoutGrid size={16} /> : <IcListTodo size={16} />}
            <span>{compact ? 'Comfortable' : 'Compact'}</span>
          </button>
        </div>
      </header>

      <section className="card todos-toolbar">
        <input
          type="search"
          className="input todos-toolbar__search"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="todos-toolbar__check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span className="small">Show archived</span>
        </label>
      </section>

      {visibleGroups.map((g, idx) => {
        const list = itemsByGroup.get(g.id) ?? [];
        const matchedList = list.filter(matchesQuery);
        const draft = draftByGroup[g.id] ?? '';
        const active = matchedList.filter((x) => !x.done);
        const done = matchedList.filter((x) => x.done);
        const totalActive = list.filter((x) => !x.done).length;
        const totalDone = list.filter((x) => x.done).length;
        const sectionOpen = isSectionOpen(sectionOpenMap, g.id);

        if (q && matchedList.length === 0) return null;

        const peers = allGroupsSorted.filter((p) => !!p.pinned === !!g.pinned && !!p.archived === !!g.archived);
        const myIdx = peers.findIndex((p) => p.id === g.id);
        const canMoveUp = myIdx > 0;
        const canMoveDown = myIdx >= 0 && myIdx < peers.length - 1;

        const isDragSrc = dragGroupId === g.id;
        const isDropTgt = dropTargetId === g.id && dragGroupId !== null && dragGroupId !== g.id;

        return (
          <section
            key={g.id}
            className={`card todos-section${g.pinned ? ' todos-section--pinned' : ''}${
              g.archived ? ' todos-section--archived' : ''
            }${isDragSrc ? ' todos-section--dragging' : ''}${isDropTgt ? ' todos-section--drop-target' : ''}`}
            onDragOver={(e) => {
              if (!dragGroupId || dragGroupId === g.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dropTargetId !== g.id) setDropTargetId(g.id);
            }}
            onDragLeave={(e) => {
              if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) {
                if (dropTargetId === g.id) setDropTargetId(null);
              }
            }}
            onDrop={(e) => {
              if (!dragGroupId || dragGroupId === g.id) return;
              e.preventDefault();
              reorderTodoGroup(dragGroupId, g.id);
              setDragGroupId(null);
              setDropTargetId(null);
            }}
          >
            <div className="todos-section__head">
              <button
                type="button"
                className="todos-section__grip"
                draggable
                aria-label={`Drag ${g.name} to reorder`}
                title="Drag to reorder"
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/x-todo-group', g.id);
                  setDragGroupId(g.id);
                }}
                onDragEnd={() => {
                  setDragGroupId(null);
                  setDropTargetId(null);
                }}
                onClick={(e) => e.preventDefault()}
              >
                <IcGrip size={16} />
              </button>
              <button
                type="button"
                className={`todos-section__toggle${sectionOpen ? '' : ' todos-section__toggle--collapsed'}`}
                title={sectionOpen ? 'Collapse list' : 'Expand list'}
                aria-expanded={sectionOpen}
                aria-label={sectionOpen ? 'Collapse list' : 'Expand list'}
                onClick={() =>
                  setSectionOpenMap((prev) => ({
                    ...prev,
                    [g.id]: !isSectionOpen(prev, g.id),
                  }))
                }
              >
                <IcChevronDown size={18} className="todos-section__chev" strokeWidth={2.25} />
              </button>

              <button
                type="button"
                className={`todos-section__pin${g.pinned ? ' todos-section__pin--on' : ''}`}
                title={g.pinned ? 'Unpin list' : 'Pin to top'}
                aria-label={g.pinned ? 'Unpin list' : 'Pin to top'}
                aria-pressed={!!g.pinned}
                onClick={() => updateTodoGroup(g.id, { pinned: !g.pinned })}
              >
                <IcStar size={16} />
              </button>

              <input
                className="todos-section__title"
                defaultValue={g.name}
                key={`gn-${g.id}-${g.name}`}
                aria-label="List name"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== g.name) updateTodoGroup(g.id, { name: v });
                }}
              />

              <span className="todos-section__counts" title="Open · Completed">
                {totalActive}
                <span className="muted"> / {totalActive + totalDone}</span>
                {g.archived ? <span className="pill" style={{ marginLeft: 8 }}>archived</span> : null}
              </span>

              <details className="todos-section__menu">
                <summary className="todos-section__menu-btn" aria-label="List options">
                  <span aria-hidden>⋯</span>
                </summary>
                <div className="todos-section__menu-panel">
                  <button
                    type="button"
                    className="todos-section__menu-item"
                    disabled={!canMoveUp}
                    onClick={() => moveTodoGroup(g.id, 'up')}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="todos-section__menu-item"
                    disabled={!canMoveDown}
                    onClick={() => moveTodoGroup(g.id, 'down')}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className="todos-section__menu-item"
                    onClick={() => updateTodoGroup(g.id, { pinned: !g.pinned })}
                  >
                    {g.pinned ? 'Unpin' : 'Pin to top'}
                  </button>
                  <button
                    type="button"
                    className="todos-section__menu-item"
                    onClick={() => updateTodoGroup(g.id, { archived: !g.archived })}
                  >
                    {g.archived ? 'Unarchive' : 'Archive'}
                  </button>
                  <div className="todos-section__menu-sep" />
                  <button
                    type="button"
                    className="todos-section__menu-item"
                    disabled={totalActive === 0}
                    onClick={() => {
                      if (window.confirm(`Mark every open task in “${g.name}” as complete?`)) {
                        markAllCompleteInGroup(g.id);
                      }
                    }}
                  >
                    Mark all complete
                  </button>
                  <button
                    type="button"
                    className="todos-section__menu-item"
                    disabled={totalDone === 0}
                    onClick={() => {
                      if (window.confirm(`Remove all completed tasks from “${g.name}”?`)) {
                        clearCompletedInGroup(g.id);
                      }
                    }}
                  >
                    Clear completed ({totalDone})
                  </button>
                  {data.todoGroups.length > 1 ? (
                    <>
                      <div className="todos-section__menu-sep" />
                      <button
                        type="button"
                        className="todos-section__menu-item todos-section__menu-item--danger"
                        onClick={() => {
                          if (window.confirm(`Delete the “${g.name}” list? Its tasks will be moved to another list.`)) {
                            removeTodoGroup(g.id);
                          }
                        }}
                      >
                        Delete list
                      </button>
                    </>
                  ) : null}
                </div>
              </details>
            </div>

            {sectionOpen ? (
              <>
                {active.length === 0 && done.length === 0 ? (
                  <p className="todos-section__empty">
                    {q ? 'No matching tasks in this list.' : 'No tasks in this list.'}
                  </p>
                ) : (
                  <ul className="todos-list">
                    {active.map((it) => (
                      <TodoTaskRow
                        key={it.id}
                        item={it}
                        group={groupById.get(it.groupId) ?? g}
                        groups={allGroupsSorted}
                        compact={compact}
                        onPatch={(id, patch) => updateTodoItem(id, patch)}
                        onToggle={toggleTodoItem}
                        onRemove={removeTodoItem}
                      />
                    ))}
                    {done.map((it) => (
                      <TodoTaskRow
                        key={it.id}
                        item={it}
                        group={groupById.get(it.groupId) ?? g}
                        groups={allGroupsSorted}
                        compact={compact}
                        onPatch={(id, patch) => updateTodoItem(id, patch)}
                        onToggle={toggleTodoItem}
                        onRemove={removeTodoItem}
                      />
                    ))}
                  </ul>
                )}

                {addingGroupId === g.id ? (
                  <form
                    className="todos-add-inline"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (!draft.trim()) {
                        setAddingGroupId(null);
                        return;
                      }
                      addTodoItem(g.id, draft.trim());
                      setDraftByGroup((prev) => ({ ...prev, [g.id]: '' }));
                      setAddingGroupId(null);
                    }}
                  >
                    <input
                      className="todos-add-inline__input"
                      placeholder="Task name"
                      value={draft}
                      autoFocus
                      onChange={(e) => setDraftByGroup((prev) => ({ ...prev, [g.id]: e.target.value }))}
                      onBlur={() => {
                        if (!draft.trim()) setAddingGroupId(null);
                      }}
                    />
                    <button type="submit" className="todos-add-inline__submit">
                      Add
                    </button>
                    <button type="button" className="todos-add-inline__cancel" onClick={() => setAddingGroupId(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button type="button" className="todos-add-task" onClick={() => setAddingGroupId(g.id)}>
                    <IcPlus size={18} className="todos-add-task__plus" strokeWidth={2.5} />
                    Add task
                  </button>
                )}
              </>
            ) : null}
            {/* unused idx kept for parity with future drag reordering */}
            <span hidden>{idx}</span>
          </section>
        );
      })}

      {dragGroupId ? (
        <div
          className={`todos-drop-tail${dropTargetId === '__end__' ? ' todos-drop-tail--active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dropTargetId !== '__end__') setDropTargetId('__end__');
          }}
          onDragLeave={() => {
            if (dropTargetId === '__end__') setDropTargetId(null);
          }}
          onDrop={(e) => {
            if (!dragGroupId) return;
            e.preventDefault();
            reorderTodoGroup(dragGroupId, null);
            setDragGroupId(null);
            setDropTargetId(null);
          }}
        >
          Drop here to move to the end
        </div>
      ) : null}

      <section className="card todos-route__foot">
        {newListOpen ? (
          <form
            className="todos-new-list"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!newGroupName.trim()) return;
              addTodoGroup(newGroupName.trim());
              setNewGroupName('');
              setNewListOpen(false);
            }}
          >
            <input
              className="todos-new-list__input"
              placeholder="New list name"
              value={newGroupName}
              autoFocus
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <button type="submit" className="todos-new-list__ok">
              Create
            </button>
            <button type="button" className="todos-new-list__cancel" onClick={() => setNewListOpen(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="todos-add-list" onClick={() => setNewListOpen(true)}>
            <IcPlus size={17} className="todos-add-list__plus" strokeWidth={2.5} />
            Add list
          </button>
        )}
      </section>
    </div>
  );
}
