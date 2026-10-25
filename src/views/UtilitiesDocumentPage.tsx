import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import { useConfirm } from '../components/ui/ConfirmProvider';
import { RichTextDocumentPane } from '../components/ui/RichTextDocumentPane';
import type { RichTextPayload } from '../lib/richText';
import { noteBodyPatchIsNoOp, richBodyFieldsFromPayload } from '../lib/richTextBody';
import type { RichTextBodyFormat } from '../lib/richText';
import type { UtilityDocumentTab } from '../core/model';
import { prefetchRichTextEditor } from '../features/notes/prefetchRichTextEditor';
import { documentTabHasContent } from '../features/tools/documentTabContent';
import { UtilityTabStrip } from '../features/tools/UtilityTabStrip';
import { useMoveTabToNote } from '../features/tools/useMoveTabToNote';
import { useToolFileSave } from '../features/tools/useToolFileSave';
import { useToast } from '../components/ui/Toast';
import { documentTabFile } from '../lib/toolFileExport';
import { IcFileText, IcSparkles } from '../components/icons';
import { hasUsableConnection } from '../lib/ai/connections';
import { useFeatures } from '../lib/features';
import { plainTextFromBodyFields } from '../lib/richTextBody';

const AIStructureDialog = lazy(() =>
  import('../components/AIStructureDialog').then((m) => ({ default: m.AIStructureDialog })),
);

export function UtilitiesDocumentPage() {
  const {
    data,
    addDocumentTab,
    addDocumentTabWithContent,
    createNoteWithContent,
    upsertUtilitySketchDocument,
    closeDocumentTab,
    renameDocumentTab,
    setActiveDocumentTab,
    patchDocumentTab,
    flushPendingSave,
    getLatestSnapshot,
  } = useAppData();
  const { user } = useAccount();
  const { confirm } = useConfirm();
  const move = useMoveTabToNote('document');
  const { features } = useFeatures();
  const aiEnabled = features.ai && hasUsableConnection(data.aiSettings);
  const [structureOpen, setStructureOpen] = useState(false);

  const tabs = useMemo(() => data.utilityDocumentTabs ?? [], [data.utilityDocumentTabs]);
  const activeTab = tabs.find((t) => t.id === data.activeDocumentTabId) ?? tabs[0] ?? null;

  const toast = useToast();
  useToolFileSave({
    active: Boolean(activeTab),
    flush: flushPendingSave,
    saveFile: window.cadence?.saveToolFile,
    notify: { success: toast.showSuccess, error: toast.showError },
    getFile: () => {
      const latest = getLatestSnapshot();
      const tabs = latest.utilityDocumentTabs ?? [];
      const tab = tabs.find((t) => t.id === latest.activeDocumentTabId) ?? tabs[0];
      return tab ? documentTabFile(tab) : null;
    },
  });

  useEffect(() => {
    prefetchRichTextEditor();
  }, []);

  // A workspace with no tabs (brand new, or every tab was moved to Notes) gets
  // one blank tab so the editor is never missing. The ref stops React
  // StrictMode's doubled effect from creating two; it re-arms once a tab exists.
  const seededRef = useRef(false);
  useEffect(() => {
    if (tabs.length > 0) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current) return;
    seededRef.current = true;
    addDocumentTab();
  }, [tabs.length, addDocumentTab]);

  const attachmentUserId = user?.id ?? 'anonymous';

  const lastUpdated = useMemo(() => {
    if (!activeTab?.updatedAt) return null;
    try {
      return new Date(activeTab.updatedAt).toLocaleString();
    } catch {
      return null;
    }
  }, [activeTab?.updatedAt]);

  const handleClose = async (tab: UtilityDocumentTab) => {
    if (documentTabHasContent(tab)) {
      const ok = await confirm({
        title: `Close “${tab.title}”?`,
        description: 'This document will be discarded. This cannot be undone.',
        confirmLabel: 'Close document',
        cancelLabel: 'Keep',
        danger: true,
      });
      if (!ok) return;
    }
    closeDocumentTab(tab.id);
  };

  if (!activeTab) {
    return (
      <div className="page page--wide utilities-doc-page">
        <p className="muted">Preparing your document…</p>
      </div>
    );
  }

  const tabId = activeTab.id;
  const bodyFormat: RichTextBodyFormat | 'auto' = activeTab.bodyFormat ?? 'auto';

  const onChange = (payload: RichTextPayload) => {
    const fields = richBodyFieldsFromPayload(payload);
    const prev = {
      body: activeTab.body,
      bodyFormat: activeTab.bodyFormat,
      bodyPlainText: activeTab.bodyPlainText,
    };
    if (noteBodyPatchIsNoOp(prev, fields, { nextBodyIsCanonical: true })) return;
    patchDocumentTab(tabId, fields);
  };

  return (
    <div className="page page--wide utilities-doc-page">
      <header className="utilities-doc-page__head">
        <div>
          <h1 className="utilities-doc-page__title">Document</h1>
          <p className="utilities-doc-page__lead muted">
            Standalone scratch documents — not notes or todos. Every tab is auto-saved to your workspace.
          </p>
        </div>
        <div className="utilities-doc-page__actions">
          {lastUpdated ? (
            <p className="utilities-doc-page__meta muted small">Last updated {lastUpdated}</p>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost btn--small"
            title="Turn this document into a note and remove it from Tools"
            onClick={() => move.request(tabId)}
          >
            <IcFileText size={14} aria-hidden />
            Move to Notes
          </button>
          {aiEnabled && plainTextFromBodyFields(activeTab).trim() ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              title="Make a tidy, structured copy of this document as a new tab"
              onClick={() => setStructureOpen(true)}
            >
              <IcSparkles size={14} aria-hidden />
              Structure with AI
            </button>
          ) : null}
        </div>
      </header>
      {move.dialog}
      {structureOpen ? (
        <Suspense fallback={null}>
          <AIStructureDialog
            open
            onClose={() => setStructureOpen(false)}
            tabTitle={activeTab.title}
            text={plainTextFromBodyFields(activeTab)}
            onApply={(title, fields) => addDocumentTabWithContent({ title, ...fields })}
            onAddNote={(title, fields) => createNoteWithContent({ title, ...fields })}
            onAddSketch={(title, sceneJson) => upsertUtilitySketchDocument({ title, sceneJson })}
          />
        </Suspense>
      ) : null}

      <UtilityTabStrip
        tabs={tabs.map((t) => ({ id: t.id, title: t.title }))}
        activeId={tabId}
        ariaLabel="Documents"
        onSelect={setActiveDocumentTab}
        onAdd={() => addDocumentTab()}
        onClose={(id) => {
          const tab = tabs.find((t) => t.id === id);
          if (tab) void handleClose(tab);
        }}
        onRename={renameDocumentTab}
      />

      <RichTextDocumentPane
        editorKey={tabId}
        value={activeTab.body}
        valueFormat={bodyFormat}
        onChange={onChange}
        placeholder="Draft ideas, paste snippets, plan before you commit to a note…"
        minHeight={420}
        attachmentScope={{ documentKind: 'utility', documentId: tabId }}
        attachmentUserId={attachmentUserId}
      />
    </div>
  );
}
