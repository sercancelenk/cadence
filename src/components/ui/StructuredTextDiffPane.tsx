import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { MergeView } from '@codemirror/merge';
import { foldAll, unfoldAll } from '@codemirror/language';
import {
  IcArrowUp,
  IcBraces,
  IcChevronDown,
} from '../icons';
import { StructuredTextLanguageToggle } from './StructuredTextLanguageToggle';
import { StructuredTextToolbarButton } from './StructuredTextToolbarButton';
import {
  buildStructuredTextExtensions,
  createStructuredTextCompartments,
  structuredTextLanguageExtensions,
} from '../../lib/structuredTextEditorExtensions';
import { syncStructuredTextDocFromProp, replaceStructuredTextDoc } from '../../lib/structuredTextEditorSync';
import {
  formatStructuredText,
  validateStructuredText,
  type StructuredTextLanguage,
  type StructuredTextValidation,
} from '../../lib/structuredText';
import { useDebouncedEmit } from '../../hooks/useDebouncedEmit';
import { useEphemeralNotice } from '../../hooks/useEphemeralNotice';

const DEFAULT_DEBOUNCE_MS = 150;

export type StructuredTextDiffPaneProps = {
  valueA: string;
  valueB: string;
  onChangeA?: (value: string) => void;
  onChangeB?: (value: string) => void;
  language: StructuredTextLanguage;
  onLanguageChange?: (language: StructuredTextLanguage) => void;
  labelA?: string;
  labelB?: string;
  minHeight?: number;
  onChangeDebounceMs?: number;
  className?: string;
};

/**
 * Side-by-side JSON / YAML diff (CodeMirror MergeView).
 * Lazy-load alongside StructuredTextEditor.
 */
