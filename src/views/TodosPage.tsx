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
  IcSparkles,
  IcStar,
  IcTrash,
} from '../components/icons';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import { AIAssistantDialog } from '../components/AIAssistantDialog';
import { AITaskExtractorDialog } from '../components/AITaskExtractorDialog';
import { AutoResizeTextarea } from '../components/ui/AutoResizeTextarea';
import { isAIConfigured } from '../lib/ai';
import { formatDateShort, formatTimeOnly, fromLocalDatetimeValue, isPast, toLocalDatetimeValue } from '../lib/datetime';
import { PRIORITY_OPTIONS, priorityRank } from '../model';
import type { Priority, TodoGroup, TodoItem } from '../model';

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
const LS_TODO_HIDE_DONE = 'leeadman.todos.hideDone.v1';
const LS_TODO_SORT_MODE = 'leeadman.todos.sortMode.v1';

function todoSectionsStorageKey(userId: string) {
  return `${LS_TODO_SECTIONS}:${userId}`;
}

function todoShowArchivedKey(userId: string) {
  return `${LS_TODO_SHOW_ARCHIVED}:${userId}`;
}

function todoHideDoneKey(userId: string) {
  return `${LS_TODO_HIDE_DONE}:${userId}`;
}

function todoSortModeKey(userId: string) {
  return `${LS_TODO_SORT_MODE}:${userId}`;
}

/**
 * Controls how items inside a list are ordered:
 *   - 'manual'    → user-defined sortOrder (drag-and-drop)
 *   - 'priority'  → urgent > high > normal > low, ties broken by manual order
 *   - 'due'       → soonest due date first; undated items last
 */
type SortMode = 'manual' | 'priority' | 'due';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'manual', label: 'Manual order' },
  { value: 'priority', label: 'By priority' },
  { value: 'due', label: 'By due date' },
];

function isSectionOpen(map: Record<string, boolean>, groupId: string): boolean {
  return map[groupId] !== false;
}

