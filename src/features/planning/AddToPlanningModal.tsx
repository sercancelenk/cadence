import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppModal, AppModalActions } from '../../components/ui/AppModal';
import { IcSearch } from '../../components/icons';
import {
  filterCandidatesDueSoon,
  planningHubSlotsRemaining,
  sortPlanningCandidates,
} from '../../lib/planningMatrix';
import { formatDateShort } from '../../lib/datetime';
import { PATH_TODOS } from '../../lib/routes';
import type { TodoGroup, TodoItem } from '../../model';
import { PlanningTaskMeta } from './PlanningTaskMeta';

export type AddToPlanningModalProps = {
  candidates: TodoItem[];
  groups: TodoGroup[];
  hubCount: number;
  atCapacity: boolean;
  onAddMany: (ids: string[]) => void;
  onClose: () => void;
};

export function AddToPlanningModal({
  candidates,
  groups,
  hubCount,
  atCapacity,
  onAddMany,
  onClose,
}: AddToPlanningModalProps) {
  const [query, setQuery] = useState('');
  const [dueSoonOnly, setDueSoonOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const slotsLeft = planningHubSlotsRemaining(hubCount);

  const filtered = useMemo(() => {
    const base = dueSoonOnly ? filterCandidatesDueSoon(candidates, 7) : candidates;
    const q = query.trim().toLowerCase();
    const searched = !q
      ? base
      : base.filter((item) => {
          const list = groupById.get(item.groupId)?.name.toLowerCase() ?? '';
          return item.title.toLowerCase().includes(q) || list.includes(q);
        });
    return sortPlanningCandidates(searched);
  }, [candidates, dueSoonOnly, groupById, query]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((item) => selected.has(item.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const item of filtered) next.delete(item.id);
      } else {
        for (const item of filtered) next.add(item.id);
      }
      return next;
    });
  };

  const selectedIds = useMemo(
    () => filtered.map((item) => item.id).filter((id) => selected.has(id)),
    [filtered, selected],
  );
  const addCount = Math.min(selectedIds.length, slotsLeft);

  return (
    <AppModal
      title="Add from to-dos"
      onClose={onClose}
      size="lg"
      layout="flex"
      showCloseButton
      panelClassName="planning-add-dialog"
      bodyClassName="planning-add-dialog__body"
      footer={
        <AppModalActions
          onCancel={onClose}
          onConfirm={() => {
            if (addCount === 0) return;
            onAddMany(selectedIds.slice(0, slotsLeft));
          }}
          cancelLabel="Cancel"
          confirmLabel={
            addCount === 0
              ? 'Add selected'
              : `Add ${addCount} task${addCount === 1 ? '' : 's'}`
          }
          confirmDisabled={atCapacity || addCount === 0}
        />
      }
    >
      {atCapacity ? (
        <p className="planning-add-dialog__notice" role="status">
          Hub is full — remove a task from the matrix before adding more.
        </p>
      ) : (
        <p className="planning-add-dialog__notice muted small" role="status">
          {slotsLeft} slot{slotsLeft === 1 ? '' : 's'} left in the hub
          {selectedIds.length > slotsLeft
            ? ` · only the first ${slotsLeft} of ${selectedIds.length} selected will be added`
            : null}
        </p>
      )}
      <label className="planning-add-dialog__search">
        <IcSearch size={16} aria-hidden />
        <input
          type="search"
          placeholder="Search tasks or lists…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>
      <div className="planning-add-dialog__filters">
        <button
          type="button"
          className={`planning-add-dialog__chip${!dueSoonOnly ? ' is-active' : ''}`}
          aria-pressed={!dueSoonOnly}
          onClick={() => setDueSoonOnly(false)}
        >
          All open
        </button>
        <button
          type="button"
          className={`planning-add-dialog__chip${dueSoonOnly ? ' is-active' : ''}`}
          aria-pressed={dueSoonOnly}
          onClick={() => setDueSoonOnly(true)}
          title="Overdue or due within the next 7 days"
        >
          Due soon
        </button>
        <button
          type="button"
          className="planning-add-dialog__chip planning-add-dialog__chip--ghost"
          onClick={toggleAllVisible}
          disabled={filtered.length === 0 || atCapacity}
        >
          {allVisibleSelected ? 'Clear visible' : 'Select visible'}
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="planning-add-dialog__empty muted">
          {dueSoonOnly ? (
            'No open to-dos due soon (or overdue).'
          ) : candidates.length === 0 ? (
            <>
              All open to-dos are already in Planning.{' '}
              <Link to={PATH_TODOS} className="planning-add-dialog__empty-link" onClick={onClose}>
                Create or reopen a task in To-dos
              </Link>{' '}
              to add more here.
            </>
          ) : (
            'No matching to-dos for this search.'
          )}
        </p>
      ) : (
        <ul className="planning-add-dialog__list">
          {filtered.map((item) => {
            const checked = selected.has(item.id);
            const listName = groupById.get(item.groupId)?.name ?? 'List';
            return (
              <li key={item.id}>
                <label
                  className={`planning-add-dialog__row${checked ? ' is-selected' : ''}${
                    atCapacity ? ' is-disabled' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={atCapacity}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="planning-add-dialog__row-main">
                    <span className="planning-add-dialog__title">{item.title}</span>
                    <span className="planning-add-dialog__list muted small">
                      {listName}
                      {item.dueAt ? ` · ${formatDateShort(item.dueAt)}` : ''}
                    </span>
                    <PlanningTaskMeta item={item} />
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </AppModal>
  );
}
