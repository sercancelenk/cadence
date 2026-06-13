import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IcCheck, IcChevronDown, IcPencil } from '../icons';
import { SYNC_BEFORE_APPLY } from '../../lib/syncApplyGuard';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  /** Show edit/preview tabs. Default: true. When false the editor is always in edit mode. */
  tabs?: boolean;
  /** Initial mode when tabs are enabled. */
  initialMode?: 'edit' | 'preview';
  /** Show the markdown formatting toolbar in edit mode. Default: true. */
  toolbar?: boolean;
};

/** Toolbar action descriptor — either wraps the selection in fixed
 *  prefix/suffix tokens, or prepends a per-line marker (lists, tasks, etc.). */
type ToolbarAction =
  | {
      kind: 'wrap';
      /** Inserted before the selection. */
      before: string;
      /** Inserted after the selection. */
      after: string;
      /** Used when nothing is currently selected: placeholder text the user
       *  can immediately overwrite (we'll select it for them). */
      placeholder: string;
    }
  | {
      kind: 'line';
      /** Marker prepended to every line in the selection. */
      marker: string;
      placeholder: string;
    }
  | {
      kind: 'insert';
      /** Raw snippet inserted at the cursor. We'll position the caret at
       *  `caretOffset` if provided, otherwise at the end of the inserted text. */
      text: string;
      caretOffset?: number;
    };

/**
 * MarkdownEditor renders a plain textarea in edit mode and a sanitized
 * react-markdown preview in preview mode. GitHub-flavored extensions
 * (checklists, tables, autolinks, strikethrough) are enabled via remark-gfm.
 *
 * When `toolbar` is true (default) and we're in edit mode, a compact
 * formatting toolbar appears above the textarea. Each button manipulates
 * the textarea selection via `selectionStart` / `selectionEnd` and then
 * restores focus + a sensible new selection so the user can keep typing.
 */
