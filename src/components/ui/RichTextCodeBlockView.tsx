import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  isMermaidLanguage,
  RICH_TEXT_CODE_LANGUAGES,
} from '../../lib/richTextLowlight';
import { renderMermaidSvg } from '../../lib/richTextMermaid';

type MermaidMode = 'preview' | 'source';

/**
 * Notion-style code block chrome: language picker + Mermaid preview/source toggle.
 * Storage stays a standard `codeBlock` node (`language` + text) — no schema bump.
 */
export function RichTextCodeBlockView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const language = typeof node.attrs.language === 'string' ? node.attrs.language : 'plaintext';
  const isMermaid = isMermaidLanguage(language);
  const editable = editor.isEditable;
  // Prefer Source while editing so users can type Mermaid DSL before previewing.
  const [mode, setMode] = useState<MermaidMode>(editable ? 'source' : 'preview');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const source = node.textContent;
  const renderGen = useRef(0);
  const selectId = useId();

  useEffect(() => {
    if (!isMermaid) setMode('source');
  }, [isMermaid]);

  // Read-only: always preview Mermaid. Editable: honor Preview/Source toggle.
  const showMermaidPreview = isMermaid && (!editable || mode === 'preview');
  const showSource = !isMermaid || (editable && mode === 'source');

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

  return (
    <NodeViewWrapper
      className={[
        'rich-editor-codeblock',
        isMermaid ? 'rich-editor-codeblock--mermaid' : '',
        selected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-language={language}
    >
      <div className="rich-editor-codeblock__chrome" contentEditable={false}>
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
        {isMermaid && editable ? (
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
        {isMermaid && !editable ? (
          <span className="rich-editor-codeblock__badge">Mermaid</span>
        ) : null}
      </div>

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

      {/* Keep NodeViewContent mounted so ProseMirror owns the text; hide when previewing. */}
      <pre
        className="rich-editor-codeblock__pre"
        style={showSource ? undefined : { display: 'none' }}
        spellCheck={false}
      >
        <NodeViewContent as="code" className={`language-${language || 'plaintext'}`} />
      </pre>
    </NodeViewWrapper>
  );
}
