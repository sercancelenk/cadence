import { useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { structureTask, type StructureKind } from '../lib/ai/prompts/structure';
import { boxesTask } from '../lib/ai/prompts/boxes';
import { visualizeTask } from '../lib/ai/prompts/visualize';
import { graphToSceneJson } from '../lib/ai/sketchScene';
import { mermaidNoteFields } from '../lib/ai/sketchGraph';
import { structureToFields, structureToText } from '../lib/ai/structureDoc';
import { useAiRun } from '../lib/ai/useAiRun';
import { validateMermaid } from '../lib/richTextMermaid';
import type { RichTextBodyFields } from '../lib/richTextBody';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  tabTitle: string;
  /** The document's text. */
  text: string;
  /** Adds the structured copy as a new tab; the new tab's id, or null when it could not be saved. */
  onApply: (title: string, fields: RichTextBodyFields) => string | null;
  /** Adds a diagram as a new note; the note's id, or null when it could not be saved. Without it there is no diagram button. */
  onAddNote?: (title: string, fields: RichTextBodyFields) => string | null;
  /** Saves a sketch as a new named board. Without it there is no sketch button. */
  onAddSketch?: (title: string, sceneJson: string) => { ok: true; id: string } | { ok: false; error: string };
};

const MAX_TEXT_CHARS = 16_000;
/** Below this there is nothing to structure, and a model would only fill the gap with guesses. */
const MIN_TEXT_CHARS = 20;

const FORMATS: Array<{ kind: StructureKind; label: string; hint: string }> = [
  { kind: 'outline', label: 'Outline', hint: 'A tidy title, sections and lists.' },
  { kind: 'rfc', label: 'RFC', hint: 'Context, Proposal, Alternatives, Risks, Open questions.' },
  { kind: 'meeting', label: 'Meeting summary', hint: 'Summary, Decisions and Action items.' },
  { kind: 'table', label: 'Table', hint: 'One table with the columns the text suggests.' },
];

/**
 * "Structure this document": a tidy copy of a scratch document, with a title, sections and lists.
 * The original tab is never touched; the copy is added as a new tab only when the user says so.
 */
