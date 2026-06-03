import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { foldAll, unfoldAll } from '@codemirror/language';
import {
  IcArrowUp,
  IcBraces,
  IcChevronDown,
  IcCopy,
  IcQuotes,
  IcRowsCompact,
  IcSearch,
} from '../icons';
import { StructuredTextLanguageToggle } from './StructuredTextLanguageToggle';
import { StructuredTextToolbarButton } from './StructuredTextToolbarButton';
import {
  buildStructuredTextExtensions,
  createStructuredTextCompartments,
  structuredTextLanguageExtensions,
} from '../../lib/structuredTextEditorExtensions';
import { syncStructuredTextDocFromProp, replaceStructuredTextDoc } from '../../lib/structuredTextEditorSync';
import { observeStructuredTextHostResize, openStructuredTextSearch } from '../../lib/structuredTextEditorLayout';
import {
  compactStructuredText,
  formatStructuredText,
  stringifyStructuredTextDocument,
  validateStructuredText,
  type StructuredTextLanguage,
  type StructuredTextValidation,
  type StructuredTextFormatResult,
} from '../../lib/structuredText';
import { useDebouncedEmit } from '../../hooks/useDebouncedEmit';
import { useEphemeralNotice } from '../../hooks/useEphemeralNotice';

const DEFAULT_DEBOUNCE_MS = 150;

export type StructuredTextEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  language: StructuredTextLanguage;
  onLanguageChange?: (language: StructuredTextLanguage) => void;
  readOnly?: boolean;
  minHeight?: number;
  onChangeDebounceMs?: number;
  onValidationChange?: (result: StructuredTextValidation) => void;
  className?: string;
};

/**
 * Reusable JSON / YAML code editor (CodeMirror 6).
 * Lazy-load this module from route pages to keep the main bundle lean.
 */