export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  rows = 8,
  tabs = true,
  initialMode = 'edit',
  toolbar = true,
}: Props) {
  const [mode, setMode] = useState<'edit' | 'preview'>(initialMode);
  const [headingOpen, setHeadingOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isEmpty = !value.trim();

  useEffect(() => {
    if (!onBlur) return;
    const flush = () => onBlur();
    window.addEventListener(SYNC_BEFORE_APPLY, flush);
    return () => window.removeEventListener(SYNC_BEFORE_APPLY, flush);
  }, [onBlur]);

  /**
   * Apply a toolbar action to the current selection.
   *
   * The big picture:
   *
   *   - `wrap`: surround the selection with before/after tokens. If nothing
   *     is selected, insert `before + placeholder + after` and select the
   *     placeholder so the user can immediately type to replace it.
   *   - `line`: prepend `marker` to every line that the selection touches.
   *     The trick is to expand the selection to whole-line boundaries before
   *     splicing, otherwise a mid-line cursor would inject markers in the
   *     middle of text.
   *   - `insert`: drop a raw snippet at the cursor (links, code blocks,
   *     dividers). Optional `caretOffset` lets the caret land somewhere
   *     inside the inserted text (e.g. between the `[` and `]` of a link).
   */
  const applyAction = useCallback(
    (action: ToolbarAction) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const before = value.slice(0, start);
      const selected = value.slice(start, end);
      const after = value.slice(end);

      if (action.kind === 'wrap') {
        const hasSel = selected.length > 0;
        const inner = hasSel ? selected : action.placeholder;
        const next = `${before}${action.before}${inner}${action.after}${after}`;
        const selStart = before.length + action.before.length;
        const selEnd = selStart + inner.length;
        onChange(next);
        queueSelection(ta, selStart, selEnd);
        return;
      }

      if (action.kind === 'line') {
        // Expand the selection to whole lines so we never inject a marker
        // mid-token. The line that `start` lies in begins right after the
        // previous newline (or at position 0).
        const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        const afterNl = value.indexOf('\n', end);
        const lineEnd = afterNl === -1 ? value.length : afterNl;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.length === 0 ? [action.placeholder] : block.split('\n');
        const markedLines = lines.map((l) => `${action.marker}${l}`);
        const replaced = markedLines.join('\n');
        const next = `${value.slice(0, lineStart)}${replaced}${value.slice(lineEnd)}`;
        const selStart = lineStart;
        const selEnd = lineStart + replaced.length;
        onChange(next);
        queueSelection(ta, selStart, selEnd);
        return;
      }

      if (action.kind === 'insert') {
        const next = `${before}${action.text}${after}`;
        const caret =
          action.caretOffset != null
            ? before.length + action.caretOffset
            : before.length + action.text.length;
        onChange(next);
        queueSelection(ta, caret, caret);
      }
    },
    [onChange, value],
  );

  const insertLink = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = value.slice(start, end);
    const label = selected || 'link text';
    const snippet = `[${label}](https://)`;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const next = `${before}${snippet}${after}`;
    // Land the caret right after the opening `(` so the user can paste / type the URL.
    const caret = before.length + label.length + 3;
    onChange(next);
    queueSelection(ta, caret, caret + 8);
  }, [onChange, value]);

  const insertCodeBlock = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = value.slice(start, end) || 'code';
    // Make sure the fence sits on its own line — otherwise inline text on
    // the same line as ``` won't render as a code block.
    const before = value.slice(0, start);
    const after = value.slice(end);
    const leading = before.length === 0 || before.endsWith('\n') ? '' : '\n';
    const trailing = after.startsWith('\n') || after.length === 0 ? '' : '\n';
    const snippet = `${leading}\`\`\`\n${selected}\n\`\`\`${trailing}`;
    const next = `${before}${snippet}${after}`;
    const innerStart = before.length + leading.length + 4; // after "```\n"
    const innerEnd = innerStart + selected.length;
    onChange(next);
    queueSelection(ta, innerStart, innerEnd);
  }, [onChange, value]);

  return (
    <div className="md-editor" data-mode={mode}>
      {tabs ? (
        <div className="md-editor__tabs" role="tablist" aria-label="Editor mode">
          <button
            type="button"
            className={`md-editor__tab${mode === 'edit' ? ' md-editor__tab--active' : ''}`}
            role="tab"
            aria-selected={mode === 'edit'}
            title="Write"
            onClick={() => setMode('edit')}
          >
            <IcPencil size={14} />
            <span>Write</span>
          </button>
          <button
            type="button"
            className={`md-editor__tab${mode === 'preview' ? ' md-editor__tab--active' : ''}`}
            role="tab"
            aria-selected={mode === 'preview'}
            title="Preview"
            onClick={() => {
              onBlur?.();
              setMode('preview');
            }}
          >
            <IcCheck size={14} />
            <span>Preview</span>
          </button>
          <span className="md-editor__hint muted small">
            Supports markdown — checklists (`- [ ]`), tables, links
          </span>
        </div>
      ) : null}

      {(mode === 'edit' || !tabs) && toolbar ? (
        <div className="md-toolbar" role="toolbar" aria-label="Markdown formatting">
          <ToolbarButton
            label="Bold"
            shortcut="⌘B"
            onClick={() => applyAction({ kind: 'wrap', before: '**', after: '**', placeholder: 'bold text' })}
          >
            <span className="md-toolbar__lbl md-toolbar__lbl--bold">B</span>
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            shortcut="⌘I"
            onClick={() => applyAction({ kind: 'wrap', before: '*', after: '*', placeholder: 'italic text' })}
          >
            <span className="md-toolbar__lbl md-toolbar__lbl--italic">I</span>
          </ToolbarButton>
          <ToolbarButton
            label="Strikethrough"
            onClick={() => applyAction({ kind: 'wrap', before: '~~', after: '~~', placeholder: 'strikethrough' })}
          >
            <span className="md-toolbar__lbl md-toolbar__lbl--strike">S</span>
          </ToolbarButton>

          <div className="md-toolbar__divider" aria-hidden />

          <div className="md-toolbar__menu">
            <ToolbarButton
              label="Heading"
              onClick={() => setHeadingOpen((v) => !v)}
              expanded={headingOpen}
            >
              <span className="md-toolbar__lbl">H</span>
              <IcChevronDown size={10} />
            </ToolbarButton>
            {headingOpen ? (
              <div className="md-toolbar__menu-pop" onMouseLeave={() => setHeadingOpen(false)}>
                {[1, 2, 3].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    className="md-toolbar__menu-item"
                    onClick={() => {
                      setHeadingOpen(false);
                      applyAction({
                        kind: 'line',
                        marker: `${'#'.repeat(lvl)} `,
                        placeholder: `Heading ${lvl}`,
                      });
                    }}
                  >
                    <span className={`md-toolbar__lbl md-toolbar__lbl--h${lvl}`}>H{lvl}</span>
                    <span className="muted small">{lvl === 1 ? 'Section' : lvl === 2 ? 'Sub-section' : 'Detail'}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="md-toolbar__divider" aria-hidden />

          <ToolbarButton
            label="Bullet list"
            onClick={() => applyAction({ kind: 'line', marker: '- ', placeholder: 'list item' })}
          >
            <span className="md-toolbar__lbl md-toolbar__icon-ul" aria-hidden>•</span>
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            onClick={() => applyAction({ kind: 'line', marker: '1. ', placeholder: 'list item' })}
          >
            <span className="md-toolbar__lbl">1.</span>
          </ToolbarButton>
          <ToolbarButton
            label="Task list"
            onClick={() => applyAction({ kind: 'line', marker: '- [ ] ', placeholder: 'task' })}
          >
            <span className="md-toolbar__lbl">☐</span>
          </ToolbarButton>

          <div className="md-toolbar__divider" aria-hidden />

          <ToolbarButton label="Link" shortcut="⌘K" onClick={insertLink}>
            <span className="md-toolbar__lbl">🔗</span>
          </ToolbarButton>
          <ToolbarButton
            label="Inline code"
            onClick={() => applyAction({ kind: 'wrap', before: '`', after: '`', placeholder: 'code' })}
          >
            <span className="md-toolbar__lbl md-toolbar__icon-code">{'</>'}</span>
          </ToolbarButton>
          <ToolbarButton label="Code block" onClick={insertCodeBlock}>
            <span className="md-toolbar__lbl md-toolbar__icon-codeblock">{'{ }'}</span>
          </ToolbarButton>
          <ToolbarButton
            label="Divider"
            onClick={() => applyAction({ kind: 'insert', text: '\n\n---\n\n' })}
          >
            <span className="md-toolbar__lbl">—</span>
          </ToolbarButton>
        </div>
      ) : null}

      {mode === 'edit' || !tabs ? (
        <textarea
          ref={textareaRef}
          className="textarea md-editor__textarea"
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            // Quick keyboard shortcuts for the most-used actions. We deliberately
            // only intercept the toolbar ones — everything else (Tab, native
            // text-editing chords) keeps the browser default.
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            if (e.key === 'b' || e.key === 'B') {
              e.preventDefault();
              applyAction({ kind: 'wrap', before: '**', after: '**', placeholder: 'bold text' });
            } else if (e.key === 'i' || e.key === 'I') {
              e.preventDefault();
              applyAction({ kind: 'wrap', before: '*', after: '*', placeholder: 'italic text' });
            } else if (e.key === 'k' || e.key === 'K') {
              // ⌘K is also the global command palette; we want it to insert
              // a link only when the textarea is focused. The CommandPalette
              // listener still gets the event through window-level listening
              // — to avoid double handling we call stopPropagation here.
              e.preventDefault();
              e.stopPropagation();
              insertLink();
            }
          }}
          spellCheck
        />
      ) : (
        <MarkdownPreview value={value} empty={isEmpty} placeholder={placeholder} />
      )}
    </div>
  );
}

