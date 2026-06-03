import { useEffect, useRef, useState } from 'react';
import { IcCheck, IcPencil } from '../icons';
import { RichTextEditor } from './RichTextEditor';
import type { RichTextPayload } from '../../lib/richText';
import type { RichTextBodyFormat } from '../../lib/richText';
import type { RichTextDoc } from '../../lib/richText';
import type { RichTextAttachmentScope } from '../../lib/richTextAttachmentUri';

export type RichTextDocumentPaneProps = {
  editorKey?: string;
  value: RichTextDoc | string;
  valueFormat?: RichTextBodyFormat | 'auto';
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onChange?: (payload: RichTextPayload) => void;
  editable?: boolean;
  placeholder?: string;
  minHeight?: number;
  attachmentScope?: RichTextAttachmentScope;
  attachmentUserId?: string;
  /** Shown beside mode tabs in preview mode. */
  previewHint?: string;
  className?: string;
};

export function RichTextDocumentPane({
  editorKey = 'default',
  value,
  valueFormat = 'auto',
  editing,
  onEditingChange,
  onChange,
  editable = true,
  placeholder = 'Write here…',
  minHeight = 360,
  attachmentScope,
  attachmentUserId,
  previewHint = 'Double-click to edit',
  className = '',
}: RichTextDocumentPaneProps) {
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saved'>('idle');
  const [toolbarMountEl, setToolbarMountEl] = useState<HTMLElement | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!editing) setToolbarMountEl(null);
  }, [editing]);

  const handleSaveStateChange = (state: 'idle' | 'pending' | 'saved') => {
    setSaveState(state);
    if (state === 'saved') {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 2000);
    }
  };

  const saveLabel =
    saveState === 'pending' ? 'Saving…' : saveState === 'saved' ? 'Saved' : null;

  const enterEdit = () => {
    if (editable) onEditingChange(true);
  };

  return (
    <div className={`rich-doc-pane${className ? ` ${className}` : ''}`}>
      <div className="rich-doc-pane__chrome">
        <div className="rich-doc-pane__mode" role="tablist" aria-label="Document mode">
          <button
            type="button"
            className={`rich-doc-pane__mode-tab${!editing ? ' rich-doc-pane__mode-tab--active' : ''}`}
            role="tab"
            aria-selected={!editing}
            onClick={() => onEditingChange(false)}
          >
            <IcCheck size={14} />
            <span>Preview</span>
          </button>
          <button
            type="button"
            className={`rich-doc-pane__mode-tab${editing ? ' rich-doc-pane__mode-tab--active' : ''}`}
            role="tab"
            aria-selected={editing}
            onClick={() => onEditingChange(true)}
          >
            <IcPencil size={14} />
            <span>Edit</span>
          </button>
          {!editing && previewHint ? (
            <span className="rich-doc-pane__hint muted small">{previewHint}</span>
          ) : null}
          {editing ? (
            <span className="rich-doc-pane__kbd-hint muted small">
              ⌘B bold · ⌘I italic · ⌘Z undo · Esc preview
            </span>
          ) : null}
          {editing && saveLabel ? (
            <span
              className={`rich-doc-pane__save${saveState === 'pending' ? ' rich-doc-pane__save--pending' : ''}`}
              role="status"
              aria-live="polite"
            >
              {saveLabel}
            </span>
          ) : null}
        </div>
        {editing ? (
          <div ref={setToolbarMountEl} className="rich-doc-pane__toolbar-host" />
        ) : null}
      </div>
      <div
        className={`rich-doc-pane__surface${editing ? '' : ' rich-doc-pane__surface--preview'}`}
        onClick={() => {
          if (!editing && editable) enterEdit();
        }}
        onDoubleClick={() => {
          if (!editing && editable) enterEdit();
        }}
        title={editing ? undefined : previewHint}
      >
        <RichTextEditor
          key={editorKey}
          value={value}
          valueFormat={valueFormat}
          onChange={editing ? onChange : undefined}
          placeholder={placeholder}
          minHeight={editing ? minHeight : Math.min(minHeight, 120)}
          editable={editable && editing}
          toolbar={editing}
          toolbarMountEl={editing ? toolbarMountEl : null}
          onRequestPreview={editing ? () => onEditingChange(false) : undefined}
          onSaveStateChange={editing ? handleSaveStateChange : undefined}
          attachmentScope={attachmentScope}
          attachmentUserId={attachmentUserId}
        />
      </div>
    </div>
  );
}