export function StructuredTextEditor({
  value,
  onChange,
  language,
  onLanguageChange,
  readOnly = false,
  minHeight = 360,
  onChangeDebounceMs = DEFAULT_DEBOUNCE_MS,
  onValidationChange,
  className = '',
}: StructuredTextEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<ReturnType<typeof createStructuredTextCompartments> | null>(
    null,
  );
  const syncedLanguageRef = useRef(language);
  const onValidationChangeRef = useRef(onValidationChange);
  onValidationChangeRef.current = onValidationChange;
  const languageRef = useRef(language);
  languageRef.current = language;

  const { lastEmitted, flush: flushEmit, schedule: scheduleEmit } = useDebouncedEmit(
    onChangeDebounceMs,
    onChange,
  );
  const { notice, showNotice, clearNotice } = useEphemeralNotice();

  const [validation, setValidation] = useState<StructuredTextValidation>(() =>
    validateStructuredText(value, language),
  );

  const pushValidation = useCallback((text: string, lang: StructuredTextLanguage) => {
    const next = validateStructuredText(text, lang);
    setValidation(next);
    onValidationChangeRef.current?.(next);
    return next;
  }, []);

  const flushChange = useCallback(
    (text: string) => {
      pushValidation(text, languageRef.current);
      flushEmit(text);
    },
    [flushEmit, pushValidation],
  );

  const scheduleChange = useCallback(
    (text: string) => {
      pushValidation(text, languageRef.current);
      scheduleEmit(text);
    },
    [pushValidation, scheduleEmit],
  );

  const baseExtensions = useMemo(
    () => (compartments: ReturnType<typeof createStructuredTextCompartments>) =>
      buildStructuredTextExtensions(compartments, language, readOnly, [], scheduleChange),
    [language, readOnly, scheduleChange],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const compartments = createStructuredTextCompartments();
    compartmentsRef.current = compartments;
    lastEmitted.current = value;
    pushValidation(value, language);
    syncedLanguageRef.current = language;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: baseExtensions(compartments),
      }),
      parent: host,
    });
    viewRef.current = view;
    const stopResizeObserver = observeStructuredTextHostResize(host, view);

    return () => {
      stopResizeObserver();
      view.destroy();
      viewRef.current = null;
      compartmentsRef.current = null;
    };
    // Mount once — language/readOnly sync in dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (syncStructuredTextDocFromProp(view, value, lastEmitted)) {
      pushValidation(value, language);
    }
  }, [value, pushValidation, lastEmitted]);

  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments || syncedLanguageRef.current === language) return;
    syncedLanguageRef.current = language;
    view.dispatch({
      effects: compartments.language.reconfigure(structuredTextLanguageExtensions(language)),
    });
    pushValidation(view.state.doc.toString(), language);
  }, [language, pushValidation]);

  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments) return;
    view.dispatch({
      effects: compartments.readOnly.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  const applyTransform = useCallback(
    (transform: (text: string, language: StructuredTextLanguage) => StructuredTextFormatResult) => {
      const view = viewRef.current;
      if (!view || readOnly) return;
      const current = view.state.doc.toString();
      const result = transform(current, languageRef.current);
      if (!result.ok) {
        showNotice(result.error);
        return;
      }
      clearNotice();
      replaceStructuredTextDoc(view, result.text);
      flushChange(result.text);
    },
    [clearNotice, flushChange, readOnly, showNotice],
  );

  const copyAll = async () => {
    const text = viewRef.current?.state.doc.toString() ?? value;
    try {
      await navigator.clipboard.writeText(text);
      showNotice('Copied to clipboard');
    } catch {
      showNotice('Could not copy');
    }
  };

  const statusLabel = validation.valid
    ? 'Valid'
    : validation.line != null
      ? `Error (line ${validation.line + 1})`
      : 'Invalid';

  return (
    <div className={`structured-text-editor${className ? ` ${className}` : ''}`}>
      <div className="structured-text-editor__toolbar" role="toolbar" aria-label="Structured text tools">
        <StructuredTextLanguageToggle language={language} onLanguageChange={onLanguageChange} />
        <span className="structured-text-editor__toolbar-divider" aria-hidden />
        <div className="structured-text-editor__toolbar-actions">
          <StructuredTextToolbarButton
            label="Search"
            tooltip="Find in document (⌘F · ⌘G next)"
            icon={<IcSearch size={15} />}
            onClick={() => openStructuredTextSearch(viewRef.current)}
          />
          <StructuredTextToolbarButton
            label="Format"
            tooltip={
              language === 'json'
                ? 'Pretty-print JSON (unwraps stringified)'
                : 'Format document'
            }
            icon={<IcBraces size={15} />}
            onClick={() => applyTransform(formatStructuredText)}
            disabled={readOnly}
          />
          {language === 'json' ? (
            <>
              <StructuredTextToolbarButton
                label="Compact"
                tooltip="Compact to one line (minify)"
                icon={<IcRowsCompact size={15} />}
                onClick={() => applyTransform(compactStructuredText)}
                disabled={readOnly}
              />
              <StructuredTextToolbarButton
                label="Stringify"
                tooltip='Escape as JSON string (e.g. "{\"a\":1}")'
                icon={<IcQuotes size={15} />}
                onClick={() => applyTransform(stringifyStructuredTextDocument)}
                disabled={readOnly}
              />
            </>
          ) : null}
          <StructuredTextToolbarButton
            label="Collapse all"
            tooltip="Collapse all nested blocks"
            icon={<IcChevronDown size={15} />}
            onClick={() => {
              const view = viewRef.current;
              if (view) foldAll(view);
            }}
          />
          <StructuredTextToolbarButton
            label="Expand all"
            tooltip="Expand all nested blocks"
            icon={<IcArrowUp size={15} />}
            onClick={() => {
              const view = viewRef.current;
              if (view) unfoldAll(view);
            }}
          />
          <StructuredTextToolbarButton
            label="Copy"
            tooltip="Copy to clipboard"
            icon={<IcCopy size={15} />}
            onClick={() => void copyAll()}
          />
        </div>
        <span
          className="structured-text-editor__kbd-hint muted small"
          title="⌘F search · ⌘G next · ⌘Z undo · ⌘⇧Z redo · ⌘⇧[ collapse · ⌘⇧] expand · { } auto-close"
        >
          ⌘F · ⌘Z
        </span>
        <span
          className={`structured-text-editor__status${validation.valid ? ' structured-text-editor__status--ok' : ' structured-text-editor__status--err'}`}
          role="status"
          title={validation.message}
        >
          {statusLabel}
        </span>
      </div>
      {notice ? (
        <div className="structured-text-editor__notice" role="status">
          {notice}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="structured-text-editor__host"
        style={{ ['--structured-text-min-height' as string]: `${minHeight}px` }}
      />
    </div>
  );
}
