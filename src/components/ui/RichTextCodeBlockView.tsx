import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  isMermaidLanguage,
  RICH_TEXT_CODE_LANGUAGES,
} from '../../lib/richTextLowlight';
import { renderMermaidSvg } from '../../lib/richTextMermaid';
import { IcChevronDown, IcChevronRight } from '../icons';

type MermaidMode = 'preview' | 'source';

function countSourceLines(source: string): number {
  if (!source) return 0;
  // Trailing newline does not add an extra visual line.
  return source.replace(/\n$/, '').split('\n').length;
}

/**
 * Notion-style code block chrome: collapse, language picker, Mermaid preview.
 * Storage stays a `codeBlock` node (`language` + optional `collapsed` + text).
 */
export function RichTextCodeBlockView({
  node,
  updateAttributes,
  editor,
  selected,
  getPos,
}: NodeViewProps) {
  const language = typeof node.attrs.language === 'string' ? node.attrs.language : 'plaintext';
  const isMermaid = isMermaidLanguage(language);
  const editable = editor.isEditable;
  const attrCollapsed = Boolean(node.attrs.collapsed);
  // Preview mode cannot persist attrs — keep a local mirror for expand/collapse.
  const [previewCollapsed, setPreviewCollapsed] = useState(attrCollapsed);
  // Prefer Source while editing so users can type Mermaid DSL before previewing.
  const [mode, setMode] = useState<MermaidMode>(editable ? 'source' : 'preview');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const source = node.textContent;
  const renderGen = useRef(0);
  const selectId = useId();
  const bodyId = useId();

  useEffect(() => {
    setPreviewCollapsed(attrCollapsed);
  }, [attrCollapsed]);

  useEffect(() => {
    if (!isMermaid) setMode('source');
  }, [isMermaid]);

  // Preview → Edit: return Mermaid to Source so the DSL is editable immediately.
  useEffect(() => {
    if (editable && isMermaid) setMode('source');
  }, [editable, isMermaid]);

  const collapsed = editable ? attrCollapsed : previewCollapsed;

  const setCollapsed = (next: boolean) => {
    if (editable) {
      updateAttributes({ collapsed: next });
      return;
    }
    setPreviewCollapsed(next);
  };

  // Read-only: always preview Mermaid. Editable: honor Preview/Source toggle.
  const showMermaidPreview = !collapsed && isMermaid && (!editable || mode === 'preview');
  const showSource = !collapsed && (!isMermaid || (editable && mode === 'source'));

  // When source is hidden, keep the caret out so keystrokes cannot silently edit.
  useEffect(() => {
    if (showSource || !editable) return;
    const ejectIfInside = () => {
      const pos = typeof getPos === 'function' ? getPos() : null;
      if (typeof pos !== 'number') return;
      const { from, to } = editor.state.selection;
      const end = pos + node.nodeSize;
      // Any intersection with the hidden node (not only fully-contained ranges).
      if (to <= pos || from >= end) return;
      const after = Math.min(end, editor.state.doc.content.size);
      editor.commands.setTextSelection(after);
    };
    ejectIfInside();
    editor.on('selectionUpdate', ejectIfInside);
    return () => {
      editor.off('selectionUpdate', ejectIfInside);
    };
  }, [showSource, editable, editor, getPos, node.nodeSize]);

  useEffect(() => {
    if (!showMermaidPreview) {
      setSvg(null);
      setError(null);
      setRendering(false);
      return;
    }
    const gen = ++renderGen.current;
    setRendering(true);
    const timer = window.setTimeout(() => {
      void renderMermaidSvg(source).then((result) => {
        if (gen !== renderGen.current) return;
        setRendering(false);
        if (result.ok) {
          setSvg(result.svg);
          setError(null);
        } else {
          setSvg(null);
          setError(result.error);
        }
      });
    }, 280);
    return () => {
      window.clearTimeout(timer);
    };
  }, [showMermaidPreview, source]);

  const knownLanguage = RICH_TEXT_CODE_LANGUAGES.some((l) => l.value === language)
    ? language
    : language || 'plaintext';

  const lineCount = countSourceLines(source);
  const lineSummary =
    lineCount === 0 ? 'Empty' : lineCount === 1 ? '1 line' : `${lineCount} lines`;

  return (
    <NodeViewWrapper
      className={[
        'rich-editor-codeblock',
        isMermaid ? 'rich-editor-codeblock--mermaid' : '',
        collapsed ? 'rich-editor-codeblock--collapsed' : '',
        selected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-language={language}
      data-collapsed={collapsed ? 'true' : undefined}
    >
      <div className="rich-editor-codeblock__chrome" contentEditable={false}>
        <div className="rich-editor-codeblock__chrome-start">
          <button
            type="button"
            className="rich-editor-codeblock__fold"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={collapsed ? 'Expand code block' : 'Collapse code block'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <IcChevronRight size={14} /> : <IcChevronDown size={14} />}
          </button>
          <label className="rich-editor-codeblock__lang" htmlFor={selectId}>
            <span className="sr-only">Language</span>
            <select
              id={selectId}
              className="rich-editor-codeblock__lang-select"
              value={knownLanguage}
              disabled={!editable}
              onChange={(e) => {
                const next = e.target.value;
                updateAttributes({ language: next === 'plaintext' ? null : next });
                if (isMermaidLanguage(next)) setMode('source');
              }}
              aria-label="Code language"
            >
              {RICH_TEXT_CODE_LANGUAGES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              {!RICH_TEXT_CODE_LANGUAGES.some((l) => l.value === language) && language ? (
                <option value={language}>{language}</option>
              ) : null}
            </select>
          </label>
          {collapsed ? (
            <span className="rich-editor-codeblock__summary" title={source.slice(0, 200)}>
              {lineSummary}
            </span>
          ) : null}
        </div>
        {isMermaid && editable && !collapsed ? (
          <div className="rich-editor-codeblock__modes" role="group" aria-label="Mermaid view">
            <button
              type="button"
              className={`rich-editor-codeblock__mode${mode === 'preview' ? ' is-active' : ''}`}
              onClick={() => setMode('preview')}
            >
              Preview
            </button>
            <button
              type="button"
              className={`rich-editor-codeblock__mode${mode === 'source' ? ' is-active' : ''}`}
              onClick={() => setMode('source')}
            >
              Source
            </button>
          </div>
        ) : null}
        {isMermaid && !editable && !collapsed ? (
          <span className="rich-editor-codeblock__badge">Mermaid</span>
        ) : null}
      </div>

      <div id={bodyId} className="rich-editor-codeblock__body">
        {showMermaidPreview ? (
          <div className="rich-editor-codeblock__mermaid" contentEditable={false}>
            {rendering && !svg ? (
              <p className="rich-editor-codeblock__mermaid-status muted small">Rendering diagram…</p>
            ) : null}
            {error ? (
              <p className="rich-editor-codeblock__mermaid-error" role="alert">
                {error}
              </p>
            ) : null}
            {svg ? (
              <div
                className="rich-editor-codeblock__mermaid-svg"
                // Mermaid SVG is generated locally from user diagram source with
                // securityLevel: 'strict' — not arbitrary HTML from the network.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : null}
            {!rendering && !error && !svg && !source.trim() ? (
              <p className="rich-editor-codeblock__mermaid-status muted small">
                Add Mermaid syntax in Source, then switch to Preview.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Keep NodeViewContent mounted so ProseMirror owns the text; hide when
            collapsed or Mermaid-previewing — never unmount (zero data loss). */}
        <pre
          className="rich-editor-codeblock__pre"
          style={showSource ? undefined : { display: 'none' }}
          spellCheck={false}
        >
          <NodeViewContent as="code" className={`language-${language || 'plaintext'}`} />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
