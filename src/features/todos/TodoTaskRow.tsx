import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  IcArchive,
  IcCalendar,
  IcCheck,
  IcClock,
  IcGrip,
  IcSparkles,
  IcStickyNote,
  IcTrash,
} from '../../components/icons';
import { SchedulePopover } from '../../components/ui/SchedulePopover';
import { formatDateShort, formatTimeOnly, isPast } from '../../lib/datetime';
import {
  plainTextFromBodyFields,
  richTextPayloadToBodyFields,
  type RichTextBodyFields,
} from '../../lib/richTextBody';
import { PRIORITY_OPTIONS, TODO_STATUS_OPTIONS, isTodoOpen } from '../../model';
import type { Priority, TodoGroup, TodoItem } from '../../model';
import {
  itemToBodyFields,
  schedulePatchToTodoPatch,
  todoBodyPatchFromFields,
  todoHasBody,
} from './todoBody';
import { priorityShort, ringStyle, tagColor } from './todoUiUtils';

const RichTextEditor = lazy(() =>
  import('../../components/ui/RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
);
export type TodoTaskRowProps = {
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
  attachmentUserId: string;
  onAskAI: (item: TodoItem) => void;
  /** Clicking the source-note chip routes to the linked note. */
  onOpenSourceNote?: (noteId: string) => void;
  onPatch: (
    id: string,
    patch: Partial<
      Pick<
        TodoItem,
        | 'title'
        | 'body'
        | 'bodyFormat'
        | 'bodyPlainText'
        | 'groupId'
        | 'dueAt'
        | 'priority'
        | 'status'
        | 'remindAt'
        | 'remindRepeat'
        | 'archived'
      >
    >,
  ) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (itemId: string) => void;
  onDragOver: (itemId: string) => void;
  onDrop: (itemId: string) => void;
  onDragEnd: () => void;
};

export function TodoTaskRow({
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
  attachmentUserId,
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
  const [draftTitle, setDraftTitle] = useState(() => item.title);
  const [draftBody, setDraftBody] = useState<RichTextBodyFields>(() => itemToBodyFields(item));

  const beginEdit = () => {
    setDraftTitle(item.title);
    setDraftBody(itemToBodyFields(item));
    setEditing(true);
  };

  const saveEdit = () => {
    const title = draftTitle.trim() || item.title;
    const patch: Parameters<typeof onPatch>[1] = {};
    if (title !== item.title) patch.title = title;

    const nextBody = todoBodyPatchFromFields(draftBody);
    const currentPlain = plainTextFromBodyFields(item);
    const nextPlain = plainTextFromBodyFields({
      body: nextBody.body,
      bodyFormat: nextBody.bodyFormat,
      bodyPlainText: nextBody.bodyPlainText,
    });
    const bodyChanged =
      (nextBody.body ?? '') !== (item.body ?? '') ||
      (nextBody.bodyFormat ?? undefined) !== (item.bodyFormat ?? undefined) ||
      currentPlain !== nextPlain;
    if (bodyChanged) {
      Object.assign(patch, nextBody);
    }

    if (Object.keys(patch).length > 0) onPatch(item.id, patch);
    setEditing(false);
  };
  const cancelEdit = () => {
    setDraftTitle(item.title);
    setDraftBody(itemToBodyFields(item));
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
  const isArchived = item.archived === true;

  return (
    <li
      data-todo-id={item.id}
      className={`todos-row${compact ? ' todos-row--compact' : ''}${isTerminal ? ' todos-row--done' : ''}${
        item.status === 'cancelled' ? ' todos-row--cancelled' : ''
      }${item.status === 'in_progress' ? ' todos-row--wip' : ''}${
        isArchived ? ' todos-row--archived-item' : ''
      }${item.priority ? ` todos-row--prio-${item.priority}` : ''}${isDragSrc ? ' todos-row--dragging' : ''}${isDropTgt ? ' todos-row--drop-target' : ''}${
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
          <div className="todos-row__edit">
            <input
              className="todos-row__title-input"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Task title"
              aria-label="Task title"
              autoFocus
            />
            <Suspense
              fallback={
                <div className="todos-row__details-loading muted small">Loading editor…</div>
              }
            >
              <RichTextEditor
                value={draftBody.body}
                valueFormat={draftBody.bodyFormat ?? 'auto'}
                onChange={(payload) => setDraftBody(richTextPayloadToBodyFields(payload))}
                placeholder="Details — paste screenshots with ⌘V, add tables, dates…"
                minHeight={160}
                attachmentScope={{ documentKind: 'todo', documentId: item.id }}
                attachmentUserId={attachmentUserId}
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

        {!editing && titleExpanded && todoHasBody(item) ? (
          <div
            className="todos-row__body-preview"
            onDoubleClick={beginEdit}
            title="Double-click to edit"
          >
            <Suspense fallback={<div className="muted small">Loading preview…</div>}>
              <RichTextEditor
                value={item.body}
                valueFormat={item.bodyFormat ?? 'auto'}
                editable={false}
                toolbar={false}
                minHeight={72}
                attachmentScope={{ documentKind: 'todo', documentId: item.id }}
                attachmentUserId={attachmentUserId}
              />
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
                itemId={item.id}
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
              className="todos-row__icon-btn"
              title={isArchived ? 'Restore to active list' : 'Archive task'}
              aria-label={isArchived ? 'Unarchive task' : 'Archive task'}
              onClick={() => onPatch(item.id, { archived: isArchived ? false : true })}
            >
              <IcArchive size={16} />
            </button>
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