/**
 * Restore focus + selection on the next animation frame. We can't do it
 * synchronously because React hasn't re-rendered with the new `value` yet,
 * so `setSelectionRange` would be operating on stale text. rAF gives the
 * controlled update one tick to flow through, then we re-target the caret
 * — which is what the user expects after clicking a toolbar button.
 */
function queueSelection(ta: HTMLTextAreaElement, start: number, end: number) {
  requestAnimationFrame(() => {
    ta.focus();
    try {
      ta.setSelectionRange(start, end);
    } catch {
      // Safari throws if the textarea is disconnected; ignore.
    }
  });
}

function ToolbarButton({
  children,
  onClick,
  label,
  shortcut,
  expanded,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  shortcut?: string;
  expanded?: boolean;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className="md-toolbar__btn"
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-expanded={expanded}
    >
      {children}
    </button>
  );
}

function MarkdownPreview({
  value,
  empty,
  placeholder,
}: {
  value: string;
  empty: boolean;
  placeholder?: string;
}): ReactNode {
  if (empty) {
    return <p className="muted small md-editor__empty">{placeholder ?? 'Nothing to preview yet.'}</p>;
  }
  return (
    <div className="md-editor__preview md-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Read-only markdown renderer used wherever we previously dropped a `<pre>` block.
 */
export function MarkdownView({ value }: { value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="md-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
