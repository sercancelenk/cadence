import type { Range } from '@tiptap/core';
import { BubbleMenu, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { IcListTodo } from '../icons';
import { isSafeEditorLinkUrl } from '../../lib/richTextEditorExtensions';
import { taskTitleFromEditorSelection } from '../../lib/richTextSelectionTask';

type Props = {
  editor: Editor;
  /**
   * When set (notes only), show a “Create task” action that uses the
   * current selection text. Other surfaces omit this — no button, no side effects.
   */
  onCreateTaskFromSelection?: (title: string) => void;
};

/** Keep editor focus + selection when interacting with the bubble. */
function keepSelection(event: MouseEvent) {
  event.preventDefault();
}

/** Re-render mark active states on selection-only changes. */
function useBubbleToolbarRefresh(editor: Editor) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);
}

/**
 * Selection bubble — compact marks while editing (always-edit notes).
 * Sticky toolbar remains for block inserts; this is the “selection first” path.
 *
 * Link editing uses an inline field (not `window.prompt`) — Electron does not
 * implement `window.prompt`, and a modal would steal focus / collapse the selection.
 */
export function RichTextBubbleToolbar({ editor, onCreateTaskFromSelection }: Props) {
  useBubbleToolbarRefresh(editor);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkOpenRef = useRef(linkOpen);
  linkOpenRef.current = linkOpen;
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  /** Selection at Link-open time — restored on Apply so input focus cannot drop the range. */
  const linkRangeRef = useRef<Range | null>(null);
  const taskTitle = onCreateTaskFromSelection ? taskTitleFromEditorSelection(editor) : null;

  const createTaskFromSelection = useCallback(() => {
    if (!editor.isEditable || !onCreateTaskFromSelection) return;
    const title = taskTitleFromEditorSelection(editor);
    if (!title) return;
    onCreateTaskFromSelection(title);
  }, [editor, onCreateTaskFromSelection]);

  const openLinkEditor = useCallback(() => {
    if (!editor.isEditable) return;
    const { from, to } = editor.state.selection;
    linkRangeRef.current = { from, to };
    const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
    setLinkUrl(prev || 'https://');
    setLinkError(null);
    setLinkOpen(true);
    queueMicrotask(() => linkInputRef.current?.focus());
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor.isEditable) return;
    const range = linkRangeRef.current;
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range);
    const raw = linkUrl.trim();
    if (!raw) {
      chain.extendMarkRange('link').unsetLink().run();
      setLinkError(null);
      setLinkOpen(false);
      linkRangeRef.current = null;
      return;
    }
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
    const href = hasScheme ? raw : `https://${raw}`;
    if (!isSafeEditorLinkUrl(href)) {
      setLinkError('Only http(s) and mailto links are allowed.');
      return;
    }
    chain.extendMarkRange('link').setLink({ href }).run();
    setLinkError(null);
    setLinkOpen(false);
    linkRangeRef.current = null;
  }, [editor, linkUrl]);

  const closeLinkEditor = useCallback(() => {
    setLinkOpen(false);
    setLinkError(null);
    linkRangeRef.current = null;
    editor.chain().focus().run();
  }, [editor]);

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 120,
        placement: 'top',
        zIndex: 40,
        // Transparent tippy chrome — the menu paints its own surface
        // (avoids the default dark shell + white pill double frame).
        theme: 'cadence-bubble',
        arrow: false,
        offset: [0, 8],
        // Body + fixed: nested CSS `zoom` on `.main` skews Popper offsets.
        // `.rich-bubble-menu` applies `--ui-scale` for App & menus size.
        appendTo: () => document.body,
        popperOptions: { strategy: 'fixed' },
      }}
      shouldShow={({ editor: ed, state }) => {
        if (!ed.isEditable) return false;
        const { empty } = state.selection;
        if (empty) {
          // Keep the bubble mounted while the inline link field is open so
          // focusing the input does not dismiss the menu mid-edit.
          return linkOpenRef.current;
        }
        if (ed.isActive('codeBlock')) return false;
        return true;
      }}
      className="rich-bubble-menu"
    >
      {linkOpen ? (
        <div className="rich-bubble-menu__link">
          <input
            ref={linkInputRef}
            className="rich-bubble-menu__link-input"
            type="url"
            value={linkUrl}
            placeholder="https://"
            aria-label="Link URL"
            aria-invalid={linkError ? true : undefined}
            // Allow the input to take focus (do not preventDefault on mousedown).
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              if (linkError) setLinkError(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                closeLinkEditor();
              }
            }}
          />
          <button
            type="button"
            className="rich-bubble-menu__btn"
            onMouseDown={keepSelection}
            onClick={applyLink}
          >
            Apply
          </button>
          <button
            type="button"
            className="rich-bubble-menu__btn"
            onMouseDown={keepSelection}
            onClick={closeLinkEditor}
          >
            Cancel
          </button>
          {linkError ? <span className="rich-bubble-menu__link-error">{linkError}</span> : null}
        </div>
      ) : (
        <>
          <button
            type="button"
            className={`rich-bubble-menu__btn${editor.isActive('bold') ? ' is-active' : ''}`}
            title="Bold"
            onMouseDown={keepSelection}
            onClick={() => {
              if (!editor.isEditable) return;
              editor.chain().focus().toggleBold().run();
            }}
          >
            B
          </button>
          <button
            type="button"
            className={`rich-bubble-menu__btn${editor.isActive('italic') ? ' is-active' : ''}`}
            title="Italic"
            onMouseDown={keepSelection}
            onClick={() => {
              if (!editor.isEditable) return;
              editor.chain().focus().toggleItalic().run();
            }}
          >
            I
          </button>
          <button
            type="button"
            className={`rich-bubble-menu__btn${editor.isActive('underline') ? ' is-active' : ''}`}
            title="Underline"
            onMouseDown={keepSelection}
            onClick={() => {
              if (!editor.isEditable) return;
              editor.chain().focus().toggleUnderline().run();
            }}
          >
            U
          </button>
          <button
            type="button"
            className={`rich-bubble-menu__btn${editor.isActive('strike') ? ' is-active' : ''}`}
            title="Strikethrough"
            onMouseDown={keepSelection}
            onClick={() => {
              if (!editor.isEditable) return;
              editor.chain().focus().toggleStrike().run();
            }}
          >
            S
          </button>
          <button
            type="button"
            className={`rich-bubble-menu__btn${editor.isActive('highlight') ? ' is-active' : ''}`}
            title="Highlight"
            onMouseDown={keepSelection}
            onClick={() => {
              if (!editor.isEditable) return;
              editor.chain().focus().toggleHighlight().run();
            }}
          >
            H
          </button>
          <button
            type="button"
            className={`rich-bubble-menu__btn${editor.isActive('code') ? ' is-active' : ''}`}
            title="Inline code"
            onMouseDown={keepSelection}
            onClick={() => {
              if (!editor.isEditable) return;
              editor.chain().focus().toggleCode().run();
            }}
          >
            {'</>'}
          </button>
          <button
            type="button"
            className={`rich-bubble-menu__btn${editor.isActive('link') ? ' is-active' : ''}`}
            title="Link"
            onMouseDown={keepSelection}
            onClick={openLinkEditor}
          >
            Link
          </button>
          {onCreateTaskFromSelection && taskTitle ? (
            <>
              <span className="rich-bubble-menu__sep" aria-hidden="true" />
              <button
                type="button"
                className="rich-bubble-menu__btn rich-bubble-menu__btn--task"
                title="Create task from selection"
                aria-label="Create task from selection"
                onMouseDown={keepSelection}
                onClick={createTaskFromSelection}
              >
                <IcListTodo size={14} strokeWidth={2} />
                <span>Task</span>
              </button>
            </>
          ) : null}
        </>
      )}
    </BubbleMenu>
  );
}
