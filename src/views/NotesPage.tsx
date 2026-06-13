import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDataActions, useAppDataSelector } from '../AppDataContext';
import { useAccount } from '../AccountContext';
import {
  NotesBodyEditor,
  NotesDetailHeader,
  NotesLockDialogs,
  NotesLockedView,
  NotesSidebar,
  NotesVersionHistoryPanel,
  filterNotesForView,
  notePlainText,
  prefetchRichTextEditor,
  useNoteGroupExpand,
  useNoteRevisionCapture,
  useNoteVersionHistory,
  useNotesEditor,
  useNotesLock,
  useNotesSelection,
  useNotesSidebarCollapse,
  useNotesSidebarDnD,
  useNotesSort,
  useNotesViewMode,
  useSidebarResize,
} from '../features/notes';
import { isAIConfigured } from '../lib/ai';
import { useFeatures } from '../lib/features';
import { useNotesUnlock } from '../lib/NotesUnlockContext';
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

  const { sortMode, setSortMode, notes } = useNotesSort(visibleNotes, user?.id);
  const { selectedId, setSelectedId, selected } = useNotesSelection(
    notes,
    notesWorkspace.notes,
    searchParams,
    setSearchParams,
    sortMode,
    patchNote,
    viewMode,
    setViewMode,
  );

  const revisionCaptureRef = useRef<ReturnType<typeof useNoteRevisionCapture> | null>(null);
  const editorState = useNotesEditor(
    selected,
    patchNote,
    replaceNote,
    unlock,
    (...args) => revisionCaptureRef.current?.captureAfterSave(...args),
  );
  const revisionCapture = useNoteRevisionCapture(selected, editorState.getRevisionSnapshot);
  revisionCaptureRef.current = revisionCapture;
  const { captureAfterSave } = revisionCapture;

  const {
    decrypted,
    setDecrypted,
    bodyEditing,
    setBodyEditing,
    decryptedForSelected,
    editorReady,
    editorBodyFormat,
    editorBody,
    onChangeTitle,
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

  const dnd = useNotesSidebarDnD(sortMode, notes, update, (noteId, groupId) =>
    patchNote(noteId, { groupId }),
  );

  const onCreate = (groupId?: string) => {
    const id = addNote(groupId);
    setViewMode('active');
    setSelectedId(id);
    setDecrypted(null);
    if (groupId) expandGroup(groupId);
  };

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
        onSelectNote={setSelectedId}
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
              onBack={() => setSelectedId(null)}
              onChangeTitle={onChangeTitle}
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
              onConfirmRemove={() => lock.setConfirmRemoveId(selected.id)}
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
