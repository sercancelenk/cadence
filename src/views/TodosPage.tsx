import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IcCalendar,
  IcCheck,
  IcChevronDown,
  IcClock,
  IcGrip,
  IcLayoutGrid,
  IcListTodo,
  IcPlus,
  IcSearch,
  IcSliders,
  IcSparkles,
  IcStar,
  IcStickyNote,
  IcTrash,
  IcX,
} from '../components/icons';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import { useToast } from '../components/ui/Toast';
// AI dialogs are lazy-loaded: they pull in react-markdown (~125 kB) plus
// lib/ai.ts (~9 kB) and the vast majority of users open them only
// occasionally. Keeping them out of the initial TodosPage chunk meaningfully
// shrinks first-paint for everyone else.
const AIAssistantDialog = lazy(() =>
  import('../components/AIAssistantDialog').then((m) => ({ default: m.AIAssistantDialog })),
);
const AITaskExtractorDialog = lazy(() =>
  import('../components/AITaskExtractorDialog').then((m) => ({ default: m.AITaskExtractorDialog })),
);
// MarkdownEditor pulls in react-markdown + remark-gfm (the same chunk
// the Notes page uses). We lazy-load it here so the initial Todos page
// payload stays light — the editor only mounts when somebody opens a
// row for editing or starts a new task with `+`.
const MarkdownEditor = lazy(() =>
  import('../components/ui/MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })),
);
// Same chunk as the editor — pulling MarkdownView via the existing
// lazy wrapper keeps the markdown-vendor cost out of the Todos initial
// payload until the user actually expands a body preview.
const MarkdownView = lazy(() =>
  import('../components/ui/MarkdownEditor').then((m) => ({ default: m.MarkdownView })),
);
import { SchedulePopover, type SchedulePatch } from '../components/ui/SchedulePopover';
import { isAIConfigured } from '../lib/ai';
import { useFeatures } from '../lib/features';
import { formatDateShort, formatTimeOnly, isPast } from '../lib/datetime';
import { PRIORITY_OPTIONS, priorityRank, TODO_STATUS_OPTIONS, isTodoOpen, todoStatusRank } from '../model';
import type { Priority, TodoGroup, TodoItem, TodoStatus } from '../model';

/**
 * Bridge from the popover's tri-state patch shape (`undefined` =
 * untouched, `null` = clear, string = set) to our action layer's
 * shape, which treats `undefined` as "clear" already. We only spread
 * fields the popover explicitly touched, so a patch that only changes
 * `remindRepeat` doesn't accidentally wipe `dueAt`.
 */
function schedulePatchToTodoPatch(
  patch: SchedulePatch,
): Partial<Pick<TodoItem, 'dueAt' | 'remindAt' | 'remindRepeat'>> {
  const out: Partial<Pick<TodoItem, 'dueAt' | 'remindAt' | 'remindRepeat'>> = {};
  if (patch.dueAt !== undefined) out.dueAt = patch.dueAt ?? undefined;
  if (patch.remindAt !== undefined) out.remindAt = patch.remindAt ?? undefined;
  if (patch.remindRepeat !== undefined) out.remindRepeat = patch.remindRepeat ?? undefined;
  return out;
}

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

// localStorage keys for to-do view preferences. Keep the legacy `leeadman.*`
// prefix-replacement at write-time only — the migration shim already copied
// any pre-rename values into the new `cadence.*` keys at app boot.
const LS_TODO_SECTIONS = 'cadence.todos.sectionsOpen.v1';
const LS_TODO_SHOW_ARCHIVED = 'cadence.todos.showArchived.v1';
const LS_TODO_HIDE_DONE = 'cadence.todos.hideDone.v1';
const LS_TODO_SORT_MODE = 'cadence.todos.sortMode.v1';
const LS_TODO_STATUS_FILTER = 'cadence.todos.statusFilter.v1';

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

function todoStatusFilterKey(userId: string) {
  return `${LS_TODO_STATUS_FILTER}:${userId}`;
}

/**
 * Controls how items inside a list are ordered:
 *   - 'manual'    → user-defined sortOrder (drag-and-drop)
 *   - 'priority'  → urgent > high > normal > low, ties broken by manual order
 *   - 'due'       → soonest due date first; undated items last
 *   - 'status'    → Kanban order: todo → in_progress → done → cancelled,
 *                   ties broken by manual order
 *   - 'created'   → newest createdAt first (when did I add this?)
 *   - 'updated'   → newest updatedAt first (which task did I just touch?)
 *   - 'completed' → newest doneAt first; rows that never reached a
 *                   terminal state sink to the bottom. Useful for
 *                   "what did I ship this week?" reviews.
 *
 * Date modes all sort newest-first because that's what "history" means
 * to most users (the freshest entry is the most relevant); ties on
 * missing dates fall to the end so the list never shuffles around
 * when a row is missing the field.
 */
type SortMode = 'manual' | 'priority' | 'due' | 'status' | 'created' | 'updated' | 'completed';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'manual', label: 'Manual order' },
  { value: 'priority', label: 'By priority' },
  { value: 'due', label: 'By due date' },
  { value: 'status', label: 'By status' },
  { value: 'created', label: 'By created date (newest)' },
  { value: 'updated', label: 'By updated date (newest)' },
  { value: 'completed', label: 'By completed date (newest)' },
];

/**
 * Status filter modes. `all` is the default — we don't drop anything. The
 * other modes either pick a single status or an aggregate ("open" = todo
 * + in_progress, which matches the most useful "stuff I still have to do"
 * view). `done` and `cancelled` make it easy to review closed work.
 */
