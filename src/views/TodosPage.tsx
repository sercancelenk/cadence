import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { IcCalendar, IcCheck, IcChevronDown, IcClock, IcLayoutGrid, IcListTodo, IcPlus, IcTrash } from '../components/icons';
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

function todoSectionsStorageKey(userId: string) {
  return `${LS_TODO_SECTIONS}:${userId}`;
}

function isSectionOpen(map: Record<string, boolean>, groupId: string): boolean {
  return map[groupId] !== false;
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

function TodoTaskRow({ item, group, groups, compact, onPatch, onToggle, onRemove }: TodoTaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);

  const dueLabel = item.dueAt ? formatTimeOnly(item.dueAt) : '';
  const dueDateShort = formatDateShort(item.dueAt);
  const overdue = item.dueAt && isPast(item.dueAt) && !item.done;

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
              <span className="todos-row__meta-placeholder">Set due date</span>
            )}
          </div>
          <div className="todos-row__toolbar">
            <label className="todos-row__date-lbl">
              <span className="sr-only">Due date</span>
              <input
                type="datetime-local"
                className="todos-row__date"
                defaultValue={toLocalDatetimeValue(item.dueAt)}
                key={`due-${item.id}-${item.updatedAt}`}
                onBlur={(e) => {
                  const v = fromLocalDatetimeValue(e.target.value);
                  onPatch(item.id, { dueAt: v });
                }}
              />
            </label>
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
  const { data, addTodoGroup, removeTodoGroup, addTodoItem, updateTodoItem, toggleTodoItem, removeTodoItem, updateTodoGroup } =
    useAppData();
  const [newGroupName, setNewGroupName] = useState('');
  const [newListOpen, setNewListOpen] = useState(false);
  const [draftByGroup, setDraftByGroup] = useState<Record<string, string>>({});
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [sectionOpenMap, setSectionOpenMap] = useState<Record<string, boolean>>({});
  const [sectionsHydrated, setSectionsHydrated] = useState(false);

  const groups = useMemo(() => [...data.todoGroups].sort((a, b) => a.sortOrder - b.sortOrder), [data.todoGroups]);

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

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  return (
    <div className="page todos-route">
      <header className="page-head todos-route__head">
        <div className="todos-route__head-main">
          <h1>Today</h1>
          <p className="muted">Your personal tasks, organised by lists.</p>
        </div>
        <button
          type="button"
          className="todos-route__display-btn todos-route__display-btn--icon-only"
          title={compact ? 'Comfortable view' : 'Compact view'}
          aria-label={compact ? 'Comfortable view' : 'Compact view'}
          onClick={() => setCompact((c) => !c)}
        >
          {compact ? <IcListTodo size={17} /> : <IcLayoutGrid size={17} />}
        </button>
      </header>

      {groups.map((g) => {
        const list = itemsByGroup.get(g.id) ?? [];
        const draft = draftByGroup[g.id] ?? '';
        const active = list.filter((x) => !x.done);
        const done = list.filter((x) => x.done);
        const sectionOpen = isSectionOpen(sectionOpenMap, g.id);

        return (
          <section key={g.id} className="card todos-section">
            <div className="todos-section__head">
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
              {data.todoGroups.length > 1 ? (
                <details className="todos-section__menu">
                  <summary className="todos-section__menu-btn" aria-label="List options">
                    <span aria-hidden>⋯</span>
                  </summary>
                  <div className="todos-section__menu-panel">
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
                  </div>
                </details>
              ) : null}
            </div>

            {sectionOpen ? (
              <>
                {active.length === 0 && done.length === 0 ? (
                  <p className="todos-section__empty">No tasks in this list.</p>
                ) : (
                  <ul className="todos-list">
                    {active.map((it) => (
                      <TodoTaskRow
                        key={it.id}
                        item={it}
                        group={groupById.get(it.groupId) ?? g}
                        groups={groups}
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
                        groups={groups}
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
          </section>
        );
      })}

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
