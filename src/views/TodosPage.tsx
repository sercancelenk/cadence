import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccount } from '../AccountContext';
import { useAppDataActions, useAppDataSelector } from '../AppDataContext';
import { useToast } from '../components/ui/Toast';
import {
  legacyBodyPlainText,
  prefetchRichTextEditor,
  sortGroups,
  TodoListSection,
  TodosFilteredEmptyHint,
  TodosArchivedEmptyHint,
  TodosGroupDropTail,
  TodosNoListsHint,
  TodosPageHeader,
  TodosToolbar,
  todoBodyPatchFromFields,
  emptyInlineAddDraft,
  buildItemsByGroup,
  filterTodoItemsForView,
  useTodoFocus,
  useTodoPagePreferences,
  type InlineAddDraft,
} from '../features/todos';
import { noteDisplayTitle } from '../features/notes/noteDisplay';
import { stepsForTopInsert } from '../lib/ai/breakdownTasks';
import { bodyRestorePatch } from '../features/todos/bodyUndo';
import { appendChecklistToBodyFields, appendPlainTextToBodyFields } from '../lib/richTextBody';
import { hasUsableConnection } from '../lib/ai/connections';
import { aiIntentFromSearch } from '../lib/ai/entryPoints';
import { toLocalDatetimeValue } from '../lib/datetime';
import { useFeatures } from '../lib/features';
import type { Note, TodoItem } from '../model';

const AIAssistantDialog = lazy(() =>
  import('../components/AIAssistantDialog').then((m) => ({ default: m.AIAssistantDialog })),
);
const AITaskExtractorDialog = lazy(() =>
  import('../components/AITaskExtractorDialog').then((m) => ({ default: m.AITaskExtractorDialog })),
);
const AIBreakDownDialog = lazy(() =>
  import('../components/AIBreakDownDialog').then((m) => ({ default: m.AIBreakDownDialog })),
);

