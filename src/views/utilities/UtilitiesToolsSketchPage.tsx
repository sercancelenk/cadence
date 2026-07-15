import { SketchCanvas } from '../../features/sketch/SketchCanvas';

export function UtilitiesToolsSketchPage() {
  return (
    <div className="utilities-tools-panels">
      <section className="utilities-tools-panel utilities-tools-panel--sketch">
        <header className="utilities-tools-panel__head">
          <h2>Sketch (whiteboard)</h2>
          <p className="muted small">
            Excalidraw-style freehand drawing for system design and meeting boards. Ephemeral
            session — export JSON or PNG to keep a copy. Does not write to your Cadence workspace.
          </p>
        </header>
        <SketchCanvas />
      </section>
    </div>
  );
}
