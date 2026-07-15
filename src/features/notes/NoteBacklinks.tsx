import { useMemo } from 'react';
import { IcCheck, IcListTodo } from '../../components/icons';
import { isTodoOpen } from '../../model';
import type { NoteTodoLink, TodoGroup, TodoItem } from '../../model';
import { todoIdsLinkedToNote } from '../../lib/noteTodoLinks';

export type NoteBacklinksProps = {
  noteId: string;
  todoItems: TodoItem[];
  todoGroups: TodoGroup[];
  /** Canonical N:N links; dual-read with legacy sourceNoteId below. */
  noteTodoLinks?: NoteTodoLink[];
  onOpenTask: (taskId: string) => void;
};

/**
 * Compact "Tasks from this note" panel rendered beneath the note editor.
 * Prefers `noteTodoLinks`, unions legacy `sourceNoteId` for dual-read.
 */
export function NoteBacklinks({
  noteId,
  todoItems,
  todoGroups,
  noteTodoLinks,
  onOpenTask,
}: NoteBacklinksProps) {
  const linked = useMemo(() => {
    const fromJoin = new Set(todoIdsLinkedToNote(noteTodoLinks, noteId));
    return todoItems
      .filter((t) => fromJoin.has(t.id) || t.sourceNoteId === noteId)
      .sort((a, b) => {
        const ao = isTodoOpen(a.status) ? 0 : 1;
        const bo = isTodoOpen(b.status) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
      });
  }, [todoItems, noteId, noteTodoLinks]);
  if (linked.length === 0) return null;

  const groupName = (gid: string) => todoGroups.find((g) => g.id === gid)?.name ?? 'Unknown list';

  return (
    <section className="note-backlinks" aria-label="Tasks from this note">
      <header className="note-backlinks__head">
        <IcListTodo size={14} />
        <h3 className="note-backlinks__title">
          {linked.length === 1
            ? '1 task from this note'
            : `${linked.length} tasks from this note`}
        </h3>
      </header>
      <ul className="note-backlinks__list">
        {linked.map((t) => {
          const open = isTodoOpen(t.status);
          const cancelled = t.status === 'cancelled';
          return (
            <li key={t.id}>
              <button
                type="button"
                className={`note-backlinks__row${open ? '' : ' note-backlinks__row--closed'}${
                  cancelled ? ' note-backlinks__row--cancelled' : ''
                }`}
                onClick={() => onOpenTask(t.id)}
                title={`${t.title} — ${groupName(t.groupId)}`}
              >
                <span
                  className={`note-backlinks__status note-backlinks__status--${t.status}`}
                  aria-label={`Status: ${t.status}`}
                >
                  {t.status === 'done' ? <IcCheck size={11} strokeWidth={2.5} /> : null}
                </span>
                <span className="note-backlinks__title-text">{t.title}</span>
                <span className="note-backlinks__group muted small">{groupName(t.groupId)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
