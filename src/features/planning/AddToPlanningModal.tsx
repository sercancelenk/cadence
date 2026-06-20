import { useMemo, useState } from 'react';
import { AppModal } from '../../components/ui/AppModal';
import { IcSearch } from '../../components/icons';
import type { TodoGroup, TodoItem } from '../../model';

export type AddToPlanningModalProps = {
  candidates: TodoItem[];
  groups: TodoGroup[];
  atCapacity: boolean;
  onAdd: (id: string) => void;
  onClose: () => void;
};

export function AddToPlanningModal({
  candidates,
  groups,
  atCapacity,
  onAdd,
  onClose,
}: AddToPlanningModalProps) {
  const [query, setQuery] = useState('');
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((item) => {
      const list = groupById.get(item.groupId)?.name.toLowerCase() ?? '';
      return item.title.toLowerCase().includes(q) || list.includes(q);
    });
  }, [candidates, groupById, query]);

  return (
    <AppModal
      title="Add from to-dos"
      onClose={onClose}
      size="lg"
      layout="flex"
      showCloseButton
      panelClassName="planning-add-dialog"
      bodyClassName="ai-dialog__scroll planning-add-dialog__body"
    >
      {atCapacity ? (
        <p className="planning-add-dialog__notice" role="status">
          Hub is full — remove a task from the matrix before adding more.
        </p>
      ) : null}
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
      {filtered.length === 0 ? (
        <p className="muted small">No open to-dos available to add.</p>
      ) : (
        <ul className="planning-add-dialog__list">
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="planning-add-dialog__row"
                disabled={atCapacity}
                onClick={() => onAdd(item.id)}
              >
                <span className="planning-add-dialog__title">{item.title}</span>
                <span className="planning-add-dialog__list muted small">
                  {groupById.get(item.groupId)?.name ?? 'List'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppModal>
  );
}
