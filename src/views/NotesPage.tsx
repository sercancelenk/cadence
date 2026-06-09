import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDataActions, useAppDataSelector } from '../AppDataContext';
import { useAccount } from '../AccountContext';
import {
  NotesBodyEditor,
  NotesDetailHeader,
  NotesLockDialogs,
  NotesLockedView,
  NotesSidebar,
  filterNotesForView,
  notePlainText,
  prefetchRichTextEditor,
  useNotesEditor,
  useNotesLock,
  useNotesManualReorder,
  useNotesSelection,
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
  const { addNote, patchNote, replaceNote, removeNote, setNotesLock, update } = useAppDataActions();
  const notesWorkspace = useAppDataSelector(
    (d) => ({
      notes: d.notes,
      notesLock: d.notesLock,
      todoItems: d.todoItems,
      todoGroups: d.todoGroups,
      aiSettings: d.aiSettings,
    }),
    (a, b) =>
      a.notes === b.notes &&
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

  const { sortMode, setSortMode, notes } = useNotesSort(visibleNotes);
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

  const editorState = useNotesEditor(selected, patchNote, replaceNote, unlock);
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
  });

  const {
    sidebarWidth,
    beginSidebarResize,
    onSidebarResizeMove,
    endSidebarResize,
  } = useSidebarResize();

  const reorder = useNotesManualReorder(sortMode, notes, update);

  const onCreate = () => {
    const id = addNote();
    setViewMode('active');
    setSelectedId(id);
    setDecrypted(null);
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
      className={`notes-page${selected ? ' notes-page--mobile-detail' : ' notes-page--mobile-list'}`}
      style={{ gridTemplateColumns: `minmax(0, ${sidebarWidth}px) 6px minmax(0, 1fr)` }}
    >
      <NotesSidebar
        notes={notes}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        archivedCount={archivedCount}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        selectedId={selectedId}
        onSelectNote={setSelectedId}
        onCreateNote={onCreate}
        hasLock={lock.hasLock}
        hasRecovery={lock.hasRecovery}
        onOpenAddRecovery={lock.openAddRecovery}
        onOpenDisableLocking={lock.openDisableLocking}
        decrypted={decrypted}
        draggingId={reorder.draggingId}
        dropTargetId={reorder.dropTargetId}
        onRowDragStart={reorder.onRowDragStart}
        onRowDragOver={reorder.onRowDragOver}
        onRowDrop={reorder.onRowDrop}
        onRowDragEnd={reorder.onRowDragEnd}
      />

      <div
        className="notes-page__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize notes sidebar"
        onPointerDown={beginSidebarResize}
        onPointerMove={onSidebarResizeMove}
        onPointerUp={endSidebarResize}
        onPointerCancel={endSidebarResize}
      />

      <section className="notes-page__main">
        {!selected ? (
          <div className="notes-page__placeholder">
            {viewMode === 'archived'
              ? 'Select an archived note on the left, or switch to Active.'
              : 'Select a note on the left, or create a new one.'}
          </div>
        ) : (
          <>
            <NotesDetailHeader
              selected={selected}
              editorReady={editorReady}
              busy={lock.busy}
              aiEnabled={aiEnabled}
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
    </div>
  );
}