function priorityShort(p: Priority): string {
  switch (p) {
    case 'urgent':
      return 'U';
    case 'high':
      return 'H';
    case 'normal':
      return 'N';
    case 'low':
      return 'L';
    default:
      return '';
  }
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
  aiEnabled: boolean;
  allowDrag: boolean;
  isDragSrc: boolean;
  isDropTgt: boolean;
  onAskAI: (item: TodoItem) => void;
  onPatch: (
    id: string,
    patch: Partial<Pick<TodoItem, 'title' | 'groupId' | 'dueAt' | 'priority'>>,
  ) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (itemId: string) => void;
  onDragOver: (itemId: string) => void;
  onDrop: (itemId: string) => void;
  onDragEnd: () => void;
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

function TodoTaskRow({
  item,
  group,
  groups,
  compact,
  aiEnabled,
  allowDrag,
  isDragSrc,
  isDropTgt,
  onAskAI,
  onPatch,
  onToggle,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TodoTaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dueLabel = item.dueAt ? formatTimeOnly(item.dueAt) : '';
  const dueDateShort = formatDateShort(item.dueAt);
  const overdue = item.dueAt && isPast(item.dueAt) && !item.done;
  const presets = useMemo(() => quickPresets(), []);

  const applyPreset = (when: Date) => {
    onPatch(item.id, { dueAt: when.toISOString() });
    setScheduleOpen(false);
  };

  // 3-second "click-to-confirm" delete. We auto-revert the confirm state so
  // the trash button doesn't sit in a dangerous mode after the user navigates
  // away mentally. Two clicks are required only when the user is hovering on
  // the same row, which keeps the keyboard-driven flow as one mental step.
  useEffect(() => {
    if (!confirmDelete) return;
    const t = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmDelete]);

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    onRemove(item.id);
  };

  return (
    <li
      className={`todos-row${compact ? ' todos-row--compact' : ''}${item.done ? ' todos-row--done' : ''}${
        item.priority ? ` todos-row--prio-${item.priority}` : ''
      }${isDragSrc ? ' todos-row--dragging' : ''}${isDropTgt ? ' todos-row--drop-target' : ''}`}
      style={ringStyle(item.groupId)}
      draggable={allowDrag}
      onDragStart={(e) => {
        if (!allowDrag) return;
        onDragStart(item.id);
        e.dataTransfer.effectAllowed = 'move';
        // Some platforms (Safari) refuse to start a drag without setData.
        try { e.dataTransfer.setData('text/plain', item.id); } catch { /* ignore */ }
      }}
      onDragOver={(e) => {
        if (!allowDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(item.id);
      }}
      onDrop={(e) => {
        if (!allowDrag) return;
        e.preventDefault();
        onDrop(item.id);
      }}
      onDragEnd={() => {
        if (!allowDrag) return;
        onDragEnd();
      }}
    >
      {allowDrag ? (
        <span className="todos-row__handle" aria-hidden title="Drag to reorder">
          <IcGrip size={14} />
        </span>
      ) : null}
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
            <AutoResizeTextarea
              className="todos-row__title-input todos-row__title-input--multi"
              value={draftTitle}
              autoFocus
              minRows={2}
              maxRows={8}
              ariaLabel="Edit task"
              onChange={setDraftTitle}
              onSubmit={() => {
                const t = draftTitle.trim();
                if (t && t !== item.title) onPatch(item.id, { title: t });
                else setDraftTitle(item.title);
                setEditing(false);
              }}
              onCancel={() => {
                setDraftTitle(item.title);
                setEditing(false);
              }}
              onBlur={() => {
                const t = draftTitle.trim();
                if (t && t !== item.title) onPatch(item.id, { title: t });
                else setDraftTitle(item.title);
                setEditing(false);
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

          {item.priority ? (
            <span className={`todos-row__prio todos-row__prio--${item.priority}`} title={`Priority: ${item.priority}`}>
              {priorityShort(item.priority)}
            </span>
          ) : null}

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
              value={item.priority ?? ''}
              onChange={(e) =>
                onPatch(item.id, { priority: (e.target.value || undefined) as Priority | undefined })
              }
              aria-label="Set priority"
              title="Priority"
            >
              <option value="">No priority</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
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
            {aiEnabled ? (
              <button
                type="button"
                className="todos-row__ai-btn"
                title="Ask AI for recommendations"
                onClick={() => onAskAI(item)}
              >
                <IcSparkles size={15} />
              </button>
            ) : null}
            <button
              type="button"
              className={`todos-row__icon-btn${confirmDelete ? ' todos-row__icon-btn--confirm' : ''}`}
              title={confirmDelete ? 'Click again to confirm delete' : 'Delete'}
              aria-label={confirmDelete ? 'Click again to confirm delete' : 'Delete'}
              onClick={handleDeleteClick}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? (
                <span className="todos-row__icon-btn-label">Sure?</span>
              ) : (
                <IcTrash size={16} />
              )}
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
    reorderTodoItem,
    updateTodoGroupPriority,
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
  const [hideDone, setHideDone] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropItemTargetId, setDropItemTargetId] = useState<string | null>(null);
  const [aiTask, setAiTask] = useState<TodoItem | null>(null);
  const [extractorOpen, setExtractorOpen] = useState(false);

  const aiEnabled = isAIConfigured(data.aiSettings);
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
      const hideDoneRaw = localStorage.getItem(todoHideDoneKey(userId));
      setHideDone(hideDoneRaw === '1');
      const sortRaw = localStorage.getItem(todoSortModeKey(userId));
      setSortMode(sortRaw === 'priority' || sortRaw === 'due' ? sortRaw : 'manual');
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

  useEffect(() => {
    if (!sectionsHydrated || !userId) return;
    try {
      localStorage.setItem(todoHideDoneKey(userId), hideDone ? '1' : '0');
      localStorage.setItem(todoSortModeKey(userId), sortMode);
    } catch {
      /* ignore */
    }
  }, [hideDone, sortMode, sectionsHydrated, userId]);

  const itemsByGroup = useMemo(() => {
    const m = new Map<string, TodoItem[]>();
    for (const g of data.todoGroups) m.set(g.id, []);
    for (const it of data.todoItems) {
      const arr = m.get(it.groupId) ?? [];
      arr.push(it);
      m.set(it.groupId, arr);
    }
    const orderOf = (x: TodoItem) => x.sortOrder ?? 0;
    const dueOf = (x: TodoItem) => (x.dueAt ? Date.parse(x.dueAt) : Infinity);

    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (sortMode === 'priority') {
          const dp = priorityRank(a.priority) - priorityRank(b.priority);
          if (dp !== 0) return dp;
          return orderOf(a) - orderOf(b);
        }
        if (sortMode === 'due') {
          const dd = dueOf(a) - dueOf(b);
          if (dd !== 0) return dd;
          return orderOf(a) - orderOf(b);
        }
        // manual
        return orderOf(a) - orderOf(b);
      });
    }
    return m;
  }, [data.todoGroups, data.todoItems, sortMode]);

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
        <label className="todos-toolbar__select">
          <span className="muted small">Sort</span>
          <select
            className="input"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label="Sort items by"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="todos-toolbar__check">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
          />
          <span className="small">Hide completed</span>
        </label>
        <label className="todos-toolbar__check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span className="small">Show archived</span>
        </label>
        {aiEnabled ? (
          <button
            type="button"
            className="btn btn--ghost todos-toolbar__ai"
            onClick={() => setExtractorOpen(true)}
            title="Paste notes and let AI extract tasks for you"
          >
            <IcSparkles size={14} />
            <span>Extract from notes</span>
          </button>
        ) : null}
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
                {g.priority ? (
                  <span
                    className={`pill todos-section__prio todos-section__prio--${g.priority}`}
                    style={{ marginLeft: 8 }}
                    title={`List priority: ${g.priority}`}
                  >
                    {g.priority}
                  </span>
                ) : null}
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
                  <div className="todos-section__menu-row">
                    <span className="muted small">List priority</span>
                    <select
                      className="input"
                      value={g.priority ?? ''}
                      onChange={(e) =>
                        updateTodoGroupPriority(
                          g.id,
                          (e.target.value || undefined) as Priority | undefined,
                        )
                      }
                      aria-label="List priority"
                    >
                      <option value="">None</option>
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
                {active.length === 0 && (hideDone || done.length === 0) ? (
                  <p className="todos-section__empty">
                    {q
                      ? 'No matching tasks in this list.'
                      : hideDone && done.length > 0
                        ? `${done.length} completed task${done.length === 1 ? '' : 's'} hidden.`
                        : 'No tasks in this list.'}
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
                        aiEnabled={aiEnabled}
                        allowDrag={sortMode === 'manual'}
                        isDragSrc={dragItemId === it.id}
                        isDropTgt={dropItemTargetId === it.id && dragItemId !== it.id}
                        onAskAI={setAiTask}
                        onPatch={(id, patch) => updateTodoItem(id, patch)}
                        onToggle={toggleTodoItem}
                        onRemove={removeTodoItem}
                        onDragStart={setDragItemId}
                        onDragOver={setDropItemTargetId}
                        onDrop={(targetId) => {
                          if (dragItemId && dragItemId !== targetId) {
                            reorderTodoItem(dragItemId, g.id, targetId);
                          }
                          setDragItemId(null);
                          setDropItemTargetId(null);
                        }}
                        onDragEnd={() => {
                          setDragItemId(null);
                          setDropItemTargetId(null);
                        }}
                      />
                    ))}
                    {!hideDone &&
                      done.map((it) => (
                        <TodoTaskRow
                          key={it.id}
                          item={it}
                          group={groupById.get(it.groupId) ?? g}
                          groups={allGroupsSorted}
                          compact={compact}
                          aiEnabled={aiEnabled}
                          allowDrag={false}
                          isDragSrc={false}
                          isDropTgt={false}
                          onAskAI={setAiTask}
                          onPatch={(id, patch) => updateTodoItem(id, patch)}
                          onToggle={toggleTodoItem}
                          onRemove={removeTodoItem}
                          onDragStart={() => {}}
                          onDragOver={() => {}}
                          onDrop={() => {}}
                          onDragEnd={() => {}}
                        />
                      ))}
                  </ul>
                )}

                {addingGroupId === g.id ? (
                  <form
                    className="todos-add-inline todos-add-inline--multi"
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
                    <AutoResizeTextarea
                      className="todos-add-inline__input todos-add-inline__textarea"
                      placeholder={'Describe the task — Enter for a new line, ⌘/Ctrl+Enter to add'}
                      value={draft}
                      autoFocus
                      minRows={3}
                      maxRows={10}
                      ariaLabel="New task"
                      onChange={(v) => setDraftByGroup((prev) => ({ ...prev, [g.id]: v }))}
                      onSubmit={() => {
                        if (!draft.trim()) {
                          setAddingGroupId(null);
                          return;
                        }
                        addTodoItem(g.id, draft.trim());
                        setDraftByGroup((prev) => ({ ...prev, [g.id]: '' }));
                        setAddingGroupId(null);
                      }}
                      onCancel={() => setAddingGroupId(null)}
                    />
                    <div className="todos-add-inline__actions">
                      <button type="submit" className="todos-add-inline__submit">
                        Add
                      </button>
                      <button type="button" className="todos-add-inline__cancel" onClick={() => setAddingGroupId(null)}>
                        Cancel
                      </button>
                    </div>
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

      <AIAssistantDialog
        open={!!aiTask}
        onClose={() => setAiTask(null)}
        task={{ title: aiTask?.title ?? '' }}
      />
      <AITaskExtractorDialog
        open={extractorOpen}
        onClose={() => setExtractorOpen(false)}
        defaultGroupId={visibleGroups[0]?.id}
      />
    </div>
  );
}
