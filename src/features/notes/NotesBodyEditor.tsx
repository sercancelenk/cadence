import { memo, useCallback, useMemo, useState } from 'react';
import { EntityLinkPills } from '../../components/ui/EntityLinkPills';
import { EntityLinkPicker } from '../../components/ui/EntityLinkPicker';
import { RichTextDocumentPane } from '../../components/ui/RichTextDocumentPane';
import type { RichTextPayload } from '../../lib/richText';
import type { RichTextBodyFormat } from '../../lib/richText';
import type { RichTextDoc } from '../../lib/richText';
import {
  linksForNote,
  todoIdsLinkedToNote,
  truncateEntityLinkLabel,
} from '../../lib/noteTodoLinks';
import type { NoteTodoLink, TodoGroup, TodoItem } from '../../model';
import { isTodoItemArchived } from '../../model';

export type NotesBodyEditorProps = {
  noteId: string;
  editorBody: RichTextDoc | string;
  editorBodyFormat: RichTextBodyFormat | 'auto';
  editorReady: boolean;
  editorAutoFocus?: boolean;
  onEditorAutoFocusHandled?: () => void;
  onChangeBody: (payload: RichTextPayload, noteId: string) => void;
  attachmentUserId: string;
  todoItems: TodoItem[];
  todoGroups: TodoGroup[];
  noteTodoLinks?: NoteTodoLink[];
  onOpenTask: (taskId: string) => void;
  onLinkTodo?: (todoId: string) => void;
  onUnlinkTodo?: (todoId: string) => void;
  /** Selection bubble → create Cadence todo (does not mutate note body). */
  onCreateTaskFromSelection?: (title: string) => void;
};

/**
 * `memo` keeps this pane out of the notes page's unrelated re-renders — version
 * history, dialogs, bulk selection — which would otherwise re-render the editor
 * tree and re-derive the linked-todo lists on every one of them.
 *
 * It does not skip renders caused by typing: `editorBody` is read from the
 * workspace copy of the note, so each autosave flush changes it. Removing that
 * cost means keeping the body out of this pane's props while its own editor is
 * the source of truth, not tuning the memo.
 */
export const NotesBodyEditor = memo(function NotesBodyEditor({
  noteId,
  editorBody,
  editorBodyFormat,
  editorReady,
  editorAutoFocus = false,
  onEditorAutoFocusHandled,
  onChangeBody,
  attachmentUserId,
  todoItems,
  todoGroups,
  noteTodoLinks,
  onOpenTask,
  onLinkTodo,
  onUnlinkTodo,
  onCreateTaskFromSelection,
}: NotesBodyEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  /**
   * Binds the note this editor is showing to its own flushes. The editor is
   * keyed by note id, so the instance being torn down on a note switch never
   * sees a later render — it keeps this closure, and its unmount flush lands
   * on the note the text was actually typed into.
   */
  const onChangeBodyForNote = useCallback(
    (payload: RichTextPayload) => onChangeBody(payload, noteId),
    [onChangeBody, noteId],
  );

  const linkedTodoIds = useMemo(
    () => new Set(todoIdsLinkedToNote(noteTodoLinks, noteId)),
    [noteTodoLinks, noteId],
  );

  const pillItems = useMemo(() => {
    return linksForNote(noteTodoLinks, noteId).map((link) => {
      const todo = todoItems.find((t) => t.id === link.todoId);
      return {
        id: link.todoId,
        label: truncateEntityLinkLabel(todo?.title ?? 'Deleted todo'),
        orphan: !todo,
      };
    });
  }, [noteTodoLinks, noteId, todoItems]);

  const pickerOptions = useMemo(() => {
    return todoItems
      .filter((t) => !isTodoItemArchived(t) && !linkedTodoIds.has(t.id))
      .map((t) => ({
        id: t.id,
        label: t.title.trim() || 'Untitled task',
        hint: todoGroups.find((g) => g.id === t.groupId)?.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [todoItems, todoGroups, linkedTodoIds]);

  return (
    <div className="notes-page__editor">
      <div className="notes-entity-links">
        <EntityLinkPills
          items={pillItems}
          ariaLabel="Linked todos"
          onOpen={onOpenTask}
          onAdd={onLinkTodo ? () => setPickerOpen(true) : undefined}
          onRemove={onUnlinkTodo}
          addLabel="Link todo"
          hideWhenEmpty={!onLinkTodo}
        />
      </div>

      <RichTextDocumentPane
        editorKey={noteId}
        value={editorBody}
        valueFormat={editorBodyFormat}
        onChange={onChangeBodyForNote}
        editable={editorReady}
        autoFocusEditor={editorAutoFocus}
        onEditorAutoFocusHandled={onEditorAutoFocusHandled}
        placeholder="Write your note…"
        minHeight={360}
        attachmentScope={{ documentKind: 'note', documentId: noteId }}
        attachmentUserId={attachmentUserId}
        onCreateTaskFromSelection={onCreateTaskFromSelection}
      />

      {onLinkTodo ? (
        <EntityLinkPicker
          open={pickerOpen}
          title="Link a todo"
          description="Choose a task to link with this note."
          options={pickerOptions}
          onClose={() => setPickerOpen(false)}
          onPick={(todoId) => onLinkTodo(todoId)}
          searchPlaceholder="Search todos…"
          emptyLabel="No more todos to link"
        />
      ) : null}
    </div>
  );
});
