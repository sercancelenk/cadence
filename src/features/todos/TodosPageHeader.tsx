import { FormEvent } from 'react';
import { IcGrip, IcLayoutGrid, IcListTodo, IcPlus } from '../../components/icons';

type Props = {
  newListOpen: boolean;
  onToggleNewList: () => void;
  compact: boolean;
  onToggleCompact: () => void;
  newGroupName: string;
  onNewGroupNameChange: (name: string) => void;
  onCreateList: (name: string) => void;
  onCancelNewList: () => void;
};

export function TodosPageHeader({
  newListOpen,
  onToggleNewList,
  compact,
  onToggleCompact,
  newGroupName,
  onNewGroupNameChange,
  onCreateList,
  onCancelNewList,
}: Props) {
  return (
    <>
      <header className="page-head todos-route__head">
        <div className="todos-route__head-main">
          <h1>Today</h1>
          <p className="muted">
            Your personal tasks, organised by lists. Drag the
            <span className="todos-route__head-grip" aria-hidden>
              {' '}
              <IcGrip size={14} />{' '}
            </span>
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
            onClick={onToggleNewList}
          >
            <IcPlus size={16} strokeWidth={2.5} />
            <span>Add list</span>
          </button>
          <button
            type="button"
            className="todos-route__display-btn"
            title={compact ? 'Switch to comfortable spacing' : 'Switch to compact spacing'}
            aria-pressed={compact}
            onClick={onToggleCompact}
          >
            {compact ? <IcLayoutGrid size={16} /> : <IcListTodo size={16} />}
            <span>{compact ? 'Comfortable' : 'Compact'}</span>
          </button>
        </div>
      </header>

      {newListOpen ? (
        <section className="card todos-new-list-card">
          <form
            className="todos-new-list"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              const name = newGroupName.trim();
              if (!name) return;
              onCreateList(name);
            }}
          >
            <input
              className="todos-new-list__input"
              placeholder="New list name"
              value={newGroupName}
              autoFocus
              onChange={(e) => onNewGroupNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancelNewList();
              }}
              aria-label="New list name"
            />
            <button type="submit" className="todos-new-list__ok" disabled={!newGroupName.trim()}>
              Create
            </button>
            <button type="button" className="todos-new-list__cancel" onClick={onCancelNewList}>
              Cancel
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
