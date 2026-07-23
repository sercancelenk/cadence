import { Link } from 'react-router-dom';
import { AppModal } from '../../components/ui/AppModal';
import { RichTextEditor } from '../../components/ui/RichTextEditor';
import { plainTextFromBodyFields } from '../../lib/richTextBody';
import { PATH_TODOS } from '../../lib/routes';
import { TODO_STATUS_OPTIONS, type TodoGroup, type TodoItem } from '../../model';
import { PlanningTaskMeta } from './PlanningTaskMeta';

export type PlanningTodoPreviewDialogProps = {
  item: TodoItem;
  groupName: string;
  onClose: () => void;
};

/**
 * Lightweight read-only peek at a planning-hub task so users can inspect
 * notes without leaving the matrix (and without a round-trip to /todos).
 */
export function PlanningTodoPreviewDialog({
  item,
  groupName,
  onClose,
}: PlanningTodoPreviewDialogProps) {
  const statusMeta = TODO_STATUS_OPTIONS.find((o) => o.value === item.status);
  const hasRichBody = Boolean(item.body?.trim());
  const plainFallback = plainTextFromBodyFields({
    body: item.body,
    bodyFormat: item.bodyFormat,
    bodyPlainText: item.bodyPlainText,
  });

  return (
    <AppModal
      onClose={onClose}
      title={item.title.trim() || 'Untitled task'}
      description={
        <span className="planning-todo-preview__desc">
          <span className="planning-todo-preview__list">{groupName}</span>
          {statusMeta ? (
            <span
              className={`planning-todo-preview__status planning-todo-preview__status--${item.status}`}
            >
              {statusMeta.label}
            </span>
          ) : null}
          <PlanningTaskMeta item={item} />
        </span>
      }
      size="lg"
      layout="flex"
      bodyClassName="planning-todo-preview__body"
      footer={
        <div className="planning-todo-preview__footer">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
          <Link
            to={`${PATH_TODOS}?focus=${encodeURIComponent(item.id)}`}
            className="btn btn--primary"
            onClick={onClose}
          >
            Open in To-dos
          </Link>
        </div>
      }
    >
      {hasRichBody ? (
        <div className="planning-todo-preview__editor">
          <RichTextEditor
            value={item.body}
            valueFormat={item.bodyFormat ?? 'auto'}
            editable={false}
            toolbar={false}
            minHeight={160}
            onChange={() => {
              /* read-only preview */
            }}
          />
        </div>
      ) : (
        <p className="planning-todo-preview__empty muted">
          {plainFallback.trim()
            ? plainFallback
            : 'No notes on this task yet. Open in To-dos to add details.'}
        </p>
      )}
    </AppModal>
  );
}

/** Resolve list name for a todo (shared by matrix + focus strip). */
export function planningGroupNameForItem(
  item: TodoItem,
  groups: TodoGroup[],
): string {
  return groups.find((g) => g.id === item.groupId)?.name ?? 'List';
}
