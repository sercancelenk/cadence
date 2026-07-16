import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Excalidraw,
  exportToBlob,
  loadFromBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useConfirm } from '../../components/ui/ConfirmProvider';
import { useTheme } from '../../providers/ThemeContext';
import {
  downloadBlob,
  downloadTextFile,
  parseSketchSceneJson,
} from '../../lib/sketch/sketchExport';

export type SketchCanvasHandle = {
  getSceneJson: () => string | null;
  loadSceneJson: (sceneJson: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  newBlank: () => void;
  isReady: () => boolean;
};

export type SketchCanvasProps = {
  onDirty?: () => void;
  /** Gate destructive replaces (Import / Clear). Return false to cancel. */
  onBeforeReplace?: () => boolean | Promise<boolean>;
};

export const SketchCanvas = forwardRef<SketchCanvasHandle, SketchCanvasProps>(function SketchCanvas(
  { onDirty, onBeforeReplace },
  ref,
) {
  const { theme } = useTheme();
  const { confirm } = useConfirm();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);
  const aliveRef = useRef(true);
  const suppressDirtyRef = useRef(false);
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;
  const onBeforeReplaceRef = useRef(onBeforeReplace);
  onBeforeReplaceRef.current = onBeforeReplace;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const onApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    setReady(true);
  }, []);

  const markDirty = useCallback(() => {
    if (suppressDirtyRef.current) return;
    onDirtyRef.current?.();
  }, []);

  const confirmReplace = useCallback(async (): Promise<boolean> => {
    const gate = onBeforeReplaceRef.current;
    if (!gate) return true;
    return gate();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      isReady: () => !!apiRef.current,
      getSceneJson: () => {
        const api = apiRef.current;
        if (!api) return null;
        return serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), 'local');
      },
      loadSceneJson: async (sceneJson) => {
        const api = apiRef.current;
        if (!api) return { ok: false, error: 'Sketch canvas is not ready yet.' };
        let raw: unknown;
        try {
          raw = JSON.parse(sceneJson);
        } catch {
          return { ok: false, error: 'Saved sketch is not valid JSON.' };
        }
        const parsed = parseSketchSceneJson(raw);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        try {
          suppressDirtyRef.current = true;
          const blob = new Blob([sceneJson], { type: 'application/json' });
          const restored = await loadFromBlob(blob, api.getAppState(), null);
          if (!aliveRef.current || apiRef.current !== api) {
            return { ok: false, error: 'Sketch canvas was closed.' };
          }
          api.updateScene({
            elements: restored.elements,
            appState: { ...restored.appState, collaborators: new Map() },
          });
          if (restored.files && Object.keys(restored.files).length > 0) {
            api.addFiles(Object.values(restored.files));
          }
          api.scrollToContent(undefined, { fitToContent: true });
          requestAnimationFrame(() => {
            suppressDirtyRef.current = false;
          });
          return { ok: true };
        } catch {
          suppressDirtyRef.current = false;
          return { ok: false, error: 'Could not load that saved sketch.' };
        }
      },
      newBlank: () => {
        const api = apiRef.current;
        if (!api) return;
        suppressDirtyRef.current = true;
        try {
          api.resetScene();
          const hist = (api as { history?: { clear?: () => void } }).history;
          hist?.clear?.();
        } finally {
          requestAnimationFrame(() => {
            suppressDirtyRef.current = false;
          });
        }
      },
    }),
    [],
  );

  const exportJson = () => {
    const api = apiRef.current;
    if (!api) return;
    const json = serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), 'local');
    downloadTextFile(`cadence-sketch-${Date.now()}.excalidraw`, json);
  };

  const exportPng = async () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const blob = await exportToBlob({
        elements: api.getSceneElements(),
        appState: {
          ...api.getAppState(),
          exportBackground: true,
          exportWithDarkMode: theme === 'dark',
        },
        files: api.getFiles(),
        mimeType: 'image/png',
      });
      downloadBlob(`cadence-sketch-${Date.now()}.png`, blob);
    } catch {
      window.alert('Could not export PNG.');
    }
  };

  const importFile = (file: File) => {
    const api = apiRef.current;
    if (!api) return;
    if (file.size > 8 * 1024 * 1024) {
      window.alert('Sketch file is too large (max 8 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (!aliveRef.current) return;
      void (async () => {
        try {
          const raw = JSON.parse(String(reader.result ?? ''));
          const parsed = parseSketchSceneJson(raw);
          if (!parsed.ok) {
            window.alert(parsed.error);
            return;
          }
          if (!(await confirmReplace())) return;
          if (!aliveRef.current || apiRef.current !== api) return;
          try {
            const restored = await loadFromBlob(file, api.getAppState(), null);
            if (!aliveRef.current || apiRef.current !== api) return;
            api.updateScene({
              elements: restored.elements,
              appState: { ...restored.appState, collaborators: new Map() },
            });
            if (restored.files && Object.keys(restored.files).length > 0) {
              api.addFiles(Object.values(restored.files));
            }
            api.scrollToContent(undefined, { fitToContent: true });
            markDirty();
          } catch {
            if (aliveRef.current) window.alert('Could not load that Excalidraw file.');
          }
        } catch {
          window.alert('Could not parse that JSON file.');
        }
      })();
    };
    reader.onerror = () => {
      if (aliveRef.current) window.alert('Could not read that file.');
    };
    reader.readAsText(file);
  };

  const clearScene = () => {
    void (async () => {
      const api = apiRef.current;
      if (!api) return;
      const ok = await confirm({
        title: 'Clear the entire sketch?',
        description: 'This clears the canvas. Unsaved work on this board will be lost.',
        confirmLabel: 'Clear',
        danger: true,
      });
      if (!ok) return;
      try {
        api.resetScene();
        const hist = (api as { history?: { clear?: () => void } }).history;
        hist?.clear?.();
        markDirty();
      } catch {
        window.alert('Could not clear the sketch.');
      }
    })();
  };

  return (
    <div className="sketch-workspace">
      <div className="sketch-toolbar" role="toolbar" aria-label="Sketch tools">
        <button type="button" className="btn btn--ghost btn--small" disabled={!ready} onClick={exportJson}>
          Export JSON
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          disabled={!ready}
          onClick={() => void exportPng()}
        >
          Export PNG
        </button>
        <label className={`btn btn--ghost btn--small sketch-toolbar__file${!ready ? ' is-disabled' : ''}`}>
          Import
          <input
            type="file"
            accept=".excalidraw,.json,application/json"
            hidden
            disabled={!ready}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
        </label>
        <button type="button" className="btn btn--ghost btn--small" disabled={!ready} onClick={clearScene}>
          Clear
        </button>
      </div>
      <p className="muted small sketch-hint">
        Hand-drawn whiteboard for meeting sketches and system design. Use Save above to keep a named
        copy in your workspace — Export for a file on disk.
      </p>
      <div className="sketch-canvas">
        <Excalidraw
          excalidrawAPI={onApi}
          theme={theme}
          langCode="en"
          aiEnabled={false}
          name="Cadence sketch"
          onChange={() => markDirty()}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              export: { saveFileToDisk: true },
              toggleTheme: false,
            },
          }}
        />
      </div>
    </div>
  );
});
