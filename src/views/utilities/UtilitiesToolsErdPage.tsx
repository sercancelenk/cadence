import { useCallback, useEffect, useRef, useState } from 'react';
import { ErdCanvas, type ErdCanvasHandle } from '../../features/erd/ErdCanvas';
import { UtilitySavedDocsPanel } from '../../features/utilities/UtilitySavedDocsPanel';
import { useConfirm } from '../../components/ui/ConfirmProvider';
import { useAppData } from '../../AppDataContext';
import { parseErdDocument } from '../../lib/erd/erdModel';

export function UtilitiesToolsErdPage() {
  const { confirm, prompt } = useConfirm();
  const {
    data,
    upsertUtilityErdDocument,
    renameUtilityErdDocument,
    removeUtilityErdDocument,
  } = useAppData();
  const docs = data.utilityErdDocuments ?? [];
  const canvasRef = useRef<ErdCanvasHandle>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const saveBusyRef = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const guardDirty = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    return confirm({
      title: 'Discard unsaved changes?',
      description: 'You have unsaved edits on this ER diagram. Continue without saving?',
      confirmLabel: 'Discard',
      danger: true,
    });
  }, [confirm]);

  const promptTitle = useCallback(
    async (initial: string): Promise<string | null> => {
      return prompt({
        title: 'Name for this ER diagram',
        initialValue: initial,
        confirmLabel: 'Save',
        requiredMessage: 'Title is required.',
      });
    },
    [prompt],
  );

  const onNew = async () => {
    if (!(await guardDirty())) return;
    canvasRef.current?.newBlank();
    setActiveId(null);
    setDirty(false);
  };

  const onOpen = async (id: string) => {
    if (id === activeId && !dirtyRef.current) return;
    if (!(await guardDirty())) return;
    const doc = docs.find((d) => d.id === id);
    if (!doc) {
      window.alert('Saved ERD not found.');
      return;
    }
    const parsed = parseErdDocument(doc.document);
    if (!parsed.ok) {
      window.alert(
        parsed.error +
          ' This saved diagram is kept in your workspace but cannot be opened in this build.',
      );
      return;
    }
    canvasRef.current?.loadDocument(parsed.doc);
    setActiveId(id);
    setDirty(false);
  };

  const runSave = async (opts: { forceNew: boolean }) => {
    if (saveBusyRef.current) return;
    const handle = canvasRef.current;
    if (!handle) return;
    const document = handle.getDocument();
    saveBusyRef.current = true;
    setSaveBusy(true);
    try {
      if (!opts.forceNew && activeId) {
        const existing = docs.find((d) => d.id === activeId);
        const result = upsertUtilityErdDocument({
          id: activeId,
          title: existing?.title ?? 'Untitled ERD',
          document,
        });
        if (!result.ok) {
          window.alert(result.error);
          return;
        }
        setDirty(false);
        return;
      }
      const existing = activeId ? docs.find((d) => d.id === activeId) : undefined;
      const title = await promptTitle(
        opts.forceNew && existing ? `${existing.title} copy` : existing?.title ?? 'Untitled ERD',
      );
      if (!title) return;
      const result = upsertUtilityErdDocument({ title, document });
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      setActiveId(result.id);
      setDirty(false);
    } finally {
      saveBusyRef.current = false;
      setSaveBusy(false);
    }
  };

  const onRename = async (id: string) => {
    const existing = docs.find((d) => d.id === id);
    if (!existing) return;
    const title = await promptTitle(existing.title);
    if (!title) return;
    renameUtilityErdDocument(id, title);
  };

  const onDelete = async (id: string) => {
    const existing = docs.find((d) => d.id === id);
    if (!existing) return;
    const ok = await confirm({
      title: 'Delete saved ERD?',
      description: `"${existing.title}" will be removed from your workspace. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    removeUtilityErdDocument(id);
    if (activeId === id) {
      canvasRef.current?.newBlank();
      setActiveId(null);
      setDirty(false);
    }
  };

  return (
    <div className="utilities-tools-panels">
      <section className="utilities-tools-panel utilities-tools-panel--erd">
        <header className="utilities-tools-panel__head">
          <h2>ER diagram (lite)</h2>
          <p className="muted small">
            Tables and foreign keys on a canvas. Save a named copy to your workspace, or Export JSON /
            PNG for a file. Unsaved work stays on this screen until you Save.
          </p>
        </header>
        <UtilitySavedDocsPanel
          libraryId="erd"
          kindLabel="ERDs"
          docs={docs}
          activeId={activeId}
          dirty={dirty}
          busy={saveBusy}
          onNew={() => void onNew()}
          onOpen={(id) => void onOpen(id)}
          onSave={() => void runSave({ forceNew: false })}
          onSaveAs={() => void runSave({ forceNew: true })}
          onRename={(id) => void onRename(id)}
          onDelete={(id) => void onDelete(id)}
        />
        <ErdCanvas
          ref={canvasRef}
          onDirty={() => setDirty(true)}
          onBeforeReplace={guardDirty}
        />
      </section>
    </div>
  );
}
