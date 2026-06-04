import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { EditorView } from '@codemirror/view';
import { MergeView } from '@codemirror/merge';
import { foldAll, unfoldAll } from '@codemirror/language';
import {
  IcArrowUp,
  IcBraces,
  IcChevronDown,
  IcSearch,
} from '../icons';
import { StructuredTextLanguageToggle } from './StructuredTextLanguageToggle';
import { StructuredTextToolbarButton } from './StructuredTextToolbarButton';
import {
  buildStructuredTextExtensions,
  createStructuredTextCompartments,
  structuredTextLanguageExtensions,
} from '../../lib/structuredTextEditorExtensions';
import {
  commitLocalStructuredTextEdit,
  applyVisualStructuredTextDoc,
  syncStructuredTextDocFromProp,
} from '../../lib/structuredTextEditorSync';
import { observeStructuredTextMergeHostResize, openStructuredTextSearch, jumpStructuredTextToPath } from '../../lib/structuredTextEditorLayout';
import {
  formatStructuredText,
  validateStructuredText,
  alignStructuredTextSidesForDiff,
  applyStructuredEditToRawText,
  type StructuredTextLanguage,
  type StructuredTextValidation,
} from '../../lib/structuredText';
import { StructuredTextSemanticDiffPanel } from './StructuredTextSemanticDiffPanel';
import { useDebouncedEmit } from '../../hooks/useDebouncedEmit';
import { useEphemeralNotice } from '../../hooks/useEphemeralNotice';
import { useVerticalSplitResize } from '../../hooks/useVerticalSplitResize';

const DEFAULT_DEBOUNCE_MS = 150;
const SEMANTIC_DEFAULT_HEIGHT = 220;
const SEMANTIC_MIN_HEIGHT = 72;
const MERGE_MIN_HEIGHT = 240;