type StatusFilter = 'all' | 'open' | TodoStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open (todo + WIP)' },
  ...TODO_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

function matchesStatusFilter(status: TodoStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return isTodoOpen(status);
  return status === filter;
}

/**
 * Strip any orphan markdown separators (`---`) that ended up at the
 * very end of a body, along with the blank lines surrounding them.
 *
 * Background: an earlier version of the "Save to notes" flow always
 * appended `\n\n---\n\n${aiContent}` to the existing body, even when
 * `aiContent` was empty (e.g. a click before the assistant finished
 * streaming). That left tasks with a dangling `---` separator and no
 * AI content below it — the user would open the body and see their
 * notes followed by a lonely horizontal rule, which read like data
 * loss. We normalise that here so the row preview and edit surface
 * both look clean even on tasks that were touched by the old code.
 */
function stripTrailingSeparators(body: string): string {
  // Drop runs of `---` (optionally with surrounding blank lines) at
  // the very end of the body. We keep separators in the middle of
  // the body intact — they're meaningful when followed by content.
  return body.replace(/(?:\s*\n)+\s*-{3,}\s*$/g, '').replace(/\s+$/g, '');
}

/**
 * Parse a single markdown blob into a title + body pair. The first
 * non-empty line becomes the title (with any leading `#` stripped so
 * users can write headings naturally); everything after it is the body,
 * trimmed of leading/trailing blank lines.
 *
 * Used by BOTH the inline edit flow on existing rows and the new-task
 * add form, so the two surfaces stay symmetric: type a heading + notes,
 * hit save, get a task whose title matches what you wrote up top.
 */
function parseTitleAndBody(content: string): { title: string; body: string } {
  const lines = content.split('\n');
  let titleIdx = -1;
  let title = '';
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed) {
      title = trimmed.replace(/^#+\s+/, '');
      titleIdx = i;
      break;
    }
  }
  const body =
    titleIdx >= 0
      ? lines
          .slice(titleIdx + 1)
          .join('\n')
          .replace(/^\n+/, '')
          .replace(/\n+$/, '')
      : '';
  return { title, body };
}

function parseStatusFilter(raw: string | null): StatusFilter {
  if (!raw) return 'all';
  if (STATUS_FILTER_OPTIONS.some((o) => o.value === raw)) return raw as StatusFilter;
  return 'all';
}

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
  /**
   * Optional metadata about the note this task was extracted from.
   * `title` is the canonical note title at render time; if the note
   * has been deleted we pass `undefined` and render a "(deleted note)"
   * affordance instead of a link. Kept as a flat prop to avoid
   * threading the entire notes collection into every row.
   */
  sourceNote?: { id: string; title: string } | { id: string; title?: undefined };
  /**
   * When set, the row is rendered with a brief flash animation so a
   * user who arrived via "open this task" from another route can
   * spot it. The parent owns the lifetime — passing `false` removes
   * the highlight class.
   */
  isFocused?: boolean;
  onAskAI: (item: TodoItem) => void;
  /** Clicking the source-note chip routes to the linked note. */
  onOpenSourceNote?: (noteId: string) => void;
  onPatch: (
    id: string,
    patch: Partial<
      Pick<TodoItem, 'title' | 'body' | 'groupId' | 'dueAt' | 'priority' | 'status' | 'remindAt' | 'remindRepeat'>
    >,
  ) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (itemId: string) => void;
  onDragOver: (itemId: string) => void;
  onDrop: (itemId: string) => void;
  onDragEnd: () => void;
};

