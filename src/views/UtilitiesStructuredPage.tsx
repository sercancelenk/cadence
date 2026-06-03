import { lazy, Suspense, useMemo, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { IcBraces, IcLayoutGrid, IcPencil } from '../components/icons';
import type { StructuredTextLanguage } from '../lib/structuredText';

const StructuredTextEditor = lazy(() =>
  import('../components/ui/StructuredTextEditor').then((m) => ({ default: m.StructuredTextEditor })),
);

const StructuredTextDiffPane = lazy(() =>
  import('../components/ui/StructuredTextDiffPane').then((m) => ({
    default: m.StructuredTextDiffPane,
  })),
);

const DEFAULT_JSON = '{\n}\n';

type StructuredMode = 'edit' | 'diff';

export function UtilitiesStructuredPage() {
  const { data, patchUtilityStructuredText } = useAppData();
  const stored = data.utilityStructuredText;
  const [mode, setMode] = useState<StructuredMode>('edit');

  const content = stored?.content ?? DEFAULT_JSON;
  const diffContent = stored?.diffContent ?? content;
  const language: StructuredTextLanguage = stored?.language ?? 'json';

  const lastUpdated = useMemo(() => {
    if (!stored?.updatedAt) return null;
    try {
      return new Date(stored.updatedAt).toLocaleString();
    } catch {
      return null;
    }
  }, [stored?.updatedAt]);

  const onChange = (next: string) => {
    const prev = stored?.content ?? DEFAULT_JSON;
    if (next === prev) return;
    patchUtilityStructuredText({ content: next });
  };

  const onDiffChange = (next: string) => {
    const prev = stored?.diffContent ?? content;
    if (next === prev) return;
    patchUtilityStructuredText({ diffContent: next });
  };

  const onLanguageChange = (next: StructuredTextLanguage) => {
    if (next === language) return;
    patchUtilityStructuredText({ language: next });
  };

  return (
    <div className="page page--wide utilities-structured-page">
      <header className="utilities-doc-page__head">
        <div>
          <h1 className="utilities-doc-page__title">JSON / YAML</h1>
          <p className="utilities-doc-page__lead muted">
            Edit structured data with folding, validation, and side-by-side diff. Auto-saved to your
            workspace — not a note or todo.
          </p>
        </div>
        {lastUpdated ? (
          <p className="utilities-doc-page__meta muted small">Last updated {lastUpdated}</p>
        ) : null}
      </header>

      <div className="structured-text-workspace">
        <div className="rich-doc-pane__chrome structured-text-workspace__chrome">
          <div className="rich-doc-pane__mode" role="tablist" aria-label="Structured text mode">
            <button
              type="button"
              className={`rich-doc-pane__mode-tab${mode === 'edit' ? ' rich-doc-pane__mode-tab--active' : ''}`}
              role="tab"
              aria-selected={mode === 'edit'}
              onClick={() => setMode('edit')}
            >
              <IcPencil size={14} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className={`rich-doc-pane__mode-tab${mode === 'diff' ? ' rich-doc-pane__mode-tab--active' : ''}`}
              role="tab"
              aria-selected={mode === 'diff'}
              onClick={() => setMode('diff')}
            >
              <IcLayoutGrid size={14} />
              <span>Diff</span>
            </button>
            <span className="rich-doc-pane__hint muted small">
              {mode === 'edit' ? (
                <>
                  <IcBraces size={13} /> Paste JSON or YAML · fold nested blocks from the gutter
                </>
              ) : (
                'Compare Before and After side by side'
              )}
            </span>
          </div>
        </div>

        <div className="structured-text-workspace__body">
          <Suspense
            fallback={
              <div className="structured-text-editor structured-text-editor--loading muted small">
                Loading editor…
              </div>
            }
          >
            {mode === 'edit' ? (
              <StructuredTextEditor
                value={content}
                language={language}
                onChange={onChange}
                onLanguageChange={onLanguageChange}
              />
            ) : (
              <StructuredTextDiffPane
                valueA={content}
                valueB={diffContent}
                onChangeA={onChange}
                onChangeB={onDiffChange}
                language={language}
                onLanguageChange={onLanguageChange}
              />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