export function AIStructureDialog({ open, onClose, tabTitle, text, onApply, onAddNote, onAddSketch }: Props) {
  const run = useAiRun(structureTask);
  const draw = useAiRun(visualizeTask);
  const [diagram, setDiagram] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const sketch = useAiRun(boxesTask);
  const [scene, setScene] = useState<{ json: string; boxes: number; arrows: number } | null>(null);
  const [building, setBuilding] = useState(false);
  const [diagramAdded, setDiagramAdded] = useState(false);
  const [sceneAdded, setSceneAdded] = useState(false);
  /** Bumped whenever the structured result changes, so a drawing for an older result is dropped. */
  const generation = useRef(0);
  const [kind, setKind] = useState<StructureKind>('outline');
  const toast = useToast();
  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_TEXT_CHARS;

  if (!open || !run.enabled) return null;

  const out = run.value;
  const add = () => {
    if (!out || run.truncated) return;
    const id = onApply(`Structured: ${tabTitle}`, structureToFields(out));
    if (id === null) {
      run.setError({ message: 'The new tab could not be saved (saving is blocked right now). Nothing was changed.' });
      return;
    }
    toast.showSuccess('Structured copy added', 'It is a new tab; your original document is unchanged.');
    onClose();
  };
  const copy = async () => {
    if (!out) return;
    if (await copyText(structureToText(out))) toast.showSuccess('Copied', 'The structure is on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the text above and copy it by hand.');
  };

  const clearDrawn = () => {
    generation.current += 1;
    draw.abort();
    sketch.abort();
    setDiagram(null);
    setDiagramAdded(false);
    draw.reset();
    setScene(null);
    setSceneAdded(false);
    sketch.reset();
  };
  const restructure = () => {
    clearDrawn();
    void run.run({ input: { text: trimmed }, options: { kind } });
  };
  const drawMermaid = async () => {
    if (!out) return;
    clearDrawn();
    const mine = generation.current;
    setChecking(true);
    try {
      const result = await draw.run({ input: { text: structureToText(out) }, options: { kind: 'auto' } });
      if (!result?.ok || mine !== generation.current) return;
      const check = await validateMermaid(result.value.source);
      if (mine !== generation.current) return;
      if (!check.ok) {
        draw.setError({ message: 'The assistant could not make a diagram that renders. Try again.' });
        return;
      }
      setDiagram(result.value.source);
    } finally {
      setChecking(false);
    }
  };
  const addDiagram = () => {
    if (!diagram || diagramAdded || draw.truncated || !onAddNote) return;
    const id = onAddNote(`Diagram: ${tabTitle}`, mermaidNoteFields(diagram));
    if (id === null) {
      draw.setError({ message: 'The note could not be saved (saving is blocked right now). Nothing was changed.' });
      return;
    }
    setDiagramAdded(true);
    toast.showSuccess('Diagram added', 'It is a new note; your document and the structured copy are unchanged.');
  };

  const drawSketch = async () => {
    if (!out) return;
    clearDrawn();
    const mine = generation.current;
    setBuilding(true);
    try {
      const result = await sketch.run({ input: { text: structureToText(out) } });
      if (!result?.ok || mine !== generation.current) return;
      const built = await graphToSceneJson(result.value);
      if (mine !== generation.current) return;
      if (!built.ok) {
        sketch.setError({ message: built.error });
        return;
      }
      const json = built.json;
      setScene({ json, boxes: result.value.nodes.length, arrows: result.value.edges.length });
    } finally {
      setBuilding(false);
    }
  };
  const addSketch = () => {
    if (!scene || sceneAdded || sketch.truncated || !onAddSketch) return;
    const saved = onAddSketch(`Sketch: ${tabTitle}`, scene.json);
    if (!saved.ok) {
      sketch.setError({ message: saved.error });
      return;
    }
    setSceneAdded(true);
    toast.showSuccess('Sketch added', 'It is a new board in Utilities → Sketch; your document and the structured copy are unchanged.');
  };

  const chips: AiContextChip[] = [
    {
      label: 'Document',
      detail: `${Math.min(trimmed.length, MAX_TEXT_CHARS)} characters`,
      sent: trimmed.slice(0, MAX_TEXT_CHARS) || undefined,
    },
  ];

  return (
    <AiResultPanel
      open
      title="Structure this document"
      connectionLabel={run.connectionLabel || undefined}
      modelLabel={run.modelLabel || undefined}
      chips={chips}
      status={run.blockedView ? 'blocked' : run.busy ? 'running' : 'ready'}
      message={run.blockedView?.message}
      blockedAction={run.blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: () => run.openSettings(onClose) } : undefined}
      truncated={run.truncated}
      applyLabel="Add as a new tab"
      onApply={out ? add : undefined}
      applyDisabled={run.truncated}
      onCopy={out ? () => void copy() : undefined}
      onRegenerate={out ? restructure : undefined}
      onClose={onClose}
    >
      {run.fellBack && run.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${run.connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        A copy in the format you choose, using only what the document says. Your document stays as it is; the copy
        becomes a new tab when you press Add.
      </p>
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend className="muted small">Format</legend>
        {FORMATS.map((f) => (
          <label key={f.kind} style={{ marginRight: 12 }} title={f.hint}>
            <input
              type="radio"
              name="structure-format"
              checked={kind === f.kind}
              disabled={run.busy}
              onChange={() => {
                setKind(f.kind);
                if (out) {
                  run.reset();
                  clearDrawn();
                }
              }}
            />{' '}
            {f.label}
          </label>
        ))}
      </fieldset>
      {!out && tooShort ? (
        <p className="muted small" role="status">
          {`Write a little more (at least ${MIN_TEXT_CHARS} characters) so there is something to structure.`}
        </p>
      ) : null}
      {!out ? (
        <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
          <Button
            type="button"
            variant="primary"
            icon={run.busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
            onClick={() => void run.run({ input: { text: trimmed }, options: { kind } })}
            disabled={run.busy || !trimmed || tooShort}
          >
            Structure
          </Button>
        </div>
      ) : null}
      {run.error ? (
        <>
          <div className="ai-dialog__error" role="alert" style={{ marginBottom: 12 }}>
            {run.error.message}
          </div>
          {run.error.diagnostic ? (
            <details className="ai-panel__diagnostic">
              <summary>Diagnostic details</summary>
              <pre>{run.error.diagnostic}</pre>
            </details>
          ) : null}
        </>
      ) : null}
      {out ? (
        <div className="ai-structure">
          <h4 className="ai-challenge__title">{out.title}</h4>
          {out.table ? (
            <table className="ai-structure__table">
              <thead>
                <tr>
                  {out.table.columns.map((c, i) => (
                    <th key={i}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {out.table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {out.sections.map((s, i) => (
            <section key={i} className="ai-challenge__section">
              <h5 className="ai-challenge__title">{s.heading}</h5>
              <ul className="ai-challenge__list">
                {s.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {out && (onAddNote || onAddSketch) ? (
        <div className="ai-structure__draw">
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            {onAddNote ? (
              <Button
                type="button"
                variant="ghost"
                icon={draw.busy || checking ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
                onClick={() => void drawMermaid()}
                disabled={draw.busy || checking || sketch.busy || building}
              >
                Draw as Mermaid
              </Button>
            ) : null}
            {onAddSketch ? (
              <Button
                type="button"
                variant="ghost"
                icon={sketch.busy || building ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
                onClick={() => void drawSketch()}
                disabled={draw.busy || checking || sketch.busy || building}
              >
                Draw as Sketch
              </Button>
            ) : null}
          </div>
          {draw.blocked ? <p className="muted small">{draw.blocked.message}</p> : null}
          {sketch.blocked ? <p className="muted small">{sketch.blocked.message}</p> : null}
          {draw.error ? (
            <div className="ai-dialog__error" role="alert" style={{ marginTop: 8 }}>
              {draw.error.message}
            </div>
          ) : null}
          {sketch.error ? (
            <div className="ai-dialog__error" role="alert" style={{ marginTop: 8 }}>
              {sketch.error.message}
            </div>
          ) : null}
          {diagram ? (
            <>
              <pre className="ai-sketch__source">{diagram}</pre>
              {draw.truncated ? <p className="muted small">The diagram was cut off, so it cannot be added. Try again.</p> : null}
              {diagramAdded ? (
                <p className="muted small" role="status">Diagram added as a new note.</p>
              ) : (
                <Button type="button" variant="primary" onClick={addDiagram} disabled={draw.truncated}>
                  Add diagram as a new note
                </Button>
              )}
            </>
          ) : null}
          {scene ? (
            <>
              <p className="muted small">{`A sketch with ${scene.boxes} ${scene.boxes === 1 ? 'box' : 'boxes'} and ${scene.arrows} ${scene.arrows === 1 ? 'arrow' : 'arrows'} is ready.`}</p>
              {sketch.truncated ? <p className="muted small">The sketch was cut off, so it cannot be added. Try again.</p> : null}
              {sceneAdded ? (
                <p className="muted small" role="status">Sketch added as a new board.</p>
              ) : (
                <Button type="button" variant="primary" onClick={addSketch} disabled={sketch.truncated}>
                  Add sketch as a new board
                </Button>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </AiResultPanel>
  );
}
