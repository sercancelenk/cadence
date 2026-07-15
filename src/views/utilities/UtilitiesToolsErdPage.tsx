import { ErdCanvas } from '../../features/erd/ErdCanvas';

export function UtilitiesToolsErdPage() {
  return (
    <div className="utilities-tools-panels">
      <section className="utilities-tools-panel utilities-tools-panel--erd">
        <header className="utilities-tools-panel__head">
          <h2>ER diagram (lite)</h2>
          <p className="muted small">
            Draw.io-style tables and foreign keys on a canvas. Ephemeral session — export JSON or PNG
            to keep a copy. Does not write to your Cadence workspace.
          </p>
        </header>
        <ErdCanvas />
      </section>
    </div>
  );
}
