import { lazy, Suspense } from 'react';
import { IcCheck, IcPencil } from '../../components/icons';
import type { RichTextPayload } from '../../lib/richText';
import type { RichTextBodyFormat } from '../../lib/richText';
import type { RichTextDoc } from '../../lib/richText';
import { NoteBacklinks } from './NoteBacklinks';
import type { TodoGroup, TodoItem } from '../../model';

const RichTextEditor = lazy(() =>
  import('../../components/ui/RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
);

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
      <div className="notes-page__body-mode" role="tablist" aria-label="Note body mode">
        <button
          type="button"
          className={`notes-page__body-mode-tab${!bodyEditing ? ' notes-page__body-mode-tab--active' : ''}`}
          role="tab"
          aria-selected={!bodyEditing}
          onClick={() => onBodyEditingChange(false)}
        >
          <IcCheck size={14} />
          <span>Preview</span>
        </button>
        <button
          type="button"
          className={`notes-page__body-mode-tab${bodyEditing ? ' notes-page__body-mode-tab--active' : ''}`}
          role="tab"
          aria-selected={bodyEditing}
          onClick={() => onBodyEditingChange(true)}
        >
          <IcPencil size={14} />
          <span>Edit</span>
        </button>
        {!bodyEditing ? (
          <span className="notes-page__body-mode-hint muted small">Double-click the note to edit</span>
        ) : null}
      </div>
      <div
        className={`notes-page__body-surface${bodyEditing ? '' : ' notes-page__body-surface--preview'}`}
        onDoubleClick={() => {
          if (!bodyEditing) onBodyEditingChange(true);
        }}
        title={bodyEditing ? undefined : 'Double-click to edit'}
      >
        <Suspense
          fallback={<div className="notes-page__editor-loading muted small">Loading editor…</div>}
        >
          <RichTextEditor
            key={noteId}
            value={editorBody}
            valueFormat={editorBodyFormat}
            onChange={bodyEditing ? onChangeBody : undefined}
            placeholder="Write your note…"
            minHeight={bodyEditing ? 360 : 120}
            editable={editorReady && bodyEditing}
            toolbar={bodyEditing}
            autoFocus={bodyEditing}
            attachmentScope={{ documentKind: 'note', documentId: noteId }}
            attachmentUserId={attachmentUserId}
          />
        </Suspense>
      </div>

      <NoteBacklinks
        noteId={noteId}
        todoItems={todoItems}
        todoGroups={todoGroups}
        onOpenTask={onOpenTask}
      />
    </div>
  );
}
