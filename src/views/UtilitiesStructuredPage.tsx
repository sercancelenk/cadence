import { useMemo, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { StructuredTextDiffPane } from '../components/ui/StructuredTextDiffPane';
import { StructuredTextEditor } from '../components/ui/StructuredTextEditor';
import { StructuredTextHelpDialog } from '../components/ui/StructuredTextHelpDialog';
import { IcHelpCircle, IcLayoutGrid, IcPencil } from '../components/icons';
import type { StructuredTextLanguage } from '../lib/structuredText';

const DEFAULT_JSON = '{\n}\n';

type StructuredMode = 'edit' | 'diff';

export function UtilitiesStructuredPage() {
  const { data, patchUtilityStructuredText } = useAppData();
  const stored = data.utilityStructuredText;
  const [mode, setMode] = useState<StructuredMode>('edit');
  const [helpOpen, setHelpOpen] = useState(false);

  const content = stored?.content ?? DEFAULT_JSON;
  const diffContentLeft = stored?.diffContentLeft ?? DEFAULT_JSON;
  const diffContentRight = stored?.diffContent ?? DEFAULT_JSON;
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

  const onDiffLeftChange = (next: string) => {
    const prev = stored?.diffContentLeft ?? DEFAULT_JSON;
    if (next === prev) return;
    patchUtilityStructuredText({ diffContentLeft: next });
  };

  const onDiffRightChange = (next: string) => {
    const prev = stored?.diffContent ?? DEFAULT_JSON;
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

  const openDiff = () => {
    const editContent = stored?.content ?? DEFAULT_JSON;
    const patch: {
      diffContentLeft?: string;
      diffContent?: string;
    } = {};
    if (stored?.diffContentLeft === undefined) {
      patch.diffContentLeft = editContent;
    }
    if (stored?.diffContent === undefined) {
      patch.diffContent = editContent;
    }
    if (Object.keys(patch).length > 0) {
      patchUtilityStructuredText(patch);
    }
    setMode('diff');
  };

  return (
    <div className="page page--wide utilities-structured-page">
      <header className="utilities-doc-page__head">
        <div>
          <div className="utilities-doc-page__title-row">
            <h1 className="utilities-doc-page__title">JSON / YAML</h1>
            <button
              type="button"
              className="icon-btn utilities-doc-page__help-btn"
              aria-label="How to use JSON / YAML editor"
              title="How to use this editor"
              onClick={() => setHelpOpen(true)}
            >
              <IcHelpCircle size={18} />
            </button>
          </div>
          <p className="utilities-doc-page__lead muted">
            Edit, convert, and diff structured data with folding and validation. Auto-saved to your
            workspace — not a note or todo.
          </p>
        </div>
        {lastUpdated ? (
          <p className="utilities-doc-page__meta muted small">Last updated {lastUpdated}</p>
        ) : null}
      </header>

      {helpOpen ? <StructuredTextHelpDialog onClose={() => setHelpOpen(false)} /> : null}

      <div className={`structured-text-workspace${mode === 'diff' ? ' structured-text-workspace--diff' : ''}`}>
        <div className="rich-doc-pane__chrome structured-text-workspace__chrome">
          <div className="rich-doc-pane__mode" role="tablist" aria-label="Structured text mode">
            <button
              type="button"
              className={`rich-doc-pane__mode-tab${mode === 'edit' ? ' rich-doc-pane__mode-tab--active' : ''}`}
              role="tab"
              aria-selected={mode === 'edit'}
              title="Edit"
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
              title="Diff"
              onClick={openDiff}
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
              valueA={diffContentLeft}
              valueB={diffContentRight}
              onChangeA={onDiffLeftChange}
              onChangeB={onDiffRightChange}
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
