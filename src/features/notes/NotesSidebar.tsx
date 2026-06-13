import { FormEvent, useMemo, useState } from 'react';
import {
  IcChevronDown,
  IcChevronLeft,
  IcFolder,
  IcKey,
  IcLockOff,
  IcPlus,
  IcTrash,
} from '../../components/icons';
import type { Note, NoteGroup } from '../../model';
import type { RichTextBodyFields } from '../../lib/richTextBody';
import { NotesIconButton } from './NotesIconButton';
import { NotesListRow } from './NotesListRow';
import {
  NOTE_VIEW_OPTIONS,
  SORT_OPTIONS,
  type NoteSortMode,
  type NoteViewMode,
} from './notePreferences';

export type NotesSidebarProps = {
  groups: NoteGroup[];
  notes: Note[];
  viewMode: NoteViewMode;
  onViewModeChange: (mode: NoteViewMode) => void;
  archivedCount: number;
  sortMode: NoteSortMode;
  onSortModeChange: (mode: NoteSortMode) => void;
  selectedId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: (groupId?: string) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onRemoveGroup: (id: string) => void;
  isGroupExpanded: (groupId: string) => boolean;
  onToggleGroup: (groupId: string) => void;
  hasLock: boolean;
  hasRecovery: boolean;
  onOpenAddRecovery: () => void;
  onOpenDisableLocking: () => void;
  decrypted: ({ noteId: string } & RichTextBodyFields) | null;
  draggingId: string | null;
  dropTargetId: string | null;
  dropTargetGroupId: string | null;
  onNoteDragStart: (e: React.DragEvent<HTMLLIElement>, noteId: string) => void;
  onNoteDragOver: (e: React.DragEvent<HTMLLIElement>, noteId: string) => void;
  onNoteDrop: (e: React.DragEvent<HTMLLIElement>, noteId: string) => void;
  onGroupDragOver: (e: React.DragEvent<HTMLLIElement>, groupId: string) => void;
  onGroupDrop: (e: React.DragEvent<HTMLLIElement>, groupId: string) => void;
  onDragEnd: () => void;
  onCollapseSidebar?: () => void;
};

export function NotesSidebar({
  groups,
  notes,
  viewMode,
  onViewModeChange,
  archivedCount,
  sortMode,
  onSortModeChange,
  selectedId,
  onSelectNote,
  onCreateNote,
  onCreateGroup,
  onRenameGroup,
  onRemoveGroup,
  isGroupExpanded,
  onToggleGroup,
  hasLock,
  hasRecovery,
  onOpenAddRecovery,
  onOpenDisableLocking,
  decrypted,
  draggingId,
  dropTargetId,
  dropTargetGroupId,
  onNoteDragStart,
  onNoteDragOver,
  onNoteDrop,
  onGroupDragOver,
  onGroupDrop,
  onDragEnd,
  onCollapseSidebar,
}: NotesSidebarProps) {
  const archivedView = viewMode === 'archived';
  const isManual = sortMode === 'manual' && !archivedView;

  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.sortOrder - b.sortOrder),
    [groups],
  );

  const { notesByGroup, ungroupedNotes } = useMemo(() => {
    const byGroup = new Map<string, Note[]>();
    for (const g of sortedGroups) byGroup.set(g.id, []);
    const ungrouped: Note[] = [];
    for (const n of notes) {
      if (n.groupId && byGroup.has(n.groupId)) {
        byGroup.get(n.groupId)!.push(n);
      } else {
        ungrouped.push(n);
      }
    }
    return { notesByGroup: byGroup, ungroupedNotes: ungrouped };
  }, [notes, sortedGroups]);

  const submitNewList = (e: FormEvent) => {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    onCreateGroup(name);
    setNewListName('');
    setNewListOpen(false);
  };

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) return;
    onRenameGroup(renamingId, name);
    setRenamingId(null);
    setRenameValue('');
  };

  const hasContent = sortedGroups.length > 0 || notes.length > 0;

  const rowProps = {
    selectedId,
    onSelectNote,
    decrypted,
    isManual,
    onDragStart: onNoteDragStart,
    onDragOver: onNoteDragOver,
    onDrop: onNoteDrop,
    onDragEnd,
  };

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
          {sortedGroups.map((g) => {
            const groupNotes = notesByGroup.get(g.id) ?? [];
            const expanded = isGroupExpanded(g.id);
            const isDropTarget = dropTargetGroupId === g.id;
            const isRenaming = renamingId === g.id;
            return (
              <li
                key={g.id}
                className={[
                  'notes-page__group-holder',
                  expanded ? 'notes-page__group-holder--open' : '',
                  isDropTarget ? 'notes-page__group-holder--drop-target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onDragOver={(e) => onGroupDragOver(e, g.id)}
                onDrop={(e) => onGroupDrop(e, g.id)}
              >
                {isRenaming ? (
                  <form className="notes-page__group-rename" onSubmit={submitRename}>
                    <input
                      className="input notes-page__group-input"
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setRenamingId(null);
                          setRenameValue('');
                        }
                      }}
                      aria-label="Rename list"
                    />
                    <button type="submit" className="btn btn--primary btn--small" disabled={!renameValue.trim()}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--small btn--icon"
                      title="Delete list"
                      aria-label="Delete list"
                      onClick={() => {
                        onRemoveGroup(g.id);
                        setRenamingId(null);
                      }}
                    >
                      <IcTrash size={14} />
                    </button>
                  </form>
                ) : (
                  <div className="notes-page__group-head">
                    <button
                      type="button"
                      className="notes-page__group-toggle"
                      onClick={() => onToggleGroup(g.id)}
                      onDoubleClick={() => {
                        setRenamingId(g.id);
                        setRenameValue(g.name);
                      }}
                      aria-expanded={expanded}
                      title="Double-click to rename"
                    >
                      <span className={`notes-page__group-chev${expanded ? ' notes-page__group-chev--open' : ''}`}>
                        <IcChevronDown size={14} />
                      </span>
                      <IcFolder size={16} className="notes-page__group-folder" aria-hidden />
                      <span className="notes-page__group-name">{g.name}</span>
                      <span className="notes-page__group-count">{groupNotes.length}</span>
                    </button>
                    {!archivedView ? (
                      <button
                        type="button"
                        className="notes-page__group-add-note icon-btn"
                        title={`Add note to ${g.name}`}
                        aria-label={`Add note to ${g.name}`}
                        onClick={() => onCreateNote(g.id)}
                      >
                        <IcPlus size={14} />
                      </button>
                    ) : null}
                  </div>
                )}
                {expanded ? (
                  <ul className="notes-page__group-children">
                    {groupNotes.length === 0 ? (
                      <li className="notes-page__group-empty muted small">Drop notes here or use + to add</li>
                    ) : (
                      groupNotes.map((n) => (
                        <NotesListRow
                          key={n.id}
                          note={n}
                          nested
                          isDragging={draggingId === n.id}
                          isDropTarget={dropTargetId === n.id}
                          {...rowProps}
                        />
                      ))
                    )}
                  </ul>
                ) : null}
              </li>
            );
          })}

          {ungroupedNotes.map((n) => (
            <NotesListRow
              key={n.id}
              note={n}
              isDragging={draggingId === n.id}
              isDropTarget={dropTargetId === n.id}
              {...rowProps}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
