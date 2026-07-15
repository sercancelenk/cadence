import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Excalidraw,
  exportToBlob,
  loadFromBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useTheme } from '../../providers/ThemeContext';
import {
  downloadBlob,
  downloadTextFile,
  parseSketchSceneJson,
} from '../../lib/sketch/sketchExport';

export function SketchCanvas() {
  const { theme } = useTheme();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);
  const aliveRef = useRef(true);

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
      try {
        const raw = JSON.parse(String(reader.result ?? ''));
        const parsed = parseSketchSceneJson(raw);
        if (!parsed.ok) {
          window.alert(parsed.error);
          return;
        }
        void (async () => {
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
          } catch {
            if (aliveRef.current) window.alert('Could not load that Excalidraw file.');
          }
        })();
      } catch {
        window.alert('Could not parse that JSON file.');
      }
    };
    reader.onerror = () => {
      if (aliveRef.current) window.alert('Could not read that file.');
    };
    reader.readAsText(file);
  };

  const clearScene = () => {
    const api = apiRef.current;
    if (!api) return;
    if (!window.confirm('Clear the entire sketch? This cannot be undone.')) return;
    try {
      api.resetScene();
      // history.clear is optional across Excalidraw versions
      const hist = (api as { history?: { clear?: () => void } }).history;
      hist?.clear?.();
    } catch {
      window.alert('Could not clear the sketch.');
    }
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
        Hand-drawn whiteboard for meeting sketches and system design. Nothing is saved to your
        workspace — use Export JSON / PNG.
      </p>
      <div className="sketch-canvas">
        <Excalidraw
          excalidrawAPI={onApi}
          theme={theme}
          langCode="en"
          aiEnabled={false}
          name="Cadence sketch"
          UIOptions={{
            canvasActions: {
              // Route loads through our Import toolbar (validated + size-capped).
              loadScene: false,
              export: { saveFileToDisk: true },
              toggleTheme: false,
            },
          }}
        />
      </div>
    </div>
  );
}
