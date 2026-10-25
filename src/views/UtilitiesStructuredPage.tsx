import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { StructuredTextDiffPane } from '../components/ui/StructuredTextDiffPane';
import { StructuredTextEditor } from '../components/ui/StructuredTextEditor';
import { StructuredTextHelpDialog } from '../components/ui/StructuredTextHelpDialog';
import { IcFileText, IcHelpCircle, IcLayoutGrid, IcPencil, IcSparkles } from '../components/icons';
import { hasUsableConnection } from '../lib/ai/connections';
import { useFeatures } from '../lib/features';
import { UtilityTabStrip } from '../features/tools/UtilityTabStrip';
import { useMoveTabToNote } from '../features/tools/useMoveTabToNote';
import { useToolFileSave } from '../features/tools/useToolFileSave';
import { useToast } from '../components/ui/Toast';
import { structuredTabFile } from '../lib/toolFileExport';
import type { StructuredTextLanguage } from '../lib/structuredText';
import type { UtilityStructuredTab } from '../core/model';

const AIMockDataDialog = lazy(() =>
  import('../components/AIMockDataDialog').then((m) => ({ default: m.AIMockDataDialog })),
);

const DEFAULT_JSON = '{\n}\n';

/**
 * Whether a tab holds content worth guarding against accidental close. A blank
 * "Untitled" tab (empty or just `{}`) closes silently; anything else prompts.
 */
function tabHasContent(tab: UtilityStructuredTab): boolean {
  const main = tab.content.replace(/\s/g, '');
  const hasMain = main !== '' && main !== '{}';
  const hasDiff =
    Boolean(tab.diffContent && tab.diffContent.trim()) ||
    Boolean(tab.diffContentLeft && tab.diffContentLeft.trim());
  return hasMain || hasDiff;
}

