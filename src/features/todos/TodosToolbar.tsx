import { IcSearch, IcSliders, IcSparkles, IcX } from '../../components/icons';
import { SORT_OPTIONS, STATUS_FILTER_OPTIONS, type SortMode, type StatusFilter } from './todoPreferences';

type Props = {
  search: string;
  onSearchChange: (q: string) => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  hideDone: boolean;
  onHideDoneChange: (v: boolean) => void;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  aiEnabled: boolean;
  onOpenExtractor: () => void;
};

export function TodosToolbar({
  search,
  onSearchChange,
  sortMode,
  onSortModeChange,
  statusFilter,
  onStatusFilterChange,
  hideDone,
  onHideDoneChange,
  showArchived,
  onShowArchivedChange,
  filtersOpen,
  onFiltersOpenChange,
  aiEnabled,
  onOpenExtractor,
}: Props) {
  const activeCount =
    (sortMode !== 'manual' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (hideDone ? 1 : 0) +
    (showArchived ? 1 : 0);

  const resetFilters = () => {
    onSortModeChange('manual');
    onStatusFilterChange('all');
    onHideDoneChange(false);
    onShowArchivedChange(false);
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
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search tasks"
          />
          {search ? (
            <button
              type="button"
              className="todos-toolbar__search-clear"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => onSearchChange('')}
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
            onClick={() => onFiltersOpenChange(!filtersOpen)}
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
              onClick={onOpenExtractor}
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
              onChange={(e) => onSortModeChange(e.target.value as SortMode)}
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
              onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
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
            <input type="checkbox" checked={hideDone} onChange={(e) => onHideDoneChange(e.target.checked)} />
            <span className="small">Hide closed</span>
          </label>
          <label className="todos-toolbar__check">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => onShowArchivedChange(e.target.checked)}
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
}