function TodoTaskRow({
  item,
  group,
  groups,
  compact,
  aiEnabled,
  allowDrag,
  isDragSrc,
  isDropTgt,
  sourceNote,
  isFocused,
  onAskAI,
  onOpenSourceNote,
  onPatch,
  onToggle,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TodoTaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /**
   * Single "row is expanded" toggle. When true:
   *   - The title's 2-line clamp is removed so the full text is
   *     visible (the trailing `…` on the clamped text is the
   *     affordance the user clicks).
   *   - If the task has a Markdown body, it is rendered inline
   *     beneath the meta sub-row.
   *
   * One state, one gesture, every row: single-click on the title
   * toggles expand; double-click drops into edit mode. There is no
   * separate body chip — body content surfaces automatically as
   * part of the same expand action.
   */
  const [titleExpanded, setTitleExpanded] = useState(false);
  // Which inline chip-menu is open. We use one state for all three chips
  // because only one menu can be open at a time — clicking a different
  // chip should swap menus, clicking outside should close. The outside-
  // click handler below scopes to the chips wrapper so this works even
  // though the menus render inside their own chip containers.
  const [openChip, setOpenChip] = useState<null | 'status' | 'priority' | 'group'>(null);
  const statusChipRef = useRef<HTMLDivElement | null>(null);
  const priorityChipRef = useRef<HTMLDivElement | null>(null);
  const groupChipRef = useRef<HTMLDivElement | null>(null);
  // Combined edit buffer: title + body in a single markdown document.
  // The first non-empty line becomes the title on save (stripped of any
  // leading `#` if the user wrote it as a heading), the rest becomes
  // the body. Initialised when entering edit mode via the helper below
  // so we always start from the current upstream state.
  const buildEditContent = (it: TodoItem): string => {
    // Strip any dangling `---` separators left behind by older
    // "Save to notes" appends so the editor opens on a clean buffer.
    const body = stripTrailingSeparators(it.body ?? '');
    return body ? `${it.title}\n\n${body}` : it.title;
  };
  const [draftEdit, setDraftEdit] = useState<string>(() => buildEditContent(item));

  const beginEdit = () => {
    setDraftEdit(buildEditContent(item));
    setEditing(true);
  };

  const saveEdit = () => {
    const { title, body } = parseTitleAndBody(draftEdit);
    // Persist the cleaned version so dangling `---` separators left
    // behind by older "Save to notes" passes get fixed on the next
    // edit — the user only has to open the row once.
    const normalisedBody = stripTrailingSeparators(body);
    const patch: Parameters<typeof onPatch>[1] = {};
    // Fall back to the existing title if the user cleared everything —
    // we never want to leave a task with an empty title.
    if (title && title !== item.title) patch.title = title;
    if (normalisedBody !== (item.body ?? '')) patch.body = normalisedBody;
    if (Object.keys(patch).length > 0) onPatch(item.id, patch);
    setEditing(false);
  };
  const cancelEdit = () => {
    setDraftEdit(buildEditContent(item));
    setEditing(false);
  };
  // The schedule trigger ref is forwarded to the popover so the popover's
  // outside-click detection ignores re-clicks on the trigger itself
  // (otherwise close+immediate-reopen ping-pongs around setState batching).
  const scheduleTriggerRef = useRef<HTMLButtonElement | null>(null);

  const dueLabel = item.dueAt ? formatTimeOnly(item.dueAt) : '';
  const dueDateShort = formatDateShort(item.dueAt);
  // Only OPEN rows (todo / in_progress) can be overdue. Done items aren't
  // pending anymore, and cancelled ones were explicitly dropped — flagging
  // either with an "Overdue" warning would just add noise.
  const overdue = item.dueAt && isPast(item.dueAt) && isTodoOpen(item.status);
  const reminderArmed = !!item.remindAt && isTodoOpen(item.status);

  // Close the currently open chip menu when the user clicks outside its
  // container or hits Escape. Clicking ANOTHER chip's button counts as
  // "outside" the current one — that mousedown closes the old menu,
  // then the new chip's onClick opens the new one in the next tick.
  useEffect(() => {
    if (!openChip) return;
    const ref =
      openChip === 'status'
        ? statusChipRef
        : openChip === 'priority'
          ? priorityChipRef
          : groupChipRef;
    const onClick = (e: MouseEvent) => {
      const node = ref.current;
      if (node && !node.contains(e.target as Node)) setOpenChip(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenChip(null);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openChip]);

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

  // Status meta is centralised so we don't repeat the lookup in every JSX
  // branch. `tone` maps onto the `.badge--<tone>` modifiers in `app.css`,
  // keeping the row's accent in sync with the global badge palette
  // (info/warn/ok/muted).
  const statusMeta = TODO_STATUS_OPTIONS.find((o) => o.value === item.status);
  const statusTone = statusMeta?.tone ?? 'info';
  const statusShort = statusMeta?.shortLabel ?? 'To do';

  // The "done" CSS modifier was historically driven by `item.done` alone,
  // which is fine for the checkmark but not enough now: cancelled rows
  // also want the strikethrough treatment to read as "this is no longer
  // an active task". We branch on status here and pass that through to
  // every visual the row uses.
  const isTerminal = item.status === 'done' || item.status === 'cancelled';

  return (
    <li
      data-todo-id={item.id}
      className={`todos-row${compact ? ' todos-row--compact' : ''}${isTerminal ? ' todos-row--done' : ''}${
        item.status === 'cancelled' ? ' todos-row--cancelled' : ''
      }${item.status === 'in_progress' ? ' todos-row--wip' : ''}${
        item.priority ? ` todos-row--prio-${item.priority}` : ''
      }${isDragSrc ? ' todos-row--dragging' : ''}${isDropTgt ? ' todos-row--drop-target' : ''}${
        isFocused ? ' todos-row--focused' : ''
      }`}
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
        {editing ? (
          // Unified edit mode: ONE markdown editor that holds both the
          // task title (first line) and the body. Save parses the first
          // non-empty line as the title (stripping leading `#` if the
          // user wrote it as a heading) and the rest as the body.
          <div className="todos-row__edit">
            <Suspense
              fallback={
                <div className="todos-row__details-loading muted small">Loading editor…</div>
              }
            >
              <MarkdownEditor
                value={draftEdit}
                onChange={setDraftEdit}
                placeholder="First line is the title — Markdown supported below."
                rows={8}
                initialMode="edit"
              />
            </Suspense>
            <div className="todos-row__edit-actions">
              <button type="button" className="btn btn--small" onClick={cancelEdit}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={saveEdit}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="todos-row__topline">
            <button
              type="button"
              className={`todos-row__title${titleExpanded ? ' todos-row__title--expanded' : ''}`}
              // Native tooltip surfaces the FULL title on hover even
              // when the visible row is line-clamped. Cheap a11y win
              // for users who paste long single-line content (e.g.
              // SSH prompts or stack traces) into the title field.
              title={item.title}
              aria-expanded={titleExpanded}
              onClick={(e) => {
                // Skip the toggle when this is the first click of a
                // dblclick (detail >= 2 fires for the second click; the
                // first click still toggles once before dblclick lands —
                // that flicker isn't visible because edit mode replaces
                // the title display immediately afterwards).
                if (e.detail >= 2) return;
                setTitleExpanded((v) => !v);
              }}
              onDoubleClick={beginEdit}
            >
              {item.title}
            </button>
          </div>
        )}

        {!editing && titleExpanded && item.body ? (
          // Inline Markdown render of the body. Sits BETWEEN the title
          // and the meta sub-row so the row reads top-to-bottom as
          // "what is this task → what's in it → its attributes". Meta
          // (list / priority / status / schedule + actions) is always
          // the last thing in the row, regardless of whether the body
          // is expanded — that keeps the visual rhythm identical for
          // every task whether it has body content or not.
          //
          // Lazy-loaded so the markdown-vendor chunk only lands when
          // at least one user actually expands a body. Dangling `---`
          // separators left over from old "Save to notes" appends are
          // stripped so the preview reads clean.
          <div
            className="todos-row__body-preview"
            onDoubleClick={beginEdit}
            title="Double-click to edit"
          >
            <Suspense
              fallback={<div className="muted small">Loading preview…</div>}
            >
              <MarkdownView value={stripTrailingSeparators(item.body)} />
            </Suspense>
          </div>
        ) : null}

        {!editing ? (
        /* ---- Sub row ----
         * Single horizontal strip ALWAYS rendered last in the row
         * (below title and any expanded body preview). Combines, in
         * order: group · priority · status · schedule, then a hover-
         * only action toolbar pushed to the right. Each chip is a
         * button that opens a small popover — replacing the three
         * <select>s that used to crowd the toolbar. */
        <div className="todos-row__sub">
          <div className="todos-row__chip-wrap" ref={groupChipRef}>
            <button
              type="button"
              className="todos-row__tag todos-row__chip-btn"
              title={`List: ${group.name} — click to move`}
              aria-haspopup="menu"
              aria-expanded={openChip === 'group'}
              onClick={() => setOpenChip((cur) => (cur === 'group' ? null : 'group'))}
            >
              <span className="todos-row__tag-name">{group.name}</span>
              <span className="todos-row__hash" style={{ color: tagColor(item.groupId) }}>
                #
              </span>
            </button>
            {openChip === 'group' ? (
              <div className="todos-row__chip-menu" role="menu">
                {groups.map((gr) => (
                  <button
                    key={gr.id}
                    type="button"
                    role="menuitem"
                    className={`todos-row__chip-menu-item${item.groupId === gr.id ? ' is-active' : ''}`}
                    onClick={() => {
                      if (gr.id !== item.groupId) onPatch(item.id, { groupId: gr.id });
                      setOpenChip(null);
                    }}
                  >
                    {gr.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="todos-row__chip-wrap" ref={priorityChipRef}>
            <button
              type="button"
              className={`todos-row__prio${
                item.priority ? ` todos-row__prio--${item.priority}` : ' todos-row__prio--none'
              } todos-row__chip-btn`}
              title={`Priority: ${item.priority ?? 'none'} — click to change`}
              aria-haspopup="menu"
              aria-expanded={openChip === 'priority'}
              onClick={() => setOpenChip((cur) => (cur === 'priority' ? null : 'priority'))}
            >
              {item.priority ? priorityShort(item.priority) : '— Priority'}
            </button>
            {openChip === 'priority' ? (
              <div className="todos-row__chip-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={`todos-row__chip-menu-item${!item.priority ? ' is-active' : ''}`}
                  onClick={() => {
                    onPatch(item.id, { priority: undefined });
                    setOpenChip(null);
                  }}
                >
                  No priority
                </button>
                {PRIORITY_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    role="menuitem"
                    className={`todos-row__chip-menu-item${item.priority === p.value ? ' is-active' : ''}`}
                    onClick={() => {
                      onPatch(item.id, { priority: p.value as Priority });
                      setOpenChip(null);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="todos-row__chip-wrap" ref={statusChipRef}>
            <button
              type="button"
              className={`todos-row__status todos-row__status--${item.status} todos-row__chip-btn`}
              data-tone={statusTone}
              title={`Status: ${statusMeta?.label ?? item.status} — click to change`}
              aria-haspopup="menu"
              aria-expanded={openChip === 'status'}
              onClick={() => setOpenChip((cur) => (cur === 'status' ? null : 'status'))}
            >
              {statusShort}
            </button>
            {openChip === 'status' ? (
              <div className="todos-row__chip-menu" role="menu">
                {TODO_STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="menuitem"
                    className={`todos-row__chip-menu-item${item.status === s.value ? ' is-active' : ''}`}
                    onClick={() => {
                      onPatch(item.id, { status: s.value });
                      setOpenChip(null);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="todos-row__sched">
            <button
              ref={scheduleTriggerRef}
              type="button"
              className={`todos-row__date-trigger${item.dueAt ? ' todos-row__date-trigger--set' : ''}${
                overdue ? ' todos-row__date-trigger--warn' : ''
              }${reminderArmed ? ' todos-row__date-trigger--reminder' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={scheduleOpen}
              title={
                item.dueAt
                  ? `Scheduled for ${formatDateShort(item.dueAt)} ${formatTimeOnly(item.dueAt)}${
                      reminderArmed ? ' · reminder set' : ''
                    } — click to change`
                  : 'Schedule a due date'
              }
              onClick={() => setScheduleOpen((o) => !o)}
            >
              <span className="todos-row__meta-ic" aria-hidden>
                <IcCalendar size={14} />
              </span>
              {item.dueAt ? (
                <>
                  <span>
                    {dueDateShort}
                    {dueLabel ? ` · ${dueLabel}` : ''}
                  </span>
                  {reminderArmed ? (
                    <span className="todos-row__meta-ic todos-row__meta-ic--muted" aria-hidden title="Reminder set">
                      <IcClock size={13} />
                    </span>
                  ) : null}
                </>
              ) : null}
            </button>
            {scheduleOpen ? (
              <SchedulePopover
                anchorRef={scheduleTriggerRef}
                dueAt={item.dueAt}
                remindAt={item.remindAt}
                remindRepeat={item.remindRepeat}
                onPatch={(patch) => onPatch(item.id, schedulePatchToTodoPatch(patch))}
                onClose={() => setScheduleOpen(false)}
              />
            ) : null}
          </div>

          {item.sourceNoteId ? (() => {
            // Source-note backlink chip. We branch on whether the
            // note actually exists in the workspace: live → clickable
            // link with the note title in the tooltip; deleted →
            // muted, non-interactive chip explaining what happened.
            // Keeping the orphan visible is intentional — it makes
            // backup recovery obvious ("oh, that note was deleted,
            // let me restore it") instead of silently hiding the
            // reference.
            const exists = !!sourceNote?.title;
            const targetId = item.sourceNoteId;
            return (
              <button
                type="button"
                className={`todos-row__note-chip${exists ? '' : ' todos-row__note-chip--orphan'}`}
                title={
                  exists
                    ? `From note: ${sourceNote!.title}`
                    : 'The source note has been deleted. Restoring it from a backup will re-link this task automatically.'
                }
                aria-label={
                  exists ? `Open source note: ${sourceNote!.title}` : 'Source note has been deleted'
                }
                disabled={!exists}
                onClick={() => {
                  if (!exists || !onOpenSourceNote) return;
                  onOpenSourceNote(targetId);
                }}
              >
                <IcStickyNote size={13} />
              </button>
            );
          })() : null}

          <div className="todos-row__toolbar">
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
        ) : null}

      </div>
    </li>
  );
}

export function TodosPage() {
  const { user } = useAccount();
  const userId = user?.id ?? '';
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
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
  // Combined markdown draft per group. The first non-empty line becomes
  // the task title on submit (stripped of any leading `#`), the rest is
  // the body. Sharing the same buffer as the inline-edit flow keeps the
  // two surfaces symmetric and avoids the old "title vs. details" split.
  const [draftByGroup, setDraftByGroup] = useState<Record<string, string>>({});
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [sectionOpenMap, setSectionOpenMap] = useState<Record<string, boolean>>({});
  const [sectionsHydrated, setSectionsHydrated] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // The filter disclosure is a per-session UI toggle, NOT a saved
  // preference. Keeping it transient avoids surprising users with a
  // panel that re-opens itself on every visit just because they once
  // peeked inside.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropItemTargetId, setDropItemTargetId] = useState<string | null>(null);
  const [aiTask, setAiTask] = useState<TodoItem | null>(null);
  const [extractorOpen, setExtractorOpen] = useState(false);

  // Two layers of "is AI usable here?":
  //   1. `features.ai` — runtime policy / preset (work-strict turns this off
  //      so the buttons NEVER appear, even if the user has an API key saved).
  //   2. `isAIConfigured(aiSettings)` — user has actually entered an API key.
  // Both must be true for any AI affordance to render.
  const { features: appFeatures } = useFeatures();
  const aiEnabled = appFeatures.ai && isAIConfigured(data.aiSettings);
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
      // Whitelist parse — any unknown / older value (or a removed mode)
      // falls back to 'manual' so we never end up with a sort mode the
      // sort function doesn't know how to honour.
      const allowedSortModes: SortMode[] = [
        'manual',
        'priority',
        'due',
        'status',
        'created',
        'updated',
        'completed',
      ];
      setSortMode(
        allowedSortModes.includes(sortRaw as SortMode) ? (sortRaw as SortMode) : 'manual',
      );
      setStatusFilter(parseStatusFilter(localStorage.getItem(todoStatusFilterKey(userId))));
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
      localStorage.setItem(todoStatusFilterKey(userId), statusFilter);
    } catch {
      /* ignore */
    }
  }, [hideDone, sortMode, statusFilter, sectionsHydrated, userId]);

  // Index of notes by id so source-note chips can render the live
  // title without forcing every TodoTaskRow to re-scan `data.notes`.
  // Recomputed only when the notes collection changes.
  const noteTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of data.notes) {
      if (n?.id) m.set(n.id, (n.title || '').trim() || 'Untitled note');
    }
    return m;
  }, [data.notes]);

  /**
   * Open a task's linked source note on the Notes route. We pass the
   * note id as a `?focus=` query string so NotesPage's existing
   * search-params bridge can pick it up and select / scroll to that
   * note on arrival — same hand-off shape the Notes → Todos backlinks
   * use in the other direction.
   */
  const openSourceNote = (noteId: string) => {
    navigate(`/notes?focus=${encodeURIComponent(noteId)}`);
  };

  /**
   * When the route lands on `/todos?focus=<id>`, scroll the matching
   * task into view and flash the row briefly so the user can spot it
   * after navigating in from a note's backlinks panel.
   *
   * Cleanup strips the query parameter once we've consumed it (via
   * `navigate(..., { replace: true })`) so a refresh or Back doesn't
   * re-trigger the highlight every time the user revisits the page.
   *
   * The flash class is removed after the animation finishes (1.6s) to
   * avoid re-paint churn during scroll-heavy interactions.
   */
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const focusId = params.get('focus');
    if (!focusId) return;
    setFocusedTaskId(focusId);
    // Strip the param NOW (replace history) so we don't re-fire on
    // every render. The state above keeps the highlight alive.
    params.delete('focus');
    const next = params.toString();
    navigate({ pathname: location.pathname, search: next ? `?${next}` : '' }, { replace: true });
  }, [location.search, location.pathname, navigate]);

  useEffect(() => {
    if (!focusedTaskId) return;
    // Defer one frame so the row has time to mount, especially when
    // the section was collapsed and we expanded it via the effect
    // below.
    const frame = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-todo-id="${focusedTaskId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clear = window.setTimeout(() => setFocusedTaskId(null), 1800);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clear);
    };
  }, [focusedTaskId]);

  // If the focused task lives in a collapsed section, open that
  // section so the scroll target actually exists in the DOM.
  useEffect(() => {
    if (!focusedTaskId) return;
    const target = data.todoItems.find((t) => t.id === focusedTaskId);
    if (!target) return;
    setSectionOpenMap((prev) => (prev[target.groupId] === false ? { ...prev, [target.groupId]: true } : prev));
  }, [focusedTaskId, data.todoItems]);

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
    /**
     * Compare two ISO timestamps newest-first. Missing / unparseable
     * dates sort to the END of the list — for `createdAt` / `updatedAt`
     * this is rare (we always stamp them) but for `completedAt` it is
     * the common case (open tasks have no `doneAt`) and "open rows
     * fall to the bottom of a completion-history view" is the right
     * default.
     */
    const cmpDateDesc = (a?: string, b?: string): number => {
      const ta = a ? Date.parse(a) : NaN;
      const tb = b ? Date.parse(b) : NaN;
      const aBad = Number.isNaN(ta);
      const bBad = Number.isNaN(tb);
      if (aBad && bBad) return 0;
      if (aBad) return 1;
      if (bBad) return -1;
      return tb - ta;
    };

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
        if (sortMode === 'status') {
          // Kanban order: todo → in_progress → done → cancelled.
          // Ties (same status) fall back to the user's manual ordering so
          // the result is stable when the user toggles back to manual.
          const ds = todoStatusRank(a.status) - todoStatusRank(b.status);
          if (ds !== 0) return ds;
          return orderOf(a) - orderOf(b);
        }
        if (sortMode === 'created') {
          const d = cmpDateDesc(a.createdAt, b.createdAt);
          if (d !== 0) return d;
          return orderOf(a) - orderOf(b);
        }
        if (sortMode === 'updated') {
          const d = cmpDateDesc(a.updatedAt, b.updatedAt);
          if (d !== 0) return d;
          return orderOf(a) - orderOf(b);
        }
        if (sortMode === 'completed') {
          const d = cmpDateDesc(a.doneAt, b.doneAt);
          if (d !== 0) return d;
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
  // Search hits BOTH the title and the optional markdown body. Body
  // matching is what made the old "I know I wrote a link about this
  // somewhere" lookup miss in the title-only era; now any markdown
  // detail field counts as part of the task's searchable surface.
  // We lowercase the body on the fly — these collections are small
  // enough (< 10k items in the most absurd cases) that the overhead is
  // unmeasurable next to a single keystroke render.
  const matchesQuery = (it: TodoItem) =>
    !q ||
    it.title.toLowerCase().includes(q) ||
    (typeof it.body === 'string' && it.body.toLowerCase().includes(q));

  return (
    <div className="page page--wide todos-route">
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
            className={`todos-route__display-btn todos-route__add-list-btn${
              newListOpen ? ' todos-route__add-list-btn--active' : ''
            }`}
            title={newListOpen ? 'Close list creator' : 'Create a new list'}
            aria-expanded={newListOpen}
            onClick={() => setNewListOpen((o) => !o)}
          >
            <IcPlus size={16} strokeWidth={2.5} />
            <span>Add list</span>
          </button>
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

      {newListOpen ? (
        // List creator lives at the top of the page now so the user
        // doesn't have to scroll past every existing list to reach it.
        // It mirrors the look of the inline "Add task" form for visual
        // continuity between the two creation surfaces.
        <section className="card todos-new-list-card">
          <form
            className="todos-new-list"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              const name = newGroupName.trim();
              if (!name) return;
              addTodoGroup(name);
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
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setNewGroupName('');
                  setNewListOpen(false);
                }
              }}
              aria-label="New list name"
            />
            <button type="submit" className="todos-new-list__ok" disabled={!newGroupName.trim()}>
              Create
            </button>
            <button
              type="button"
              className="todos-new-list__cancel"
              onClick={() => {
                setNewGroupName('');
                setNewListOpen(false);
              }}
            >
              Cancel
            </button>
          </form>
        </section>
      ) : null}

      {/* —— Search + filters toolbar ——
       * Two-row layout: a focused search input + the only ever-visible
       * actions (Filters disclosure, AI extract) on top; the four
       * filter controls collapse behind the disclosure so the toolbar
       * never feels like a wall of inputs.
       */}
      {(() => {
        // Count every "non-default" filter so we can badge the toggle
        // when filters are active even if the panel is collapsed.
        // `sortMode === 'manual'` is the default; everything else
        // counts. Search is intentionally excluded — it already has
        // its own visible input, no point double-counting it.
        const activeCount =
          (sortMode !== 'manual' ? 1 : 0) +
          (statusFilter !== 'all' ? 1 : 0) +
          (hideDone ? 1 : 0) +
          (showArchived ? 1 : 0);
        const resetFilters = () => {
          setSortMode('manual');
          setStatusFilter('all');
          setHideDone(false);
          setShowArchived(false);
        };
        return (
          <section className="card todos-toolbar">
            <div className="todos-toolbar__row">
              <div className="todos-toolbar__search-wrap">
                <span className="todos-toolbar__search-ic" aria-hidden>
                  <IcSearch size={15} />
                </span>
                <input
                  type="search"
                  className="todos-toolbar__search"
                  placeholder="Search tasks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search tasks"
                />
                {search ? (
                  <button
                    type="button"
                    className="todos-toolbar__search-clear"
                    aria-label="Clear search"
                    title="Clear search"
                    onClick={() => setSearch('')}
                  >
                    <IcX size={14} />
                  </button>
                ) : null}
              </div>
              <div className="todos-toolbar__row-actions">
                <button
                  type="button"
                  className={`todos-toolbar__filters-btn${
                    filtersOpen ? ' todos-toolbar__filters-btn--open' : ''
                  }${activeCount > 0 ? ' todos-toolbar__filters-btn--active' : ''}`}
                  aria-expanded={filtersOpen}
                  aria-controls="todos-toolbar-filters"
                  onClick={() => setFiltersOpen((o) => !o)}
                  title={filtersOpen ? 'Hide filters' : 'Show filters'}
                >
                  <IcSliders size={15} />
                  <span>Filters</span>
                  {activeCount > 0 ? (
                    <span className="todos-toolbar__filters-badge" aria-label={`${activeCount} active filters`}>
                      {activeCount}
                    </span>
                  ) : null}
                </button>
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
              </div>
            </div>
            {filtersOpen ? (
              <div id="todos-toolbar-filters" className="todos-toolbar__filters">
                <label className="todos-toolbar__filter">
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
                <label className="todos-toolbar__filter">
                  <span className="muted small">Status</span>
                  <select
                    className="input"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    aria-label="Filter by status"
                  >
                    {STATUS_FILTER_OPTIONS.map((o) => (
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
                  <span className="small">Hide closed</span>
                </label>
                <label className="todos-toolbar__check">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  <span className="small">Show archived</span>
                </label>
                {activeCount > 0 ? (
                  <button
                    type="button"
                    className="todos-toolbar__filters-reset"
                    onClick={resetFilters}
                    title="Reset all filters to their defaults"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })()}

      {visibleGroups.length === 0 && allGroupsSorted.length > 0 ? (
        // The user has lists but they're all filtered out — most often
        // every group is archived (common after a LAN-sync pull from a
        // device that finished a project) or the search/status filters
        // are too tight. Spell that out and offer the one-click fix so
        // they don't think their data was lost.
        //
        // The "all-archived" case in particular has been reported as
        // "data kayboldu" multiple times because the empty Todos page
        // looks identical to a fresh install. We raise the visual
        // weight (amber alarm variant + explicit item count) so the
        // user immediately sees that the data is on disk, just hidden,
        // and can recover with one click.
        (() => {
          const archived = allGroupsSorted.filter((g) => g.archived).length;
          const allArchived = archived > 0 && archived === allGroupsSorted.length;
          const itemsInArchived = data.todoItems.filter((it) =>
            allGroupsSorted.some((g) => g.id === it.groupId && g.archived),
          ).length;
          return (
            <section
              className={`card todos-empty-hint${allArchived ? ' todos-empty-hint--alarm' : ''}`}
              role={allArchived ? 'alert' : undefined}
            >
              <h3 className="todos-empty-hint__title">
                {allArchived
                  ? `⚠ Your data is safe — all ${archived} of your lists are archived (${itemsInArchived} items inside).`
                  : 'No lists match the current filters.'}
              </h3>
              <p className="muted small todos-empty-hint__body">
                {allArchived
                  ? 'Your todos are still on disk. Click below to bring them back, or pick "Unarchive" from each list\'s menu to permanently restore it. (You can also restore an earlier snapshot from Settings → Backups & Recovery.)'
                  : 'Adjust the status filter or search box above, or create a new list below.'}
              </p>
              {allArchived && !showArchived ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setShowArchived(true)}
                >
                  Show archived lists
                </button>
              ) : null}
            </section>
          );
        })()
      ) : null}

      {visibleGroups.map((g, idx) => {
        const list = itemsByGroup.get(g.id) ?? [];
        // Search + status filter both apply before we split into open /
        // terminal tiers. The status filter is its own concept on top of
        // "Hide completed" so users can, say, look at only cancelled rows
        // even when hideDone would normally hide them.
        const matchedList = list.filter(
          (it) => matchesQuery(it) && matchesStatusFilter(it.status, statusFilter),
        );
        const draft = draftByGroup[g.id] ?? '';
        // "Open" tier = todo + in_progress. Anything terminal (done,
        // cancelled) goes into the closed tier and is rendered separately
        // below so the open work always stays visible at the top.
        const active = matchedList.filter((x) => isTodoOpen(x.status));
        const closed = matchedList.filter((x) => !isTodoOpen(x.status));
        const totalActive = list.filter((x) => isTodoOpen(x.status)).length;
        const totalClosed = list.filter((x) => !isTodoOpen(x.status)).length;
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

              <button
                type="button"
                className={`todos-section__add${addingGroupId === g.id ? ' todos-section__add--active' : ''}`}
                title="Add task"
                aria-label={`Add task to ${g.name}`}
                aria-expanded={addingGroupId === g.id}
                onClick={() => {
                  setSectionOpenMap((prev) => ({ ...prev, [g.id]: true }));
                  setAddingGroupId(g.id);
                }}
              >
                <IcPlus size={18} strokeWidth={2.5} />
              </button>

              <span className="todos-section__counts" title="Open · Total">
                {totalActive}
                <span className="muted"> / {totalActive + totalClosed}</span>
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
                    disabled={totalClosed === 0}
                    title="Removes all done and cancelled tasks from this list"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove all done and cancelled tasks from “${g.name}”? This can't be undone.`,
                        )
                      ) {
                        clearCompletedInGroup(g.id);
                      }
                    }}
                  >
                    Clear closed ({totalClosed})
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
                {addingGroupId === g.id ? (() => {
                  const submitAdd = () => {
                    const { title, body } = parseTitleAndBody(draft);
                    if (!title) {
                      // Nothing actionable yet — just close the form rather
                      // than spawn an empty task. The draft is preserved
                      // so reopening with `+` puts the user back where
                      // they left off (handy after an accidental Cancel).
                      setAddingGroupId(null);
                      return;
                    }
                    addTodoItem(g.id, title, body ? { body } : undefined);
                    setDraftByGroup((prev) => ({ ...prev, [g.id]: '' }));
                    setAddingGroupId(null);
                  };
                  const cancelAdd = () => {
                    setAddingGroupId(null);
                  };
                  return (
                    <form
                      className="todos-add-inline todos-add-inline--multi"
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        submitAdd();
                      }}
                    >
                      <div className="todos-add-inline__body" role="region" aria-label="New task">
                        <Suspense
                          fallback={
                            <div className="todos-row__details-loading muted small">Loading editor…</div>
                          }
                        >
                          <MarkdownEditor
                            value={draft}
                            onChange={(v) =>
                              setDraftByGroup((prev) => ({ ...prev, [g.id]: v }))
                            }
                            placeholder="First line is the title — Markdown supported below."
                            rows={6}
                            initialMode="edit"
                          />
                        </Suspense>
                      </div>
                      <div className="todos-add-inline__actions">
                        <button type="button" className="todos-add-inline__cancel" onClick={cancelAdd}>
                          Cancel
                        </button>
                        <button type="submit" className="todos-add-inline__submit">
                          Add
                        </button>
                      </div>
                    </form>
                  );
                })() : null}

                {active.length === 0 && (hideDone || closed.length === 0) ? (
                  <p className="todos-section__empty">
                    {q
                      ? 'No matching tasks in this list.'
                      : statusFilter !== 'all'
                        ? 'No tasks match this status filter.'
                        : hideDone && closed.length > 0
                          ? `${closed.length} closed task${closed.length === 1 ? '' : 's'} hidden.`
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
                        sourceNote={
                          it.sourceNoteId
                            ? noteTitleById.has(it.sourceNoteId)
                              ? { id: it.sourceNoteId, title: noteTitleById.get(it.sourceNoteId)! }
                              : { id: it.sourceNoteId }
                            : undefined
                        }
                        isFocused={focusedTaskId === it.id}
                        onAskAI={setAiTask}
                        onOpenSourceNote={openSourceNote}
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
                      closed.map((it) => (
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
                          sourceNote={
                            it.sourceNoteId
                              ? noteTitleById.has(it.sourceNoteId)
                                ? { id: it.sourceNoteId, title: noteTitleById.get(it.sourceNoteId)! }
                                : { id: it.sourceNoteId }
                              : undefined
                          }
                          isFocused={focusedTaskId === it.id}
                          onAskAI={setAiTask}
                          onOpenSourceNote={openSourceNote}
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

      {allGroupsSorted.length === 0 ? (
        // Brand-new workspace: no lists at all. We don't auto-create one
        // because that's a meaningful first decision and silently
        // seeding it would dirty the encrypted store on first boot.
        // Instead, point at the header button so the empty state is
        // never a dead end.
        <section className="card todos-empty-hint">
          <h3 className="todos-empty-hint__title">No lists yet</h3>
          <p className="muted small todos-empty-hint__body">
            Use <strong>Add list</strong> at the top of the page to create your first list.
          </p>
        </section>
      ) : null}

      {aiTask || extractorOpen ? (
        <Suspense fallback={null}>
          {aiTask ? (
            <AIAssistantDialog
              open={!!aiTask}
              onClose={() => setAiTask(null)}
              // Pass BOTH the title and the markdown body of the task —
              // the body is where the user typically captures the real
              // intent (links, requirements, context). Sending only the
              // title used to give the assistant a one-line prompt and
              // generic, unhelpful advice. The lib-level prompt builder
              // already wraps the body in a clearly delimited section.
              task={{ title: aiTask.title, body: aiTask.body }}
              onAppendToBody={(markdown) => {
                // "Save to notes" round-trips the answer into the
                // task's own body so the user has the recommendation
                // alongside the task they were asking about. Existing
                // notes are preserved with a soft separator so the
                // user can keep both their own context and the AI's.
                //
                // We snapshot the id/body BEFORE calling setState
                // because `setAiTask(null)` (further down) clears the
                // closure variable on the next render — without the
                // snapshot, a re-click would re-read stale data.
                const targetId = aiTask.id;
                const existing = (aiTask.body ?? '').trim();
                const incoming = markdown.trim();
                if (!incoming) return;
                const next = existing ? `${existing}\n\n---\n\n${incoming}` : incoming;
                updateTodoItem(targetId, { body: next });
                // The previous build wired the callback but did
                // nothing else — the dialog stayed open and there was
                // no confirmation, so the click felt like a no-op.
                // Closing the dialog and showing a toast turns the
                // action into a clear, finished UX moment.
                toast.showSuccess(
                  'Saved to task notes',
                  'The assistant\u2019s reply was appended to this task\u2019s details.',
                );
                setAiTask(null);
              }}
            />
          ) : null}
          {extractorOpen ? (
            <AITaskExtractorDialog
              open={extractorOpen}
              onClose={() => setExtractorOpen(false)}
              defaultGroupId={visibleGroups[0]?.id}
            />
          ) : null}
        </Suspense>
      ) : null}
    </div>
  );
}
