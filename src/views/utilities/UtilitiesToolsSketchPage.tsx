import { useCallback, useEffect, useRef, useState } from 'react';
import { SketchCanvas, type SketchCanvasHandle } from '../../features/sketch/SketchCanvas';
import { UtilitySavedDocsPanel } from '../../features/utilities/UtilitySavedDocsPanel';
import { useConfirm } from '../../components/ui/ConfirmProvider';
import { useAppData } from '../../AppDataContext';

export function UtilitiesToolsSketchPage() {
  const { confirm, prompt } = useConfirm();
  const {
    data,
    upsertUtilitySketchDocument,
    renameUtilitySketchDocument,
    removeUtilitySketchDocument,
  } = useAppData();
  const docs = data.utilitySketchDocuments ?? [];
  const canvasRef = useRef<SketchCanvasHandle>(null);
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
      description: 'You have unsaved edits on this sketch. Continue without saving?',
      confirmLabel: 'Discard',
      danger: true,
    });
  }, [confirm]);

  const promptTitle = useCallback(
    async (initial: string): Promise<string | null> => {
      return prompt({
        title: 'Name for this sketch',
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
      window.alert('Saved sketch not found.');
      return;
    }
    const handle = canvasRef.current;
    if (!handle?.isReady()) {
      window.alert('Sketch canvas is still loading — try again in a moment.');
      return;
    }
    const loaded = await handle.loadSceneJson(doc.sceneJson);
    if (!loaded.ok) {
      window.alert(loaded.error);
      return;
    }
    setActiveId(id);
    setDirty(false);
  };

  const runSave = async (opts: { forceNew: boolean }) => {
    if (saveBusyRef.current) return;
    const handle = canvasRef.current;
    const sceneJson = handle?.getSceneJson();
    if (!sceneJson) {
      window.alert('Sketch canvas is not ready yet.');
      return;
    }
    saveBusyRef.current = true;
    setSaveBusy(true);
    try {
      if (!opts.forceNew && activeId) {
        const existing = docs.find((d) => d.id === activeId);
        const result = upsertUtilitySketchDocument({
          id: activeId,
          title: existing?.title ?? 'Untitled sketch',
          sceneJson,
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
        opts.forceNew && existing
          ? `${existing.title} copy`
          : existing?.title ?? 'Untitled sketch',
      );
      if (!title) return;
      const result = upsertUtilitySketchDocument({ title, sceneJson });
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
    renameUtilitySketchDocument(id, title);
  };

  const onDelete = async (id: string) => {
    const existing = docs.find((d) => d.id === id);
    if (!existing) return;
    const ok = await confirm({
      title: 'Delete saved sketch?',
      description: `"${existing.title}" will be removed from your workspace. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    removeUtilitySketchDocument(id);
    if (activeId === id) {
      canvasRef.current?.newBlank();
      setActiveId(null);
      setDirty(false);
    }
  };

  return (
    <div className="utilities-tools-panels">
      <section className="utilities-tools-panel utilities-tools-panel--sketch">
        <header className="utilities-tools-panel__head">
          <h2>Sketch (whiteboard)</h2>
          <p className="muted small">
            Freehand boards for system design and meetings. Save a named copy to your workspace, or
            Export for a file. Unsaved work stays on this screen until you Save.
          </p>
        </header>
        <UtilitySavedDocsPanel
          libraryId="sketch"
          kindLabel="sketches"
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
        <SketchCanvas
          ref={canvasRef}
          onDirty={() => setDirty(true)}
          onBeforeReplace={guardDirty}
        />
      </section>
    </div>
  );
}
