import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { useToast } from '../components/ui/Toast';
import { useAppDataActions, useAppDataSelector } from '../AppDataContext';
import { useAccount } from '../AccountContext';
import {
  NotesBodyEditor,
  NotesDetailHeader,
  NotesListContextMenu,
  NotesLockDialogs,
  NotesLockedView,
  NotesSidebar,
  NotesVersionHistoryPanel,
  filterNotesForView,
  flatSidebarNoteIds,
  notePlainText,
  prefetchRichTextEditor,
  useNoteGroupExpand,
  useNoteRevisionCapture,
  useNoteVersionHistory,
  useNotesBulkSelection,
  useNotesEditor,
  useNotesLock,
  useNotesSelection,
  useNotesSidebarCollapse,
  useNotesSidebarDnD,
  useNotesSort,
  useNotesViewMode,
  useSidebarResize,
} from '../features/notes';
import { moveNoteToGroup } from '../core/actions';
import { isAIConfigured } from '../lib/ai';
import { useFeatures } from '../lib/features';
import { useNotesUnlock } from '../lib/NotesUnlockContext';
import { purgeNoteRevisionHistory } from '../lib/noteRevision/noteRevisionStore';
import { runBeforeFlushHooks } from '../lib/pendingSaveFlush';
import type { AppData } from '../model';

const AITaskExtractorDialog = lazy(() =>
  import('../components/AITaskExtractorDialog').then((m) => ({ default: m.AITaskExtractorDialog })),
);

/**
 * macOS-Notes-style two-pane view. Left rail lists every note (title +
 * preview); right pane is a rich-text editor for the selected note.
 *
 * Lock model, strict per-note unlock UX, and crypto invariants are
 * documented in `useNotesLock` and the original NotesPage design — see
 * `docs/HEALTH-CHECK-AND-ROADMAP.md` (B2 notes module).
 */