export function TodosPage() {
  const { user } = useAccount();
  const userId = user?.id ?? '';
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    addTodoGroup,
    removeTodoGroup,
    addTodoItem,
    updateTodoItem,
    getLatestSnapshot,
    toggleTodoItem,
    removeTodoItem,
    reorderTodoItem,
    updateTodoGroupPriority,
    updateTodoGroup,
    moveTodoGroup,
    reorderTodoGroup,
    clearCompletedInGroup,
    markAllCompleteInGroup,
    linkNoteTodo,
    unlinkNoteTodo,
  } = useAppDataActions();
  const workspace = useAppDataSelector(
    (d) => ({
      todoGroups: d.todoGroups,
      todoItems: d.todoItems,
      notes: d.notes,
      noteTodoLinks: d.noteTodoLinks,
      aiSettings: d.aiSettings,
    }),
    (a, b) =>
      a.todoGroups === b.todoGroups &&
      a.todoItems === b.todoItems &&
      a.notes === b.notes &&
      a.noteTodoLinks === b.noteTodoLinks &&
      a.aiSettings === b.aiSettings,
  );

  const [newGroupName, setNewGroupName] = useState('');
  const [newListOpen, setNewListOpen] = useState(false);
  const [draftByGroup, setDraftByGroup] = useState<Record<string, InlineAddDraft>>({});
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropItemTargetId, setDropItemTargetId] = useState<string | null>(null);
  const [aiTask, setAiTask] = useState<TodoItem | null>(null);
  const [breakTask, setBreakTask] = useState<TodoItem | null>(null);
  const [extractorOpen, setExtractorOpen] = useState(false);

  const prefs = useTodoPagePreferences(userId);
  const {
    sectionOpenMap,
    setSectionOpenMap,
    search,
    setSearch,
    showArchived,
    setShowArchived,
    itemViewMode,
    setItemViewMode,
    hideDone,
    setHideDone,
    sortMode,
    setSortMode,
    statusFilter,
    setStatusFilter,
    filtersOpen,
    setFiltersOpen,
  } = prefs;

  const { features: appFeatures } = useFeatures();
  const aiEnabled = appFeatures.ai && hasUsableConnection(workspace.aiSettings);

  // ⌘K "AI: Extract tasks from notes" arrives as /todos?ai=extract: open the extractor, then
  // drop the parameter so a reload or the back button does not reopen it.
  const aiIntent = aiIntentFromSearch(location.search);
  useEffect(() => {
    if (!aiIntent) return;
    if (aiIntent === 'extract' && aiEnabled) setExtractorOpen(true);
    navigate(location.pathname, { replace: true });
  }, [aiIntent, aiEnabled, navigate, location.pathname]);
  const allGroupsSorted = useMemo(() => sortGroups(workspace.todoGroups), [workspace.todoGroups]);
  const archivedItemCount = useMemo(
    () => workspace.todoItems.filter((it) => it.archived === true).length,
    [workspace.todoItems],
  );
  const visibleTodoItems = useMemo(
    () => filterTodoItemsForView(workspace.todoItems, itemViewMode),
    [workspace.todoItems, itemViewMode],
  );
  const visibleGroups = useMemo(() => {
    if (itemViewMode === 'archived') {
      const groupIds = new Set(visibleTodoItems.map((it) => it.groupId));
      return allGroupsSorted.filter((g) => groupIds.has(g.id));
    }
    return allGroupsSorted.filter((g) => showArchived || !g.archived);
  }, [allGroupsSorted, itemViewMode, showArchived, visibleTodoItems]);

  useEffect(() => {
    prefetchRichTextEditor();
  }, []);

  const noteTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of workspace.notes) {
      if (n?.id) m.set(n.id, noteDisplayTitle(n));
    }
    return m;
  }, [workspace.notes]);

  const openSourceNote = (noteId: string) => {
    navigate(`/notes?focus=${encodeURIComponent(noteId)}`);
  };

  const focusedTaskId = useTodoFocus(
    location.search,
    location.pathname,
    navigate,
    workspace.todoItems,
    workspace.todoGroups,
    statusFilter,
    hideDone,
    showArchived,
    itemViewMode,
    {
      setSearch,
      setStatusFilter,
      setHideDone,
      setShowArchived,
      setItemViewMode,
      setSectionOpenMap,
    },
  );

  const itemsByGroup = useMemo(
    () => buildItemsByGroup(workspace.todoGroups, visibleTodoItems, sortMode),
    [workspace.todoGroups, visibleTodoItems, sortMode],
  );
  const groupById = useMemo(() => new Map(allGroupsSorted.map((g) => [g.id, g])), [allGroupsSorted]);

  const listActions = useMemo(
    () => ({
      addTodoItem,
      updateTodoItem,
      toggleTodoItem,
      removeTodoItem,
      reorderTodoItem,
      updateTodoGroup,
      updateTodoGroupPriority,
      moveTodoGroup,
      removeTodoGroup,
      clearCompletedInGroup,
      markAllCompleteInGroup,
      reorderTodoGroup,
      onOpenSourceNote: openSourceNote,
      onLinkNote: linkNoteTodo,
      onUnlinkNote: unlinkNoteTodo,
      onAskAI: setAiTask,
      onBreakDown: setBreakTask,
    }),
    [
      addTodoItem,
      updateTodoItem,
      toggleTodoItem,
      removeTodoItem,
      reorderTodoItem,
      updateTodoGroup,
      updateTodoGroupPriority,
      moveTodoGroup,
      removeTodoGroup,
      clearCompletedInGroup,
      markAllCompleteInGroup,
      reorderTodoGroup,
      openSourceNote,
      linkNoteTodo,
      unlinkNoteTodo,
    ],
  );

  /**
   * After an AI change appended to a task's details, offer Undo for a while. It puts the details
   * back as they were, and only if the task has not been edited since.
   */
  const offerBodyUndo = (
    title: string,
    description: string,
    taskId: string,
    applied: Parameters<typeof bodyRestorePatch>[1],
    previous: Parameters<typeof bodyRestorePatch>[2],
  ) => {
    toast.show({
      kind: 'success',
      title,
      description,
      durationMs: 10_000,
      action: {
        label: 'Undo',
        onClick: () => {
          const current = getLatestSnapshot().todoItems.find((t) => t.id === taskId);
          const restore = bodyRestorePatch(current, applied, previous);
          if (!restore.ok) {
            toast.showWarning(
              'Not undone',
              restore.reason === 'changed' ? 'The task was edited since, so its details were left as they are.' : 'The task no longer exists.',
            );
            return;
          }
          if (updateTodoItem(taskId, restore.patch) === false) {
            toast.showWarning('Not undone', 'Saving is temporarily blocked. Try again in a moment.');
          }
        },
      },
    });
  };

  return (
    <div className="page page--wide todos-route">
      <TodosPageHeader
        newListOpen={newListOpen}
        onToggleNewList={() => setNewListOpen((o) => !o)}
        compact={compact}
        onToggleCompact={() => setCompact((c) => !c)}
        newGroupName={newGroupName}
        onNewGroupNameChange={setNewGroupName}
        onCreateList={(name) => {
          addTodoGroup(name);
          setNewGroupName('');
          setNewListOpen(false);
        }}
        onCancelNewList={() => {
          setNewGroupName('');
          setNewListOpen(false);
        }}
      />

      <TodosToolbar
        itemViewMode={itemViewMode}
        onItemViewModeChange={setItemViewMode}
        archivedCount={archivedItemCount}
        search={search}
        onSearchChange={setSearch}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        hideDone={hideDone}
        onHideDoneChange={setHideDone}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        filtersOpen={filtersOpen}
        onFiltersOpenChange={setFiltersOpen}
        aiEnabled={aiEnabled}
        onOpenExtractor={() => setExtractorOpen(true)}
      />

      {itemViewMode === 'archived' && archivedItemCount === 0 ? <TodosArchivedEmptyHint /> : null}

      {itemViewMode === 'active' && visibleGroups.length === 0 && allGroupsSorted.length > 0 ? (
        <TodosFilteredEmptyHint
          allGroupsSorted={allGroupsSorted}
          todoItems={workspace.todoItems}
          showArchived={showArchived}
          onShowArchived={() => setShowArchived(true)}
        />
      ) : null}

      {visibleGroups.map((g, idx) => (
        <TodoListSection
          key={g.id}
          group={g}
          sectionIndex={idx}
          list={itemsByGroup.get(g.id) ?? []}
          searchQuery={search}
          statusFilter={statusFilter}
          hideDone={hideDone}
          itemsViewMode={itemViewMode}
          sortMode={sortMode}
          compact={compact}
          aiEnabled={aiEnabled}
          focusedTaskId={focusedTaskId}
          sectionOpenMap={sectionOpenMap}
          onSectionOpenChange={(groupId, open) =>
            setSectionOpenMap((prev) => ({ ...prev, [groupId]: open }))
          }
          draft={draftByGroup[g.id] ?? emptyInlineAddDraft()}
          onDraftChange={(next) => setDraftByGroup((prev) => ({ ...prev, [g.id]: next }))}
          addingOpen={addingGroupId === g.id}
          onAddingOpenChange={(open) => setAddingGroupId(open ? g.id : null)}
          allGroupsSorted={allGroupsSorted}
          groupById={groupById}
          noteTitleById={noteTitleById}
          noteTodoLinks={workspace.noteTodoLinks}
          attachmentUserId={user?.id ?? 'anonymous'}
          totalGroupCount={workspace.todoGroups.length}
          isGroupDragSrc={dragGroupId === g.id}
          isGroupDropTgt={dropTargetId === g.id && dragGroupId !== null && dragGroupId !== g.id}
          dragGroupId={dragGroupId}
          onGroupDragStart={setDragGroupId}
          onGroupDragEnd={() => {
            setDragGroupId(null);
            setDropTargetId(null);
          }}
          onGroupDropTarget={setDropTargetId}
          dragItemId={dragItemId}
          dropItemTargetId={dropItemTargetId}
          onItemDragStart={setDragItemId}
          onItemDragOver={setDropItemTargetId}
          onItemDragEnd={() => {
            setDragItemId(null);
            setDropItemTargetId(null);
          }}
          actions={listActions}
        />
      ))}

      {itemViewMode === 'active' ? (
      <TodosGroupDropTail
        active={!!dragGroupId}
        isDropTarget={dropTargetId === '__end__'}
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
      />
      ) : null}

      {allGroupsSorted.length === 0 ? <TodosNoListsHint /> : null}

      {aiTask || extractorOpen || breakTask ? (
        <Suspense fallback={null}>
          {aiTask ? (
            <AIAssistantDialog
              open={!!aiTask}
              onClose={() => setAiTask(null)}
              task={{
                title: aiTask.title,
                body: legacyBodyPlainText(aiTask) || undefined,
              }}
              context={{
                listName: workspace.todoGroups.find((g) => g.id === aiTask.groupId)?.name,
                dueAt: aiTask.dueAt ? toLocalDatetimeValue(aiTask.dueAt).slice(0, 10) || undefined : undefined,
                priority: aiTask.priority,
                linkedNoteTitle: linkedNoteTitle(workspace.notes, aiTask.sourceNoteId),
              }}
              onAppendToBody={(markdown) => {
                // Append to the task as it is now, not as it was when the dialog opened.
                const latest = getLatestSnapshot().todoItems.find((t) => t.id === aiTask.id);
                if (!latest) return false;
                const applied = appendPlainTextToBodyFields(latest, markdown);
                const saved = updateTodoItem(aiTask.id, todoBodyPatchFromFields(applied));
                if (saved === false) return false;
                offerBodyUndo(
                  'Saved to task notes',
                  'The assistant\u2019s reply was appended to this task\u2019s details.',
                  aiTask.id,
                  applied,
                  latest,
                );
                setAiTask(null);
                return true;
              }}
            />
          ) : null}
          {breakTask ? (
            <AIBreakDownDialog
              open
              onClose={() => setBreakTask(null)}
              task={{ title: breakTask.title, body: legacyBodyPlainText(breakTask) || undefined }}
              context={{
                listName: workspace.todoGroups.find((g) => g.id === breakTask.groupId)?.name,
                dueAt: breakTask.dueAt ? toLocalDatetimeValue(breakTask.dueAt).slice(0, 10) || undefined : undefined,
                priority: breakTask.priority,
                linkedNoteTitle: linkedNoteTitle(workspace.notes, breakTask.sourceNoteId),
              }}
              onAppendChecklist={(titles) => {
                // Append to the task as it is now, not as it was when the dialog opened.
                const latest = getLatestSnapshot().todoItems.find((t) => t.id === breakTask.id);
                if (!latest) return false;
                const applied = appendChecklistToBodyFields(latest, titles);
                const saved = updateTodoItem(breakTask.id, todoBodyPatchFromFields(applied));
                if (saved === false) return false;
                offerBodyUndo('Checklist added', 'The steps were added to this task\u2019s details.', breakTask.id, applied, latest);
                return true;
              }}
              onCreateTasks={(steps) => {
                // New tasks go to the top of the list, so add them last to first to keep the order.
                let created = 0;
                for (const step of stepsForTopInsert(steps)) {
                  const note = step.detail?.trim();
                  const added = addTodoItem(
                    breakTask.groupId,
                    step.title,
                    note ? { body: note, bodyFormat: 'markdown', bodyPlainText: note } : undefined,
                  );
                  if (added === false) return created > 0 ? { created } : false;
                  created += 1;
                }
                toast.showSuccess(
                  `${steps.length} ${steps.length === 1 ? 'task' : 'tasks'} created`,
                  'They are in the same list as the original task.',
                );
                return true;
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

/** Title of the note a task came from, for the AI context. A locked note's title is never sent. */
function linkedNoteTitle(notes: Note[], noteId: string | undefined): string | undefined {
  const note = noteId ? notes.find((n) => n.id === noteId) : undefined;
  return note && !note.locked ? noteDisplayTitle(note) : undefined;
}