export function StructuredTextDiffPane({
  valueA,
  valueB,
  onChangeA,
  onChangeB,
  language,
  onLanguageChange,
  labelA = 'Before',
  labelB = 'After',
  minHeight = 480,
  onChangeDebounceMs = DEFAULT_DEBOUNCE_MS,
  className = '',
}: StructuredTextDiffPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mergeRef = useRef<MergeView | null>(null);
  const compartmentsRef = useRef({
    a: createStructuredTextCompartments(),
    b: createStructuredTextCompartments(),
  });
  const languageRef = useRef(language);
  languageRef.current = language;

  const onChangeARef = useRef(onChangeA);
  onChangeARef.current = onChangeA;
  const onChangeBRef = useRef(onChangeB);
  onChangeBRef.current = onChangeB;
  const refreshMetaRef = useRef<() => void>(() => {});

  const [validationA, setValidationA] = useState<StructuredTextValidation>(() =>
    validateStructuredText(valueA, language),
  );
  const [validationB, setValidationB] = useState<StructuredTextValidation>(() =>
    validateStructuredText(valueB, language),
  );

  const refreshMeta = useCallback(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    const textA = merge.a.state.doc.toString();
    const textB = merge.b.state.doc.toString();
    setValidationA(validateStructuredText(textA, languageRef.current));
    setValidationB(validateStructuredText(textB, languageRef.current));
  }, []);
  refreshMetaRef.current = refreshMeta;

  const emitA = useDebouncedEmit(onChangeDebounceMs, (text) => {
    onChangeARef.current?.(text);
    refreshMetaRef.current();
  });
  const emitB = useDebouncedEmit(onChangeDebounceMs, (text) => {
    onChangeBRef.current?.(text);
    refreshMetaRef.current();
  });
  const { notice, showNotice, clearNotice } = useEphemeralNotice();

  const scheduleA = useCallback(
    (text: string) => {
      setValidationA(validateStructuredText(text, languageRef.current));
      emitA.schedule(text);
    },
    [emitA],
  );

  const scheduleB = useCallback(
    (text: string) => {
      setValidationB(validateStructuredText(text, languageRef.current));
      emitB.schedule(text);
    },
    [emitB],
  );

  useEffect(() => {
    if (!hostRef.current) return;
    emitA.lastEmitted.current = valueA;
    emitB.lastEmitted.current = valueB;

    const metaListenerA = EditorView.updateListener.of((update) => {
      if (update.docChanged) refreshMeta();
    });
    const metaListenerB = EditorView.updateListener.of((update) => {
      if (update.docChanged) refreshMeta();
    });

    const merge = new MergeView({
      a: {
        doc: valueA,
        extensions: buildStructuredTextExtensions(
          compartmentsRef.current.a,
          language,
          false,
          [metaListenerA],
          scheduleA,
        ),
      },
      b: {
        doc: valueB,
        extensions: buildStructuredTextExtensions(
          compartmentsRef.current.b,
          language,
          false,
          [metaListenerB],
          scheduleB,
        ),
      },
      parent: hostRef.current,
      gutter: true,
      highlightChanges: true,
      collapseUnchanged: { margin: 3, minSize: 4 },
      revertControls: 'a-to-b',
    });
    mergeRef.current = merge;
    refreshMeta();

    return () => {
      merge.destroy();
      mergeRef.current = null;
    };
    // Mount once — prop sync in dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    if (syncStructuredTextDocFromProp(merge.a, valueA, emitA.lastEmitted)) refreshMeta();
  }, [valueA, refreshMeta, emitA.lastEmitted]);

  useEffect(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    if (syncStructuredTextDocFromProp(merge.b, valueB, emitB.lastEmitted)) refreshMeta();
  }, [valueB, refreshMeta, emitB.lastEmitted]);

  useEffect(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    const langExt = structuredTextLanguageExtensions(language);
    merge.a.dispatch({
      effects: compartmentsRef.current.a.language.reconfigure(langExt),
    });
    merge.b.dispatch({
      effects: compartmentsRef.current.b.language.reconfigure(langExt),
    });
    refreshMeta();
  }, [language, refreshMeta]);

  const runFormatBoth = () => {
    const merge = mergeRef.current;
    if (!merge) return;
    const currentA = merge.a.state.doc.toString();
    const currentB = merge.b.state.doc.toString();
    const resultA = formatStructuredText(currentA, language);
    const resultB = formatStructuredText(currentB, language);
    if (!resultA.ok || !resultB.ok) {
      showNotice(resultA.ok ? resultB.error : resultA.error);
      return;
    }
    clearNotice();
    replaceStructuredTextDoc(merge.a, resultA.text);
    replaceStructuredTextDoc(merge.b, resultB.text);
    emitA.flush(resultA.text);
    emitB.flush(resultB.text);
  };

  const statusFor = (validation: StructuredTextValidation, side: string) =>
    validation.valid
      ? `${side}: valid`
      : validation.line != null
        ? `${side}: error line ${validation.line + 1}`
        : `${side}: invalid`;

  return (
    <div className={`structured-text-diff-pane${className ? ` ${className}` : ''}`}>
      <div className="structured-text-editor__toolbar" role="toolbar" aria-label="Diff tools">
        <StructuredTextLanguageToggle language={language} onLanguageChange={onLanguageChange} />
        <span className="structured-text-editor__toolbar-divider" aria-hidden />
        <div className="structured-text-editor__toolbar-actions">
          <StructuredTextToolbarButton
            label="Format"
            tooltip={
              language === 'json'
                ? 'Pretty-print JSON on both sides (unwraps stringified)'
                : 'Format both sides'
            }
            icon={<IcBraces size={15} />}
            onClick={runFormatBoth}
          />
          <StructuredTextToolbarButton
            label="Collapse all"
            tooltip="Collapse all nested blocks"
            icon={<IcChevronDown size={15} />}
            onClick={() => {
              const merge = mergeRef.current;
              if (!merge) return;
              foldAll(merge.a);
              foldAll(merge.b);
            }}
          />
          <StructuredTextToolbarButton
            label="Expand all"
            tooltip="Expand all nested blocks"
            icon={<IcArrowUp size={15} />}
            onClick={() => {
              const merge = mergeRef.current;
              if (!merge) return;
              unfoldAll(merge.a);
              unfoldAll(merge.b);
            }}
          />
        </div>
      </div>
      {notice ? (
        <div className="structured-text-editor__notice" role="status">
          {notice}
        </div>
      ) : null}
      <div className="structured-text-diff-pane__labels">
        <span
          className={`structured-text-diff-pane__label${validationA.valid ? '' : ' structured-text-diff-pane__label--err'}`}
        >
          {labelA}
          <span className="structured-text-diff-pane__label-meta muted small">
            {statusFor(validationA, labelA)}
          </span>
        </span>
        <span
          className={`structured-text-diff-pane__label${validationB.valid ? '' : ' structured-text-diff-pane__label--err'}`}
        >
          {labelB}
          <span className="structured-text-diff-pane__label-meta muted small">
            {statusFor(validationB, labelB)}
          </span>
        </span>
      </div>
      <div
        ref={hostRef}
        className="structured-text-diff-pane__host"
        style={{ minHeight: `${minHeight}px` }}
      />
    </div>
  );
}