export function UtilitiesStructuredPage() {
  const {
    data,
    addStructuredTab,
    addStructuredTabWithContent,
    closeStructuredTab,
    renameStructuredTab,
    setActiveStructuredTab,
    patchStructuredTab,
    flushPendingSave,
    getLatestSnapshot,
  } = useAppData();
  const { confirm } = useConfirm();
  const move = useMoveTabToNote('structured');
  const { features } = useFeatures();
  const aiEnabled = features.ai && hasUsableConnection(data.aiSettings);
  const [mockOpen, setMockOpen] = useState(false);

  const tabs = useMemo(() => data.utilityStructuredTabs ?? [], [data.utilityStructuredTabs]);
  const activeTab =
    tabs.find((t) => t.id === data.activeStructuredTabId) ?? tabs[0] ?? null;

  const toast = useToast();
  // In Diff mode the file is still the tab's edit buffer: the diff panes are scratch.
  useToolFileSave({
    active: Boolean(activeTab),
    flush: flushPendingSave,
    saveFile: window.cadence?.saveToolFile,
    notify: { success: toast.showSuccess, error: toast.showError },
    getFile: () => {
      const latest = getLatestSnapshot();
      const all = latest.utilityStructuredTabs ?? [];
      const tab = all.find((t) => t.id === latest.activeStructuredTabId) ?? all[0];
      return tab ? structuredTabFile(tab) : null;
    },
  });

  const [helpOpen, setHelpOpen] = useState(false);

  // Brand-new workspaces (never opened this editor, no legacy buffer) have no
  // tabs yet. Seed exactly one so the editor is never blank. The ref guards
  // against React StrictMode's double-invoked effect creating two tabs.
  const seededRef = useRef(false);
  useEffect(() => {
    // Re-arm once a tab exists: moving the only tab to Notes leaves none again.
    if (tabs.length > 0) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current) return;
    seededRef.current = true;
    addStructuredTab();
  }, [tabs.length, addStructuredTab]);

  const lastUpdated = useMemo(() => {
    if (!activeTab?.updatedAt) return null;
    try {
      return new Date(activeTab.updatedAt).toLocaleString();
    } catch {
      return null;
    }
  }, [activeTab?.updatedAt]);

  if (!activeTab) {
    return (
      <div className="page page--wide utilities-structured-page">
        <p className="muted">Preparing editor…</p>
      </div>
    );
  }

  const activeId = activeTab.id;
  const mode = activeTab.mode;
  const content = activeTab.content ?? DEFAULT_JSON;
  const diffContentLeft = activeTab.diffContentLeft ?? DEFAULT_JSON;
  const diffContentRight = activeTab.diffContent ?? DEFAULT_JSON;
  const language: StructuredTextLanguage = activeTab.language ?? 'json';

  const onChange = (next: string) => {
    if (next === activeTab.content) return;
    patchStructuredTab(activeId, { content: next });
  };

  const onDiffLeftChange = (next: string) => {
    if (next === activeTab.diffContentLeft) return;
    patchStructuredTab(activeId, { diffContentLeft: next });
  };

  const onDiffRightChange = (next: string) => {
    if (next === activeTab.diffContent) return;
    patchStructuredTab(activeId, { diffContent: next });
  };

  const onLanguageChange = (next: StructuredTextLanguage) => {
    if (next === language) return;
    patchStructuredTab(activeId, { language: next });
  };

  const onConvert = (nextContent: string, nextLanguage: StructuredTextLanguage) => {
    patchStructuredTab(activeId, { content: nextContent, language: nextLanguage });
  };

  const setMode = (next: 'edit' | 'diff') => {
    if (next === mode) return;
    patchStructuredTab(activeId, { mode: next });
  };

  const openDiff = () => {
    // Seed the diff panes from the edit buffer the first time Diff opens, so
    // the user starts from their current content instead of an empty pane.
    const patch: Partial<Pick<UtilityStructuredTab, 'diffContentLeft' | 'diffContent' | 'mode'>> = {
      mode: 'diff',
    };
    if (activeTab.diffContentLeft === undefined) patch.diffContentLeft = activeTab.content;
    if (activeTab.diffContent === undefined) patch.diffContent = activeTab.content;
    patchStructuredTab(activeId, patch);
  };

  const handleCloseTab = async (tab: UtilityStructuredTab) => {
    if (tabHasContent(tab)) {
      const ok = await confirm({
        title: `Close “${tab.title}”?`,
        description: 'This tab and its content will be discarded. This cannot be undone.',
        confirmLabel: 'Close tab',
        cancelLabel: 'Keep',
        danger: true,
      });
      if (!ok) return;
    }
    closeStructuredTab(tab.id);
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
            Edit, convert, and diff structured data across multiple tabs. Every tab is auto-saved to
            your workspace — not a note or todo.
          </p>
        </div>
        <div className="utilities-doc-page__actions">
          {lastUpdated ? (
            <p className="utilities-doc-page__meta muted small">Last updated {lastUpdated}</p>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost btn--small"
            title="Turn this tab into a note and remove it from Tools"
            onClick={() => move.request(activeId)}
          >
            <IcFileText size={14} aria-hidden />
            Move to Notes
          </button>
          {aiEnabled && language === 'json' && tabHasContent(activeTab) ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              title="Generate more records shaped like this JSON, as a new tab"
              onClick={() => setMockOpen(true)}
            >
              <IcSparkles size={14} aria-hidden />
              Mock data with AI
            </button>
          ) : null}
        </div>
      </header>
      {move.dialog}
      {mockOpen ? (
        <Suspense fallback={null}>
          <AIMockDataDialog
            open
            onClose={() => setMockOpen(false)}
            tabTitle={activeTab.title}
            sampleText={content}
            onApply={(title, text) => addStructuredTabWithContent({ title, content: text, language: 'json' })}
          />
        </Suspense>
      ) : null}

      {helpOpen ? <StructuredTextHelpDialog onClose={() => setHelpOpen(false)} /> : null}

      <UtilityTabStrip
        tabs={tabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          badge: (
            <span className={`structured-tab__badge structured-tab__badge--${tab.language}`} aria-hidden>
              {tab.language === 'yaml' ? 'YAML' : 'JSON'}
            </span>
          ),
        }))}
        activeId={activeId}
        ariaLabel="JSON / YAML documents"
        onSelect={setActiveStructuredTab}
        onAdd={() => addStructuredTab()}
        onClose={(id) => {
          const tab = tabs.find((t) => t.id === id);
          if (tab) void handleCloseTab(tab);
        }}
        onRename={renameStructuredTab}
      />

      <div
        className={`structured-text-workspace${mode === 'diff' ? ' structured-text-workspace--diff' : ''}`}
      >
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
              key={`edit-${activeId}`}
              value={content}
              language={language}
              onChange={onChange}
              onLanguageChange={onLanguageChange}
              onConvert={onConvert}
              minHeight={0}
            />
          ) : (
            <StructuredTextDiffPane
              key={`diff-${activeId}`}
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
