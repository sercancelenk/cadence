import { useEffect, useRef, useState } from 'react';
import { IcGrip } from '../../components/icons';
import type { TodoGroup, TodoItem, TodoStatus } from '../../model';
import { TODO_STATUS_OPTIONS } from '../../model';
import {
  isPlanningTodoOverdue,
  PLANNING_QUADRANT_META,
  PLANNING_UNSORTED_META,
  type PlanningQuadrant,
} from '../../lib/planningMatrix';
import { PlanningTaskMeta } from './PlanningTaskMeta';

/** All move destinations, in display order, including back to Unsorted. */
const PLANNING_MOVE_TARGETS: { id: PlanningQuadrant; title: string }[] = [
  ...PLANNING_QUADRANT_META.map((m) => ({ id: m.id, title: m.title })),
  { id: PLANNING_UNSORTED_META.id, title: PLANNING_UNSORTED_META.title },
];

export type PlanningTaskCardProps = {
  item: TodoItem;
  groupName: string;
  focused: boolean;
  /** Quadrant the card currently sits in — disabled in the move menu. */
  currentQuadrant: PlanningQuadrant;
  onToggleFocus: () => void;
  onRemoveFromHub: () => void;
  onToggleComplete: () => void;
  onStatusChange: (status: TodoStatus) => void;
  /** Tap-to-classify alternative to drag-and-drop (essential on touch). */
  onMove: (quadrant: PlanningQuadrant) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  /** Open an in-place preview (stay on Planning). */
  onPreview: () => void;
  dragging?: boolean;
};

/**
 * Tap-driven quadrant picker. Drag-and-drop is the desktop affordance,
 * but HTML5 DnD is unreliable on touch, so phones/tablets need an
 * explicit menu to move a card between Eisenhower quadrants.
 */
function PlanningMoveMenu({
  currentQuadrant,
  onMove,
}: {
  currentQuadrant: PlanningQuadrant;
  onMove: (quadrant: PlanningQuadrant) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Dismiss on outside tap / Escape — essential for a touch surface,
  // where there's no hover and re-tapping the trigger is awkward.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="planning-card__move-wrap" ref={wrapRef}>
      <button
        type="button"
        className="planning-card__move"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Move to a quadrant"
        onClick={() => setOpen((v) => !v)}
      >
        Move
      </button>
      {open ? (
        <div className="planning-card__move-menu" role="menu">
          {PLANNING_MOVE_TARGETS.map((target) => (
            <button
              key={target.id}
              type="button"
              role="menuitem"
              className={`planning-card__move-item${
                target.id === currentQuadrant ? ' is-active' : ''
              }`}
              disabled={target.id === currentQuadrant}
              onClick={() => {
                onMove(target.id);
                setOpen(false);
              }}
            >
              {target.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

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
  currentQuadrant,
  onToggleFocus,
  onRemoveFromHub,
  onToggleComplete,
  onStatusChange,
  onMove,
  onDragStart,
  onDragEnd,
  onPreview,
  dragging = false,
}: PlanningTaskCardProps) {
  const terminal = item.status === 'done' || item.status === 'cancelled';
  const checked = item.status === 'done';
  const overdue = isPlanningTodoOverdue(item);
  const cardRef = useRef<HTMLElement | null>(null);

  return (
    <article
      ref={cardRef}
      className={`planning-card${dragging ? ' planning-card--dragging' : ''}${focused ? ' planning-card--focus' : ''}${
        terminal ? ' planning-card--terminal' : ''
      }${item.status === 'in_progress' ? ' planning-card--wip' : ''}${
        overdue ? ' planning-card--overdue' : ''
      }`}
      // The whole card is the drag surface — the tiny grip alone was easy to
      // miss, and grabbing the title (an <a>) used to start a native link drag
      // that the quadrant drop handler couldn't classify. Mirrors NotesListRow.
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
        const card = cardRef.current;
        if (card) {
          try {
            e.dataTransfer.setDragImage(card, 24, 16);
          } catch {
            /* setDragImage is best-effort */
          }
        }
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="planning-card__head">
        <span className="planning-card__handle" aria-hidden title="Drag to move quadrant">
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
        <button
          type="button"
          className="planning-card__title-link"
          title={`Preview "${item.title}"`}
          // Buttons are not natively draggable for link-drags; keep the card DnD.
          draggable={false}
          onClick={onPreview}
        >
          {item.title}
        </button>
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
        <span className="planning-card__meta-left">
          <span className="planning-card__list-name">{groupName}</span>
          <PlanningTaskMeta item={item} />
        </span>
        <div className="planning-card__meta-actions">
          <PlanningMoveMenu currentQuadrant={currentQuadrant} onMove={onMove} />
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
  onPreview: (id: string) => void;
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
  onPreview,
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
                currentQuadrant={quadrant}
                dragging={draggingId === item.id}
                onToggleFocus={() => onToggleFocus(item.id)}
                onRemoveFromHub={() => onRemoveFromHub(item.id)}
                onToggleComplete={() => onToggleComplete(item.id)}
                onStatusChange={(status) => onStatusChange(item.id, status)}
                onMove={(target) => onDrop(target, item.id)}
                onDragStart={() => onDragStart(item.id)}
                onDragEnd={onDragEnd}
                onPreview={() => onPreview(item.id)}
              />
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
