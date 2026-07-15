import { useMemo, useState } from 'react';
import { EntityLinkPills } from '../../components/ui/EntityLinkPills';
import { EntityLinkPicker } from '../../components/ui/EntityLinkPicker';
import { NoteBacklinks } from './NoteBacklinks';
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
  bodyEditing: boolean;
  onBodyEditingChange: (editing: boolean) => void;
  editorAutoFocus?: boolean;
  onEditorAutoFocusHandled?: () => void;
  onChangeBody: (payload: RichTextPayload) => void;
  attachmentUserId: string;
  todoItems: TodoItem[];
  todoGroups: TodoGroup[];
  noteTodoLinks?: NoteTodoLink[];
  onOpenTask: (taskId: string) => void;
  onLinkTodo?: (todoId: string) => void;
  onUnlinkTodo?: (todoId: string) => void;
};

export function NotesBodyEditor({
  noteId,
  editorBody,
  editorBodyFormat,
  editorReady,
  bodyEditing,
  onBodyEditingChange,
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
}: NotesBodyEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

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
        editing={bodyEditing}
        onEditingChange={onBodyEditingChange}
        autoFocusEditor={editorAutoFocus}
        onEditorAutoFocusHandled={onEditorAutoFocusHandled}
        onChange={onChangeBody}
        editable={editorReady}
        placeholder="Write your note…"
        minHeight={360}
        attachmentScope={{ documentKind: 'note', documentId: noteId }}
        attachmentUserId={attachmentUserId}
        previewHint="Use Edit to change this note · Click images to enlarge · Click links to open · ⌘/Ctrl+click to copy"
      />

      <NoteBacklinks
        noteId={noteId}
        todoItems={todoItems}
        todoGroups={todoGroups}
        noteTodoLinks={noteTodoLinks}
        onOpenTask={onOpenTask}
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
}
