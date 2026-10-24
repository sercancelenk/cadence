import { useEffect, useState } from 'react';
import { RichTextEditor } from './RichTextEditor';
import type { RichTextPayload } from '../../lib/richText';
import type { RichTextBodyFormat } from '../../lib/richText';
import type { RichTextDoc } from '../../lib/richText';
import type { RichTextAttachmentScope } from '../../lib/richTextAttachmentUri';

export type RichTextDocumentPaneProps = {
  editorKey?: string;
  value: RichTextDoc | string;
  valueFormat?: RichTextBodyFormat | 'auto';
  onChange?: (payload: RichTextPayload) => void;
  /** When false, read-only (version history). Default true — always-edit, no mode tabs. */
  editable?: boolean;
  placeholder?: string;
  minHeight?: number;
  attachmentScope?: RichTextAttachmentScope;
  attachmentUserId?: string;
  /** Shown in the chrome row (gesture tips or read-only label). */
  chromeHint?: string;
  className?: string;
  /** Focus the editor surface once when mounted editable (e.g. new note). */
  autoFocusEditor?: boolean;
  onEditorAutoFocusHandled?: () => void;
  /** Opt-in bubble “Create task” — notes only; other panes leave undefined. */
  onCreateTaskFromSelection?: (title: string) => void;
};

const EDITABLE_CHROME_HINT =
  'Type / for blocks · Select text for format bubble · Double-click images · ⌘/Ctrl+click links';

/**
 * Shared note/document chrome: always-edit when unlocked, with sticky toolbar
 * and save indicator. Read-only surfaces (version history) pass editable={false}.
 * There is no Preview/Edit mode toggle — TipTap is already WYSIWYG.
 */
export function RichTextDocumentPane({
  editorKey = 'default',
  value,
  valueFormat = 'auto',
  onChange,
  editable = true,
  placeholder = 'Write here…',
  minHeight = 360,
  attachmentScope,
  attachmentUserId,
  chromeHint,
  className = '',
  autoFocusEditor = false,
  onEditorAutoFocusHandled,
  onCreateTaskFromSelection,
}: RichTextDocumentPaneProps) {
  const [toolbarMountEl, setToolbarMountEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!editable) setToolbarMountEl(null);
  }, [editable]);

  const hint = chromeHint ?? (editable ? EDITABLE_CHROME_HINT : undefined);

  return (
    <div className={`rich-doc-pane${className ? ` ${className}` : ''}`}>
      <div className="rich-doc-pane__chrome">
        <div className="rich-doc-pane__status" aria-label={editable ? 'Editor' : 'Read-only'}>
          {editable ? (
            <span className="rich-doc-pane__kbd-hint muted small">
              / blocks · ⌘B bold · ⌘I italic · ⌘Z undo
            </span>
          ) : null}
          {hint ? <span className="rich-doc-pane__hint muted small">{hint}</span> : null}
        </div>
        {editable ? (
          <div ref={setToolbarMountEl} className="rich-doc-pane__toolbar-host" />
        ) : null}
      </div>
      <div
        className={`rich-doc-pane__surface${editable ? '' : ' rich-doc-pane__surface--preview'}`}
      >
        <RichTextEditor
          key={editorKey}
          value={value}
          valueFormat={valueFormat}
          onChange={onChange}
          placeholder={placeholder}
          minHeight={editable ? minHeight : Math.min(minHeight, 120)}
          editable={editable}
          toolbar={editable}
          toolbarMountEl={editable ? toolbarMountEl : null}
          attachmentScope={attachmentScope}
          attachmentUserId={attachmentUserId}
          autoFocus={autoFocusEditor}
          onAutoFocusHandled={onEditorAutoFocusHandled}
          onCreateTaskFromSelection={onCreateTaskFromSelection}
        />
      </div>
    </div>
  );
}