export type StructuredTextDiffCompareMode = 'line' | 'structured' | 'both';

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
  labelA = 'Left',
  labelB = 'Right',
  minHeight = 480,
  onChangeDebounceMs = DEFAULT_DEBOUNCE_MS,
  className = '',
}: StructuredTextDiffPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const mergeRef = useRef<MergeView | null>(null);
  const compartmentsRef = useRef<{
    a: ReturnType<typeof createStructuredTextCompartments>;
    b: ReturnType<typeof createStructuredTextCompartments>;
  } | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  const syncedLanguageRef = useRef(language);
  const holdPropSyncARef = useRef(false);
  const holdPropSyncBRef = useRef(false);

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
  const [liveA, setLiveA] = useState(valueA);
  const [liveB, setLiveB] = useState(valueB);
  const [compareMode, setCompareMode] = useState<StructuredTextDiffCompareMode>('both');
  const [alignKeys, setAlignKeys] = useState(false);
  const alignKeysRef = useRef(alignKeys);
  alignKeysRef.current = alignKeys;
  const valueARef = useRef(valueA);
  valueARef.current = valueA;
  const valueBRef = useRef(valueB);
  valueBRef.current = valueB;

  const refreshMeta = useCallback(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    const textA = merge.a.state.doc.toString();
    const textB = merge.b.state.doc.toString();
    setLiveA(textA);
    setLiveB(textB);
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

  const applyVisualAlignKeys = useCallback(
    (merge: MergeView, lang: StructuredTextLanguage, rawA?: string, rawB?: string) => {
      const textA = rawA ?? merge.a.state.doc.toString();
      const textB = rawB ?? merge.b.state.doc.toString();
      const aligned = alignStructuredTextSidesForDiff(textA, textB, lang);
      if (!aligned.ok) return false;
      let changed = false;
      if (aligned.changedA) {
        applyVisualStructuredTextDoc(merge.a, aligned.textA, holdPropSyncARef);
        changed = true;
      }
      if (aligned.changedB) {
        applyVisualStructuredTextDoc(merge.b, aligned.textB, holdPropSyncBRef);
        changed = true;
      }
      if (changed) refreshMeta();
      return true;
    },
    [refreshMeta],
  );

  const runAlignKeys = useCallback(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    if (!applyVisualAlignKeys(merge, languageRef.current)) {
      showNotice('Align keys skipped — fix parse errors on one or both sides.', 5000);
    } else {
      clearNotice();
    }
  }, [applyVisualAlignKeys, showNotice, clearNotice]);

  const restoreRawFromProps = useCallback(
    (merge: MergeView) => {
      holdPropSyncARef.current = false;
      holdPropSyncBRef.current = false;
      commitLocalStructuredTextEdit(merge.a, valueARef.current, emitA.lastEmitted, holdPropSyncARef);
      commitLocalStructuredTextEdit(merge.b, valueBRef.current, emitB.lastEmitted, holdPropSyncBRef);
      emitA.lastEmitted.current = valueARef.current;
      emitB.lastEmitted.current = valueBRef.current;
      holdPropSyncARef.current = false;
      holdPropSyncBRef.current = false;
      refreshMeta();
    },
    [emitA, emitB, refreshMeta],
  );

  const scheduleA = useCallback(
    (text: string) => {
      setValidationA(validateStructuredText(text, languageRef.current));
      const persistText = alignKeysRef.current
        ? (() => {
            const merged = applyStructuredEditToRawText(
              valueARef.current,
              text,
              languageRef.current,
            );
            return merged.ok ? merged.text : text;
          })()
        : text;
      emitA.schedule(persistText);
    },
    [emitA],
  );

  const scheduleB = useCallback(
    (text: string) => {
      setValidationB(validateStructuredText(text, languageRef.current));
      const persistText = alignKeysRef.current
        ? (() => {
            const merged = applyStructuredEditToRawText(
              valueBRef.current,
              text,
              languageRef.current,
            );
            return merged.ok ? merged.text : text;
          })()
        : text;
      emitB.schedule(persistText);
    },
    [emitB],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const compartments = {
      a: createStructuredTextCompartments(),
      b: createStructuredTextCompartments(),
    };
    compartmentsRef.current = compartments;
    emitA.lastEmitted.current = valueA;
    emitB.lastEmitted.current = valueB;
    syncedLanguageRef.current = language;

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
          compartments.a,
          language,
          false,
          [metaListenerA],
          scheduleA,
        ),
      },
      b: {
        doc: valueB,
        extensions: buildStructuredTextExtensions(
          compartments.b,
          language,
          false,
          [metaListenerB],
          scheduleB,
        ),
      },
      parent: host,
      gutter: true,
      highlightChanges: true,
    });
    mergeRef.current = merge;
    refreshMeta();
    const stopResizeObserver = observeStructuredTextMergeHostResize(host, merge);

    return () => {
      stopResizeObserver();
      merge.destroy();
      mergeRef.current = null;
      compartmentsRef.current = null;
    };
    // Mount once — prop sync in dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    if (syncStructuredTextDocFromProp(merge.a, valueA, emitA.lastEmitted, holdPropSyncARef)) {
      refreshMeta();
    }
  }, [valueA, refreshMeta, emitA.lastEmitted]);

  useEffect(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    if (syncStructuredTextDocFromProp(merge.b, valueB, emitB.lastEmitted, holdPropSyncBRef)) {
      refreshMeta();
    }
  }, [valueB, refreshMeta, emitB.lastEmitted]);

  useEffect(() => {
    const merge = mergeRef.current;
    const compartments = compartmentsRef.current;
    if (!merge || !compartments || syncedLanguageRef.current === language) return;
    syncedLanguageRef.current = language;
    const langExt = structuredTextLanguageExtensions(language);
    merge.a.dispatch({
      effects: compartments.a.language.reconfigure(langExt),
    });
    merge.b.dispatch({
      effects: compartments.b.language.reconfigure(langExt),
    });
    refreshMeta();
  }, [language, refreshMeta]);

  const runAlignKeysRef = useRef(runAlignKeys);
  runAlignKeysRef.current = runAlignKeys;
  const restoreRawFromPropsRef = useRef(restoreRawFromProps);
  restoreRawFromPropsRef.current = restoreRawFromProps;

  useEffect(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    if (alignKeys) {
      runAlignKeysRef.current();
    } else {
      restoreRawFromPropsRef.current(merge);
    }
    // Intentionally alignKeys + language only — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignKeys, language]);

  const toggleAlignKeys = () => {
    setAlignKeys((on) => !on);
  };

  const runFormatBoth = () => {
    const merge = mergeRef.current;
    if (!merge) return;
    const currentA = merge.a.state.doc.toString();
    const currentB = merge.b.state.doc.toString();
    const resultA = formatStructuredText(currentA, language);
    const resultB = formatStructuredText(currentB, language);
    if (!resultA.ok) {
      showNotice(resultA.error);
      return;
    }
    if (!resultB.ok) {
      showNotice(resultB.error);
      return;
    }
    clearNotice();
    commitLocalStructuredTextEdit(merge.a, resultA.text, emitA.lastEmitted, holdPropSyncARef);
    commitLocalStructuredTextEdit(merge.b, resultB.text, emitB.lastEmitted, holdPropSyncBRef);
    emitA.flush(resultA.text);
    emitB.flush(resultB.text);
    refreshMeta();
  };

  const statusFor = (validation: StructuredTextValidation, side: string) =>
    validation.valid
      ? `${side}: valid`
      : validation.line != null
        ? `${side}: error line ${validation.line + 1}`
        : `${side}: invalid`;

  const jumpToPath = useCallback((side: 'a' | 'b', path: string) => {
    setCompareMode((mode) => (mode === 'structured' ? 'both' : mode));
    requestAnimationFrame(() => {
      const merge = mergeRef.current;
      if (!merge) return;
      const view = side === 'b' ? merge.b : merge.a;
      if (!jumpStructuredTextToPath(view, path)) {
        openStructuredTextSearch(view);
      }
    });
  }, []);

  const showSemantic = compareMode === 'structured' || compareMode === 'both';
  const showLineMerge = compareMode === 'line' || compareMode === 'both';
  const showSplit = showSemantic && showLineMerge;

  const { topSize: semanticHeight, begin: beginSplit, move: moveSplit, end: endSplit } =
    useVerticalSplitResize({
      containerRef: bodyRef,
      defaultSize: SEMANTIC_DEFAULT_HEIGHT,
      minTop: SEMANTIC_MIN_HEIGHT,
      minBottom: MERGE_MIN_HEIGHT,
    });

  useEffect(() => {
    const merge = mergeRef.current;
    if (!merge) return;
    merge.a.requestMeasure();
    merge.b.requestMeasure();
  }, [semanticHeight, showSplit, showLineMerge]);

  return (
    <div className={`structured-text-diff-pane${className ? ` ${className}` : ''}`}>
      <div className="structured-text-editor__toolbar" role="toolbar" aria-label="Diff tools">
        <StructuredTextLanguageToggle language={language} onLanguageChange={onLanguageChange} />
        <span className="structured-text-editor__toolbar-divider" aria-hidden />
        <div className="structured-text-editor__lang" role="group" aria-label="Compare mode">
          {(
            [
              ['both', 'Line + summary'],
              ['line', 'Line only'],
              ['structured', 'Summary only'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`structured-text-editor__lang-btn${compareMode === mode ? ' structured-text-editor__lang-btn--active' : ''}`}
              aria-pressed={compareMode === mode}
              title={
                mode === 'structured'
                  ? 'Structural diff only — added/removed keys and changed values, no side-by-side text'
                  : mode === 'line'
                    ? 'Side-by-side line diff only'
                    : 'Line diff plus structural summary'
              }
              onClick={() => setCompareMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="structured-text-editor__toolbar-divider" aria-hidden />
        <button
          type="button"
          className={`structured-text-editor__lang-btn${alignKeys ? ' structured-text-editor__lang-btn--active' : ''}`}
          aria-pressed={alignKeys}
          title={
            alignKeys
              ? 'Visual only — sorts keys for line diff. Turn off for normal editing (recommended).'
              : 'Sort keys visually for easier line diff (editing while on may feel different from Edit mode)'
          }
          onClick={toggleAlignKeys}
          onDoubleClick={(e) => {
            e.preventDefault();
            if (!alignKeys) return;
            runAlignKeys();
          }}
        >
          Align keys
        </button>
        <span className="structured-text-editor__toolbar-divider" aria-hidden />
        <div className="structured-text-editor__toolbar-actions">
          <StructuredTextToolbarButton
            label="Search"
            tooltip="Find in focused side (⌘F · ⌘G next)"
            icon={<IcSearch size={15} />}
            onClick={() => openStructuredTextSearch(undefined, mergeRef.current)}
          />
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
      <div
        ref={bodyRef}
        className={`structured-text-diff-pane__body${compareMode === 'structured' ? ' structured-text-diff-pane__body--summary-only' : ''}`}
      >
        {showSemantic ? (
          <div
            className={`structured-text-diff-pane__semantic-wrap${
              showSplit
                ? ' structured-text-diff-pane__semantic-wrap--split'
                : ' structured-text-diff-pane__semantic-wrap--fill'
            }`}
            style={showSplit ? { height: semanticHeight } : undefined}
          >
            <StructuredTextSemanticDiffPanel
              valueA={liveA}
              valueB={liveB}
              language={language}
              leftLabel={labelA}
              rightLabel={labelB}
              onJumpToPath={jumpToPath}
            />
          </div>
        ) : null}
        {showSplit ? (
          <div
            className="structured-text-diff-pane__splitter"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize semantic summary and line diff"
            title="Drag to resize panels"
            onPointerDown={beginSplit}
            onPointerMove={moveSplit}
            onPointerUp={endSplit}
            onPointerCancel={endSplit}
          />
        ) : null}
        <div
          className={`structured-text-diff-pane__merge${showLineMerge ? '' : ' structured-text-diff-pane__merge--hidden'}`}
          aria-hidden={!showLineMerge}
        >
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
          <p className="structured-text-diff-pane__legend muted small">
            Highlighted lines differ between {labelA} and {labelB} — same color on both sides.
          </p>
          <div
            ref={hostRef}
            className="structured-text-diff-pane__host"
            style={
              minHeight > 0
                ? ({ ['--structured-text-min-height' as string]: `${minHeight}px` } as CSSProperties)
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
