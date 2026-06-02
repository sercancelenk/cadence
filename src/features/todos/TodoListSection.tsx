import { FormEvent, lazy, Suspense } from 'react';
import { IcChevronDown, IcGrip, IcPlus, IcStar } from '../../components/icons';
import { richTextPayloadToBodyFields } from '../../lib/richTextBody';
import { PRIORITY_OPTIONS, isTodoOpen } from '../../model';
import type { Priority, TodoGroup, TodoItem } from '../../model';
import { prefetchRichTextEditor } from './prefetchRichTextEditor';
import { emptyInlineAddDraft, todoBodyPatchFromFields, type InlineAddDraft } from './todoBody';
import { matchesStatusFilter, isSectionOpen, type SortMode, type StatusFilter } from './todoPreferences';
import { todoMatchesSearchQuery } from './sortTodoItemsByGroup';
import { TodoTaskRow } from './TodoTaskRow';

const RichTextEditor = lazy(() =>
  import('../../components/ui/RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
);

export type TodoListSectionCallbacks = {
  addTodoItem: (
    groupId: string,
    title: string,
    extra?: { body?: string; bodyFormat?: TodoItem['bodyFormat']; bodyPlainText?: string },
  ) => void;
  updateTodoItem: (
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
      >
    >,
  ) => void;
  toggleTodoItem: (id: string) => void;
  removeTodoItem: (id: string) => void;
  reorderTodoItem: (itemId: string, groupId: string, targetId: string) => void;
  updateTodoGroup: (id: string, patch: Partial<Pick<TodoGroup, 'name' | 'pinned' | 'archived'>>) => void;
  updateTodoGroupPriority: (id: string, priority: Priority | undefined) => void;
  moveTodoGroup: (id: string, dir: 'up' | 'down') => void;
  removeTodoGroup: (id: string) => void;
  clearCompletedInGroup: (groupId: string) => void;
  markAllCompleteInGroup: (groupId: string) => void;
  reorderTodoGroup: (sourceId: string, targetId: string | null) => void;
  onOpenSourceNote: (noteId: string) => void;
  onAskAI: (item: TodoItem) => void;
};

export type TodoListSectionProps = {
  group: TodoGroup;
  sectionIndex: number;
  list: TodoItem[];
  searchQuery: string;
  statusFilter: StatusFilter;
  hideDone: boolean;
  sortMode: SortMode;
  compact: boolean;
  aiEnabled: boolean;
  focusedTaskId: string | null;
  sectionOpenMap: Record<string, boolean>;
  onSectionOpenChange: (groupId: string, open: boolean) => void;
  draft: InlineAddDraft;
  onDraftChange: (draft: InlineAddDraft) => void;
  addingOpen: boolean;
  onAddingOpenChange: (open: boolean) => void;
  allGroupsSorted: TodoGroup[];
  groupById: Map<string, TodoGroup>;
  noteTitleById: Map<string, string>;
  attachmentUserId: string;
  totalGroupCount: number;
  isGroupDragSrc: boolean;
  isGroupDropTgt: boolean;
  dragGroupId: string | null;
  onGroupDragStart: (id: string) => void;
  onGroupDragEnd: () => void;
  onGroupDropTarget: (id: string | null) => void;
  dragItemId: string | null;
  dropItemTargetId: string | null;
  onItemDragStart: (id: string) => void;
  onItemDragOver: (id: string) => void;
  onItemDragEnd: () => void;
  actions: TodoListSectionCallbacks;
};

export function TodoListSection(props: TodoListSectionProps) {
  const {
    group: g,
    sectionIndex: idx,
    list,
    searchQuery: q,
    statusFilter,
    hideDone,
    sortMode,
    compact,
    aiEnabled,
    focusedTaskId,
    sectionOpenMap,
    onSectionOpenChange,
    draft,
    onDraftChange,
    addingOpen,
    onAddingOpenChange,
    allGroupsSorted,
    groupById,
    noteTitleById,
    attachmentUserId,
    totalGroupCount,
    isGroupDragSrc: isDragSrc,
    isGroupDropTgt: isDropTgt,
    dragGroupId,
    onGroupDragStart,
    onGroupDragEnd,
    onGroupDropTarget,
    dragItemId,
    dropItemTargetId,
    onItemDragStart,
    onItemDragOver,
    onItemDragEnd,
    actions,
  } = props;

  const matchedList = list.filter(
    (it) => todoMatchesSearchQuery(it, q) && matchesStatusFilter(it.status, statusFilter),
  );
  if (q.trim() && matchedList.length === 0) return null;

  const active = matchedList.filter((x) => isTodoOpen(x.status));
  const closed = matchedList.filter((x) => !isTodoOpen(x.status));
  const totalActive = list.filter((x) => isTodoOpen(x.status)).length;
  const totalClosed = list.filter((x) => !isTodoOpen(x.status)).length;
  const sectionOpen = isSectionOpen(sectionOpenMap, g.id);
  const isAdding = addingOpen;

  const peers = allGroupsSorted.filter(
    (p) => !!p.pinned === !!g.pinned && !!p.archived === !!g.archived,
  );
  const myIdx = peers.findIndex((p) => p.id === g.id);
  const canMoveUp = myIdx > 0;
  const canMoveDown = myIdx >= 0 && myIdx < peers.length - 1;

  const rowProps = (it: TodoItem, allowDrag: boolean) => ({
    item: it,
    group: groupById.get(it.groupId) ?? g,
    groups: allGroupsSorted,
    compact,
    aiEnabled,
    allowDrag,
    isDragSrc: allowDrag && dragItemId === it.id,
    isDropTgt: allowDrag && dropItemTargetId === it.id && dragItemId !== it.id,
    sourceNote: it.sourceNoteId
      ? noteTitleById.has(it.sourceNoteId)
        ? { id: it.sourceNoteId, title: noteTitleById.get(it.sourceNoteId)! }
        : { id: it.sourceNoteId }
      : undefined,
    isFocused: focusedTaskId === it.id,
    attachmentUserId,
    onAskAI: actions.onAskAI,
    onOpenSourceNote: actions.onOpenSourceNote,
    onPatch: (id: string, patch: Parameters<typeof actions.updateTodoItem>[1]) =>
      actions.updateTodoItem(id, patch),
    onToggle: actions.toggleTodoItem,
    onRemove: actions.removeTodoItem,
    onDragStart: allowDrag ? onItemDragStart : () => {},
    onDragOver: allowDrag ? onItemDragOver : () => {},
    onDrop: allowDrag
      ? (targetId: string) => {
          if (dragItemId && dragItemId !== targetId) {
            actions.reorderTodoItem(dragItemId, g.id, targetId);
          }
          onItemDragEnd();
        }
      : () => {},
    onDragEnd: allowDrag ? onItemDragEnd : () => {},
  });

  return (
    <section
      className={`card todos-section${g.pinned ? ' todos-section--pinned' : ''}${
        g.archived ? ' todos-section--archived' : ''
      }${isDragSrc ? ' todos-section--dragging' : ''}${isDropTgt ? ' todos-section--drop-target' : ''}`}
      onDragOver={(e) => {
        if (!dragGroupId || dragGroupId === g.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onGroupDropTarget(g.id);
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) {
          onGroupDropTarget(null);
        }
      }}
      onDrop={(e) => {
        if (!dragGroupId || dragGroupId === g.id) return;
        e.preventDefault();
        actions.reorderTodoGroup(dragGroupId, g.id);
        onGroupDragEnd();
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
            onGroupDragStart(g.id);
          }}
          onDragEnd={onGroupDragEnd}
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
          onClick={() => onSectionOpenChange(g.id, !sectionOpen)}
        >
          <IcChevronDown size={18} className="todos-section__chev" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className={`todos-section__pin${g.pinned ? ' todos-section__pin--on' : ''}`}
          title={g.pinned ? 'Unpin list' : 'Pin to top'}
          aria-label={g.pinned ? 'Unpin list' : 'Pin to top'}
          aria-pressed={!!g.pinned}
          onClick={() => actions.updateTodoGroup(g.id, { pinned: !g.pinned })}
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
            if (v && v !== g.name) actions.updateTodoGroup(g.id, { name: v });
          }}
        />
        <button
          type="button"
          className={`todos-section__add${isAdding ? ' todos-section__add--active' : ''}`}
          title="Add task"
          aria-label={`Add task to ${g.name}`}
          aria-expanded={isAdding}
          onClick={(e) => {
            e.stopPropagation();
            prefetchRichTextEditor();
            onSectionOpenChange(g.id, true);
            onAddingOpenChange(!isAdding);
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
            <button type="button" className="todos-section__menu-item" disabled={!canMoveUp} onClick={() => actions.moveTodoGroup(g.id, 'up')}>
              Move up
            </button>
            <button type="button" className="todos-section__menu-item" disabled={!canMoveDown} onClick={() => actions.moveTodoGroup(g.id, 'down')}>
              Move down
            </button>
            <button type="button" className="todos-section__menu-item" onClick={() => actions.updateTodoGroup(g.id, { pinned: !g.pinned })}>
              {g.pinned ? 'Unpin' : 'Pin to top'}
            </button>
            <button type="button" className="todos-section__menu-item" onClick={() => actions.updateTodoGroup(g.id, { archived: !g.archived })}>
              {g.archived ? 'Unarchive' : 'Archive'}
            </button>
            <div className="todos-section__menu-sep" />
            <div className="todos-section__menu-row">
              <span className="muted small">List priority</span>
              <select
                className="input"
                value={g.priority ?? ''}
                onChange={(e) =>
                  actions.updateTodoGroupPriority(g.id, (e.target.value || undefined) as Priority | undefined)
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
                  actions.markAllCompleteInGroup(g.id);
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
                if (window.confirm(`Remove all done and cancelled tasks from “${g.name}”? This can't be undone.`)) {
                  actions.clearCompletedInGroup(g.id);
                }
              }}
            >
              Clear closed ({totalClosed})
            </button>
            {totalGroupCount > 1 ? (
              <>
                <div className="todos-section__menu-sep" />
                <button
                  type="button"
                  className="todos-section__menu-item todos-section__menu-item--danger"
                  onClick={() => {
                    if (window.confirm(`Delete the “${g.name}” list? Its tasks will be moved to another list.`)) {
                      actions.removeTodoGroup(g.id);
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
          {isAdding ? (
            <form
              className="todos-add-inline todos-add-inline--multi"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const title = draft.title.trim();
                if (!title) {
                  onAddingOpenChange(false);
                  return;
                }
                const bodyPatch = todoBodyPatchFromFields(draft.body);
                actions.addTodoItem(
                  g.id,
                  title,
                  bodyPatch.body
                    ? {
                        body: bodyPatch.body,
                        bodyFormat: bodyPatch.bodyFormat,
                        bodyPlainText: bodyPatch.bodyPlainText,
                      }
                    : undefined,
                );
                onDraftChange(emptyInlineAddDraft());
                onAddingOpenChange(false);
              }}
            >
              <div className="todos-add-inline__body" role="region" aria-label="New task">
                <input
                  className="todos-row__title-input todos-add-inline__title"
                  value={draft.title}
                  onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
                  placeholder="Task title"
                  aria-label="New task title"
                  autoFocus
                />
                <Suspense fallback={<div className="todos-row__details-loading muted small">Loading editor…</div>}>
                  <RichTextEditor
                    value={draft.body.body}
                    valueFormat={draft.body.bodyFormat ?? 'auto'}
                    onChange={(payload) =>
                      onDraftChange({ ...draft, body: richTextPayloadToBodyFields(payload) })
                    }
                    placeholder="Details (optional)"
                    minHeight={140}
                    attachmentScope={{ documentKind: 'todo', documentId: `new-${g.id}` }}
                    attachmentUserId={attachmentUserId}
                  />
                </Suspense>
              </div>
              <div className="todos-add-inline__actions">
                <button type="button" className="todos-add-inline__cancel" onClick={() => onAddingOpenChange(false)}>
                  Cancel
                </button>
                <button type="submit" className="todos-add-inline__submit">
                  Add
                </button>
              </div>
            </form>
          ) : null}

          {active.length === 0 && (hideDone || closed.length === 0) ? (
            <p className="todos-section__empty">
              {q.trim()
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
                <TodoTaskRow key={it.id} {...rowProps(it, sortMode === 'manual')} />
              ))}
              {!hideDone && closed.map((it) => (
                <TodoTaskRow key={it.id} {...rowProps(it, false)} />
              ))}
            </ul>
          )}
        </>
      ) : null}
      <span hidden>{idx}</span>
    </section>
  );
}
