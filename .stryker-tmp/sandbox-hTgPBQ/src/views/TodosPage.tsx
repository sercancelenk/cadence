// @ts-nocheck
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import { useToast } from '../components/ui/Toast';
import {
  legacyBodyPlainText,
  prefetchRichTextEditor,
  sortGroups,
  TodoListSection,
  TodosFilteredEmptyHint,
  TodosGroupDropTail,
  TodosNoListsHint,
  TodosPageHeader,
  TodosToolbar,
  todoBodyPatchFromFields,
  emptyInlineAddDraft,
  buildItemsByGroup,
  useTodoFocus,
  useTodoPagePreferences,
  type InlineAddDraft,
} from '../features/todos';
import { appendPlainTextToBodyFields } from '../lib/richTextBody';
import { isAIConfigured } from '../lib/ai';
import { useFeatures } from '../lib/features';
import type { TodoItem } from '../model';

const AIAssistantDialog = lazy(() =>
  import('../components/AIAssistantDialog').then((m) => ({ default: m.AIAssistantDialog })),
);
const AITaskExtractorDialog = lazy(() =>
  import('../components/AITaskExtractorDialog').then((m) => ({ default: m.AITaskExtractorDialog })),
);

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
  const [draftByGroup, setDraftByGroup] = useState<Record<string, InlineAddDraft>>({});
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropItemTargetId, setDropItemTargetId] = useState<string | null>(null);
  const [aiTask, setAiTask] = useState<TodoItem | null>(null);
  const [extractorOpen, setExtractorOpen] = useState(false);

  const prefs = useTodoPagePreferences(userId);
  const {
    sectionOpenMap,
    setSectionOpenMap,
    search,
    setSearch,
    showArchived,
    setShowArchived,
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
  const aiEnabled = appFeatures.ai && isAIConfigured(data.aiSettings);
  const allGroupsSorted = useMemo(() => sortGroups(data.todoGroups), [data.todoGroups]);
  const visibleGroups = useMemo(
    () => allGroupsSorted.filter((g) => showArchived || !g.archived),
    [allGroupsSorted, showArchived],
  );

  useEffect(() => {
    prefetchRichTextEditor();
  }, []);

  const noteTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of data.notes) {
      if (n?.id) m.set(n.id, (n.title || '').trim() || 'Untitled note');
    }
    return m;
  }, [data.notes]);

  const openSourceNote = (noteId: string) => {
    navigate(`/notes?focus=${encodeURIComponent(noteId)}`);
  };

  const focusedTaskId = useTodoFocus(
    location.search,
    location.pathname,
    navigate,
    data.todoItems,
    data.todoGroups,
    statusFilter,
    hideDone,
    showArchived,
    {
      setSearch,
      setStatusFilter,
      setHideDone,
      setShowArchived,
      setSectionOpenMap,
    },
  );

  const itemsByGroup = useMemo(
    () => buildItemsByGroup(data.todoGroups, data.todoItems, sortMode),
    [data.todoGroups, data.todoItems, sortMode],
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
      onAskAI: setAiTask,
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
    ],
  );

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

      {visibleGroups.length === 0 && allGroupsSorted.length > 0 ? (
        <TodosFilteredEmptyHint
          allGroupsSorted={allGroupsSorted}
          todoItems={data.todoItems}
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
          attachmentUserId={user?.id ?? 'anonymous'}
          totalGroupCount={data.todoGroups.length}
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

      {allGroupsSorted.length === 0 ? <TodosNoListsHint /> : null}

      {aiTask || extractorOpen ? (
        <Suspense fallback={null}>
          {aiTask ? (
            <AIAssistantDialog
              open={!!aiTask}
              onClose={() => setAiTask(null)}
              task={{
                title: aiTask.title,
                body: legacyBodyPlainText(aiTask) || undefined,
              }}
              onAppendToBody={(markdown) => {
                const targetId = aiTask.id;
                const nextFields = appendPlainTextToBodyFields(aiTask, markdown);
                updateTodoItem(targetId, todoBodyPatchFromFields(nextFields));
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
