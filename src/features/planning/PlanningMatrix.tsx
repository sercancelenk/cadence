import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IcGrip } from '../../components/icons';
import type { TodoGroup, TodoItem, TodoStatus } from '../../model';
import { TODO_STATUS_OPTIONS } from '../../model';
import type { PlanningQuadrant } from '../../lib/planningMatrix';
import { PATH_TODOS } from '../../lib/routes';

export type PlanningTaskCardProps = {
  item: TodoItem;
  groupName: string;
  focused: boolean;
  onToggleFocus: () => void;
  onRemoveFromHub: () => void;
  onToggleComplete: () => void;
  onStatusChange: (status: TodoStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging?: boolean;
};

function PlanningStatusChip({
  status,
  onChange,
}: {
  status: TodoStatus;
  onChange: (status: TodoStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = TODO_STATUS_OPTIONS.find((o) => o.value === status);

  return (
    <div className="planning-card__status-wrap">
      <button
        type="button"
        className={`planning-card__status planning-card__status--${status}`}
        data-tone={meta?.tone ?? 'info'}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Status: ${meta?.label ?? status}`}
        onClick={() => setOpen((v) => !v)}
      >
        {meta?.shortLabel ?? status}
      </button>
      {open ? (
        <div className="planning-card__status-menu" role="menu">
          {TODO_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitem"
              className={`planning-card__status-item${status === opt.value ? ' is-active' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PlanningTaskCard({
  item,
  groupName,
  focused,
  onToggleFocus,
  onRemoveFromHub,
  onToggleComplete,
  onStatusChange,
  onDragStart,
  onDragEnd,
  dragging = false,
}: PlanningTaskCardProps) {
  const terminal = item.status === 'done' || item.status === 'cancelled';
  const checked = item.status === 'done';

  return (
    <article
      className={`planning-card${dragging ? ' planning-card--dragging' : ''}${focused ? ' planning-card--focus' : ''}${
        terminal ? ' planning-card--terminal' : ''
      }${item.status === 'in_progress' ? ' planning-card--wip' : ''}`}
    >
      <div className="planning-card__head">
        <span
          className="planning-card__handle"
          draggable
          aria-hidden
          title="Drag to move quadrant"
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', item.id);
            e.dataTransfer.effectAllowed = 'move';
            const card = e.currentTarget.closest('.planning-card');
            if (card instanceof HTMLElement) {
              e.dataTransfer.setDragImage(card, 24, 16);
            }
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <IcGrip size={14} />
        </span>
        <button
          type="button"
          className={`planning-card__check${checked ? ' planning-card__check--on' : ''}`}
          aria-label={checked ? `Reopen "${item.title}"` : `Mark "${item.title}" done`}
          title={checked ? `Reopen "${item.title}"` : `Mark "${item.title}" done`}
          aria-checked={checked}
          role="checkbox"
          onClick={onToggleComplete}
        >
          <span className="planning-card__check-box" aria-hidden />
        </button>
        <Link
          to={`${PATH_TODOS}?focus=${encodeURIComponent(item.id)}`}
          className="planning-card__title-link"
          title={`Open "${item.title}" in to-dos`}
        >
          {item.title}
        </Link>
        <button
          type="button"
          className={`planning-card__star${focused ? ' planning-card__star--on' : ''}`}
          aria-label={focused ? 'Remove from today focus' : 'Add to today focus'}
          title={focused ? 'Remove from today focus' : 'Add to today focus'}
          aria-pressed={focused}
          onClick={onToggleFocus}
        >
          ★
        </button>
      </div>
      <div className="planning-card__meta muted small">
        <span className="planning-card__list-name">{groupName}</span>
        <div className="planning-card__meta-actions">
          <PlanningStatusChip status={item.status} onChange={onStatusChange} />
          <button type="button" className="planning-card__remove" onClick={onRemoveFromHub}>
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}

export type PlanningQuadrantCellProps = {
  quadrant: PlanningQuadrant;
  title: string;
  hint: string;
  items: TodoItem[];
  groupById: Map<string, TodoGroup>;
  focusIds: Set<string>;
  draggingId: string | null;
  onDrop: (quadrant: PlanningQuadrant, itemId: string) => void;
  onToggleFocus: (id: string) => void;
  onRemoveFromHub: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onStatusChange: (id: string, status: TodoStatus) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
};

export function PlanningQuadrantCell({
  quadrant,
  title,
  hint,
  items,
  groupById,
  focusIds,
  draggingId,
  onDrop,
  onToggleFocus,
  onRemoveFromHub,
  onToggleComplete,
  onStatusChange,
  onDragStart,
  onDragEnd,
}: PlanningQuadrantCellProps) {
  const [dropActive, setDropActive] = useState(false);

  return (
    <section
      className={`planning-quadrant planning-quadrant--${quadrant}${
        dropActive ? ' planning-quadrant--drop-target' : ''
      }`}
      aria-label={`${title} quadrant`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('text/plain')) return;
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropActive(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropActive(true);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        const itemId = e.dataTransfer.getData('text/plain');
        if (itemId) onDrop(quadrant, itemId);
      }}
    >
      <header className="planning-quadrant__head">
        <h3 className="planning-quadrant__title">{title}</h3>
        <p className="planning-quadrant__hint small">{hint}</p>
        <span className="planning-quadrant__count">{items.length}</span>
      </header>
      <ul className="planning-quadrant__list">
        {items.length === 0 ? (
          <li className="planning-quadrant__empty muted small">Drop tasks here</li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <PlanningTaskCard
                item={item}
                groupName={groupById.get(item.groupId)?.name ?? 'List'}
                focused={focusIds.has(item.id)}
                dragging={draggingId === item.id}
                onToggleFocus={() => onToggleFocus(item.id)}
                onRemoveFromHub={() => onRemoveFromHub(item.id)}
                onToggleComplete={() => onToggleComplete(item.id)}
                onStatusChange={(status) => onStatusChange(item.id, status)}
                onDragStart={() => onDragStart(item.id)}
                onDragEnd={onDragEnd}
              />
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