export function NotesPage() {
  const { addNote, addNoteGroup, updateNoteGroup, removeNoteGroup, patchNote, replaceNote, removeNote, setNotesLock, update, flushPendingSave } =
    useAppDataActions();
  const notesWorkspace = useAppDataSelector(
    (d) => ({
      notes: d.notes,
      noteGroups: d.noteGroups,
      notesLock: d.notesLock,
      todoItems: d.todoItems,
      todoGroups: d.todoGroups,
      aiSettings: d.aiSettings,
    }),
    (a, b) =>
      a.notes === b.notes &&
      a.noteGroups === b.noteGroups &&
      a.notesLock === b.notesLock &&
      a.todoItems === b.todoItems &&
      a.todoGroups === b.todoGroups &&
      a.aiSettings === b.aiSettings,
  );
  const { user } = useAccount();
  const unlock = useNotesUnlock();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { features } = useFeatures();
  const aiEnabled = features.ai && isAIConfigured(notesWorkspace.aiSettings);

  const [extractorContext, setExtractorContext] = useState<{ noteId: string; notes: string } | null>(
    null,
  );
  const [listContextMenu, setListContextMenu] = useState<{
    x: number;
    y: number;
    noteIds: string[];
  } | null>(null);

  const { viewMode, setViewMode } = useNotesViewMode(user?.id ?? '');
  const { isExpanded, toggleExpanded, expandGroup } = useNoteGroupExpand(user?.id ?? '');
  const groups = useMemo(
    () => [...notesWorkspace.noteGroups].sort((a, b) => a.sortOrder - b.sortOrder),
    [notesWorkspace.noteGroups],
  );
  const archivedCount = useMemo(
    () => notesWorkspace.notes.filter((n) => n.archived === true).length,
    [notesWorkspace.notes],
  );
  const visibleNotes = useMemo(
    () => filterNotesForView(notesWorkspace.notes, viewMode),
    [notesWorkspace.notes, viewMode],
  );

  useEffect(() => {
    prefetchRichTextEditor();
  }, []);

  const pendingSelectNoteIdRef = useRef<string | null>(null);
  const createNoteEditIntentRef = useRef<string | null>(null);

  const { sortMode, setSortMode, notes } = useNotesSort(visibleNotes, user?.id);
  const orderedNoteIds = useMemo(() => flatSidebarNoteIds(groups, notes), [groups, notes]);
  const bulkSelection = useNotesBulkSelection(orderedNoteIds);
  const { selectedId, setSelectedId, selected } = useNotesSelection(
    notes,
    notesWorkspace.notes,
    searchParams,
    setSearchParams,
    sortMode,
    patchNote,
    viewMode,
    setViewMode,
    pendingSelectNoteIdRef,
  );

  const toast = useToast();
  const revisionCaptureRef = useRef<ReturnType<typeof useNoteRevisionCapture> | null>(null);
  const editorState = useNotesEditor(
    selected,
    patchNote,
    update,
    unlock,
    (...args) => revisionCaptureRef.current?.captureAfterSave(...args),
    createNoteEditIntentRef,
    (message) => toast.showError('Locked note not saved', message),
  );
  const revisionCapture = useNoteRevisionCapture(selected, editorState.getRevisionSnapshot);
  revisionCaptureRef.current = revisionCapture;
  const { captureAfterSave } = revisionCapture;

  const {
    decrypted,
    setDecrypted,
    bodyEditing,
    setBodyEditing,
    editorAutoFocus,
    clearEditorAutoFocus,
    decryptedForSelected,
    editorReady,
    editorBodyFormat,
    editorBody,
    onChangeBody,
    hideSelected,
  } = editorState;

  const versionHistory = useNoteVersionHistory(
    selected,
    editorReady,
    unlock,
    patchNote,
    replaceNote,
    flushPendingSave,
    setDecrypted,
  );

  const lock = useNotesLock({
    data: notesWorkspace as AppData,
    selected,
    decrypted,
    setDecrypted,
    unlock,
    replaceNote,
    setNotesLock,
    update,
    removeNote,
    captureRevision: captureAfterSave,
    getLatestBodyFields: editorState.getLatestBodyFields,
  });

  const {
    sidebarWidth,
    beginSidebarResize,
    onSidebarResizeMove,
    endSidebarResize,
  } = useSidebarResize();

  const { sidebarCollapsed, toggleSidebar, expandSidebar, collapseSidebar } =
    useNotesSidebarCollapse(user?.id ?? '');

  const dnd = useNotesSidebarDnD(sortMode, notes, update);

  // Once the new note lands in workspace data, force selection and expand its list.
  useEffect(() => {
    const pendingId = pendingSelectNoteIdRef.current;
    if (!pendingId) return;
    const note = notesWorkspace.notes.find((n) => n.id === pendingId);
    if (!note) return;
    if (note.groupId) expandGroup(note.groupId);
    if (selectedId !== pendingId) setSelectedId(pendingId);
  }, [notesWorkspace.notes, selectedId, setSelectedId, expandGroup]);

  const onCreate = (groupId?: string) => {
    const id = addNote(groupId);
    setViewMode('active');
    setDecrypted(null);
    bulkSelection.clearBulk();
    setListContextMenu(null);
    pendingSelectNoteIdRef.current = id;
    createNoteEditIntentRef.current = id;
    setSelectedId(id);
    if (groupId) expandGroup(groupId);
  };

  const selectPrimaryNote = useCallback(
    (id: string) => {
      pendingSelectNoteIdRef.current = null;
      createNoteEditIntentRef.current = null;
      setBodyEditing(false);
      setSelectedId(id);
    },
    [setBodyEditing, setSelectedId],
  );

  const onNoteClick = (id: string, event: React.MouseEvent) => {
    bulkSelection.handleNoteClick(
      id,
      { shiftKey: event.shiftKey, metaKey: event.metaKey || event.ctrlKey },
      selectedId,
      selectPrimaryNote,
    );
  };

  const onNoteContextMenu = (id: string, event: React.MouseEvent) => {
    event.preventDefault();
    const noteIds = bulkSelection.prepareContextMenu(id);
    selectPrimaryNote(id);
    setListContextMenu({ x: event.clientX, y: event.clientY, noteIds });
  };

  const onBulkPin = useCallback(
    (noteIds: string[]) => {
      for (const noteId of noteIds) patchNote(noteId, { pinned: true });
    },
    [patchNote],
  );

  const onBulkUnpin = useCallback(
    (noteIds: string[]) => {
      for (const noteId of noteIds) patchNote(noteId, { pinned: false });
    },
    [patchNote],
  );

  const onBulkMoveToGroup = useCallback(
    (noteIds: string[], groupId: string | undefined) => {
      update((d) => noteIds.reduce((acc, noteId) => moveNoteToGroup(acc, noteId, groupId), d));
      if (groupId) expandGroup(groupId);
    },
    [update, expandGroup],
  );

  const { confirm } = useConfirm();

  const onBulkDelete = useCallback(
    async (noteIds: string[]) => {
      const lockedIds = noteIds.filter((id) => notesWorkspace.notes.find((n) => n.id === id)?.locked);
      if (lockedIds.length > 0) {
        toast.showInfo(
          lockedIds.length === 1 ? 'Note is locked' : `${lockedIds.length} notes are locked`,
          'Remove the lock before deleting locked notes.',
        );
        return;
      }
      const deletableIds = noteIds;
      const title = deletableIds.length === 1 ? 'Delete this note?' : `Delete ${deletableIds.length} notes?`;
      const description = "This can't be undone.";
      if (!(await confirm({ title, description, confirmLabel: 'Delete', danger: true }))) return;
      try {
        await runBeforeFlushHooks();
      } catch {
        /* best effort */
      }
      for (const noteId of deletableIds) {
        void purgeNoteRevisionHistory(noteId);
        removeNote(noteId);
      }
      if (selectedId && deletableIds.includes(selectedId)) {
        setSelectedId(null);
      }
      bulkSelection.clearBulk();
    },
    [bulkSelection, confirm, notesWorkspace.notes, removeNote, selectedId, setSelectedId, toast],
  );

  useEffect(() => {
    bulkSelection.clearBulk();
    setListContextMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const onCreateGroup = (name: string) => {
    const id = addNoteGroup(name);
    expandGroup(id);
  };

  const onRenameGroup = (groupId: string, name: string) => {
    updateNoteGroup(groupId, { name });
  };

  const onRemoveGroup = (groupId: string) => {
    removeNoteGroup(groupId);
  };

  const onTogglePinned = () => {
    if (!selected) return;
    patchNote(selected.id, { pinned: !selected.pinned });
  };

  const onToggleArchive = () => {
    if (!selected) return;
    const nextArchived = selected.archived !== true;
    patchNote(selected.id, { archived: nextArchived ? true : false });
    if (nextArchived) {
      setSelectedId(null);
    }
  };

  return (
    <div
      className={[
        'notes-page',
        selected ? 'notes-page--mobile-detail' : 'notes-page--mobile-list',
        sidebarCollapsed ? 'notes-page--sidebar-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        sidebarCollapsed
          ? undefined
          : { gridTemplateColumns: `minmax(0, ${sidebarWidth}px) 6px minmax(0, 1fr)` }
      }
    >
      <NotesSidebar
        groups={groups}
        notes={notes}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        archivedCount={archivedCount}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        selectedId={selectedId}
        bulkSelectedIds={bulkSelection.bulkIds}
        onNoteClick={onNoteClick}
        onNoteContextMenu={onNoteContextMenu}
        onCreateNote={onCreate}
        onCreateGroup={onCreateGroup}
        onRenameGroup={onRenameGroup}
        onRemoveGroup={onRemoveGroup}
        isGroupExpanded={isExpanded}
        onToggleGroup={toggleExpanded}
        hasLock={lock.hasLock}
        hasRecovery={lock.hasRecovery}
        onOpenAddRecovery={lock.openAddRecovery}
        onOpenDisableLocking={lock.openDisableLocking}
        decrypted={decrypted}
        draggingId={dnd.draggingId}
        dropTargetId={dnd.dropTargetId}
        dropTargetGroupId={dnd.dropTargetGroupId}
        onNoteDragStart={dnd.onNoteDragStart}
        onNoteDragOver={dnd.onNoteDragOver}
        onNoteDrop={dnd.onNoteDrop}
        onGroupDragOver={dnd.onGroupDragOver}
        onGroupDrop={dnd.onGroupDrop}
        onDragEnd={dnd.onDragEnd}
        onCollapseSidebar={collapseSidebar}
      />

      {!sidebarCollapsed ? (
        <div
          className="notes-page__resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize notes sidebar"
          title="Resize notes sidebar"
          onPointerDown={beginSidebarResize}
          onPointerMove={onSidebarResizeMove}
          onPointerUp={endSidebarResize}
          onPointerCancel={endSidebarResize}
        />
      ) : null}

      <section className="notes-page__main">
        {!selected ? (
          <div className="notes-page__placeholder">
            {sidebarCollapsed ? (
              <button
                type="button"
                className="notes-page__show-list-btn"
                title="Show notes list"
                onClick={expandSidebar}
              >
                Show notes list
              </button>
            ) : null}
            <p className="muted">
              {viewMode === 'archived'
                ? 'Select an archived note on the left, or switch to Active.'
                : 'Select a note on the left, or create a new one.'}
            </p>
          </div>
        ) : (
          <>
            <NotesDetailHeader
              selected={selected}
              editorReady={editorReady}
              busy={lock.busy}
              aiEnabled={aiEnabled}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={toggleSidebar}
              onBack={() => {
                pendingSelectNoteIdRef.current = null;
                createNoteEditIntentRef.current = null;
                setSelectedId(null);
              }}
              onExtractTasks={() =>
                setExtractorContext({
                  noteId: selected.id,
                  notes: notePlainText(selected, decryptedForSelected),
                })
              }
              onTogglePinned={onTogglePinned}
              onToggleArchive={onToggleArchive}
              onRequestAction={lock.requestAction}
              onHideSelected={hideSelected}
              onConfirmRemove={() => {
                if (selected.locked) return;
                lock.setConfirmRemoveId(selected.id);
              }}
              onOpenVersionHistory={() => versionHistory.setOpen(true)}
              versionHistoryAvailable={versionHistory.available}
            />

            {selected.locked && !editorReady ? (
              <NotesLockedView busy={lock.busy} onRequestAction={lock.requestAction} />
            ) : (
              <NotesBodyEditor
                noteId={selected.id}
                editorBody={editorBody}
                editorBodyFormat={editorBodyFormat}
                editorReady={editorReady}
                bodyEditing={bodyEditing}
                onBodyEditingChange={setBodyEditing}
                editorAutoFocus={editorAutoFocus}
                onEditorAutoFocusHandled={clearEditorAutoFocus}
                onChangeBody={onChangeBody}
                attachmentUserId={user?.id ?? 'anonymous'}
                todoItems={notesWorkspace.todoItems}
                todoGroups={notesWorkspace.todoGroups}
                onOpenTask={(taskId) => {
                  navigate(`/todos?focus=${encodeURIComponent(taskId)}`);
                }}
              />
            )}
          </>
        )}
      </section>

      {listContextMenu ? (
        <NotesListContextMenu
          x={listContextMenu.x}
          y={listContextMenu.y}
          noteIds={listContextMenu.noteIds}
          notes={notesWorkspace.notes}
          groups={groups}
          onClose={() => setListContextMenu(null)}
          onPin={onBulkPin}
          onUnpin={onBulkUnpin}
          onMoveToGroup={onBulkMoveToGroup}
          onDelete={onBulkDelete}
        />
      ) : null}

      {extractorContext ? (
        <Suspense fallback={null}>
          <AITaskExtractorDialog
            open
            onClose={() => setExtractorContext(null)}
            sourceNoteId={extractorContext.noteId}
            initialNotes={extractorContext.notes}
          />
        </Suspense>
      ) : null}

      <NotesLockDialogs notes={notesWorkspace.notes} data={notesWorkspace as AppData} lock={lock} />

      {selected ? (
        <NotesVersionHistoryPanel
          noteId={selected.id}
          attachmentUserId={user?.id ?? 'anonymous'}
          history={versionHistory}
        />
      ) : null}
    </div>
  );
}
