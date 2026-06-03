import { useMemo, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { StructuredTextDiffPane } from '../components/ui/StructuredTextDiffPane';
import { StructuredTextEditor } from '../components/ui/StructuredTextEditor';
import { IcLayoutGrid, IcPencil } from '../components/icons';
import type { StructuredTextLanguage } from '../lib/structuredText';

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

  const onConvert = (content: string, nextLanguage: StructuredTextLanguage) => {
    patchUtilityStructuredText({ content, language: nextLanguage });
  };

  return (
    <div className="page page--wide utilities-structured-page">
      <header className="utilities-doc-page__head">
        <div>
          <h1 className="utilities-doc-page__title">JSON / YAML</h1>
          <p className="utilities-doc-page__lead muted">
            Edit, convert, and diff structured data with folding and validation. Auto-saved to your
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
          </div>
        </div>

        <div className="structured-text-workspace__body">
          {mode === 'edit' ? (
            <StructuredTextEditor
              value={content}
              language={language}
              onChange={onChange}
              onLanguageChange={onLanguageChange}
              onConvert={onConvert}
              minHeight={0}
            />
          ) : (
            <StructuredTextDiffPane
              valueA={content}
              valueB={diffContent}
              onChangeA={onChange}
              onChangeB={onDiffChange}
              language={language}
              onLanguageChange={onLanguageChange}
              minHeight={0}
            />
          )}
        </div>
      </div>
    </div>
  );
}
