import { FormEvent, memo, useCallback, useMemo, useState } from 'react';
import {
  IcChevronLeft,
  IcFolder,
  IcKey,
  IcLockOff,
  IcPlus,
  IcUpload,
} from '../../components/icons';
import { useConfirm } from '../../components/ui/ConfirmProvider';
import type { Note, NoteGroup } from '../../model';
import type { RichTextBodyFields } from '../../lib/richTextBody';
import { NotesIconButton } from './NotesIconButton';
import { NotesGroupTree } from './NotesGroupTree';
import { NotesListRow } from './NotesListRow';
import { buildGroupForest, describeGroupDeletion } from './noteGroupForest';
import {
  NOTE_VIEW_OPTIONS,
  SORT_OPTIONS,
  type NoteSortMode,
  type NoteViewMode,
} from './notePreferences';

export type NotesSidebarProps = {
  groups: NoteGroup[];
  /** Notes in the current Active / Archived view. */
  notes: Note[];
  /** Every note, for the delete-list confirmation counts. */
  allNotes: Note[];
  viewMode: NoteViewMode;
  onViewModeChange: (mode: NoteViewMode) => void;
  archivedCount: number;
  sortMode: NoteSortMode;
  onSortModeChange: (mode: NoteSortMode) => void;
  selectedId: string | null;
  bulkSelectedIds: ReadonlySet<string>;
  onNoteClick: (id: string, event: React.MouseEvent) => void;
  onNoteContextMenu: (id: string, event: React.MouseEvent) => void;
  onCreateNote: (groupId?: string) => void;
  /** Omit to hide "Open file" (no desktop bridge). */
  onOpenFile?: () => void;
  onCreateGroup: (name: string, parentId?: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onRemoveGroup: (id: string) => void;
  onSetGroupArchived: (id: string, archived: boolean) => void;
  onMoveGroup: (id: string, newParentId: string | undefined) => void;
  isGroupExpanded: (groupId: string) => boolean;
  onToggleGroup: (groupId: string) => void;
  onExpandGroup: (groupId: string) => void;
  hasLock: boolean;
  hasRecovery: boolean;
  onOpenAddRecovery: () => void;
  onOpenDisableLocking: () => void;
  decrypted: ({ noteId: string } & RichTextBodyFields) | null;
  draggingId: string | null;
  dropTargetId: string | null;
  dropPlacement?: 'before' | 'after';
  dropTargetGroupId: string | null;
  onNoteDragStart: (e: React.DragEvent<HTMLElement>, noteId: string) => void;
  onNoteDragOver: (e: React.DragEvent<HTMLElement>, noteId: string) => void;
  onNoteDragEnter?: (e: React.DragEvent<HTMLElement>, noteId: string) => void;
  onNoteDrop: (e: React.DragEvent<HTMLElement>, noteId: string) => void;
  onGroupDragOver: (e: React.DragEvent<HTMLLIElement>, groupId: string) => void;
  onGroupDrop: (e: React.DragEvent<HTMLLIElement>, groupId: string) => void;
  onDragEnd: () => void;
  onCollapseSidebar?: () => void;
};

/**
 * `memo` so page state that the list does not read — editor buffers, version
 * history, dialogs — stops re-grouping and re-rendering every row.
 */
export const NotesSidebar = memo(function NotesSidebar({
  groups,
  notes,
  allNotes,
  viewMode,
  onViewModeChange,
  archivedCount,
  sortMode,
  onSortModeChange,
  selectedId,
  bulkSelectedIds,
  onNoteClick,
  onNoteContextMenu,
  onCreateNote,
  onOpenFile,
  onCreateGroup,
  onRenameGroup,
  onRemoveGroup,
  onSetGroupArchived,
  onMoveGroup,
  isGroupExpanded,
  onToggleGroup,
  onExpandGroup,
  hasLock,
  hasRecovery,
  onOpenAddRecovery,
  onOpenDisableLocking,
  decrypted,
  draggingId,
  dropTargetId,
  dropPlacement = 'before',
  dropTargetGroupId,
  onNoteDragStart,
  onNoteDragOver,
  onNoteDragEnter,
  onNoteDrop,
  onGroupDragOver,
  onGroupDrop,
  onDragEnd,
  onCollapseSidebar,
}: NotesSidebarProps) {
  const { confirm } = useConfirm();
  const archivedView = viewMode === 'archived';
  const isManual = sortMode === 'manual' && !archivedView;

  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const forest = useMemo(
    () => buildGroupForest({ groups, notes, viewMode }),
    [groups, notes, viewMode],
  );

  const submitNewList = (e: FormEvent) => {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    onCreateGroup(name);
    setNewListName('');
    setNewListOpen(false);
  };

  const hasContent = forest.roots.length > 0 || forest.ungrouped.length > 0;

  const requestDeleteGroup = useCallback(
    async (groupId: string) => {
      const group = groups.find((x) => x.id === groupId);
      if (!group) return;
      const accepted = await confirm({
        title: `Delete “${group.name}”?`,
        description: describeGroupDeletion(groups, allNotes, groupId).message,
        confirmLabel: 'Delete list',
        danger: true,
      });
      if (accepted) onRemoveGroup(groupId);
    },
    [confirm, groups, allNotes, onRemoveGroup],
  );

  const rowProps = useMemo(
    () => ({
      selectedId,
      onNoteClick,
      onNoteContextMenu,
      decrypted,
      isManual,
      dropPlacement,
      onDragStart: onNoteDragStart,
      onDragOver: onNoteDragOver,
      onDragEnter: onNoteDragEnter,
      onDrop: onNoteDrop,
      onDragEnd,
    }),
    [
      selectedId,
      onNoteClick,
      onNoteContextMenu,
      decrypted,
      isManual,
      dropPlacement,
      onNoteDragStart,
      onNoteDragOver,
      onNoteDragEnter,
      onNoteDrop,
      onDragEnd,
    ],
  );

  return (
    <aside className="notes-page__sidebar">
      <header className="notes-page__sidebar-header">
        <div className="notes-page__sidebar-header-start">
          {onCollapseSidebar ? (
            <NotesIconButton
              onClick={onCollapseSidebar}
              label="Hide notes list"
              tooltip="Hide notes list"
              ariaExpanded={true}
            >
              <IcChevronLeft size={18} />
            </NotesIconButton>
          ) : null}
          <h2>Notes</h2>
        </div>
        <div className="notes-page__sidebar-actions">
          <select
            className="select select--compact notes-page__sort"
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value as NoteSortMode)}
            aria-label="Sort notes by"
            title="Sort notes by"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hasLock && !hasRecovery ? (
            <NotesIconButton
              onClick={onOpenAddRecovery}
              label="Add recovery"
              tooltip="Allow recovery using your account password"
            >
              <IcKey size={16} />
            </NotesIconButton>
          ) : null}
          {hasLock ? (
            <NotesIconButton
              onClick={onOpenDisableLocking}
              label="Remove notes passphrase"
              tooltip="Remove the Notes passphrase from this workspace"
              variant="danger"
            >
              <IcLockOff size={16} />
            </NotesIconButton>
          ) : null}
          {!archivedView ? (
            <>
              <NotesIconButton
                onClick={() => setNewListOpen((v) => !v)}
                label="New list"
                tooltip="Create a note list"
                variant={newListOpen ? 'primary' : undefined}
              >
                <IcFolder size={16} />
              </NotesIconButton>
              {onOpenFile ? (
                <NotesIconButton
                  onClick={onOpenFile}
                  label="Open file"
                  tooltip="Open a .md, .txt or .html file as a new note"
                >
                  <IcUpload size={16} />
                </NotesIconButton>
              ) : null}
              <NotesIconButton onClick={() => onCreateNote()} label="New note" tooltip="New note" variant="primary">
                <IcPlus size={16} />
              </NotesIconButton>
            </>
          ) : null}
        </div>
      </header>

      {newListOpen && !archivedView ? (
        <form className="notes-page__group-form notes-page__group-form--header" onSubmit={submitNewList}>
          <input
            className="input notes-page__group-input"
            placeholder="New list name"
            value={newListName}
            autoFocus
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setNewListOpen(false);
                setNewListName('');
              }
            }}
            aria-label="New list name"
          />
          <button type="submit" className="btn btn--primary btn--small" disabled={!newListName.trim()}>
            Create
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setNewListOpen(false);
              setNewListName('');
            }}
          >
            Cancel
          </button>
        </form>
      ) : null}

      <div className="seg notes-page__view-seg" role="group" aria-label="Notes view">
        {NOTE_VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`seg__btn${viewMode === opt.value ? ' seg__btn--on' : ''}`}
            title={opt.label}
            onClick={() => onViewModeChange(opt.value)}
          >
            {opt.label}
            {opt.value === 'archived' && archivedCount > 0 ? (
              <span className="notes-page__view-badge">{archivedCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {!hasContent ? (
        <div className="notes-page__empty">
          {archivedView ? (
            <>
              <p>No archived notes.</p>
              <p className="muted small">Archive a note from the Active view using the archive icon in the header.</p>
            </>
          ) : (
            <>
              <p>No notes yet.</p>
              <button type="button" className="btn btn--primary" onClick={() => onCreateNote()}>
                Create your first note
              </button>
            </>
          )}
        </div>
      ) : (
        <ul className="notes-page__list">
          <NotesGroupTree
            nodes={forest.roots}
            allGroups={groups}
            archivedView={archivedView}
            isExpanded={isGroupExpanded}
            onToggle={onToggleGroup}
            onExpand={onExpandGroup}
            renderNote={(n) => (
              <NotesListRow
                key={n.id}
                note={n}
                nested
                bulkSelected={bulkSelectedIds.has(n.id)}
                bulkSelectionSize={bulkSelectedIds.size}
                isDragging={draggingId === n.id}
                isDropTarget={dropTargetId === n.id}
                {...rowProps}
              />
            )}
            onCreateNote={onCreateNote}
            onCreateSubGroup={(parentId, name) => onCreateGroup(name, parentId)}
            onRename={onRenameGroup}
            onSetArchived={onSetGroupArchived}
            onMove={onMoveGroup}
            onRequestDelete={(id) => void requestDeleteGroup(id)}
            dropTargetGroupId={dropTargetGroupId}
            onGroupDragOver={onGroupDragOver}
            onGroupDrop={onGroupDrop}
          />

          {forest.ungrouped.map((n) => (
            <NotesListRow
              key={n.id}
              note={n}
              bulkSelected={bulkSelectedIds.has(n.id)}
              bulkSelectionSize={bulkSelectedIds.size}
              isDragging={draggingId === n.id}
              isDropTarget={dropTargetId === n.id}
              {...rowProps}
            />
          ))}
        </ul>
      )}
    </aside>
  );
});
