import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { StructuredTextDiffPane } from '../components/ui/StructuredTextDiffPane';
import { StructuredTextEditor } from '../components/ui/StructuredTextEditor';
import { StructuredTextHelpDialog } from '../components/ui/StructuredTextHelpDialog';
import { IcHelpCircle, IcLayoutGrid, IcPencil, IcPlus, IcX } from '../components/icons';
import type { StructuredTextLanguage } from '../lib/structuredText';
import type { UtilityStructuredTab } from '../core/model';

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
    closeStructuredTab,
    renameStructuredTab,
    setActiveStructuredTab,
    patchStructuredTab,
  } = useAppData();
  const { confirm } = useConfirm();

  const tabs = useMemo(() => data.utilityStructuredTabs ?? [], [data.utilityStructuredTabs]);
  const activeTab =
    tabs.find((t) => t.id === data.activeStructuredTabId) ?? tabs[0] ?? null;

  const [helpOpen, setHelpOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Brand-new workspaces (never opened this editor, no legacy buffer) have no
  // tabs yet. Seed exactly one so the editor is never blank. The ref guards
  // against React StrictMode's double-invoked effect creating two tabs.
  const seededRef = useRef(false);
  useEffect(() => {
    if (tabs.length > 0 || seededRef.current) return;
    seededRef.current = true;
    addStructuredTab();
  }, [tabs.length, addStructuredTab]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

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

  const beginRename = (tab: UtilityStructuredTab) => {
    setRenamingId(tab.id);
    setRenameValue(tab.title);
  };

  const commitRename = () => {
    if (renamingId) renameStructuredTab(renamingId, renameValue);
    setRenamingId(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
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
        {lastUpdated ? (
          <p className="utilities-doc-page__meta muted small">Last updated {lastUpdated}</p>
        ) : null}
      </header>

      {helpOpen ? <StructuredTextHelpDialog onClose={() => setHelpOpen(false)} /> : null}

      <div className="structured-tabbar" role="tablist" aria-label="JSON / YAML documents">
        <div className="structured-tabbar__list">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            const isRenaming = tab.id === renamingId;
            return (
              <div
                key={tab.id}
                className={`structured-tab${isActive ? ' structured-tab--active' : ''}`}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveStructuredTab(tab.id)}
                onDoubleClick={() => beginRename(tab)}
              >
                <span
                  className={`structured-tab__badge structured-tab__badge--${tab.language}`}
                  aria-hidden
                >
                  {tab.language === 'yaml' ? 'YAML' : 'JSON'}
                </span>
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="structured-tab__rename"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                  />
                ) : (
                  <span className="structured-tab__title" title={tab.title}>
                    {tab.title}
                  </span>
                )}
                <button
                  type="button"
                  className="structured-tab__close"
                  aria-label={`Close ${tab.title}`}
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCloseTab(tab);
                  }}
                >
                  <IcX size={13} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="structured-tabbar__add"
          aria-label="New tab"
          title="New tab"
          onClick={() => addStructuredTab()}
        >
          <IcPlus size={16} />
        </button>
      </div>

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
