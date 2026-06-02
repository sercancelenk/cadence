import { FormEvent, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IcChevronDown,
  IcGrip,
  IcLayoutGrid,
  IcListTodo,
  IcPlus,
  IcSearch,
  IcSliders,
  IcStar,
  IcX,
} from '../components/icons';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import { useToast } from '../components/ui/Toast';
import {
  ALLOWED_SORT_MODES,
  emptyInlineAddDraft,
  legacyBodyPlainText,
  matchesStatusFilter,
  parseStatusFilter,
  prefetchRichTextEditor,
  SORT_OPTIONS,
  sortGroups,
  STATUS_FILTER_OPTIONS,
  TodoTaskRow,
  todoBodyPatchFromFields,
  todoHideDoneKey,
  todoSectionsStorageKey,
  todoShowArchivedKey,
  todoSortModeKey,
  todoStatusFilterKey,
  isSectionOpen,
  type InlineAddDraft,
  type SortMode,
  type StatusFilter,
} from '../features/todos';
import { appendPlainTextToBodyFields, richTextPayloadToBodyFields } from '../lib/richTextBody';
import { isAIConfigured } from '../lib/ai';
import { useFeatures } from '../lib/features';
import { PRIORITY_OPTIONS, priorityRank, isTodoOpen, todoStatusRank } from '../model';
import type { TodoGroup, TodoItem } from '../model';

const AIAssistantDialog = lazy(() =>
  import('../components/AIAssistantDialog').then((m) => ({ default: m.AIAssistantDialog })),
);
const AITaskExtractorDialog = lazy(() =>
  import('../components/AITaskExtractorDialog').then((m) => ({ default: m.AITaskExtractorDialog })),
);
const RichTextEditor = lazy(() =>
  import('../components/ui/RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
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
  // Combined markdown draft per group. The first non-empty line becomes
  // the task title on submit (stripped of any leading `#`), the rest is
  // the body. Sharing the same buffer as the inline-edit flow keeps the
  // two surfaces symmetric and avoids the old "title vs. details" split.
  const [draftByGroup, setDraftByGroup] = useState<Record<string, InlineAddDraft>>({});
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
    prefetchRichTextEditor();
  }, []);

  useEffect(() => {
    if (!userId) {
      setSectionOpenMap({});
      setSectionsHydrated(true);
      return;
    }
    setSectionsHydrated(false);
    try {
      const raw = localStorage.getItem(todoSectionsStorageKey(userId));
      let fromStorage: Record<string, boolean> = {};
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          fromStorage = parsed as Record<string, boolean>;
        }
      }
      // Merge with any in-flight user toggles (e.g. + clicked before hydrate
      // finished) so we don't clobber a section the user just opened.
      setSectionOpenMap((prev) => ({ ...fromStorage, ...prev }));
      const archivedRaw = localStorage.getItem(todoShowArchivedKey(userId));
      setShowArchived(archivedRaw === '1');
      const hideDoneRaw = localStorage.getItem(todoHideDoneKey(userId));
      setHideDone(hideDoneRaw === '1');
      const sortRaw = localStorage.getItem(todoSortModeKey(userId));
      // Whitelist parse — any unknown / older value (or a removed mode)
      // falls back to 'manual' so we never end up with a sort mode the
      // sort function doesn't know how to honour.
      setSortMode(ALLOWED_SORT_MODES.includes(sortRaw as SortMode) ? (sortRaw as SortMode) : 'manual');
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

    const target = data.todoItems.find((t) => t.id === focusId);
    if (target) {
      // Deep links (search palette, note backlinks) must reveal the row even
      // when local filters would normally hide it.
      setSearch('');
      if (!matchesStatusFilter(target.status, statusFilter)) {
        setStatusFilter('all');
      }
      if (!isTodoOpen(target.status) && hideDone) {
        setHideDone(false);
      }
      const group = data.todoGroups.find((g) => g.id === target.groupId);
      if (group?.archived && !showArchived) {
        setShowArchived(true);
      }
      setSectionOpenMap((prev) =>
        prev[target.groupId] === false ? { ...prev, [target.groupId]: true } : prev,
      );
    }

    setFocusedTaskId(focusId);
    // Strip the param NOW (replace history) so we don't re-fire on
    // every render. The state above keeps the highlight alive.
    params.delete('focus');
    const next = params.toString();
    navigate({ pathname: location.pathname, search: next ? `?${next}` : '' }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.pathname, navigate]);

  useEffect(() => {
    if (!focusedTaskId) return;
    let cancelled = false;
    const tryScroll = (attempt = 0) => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-todo-id="${focusedTaskId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempt < 6) {
        window.setTimeout(() => tryScroll(attempt + 1), 50 * (attempt + 1));
      }
    };
    const frame = window.requestAnimationFrame(() => tryScroll());
    const clear = window.setTimeout(() => setFocusedTaskId(null), 1800);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clear);
    };
  }, [focusedTaskId]);

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
    legacyBodyPlainText(it).toLowerCase().includes(q);

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
        const draft = draftByGroup[g.id] ?? emptyInlineAddDraft();
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
                onClick={(e) => {
                  e.stopPropagation();
                  prefetchRichTextEditor();
                  setSectionOpenMap((prev) => ({ ...prev, [g.id]: true }));
                  setAddingGroupId((cur) => (cur === g.id ? null : g.id));
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
                    const title = draft.title.trim();
                    if (!title) {
                      setAddingGroupId(null);
                      return;
                    }
                    const bodyPatch = todoBodyPatchFromFields(draft.body);
                    addTodoItem(
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
                    setDraftByGroup((prev) => ({ ...prev, [g.id]: emptyInlineAddDraft() }));
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
                        <input
                          className="todos-row__title-input todos-add-inline__title"
                          value={draft.title}
                          onChange={(e) =>
                            setDraftByGroup((prev) => ({
                              ...prev,
                              [g.id]: { ...draft, title: e.target.value },
                            }))
                          }
                          placeholder="Task title"
                          aria-label="New task title"
                          autoFocus
                        />
                        <Suspense
                          fallback={
                            <div className="todos-row__details-loading muted small">Loading editor…</div>
                          }
                        >
                          <RichTextEditor
                            value={draft.body.body}
                            valueFormat={draft.body.bodyFormat ?? 'auto'}
                            onChange={(payload) =>
                              setDraftByGroup((prev) => ({
                                ...prev,
                                [g.id]: {
                                  ...draft,
                                  body: richTextPayloadToBodyFields(payload),
                                },
                              }))
                            }
                            placeholder="Details (optional)"
                            minHeight={140}
                            attachmentScope={{ documentKind: 'todo', documentId: `new-${g.id}` }}
                            attachmentUserId={user?.id ?? 'anonymous'}
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
                        attachmentUserId={user?.id ?? 'anonymous'}
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
                          attachmentUserId={user?.id ?? 'anonymous'}
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
              task={{
                title: aiTask.title,
                body: legacyBodyPlainText(aiTask) || undefined,
              }}
              onAppendToBody={(markdown) => {
                const targetId = aiTask.id;
                const nextFields = appendPlainTextToBodyFields(aiTask, markdown);
                updateTodoItem(targetId, todoBodyPatchFromFields(nextFields));
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
