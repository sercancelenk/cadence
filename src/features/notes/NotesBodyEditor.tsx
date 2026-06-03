import { NoteBacklinks } from './NoteBacklinks';
import { RichTextDocumentPane } from '../../components/ui/RichTextDocumentPane';
import type { RichTextPayload } from '../../lib/richText';
import type { RichTextBodyFormat } from '../../lib/richText';
import type { RichTextDoc } from '../../lib/richText';
import type { TodoGroup, TodoItem } from '../../model';

export type NotesBodyEditorProps = {
  noteId: string;
  editorBody: RichTextDoc | string;
  editorBodyFormat: RichTextBodyFormat | 'auto';
  editorReady: boolean;
  bodyEditing: boolean;
  onBodyEditingChange: (editing: boolean) => void;
  onChangeBody: (payload: RichTextPayload) => void;
  attachmentUserId: string;
  todoItems: TodoItem[];
  todoGroups: TodoGroup[];
  onOpenTask: (taskId: string) => void;
};

export function NotesBodyEditor({
  noteId,
  editorBody,
  editorBodyFormat,
  editorReady,
  bodyEditing,
  onBodyEditingChange,
  onChangeBody,
  attachmentUserId,
  todoItems,
  todoGroups,
  onOpenTask,
}: NotesBodyEditorProps) {
  return (
    <div className="notes-page__editor">
      <RichTextDocumentPane
        editorKey={noteId}
        value={editorBody}
        valueFormat={editorBodyFormat}
        editing={bodyEditing}
        onEditingChange={onBodyEditingChange}
        onChange={onChangeBody}
        editable={editorReady}
        placeholder="Write your note…"
        minHeight={360}
        attachmentScope={{ documentKind: 'note', documentId: noteId }}
        attachmentUserId={attachmentUserId}
        previewHint="Double-click the note to edit"
      />

      <NoteBacklinks
        noteId={noteId}
        todoItems={todoItems}
        todoGroups={todoGroups}
        onOpenTask={onOpenTask}
      />
    </div>
  );
}
