import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import { boxesTask, type BoxesOut } from '../lib/ai/prompts/boxes';
import { visualizeTask } from '../lib/ai/prompts/visualize';
import { describeGraph, mermaidNoteFields } from '../lib/ai/sketchGraph';
import { graphToSceneJson } from '../lib/ai/sketchScene';
import { useAiRun } from '../lib/ai/useAiRun';
import { validateMermaid } from '../lib/richTextMermaid';
import type { RichTextBodyFields } from '../lib/richTextBody';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { Button } from './ui/Button';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { useToast } from './ui/Toast';

type Format = 'mermaid' | 'sketch';
type MermaidKind = 'auto' | 'flowchart' | 'sequence' | 'state';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Which format to start with; Mermaid when not given. */
  initialFormat?: Format;
  /** Adds a diagram as a new note; the note's id, or null when it could not be saved. */
  onAddNote: (title: string, fields: RichTextBodyFields) => string | null;
  /** Saves a sketch as a new named board. */
  onAddSketch: (title: string, sceneJson: string) => { ok: true; id: string } | { ok: false; error: string };
};

const MIN_CHARS = 10;
const MAX_CHARS = 4_000;
const MAX_CHANGE_CHARS = 1_000;
const CUT_OFF_CHANGE = 'The reply to your change was cut off, so it was not used. The earlier diagram is kept; try a smaller change.';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "Draw from a description": say what the diagram should show, get Mermaid or a Sketch board, then
 * ask for changes ("add a cache"). Results are previewed and added as a NEW note or a NEW board; an
 * existing note or sketch is never touched. While a request runs the panel offers no control, so only
 * one request is ever in flight.
 */
export function AIDrawDialog({ open, onClose, initialFormat = 'mermaid', onAddNote, onAddSketch }: Props) {
  const mermaid = useAiRun(visualizeTask);
  const boxes = useAiRun(boxesTask);
  const toast = useToast();
  const [format, setFormat] = useState<Format>(initialFormat);
  const [kind, setKind] = useState<MermaidKind>('auto');
  const [description, setDescription] = useState('');
  const [change, setChange] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [graph, setGraph] = useState<BoxesOut | null>(null);
  const [sceneJson, setSceneJson] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [working, setWorking] = useState(false);
  // A change reply was cut off and thrown away; the result on screen is the earlier, complete one.
  const [keptEarlier, setKeptEarlier] = useState(false);

  const active = format === 'mermaid' ? mermaid : boxes;
  const cutOff = active.truncated && !keptEarlier;
  const trimmed = description.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_CHARS;
  const hasResult = format === 'mermaid' ? source !== null : graph !== null && sceneJson !== null;

  if (!open || !active.enabled) return null;

  const clearResult = () => {
    mermaid.abort();
    boxes.abort();
    mermaid.reset();
    boxes.reset();
    setSource(null);
    setGraph(null);
    setSceneJson(null);
    setAdded(false);
    setWorking(false);
    setKeptEarlier(false);
  };

  /** One request. With `changeText` it builds on the current result and keeps it on screen until the new one arrives. */
  const ask = async (changeText?: string) => {
    if (changeText === undefined) clearResult();
    setKeptEarlier(false);
    setWorking(true);
    try {
      if (format === 'mermaid') {
        const result = await mermaid.run({
          input: { text: trimmed, ...(changeText !== undefined && source ? { current: source, change: changeText } : {}) },
          options: { kind },
        });
        if (!result?.ok) return;
        if (changeText !== undefined && result.stopReason === 'length') {
          setKeptEarlier(true);
          mermaid.setError({ message: CUT_OFF_CHANGE });
          return;
        }
        const check = await validateMermaid(result.value.source);
        if (!check.ok) {
          mermaid.setError({ message: 'The assistant could not make a diagram that renders. Try again.' });
          return;
        }
        setSource(result.value.source);
        setAdded(false);
      } else {
        const result = await boxes.run({
          input: {
            text: trimmed,
            ...(changeText !== undefined && graph ? { current: describeGraph({ ...graph, cut: false }), change: changeText } : {}),
          },
        });
        if (!result?.ok) return;
        if (changeText !== undefined && result.stopReason === 'length') {
          setKeptEarlier(true);
          boxes.setError({ message: CUT_OFF_CHANGE });
          return;
        }
        const built = await graphToSceneJson(result.value);
        if (!built.ok) {
          boxes.setError({ message: built.error });
          return;
        }
        setGraph(result.value);
        setSceneJson(built.json);
        setAdded(false);
      }
      if (changeText !== undefined) setChange('');
    } finally {
      setWorking(false);
    }
  };

  const titleBase = trimmed.split('\n')[0]!.slice(0, 40);
  const add = () => {
    if (added || cutOff || !hasResult) return;
    if (format === 'mermaid' && source) {
      if (onAddNote(`Diagram: ${titleBase}`, mermaidNoteFields(source)) === null) {
        mermaid.setError({ message: 'The note could not be saved (saving is blocked right now). Nothing was changed.' });
        return;
      }
      toast.showSuccess('Diagram added', 'It is a new note; nothing existing was changed.');
    } else if (sceneJson) {
      const saved = onAddSketch(`Sketch: ${titleBase}`, sceneJson);
      if (!saved.ok) {
        boxes.setError({ message: saved.error });
        return;
      }
      toast.showSuccess('Sketch added', 'It is a new board in Utilities → Sketch; nothing existing was changed.');
    }
    setAdded(true);
  };
  const copy = async () => {
    if (!source) return;
    if (await copyText(source)) toast.showSuccess('Copied', 'The Mermaid source is on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the source above and copy it by hand.');
  };

  const busy = working || active.busy;
  const canChange = hasResult && !busy && !cutOff && change.trim().length > 0;
  const chips: AiContextChip[] = [
    {
      label: 'Your description',
      detail: `${Math.min(trimmed.length, MAX_CHARS)} characters`,
      sent: trimmed.slice(0, MAX_CHARS) || undefined,
    },
  ];

  return (
    <AiResultPanel
      open
      title="Draw from a description"
      connectionLabel={active.connectionLabel || undefined}
      modelLabel={active.modelLabel || undefined}
      chips={chips}
      status={active.blockedView ? 'blocked' : busy ? 'running' : 'ready'}
      message={active.blockedView?.message}
      blockedAction={active.blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: () => active.openSettings(onClose) } : undefined}
      truncated={cutOff}
      applyLabel={added ? 'Added' : format === 'mermaid' ? 'Add as a new note' : 'Add as a new board'}
      onApply={hasResult ? add : undefined}
      applyDisabled={added || cutOff}
      onCopy={format === 'mermaid' && source ? () => void copy() : undefined}
      onRegenerate={hasResult ? () => void ask() : undefined}
      onClose={onClose}
    >
      {active.fellBack && active.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${active.connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        Describe what the diagram should show. Only your description (and, when you ask for a change, the current
        diagram) is sent. The result is added as something new; nothing existing is touched.
      </p>
      <label className="field">
        <span>Description</span>
        <AutoResizeTextarea
          className="textarea"
          value={description}
          onChange={(v) => setDescription(v.slice(0, MAX_CHARS))}
          minRows={3}
          maxRows={8}
          disabled={busy || hasResult}
          ariaLabel="Description"
        />
      </label>
      <div className="row" style={{ gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <fieldset className="field" style={{ marginTop: 0, border: 0, padding: 0 }}>
          <legend className="muted small">Format</legend>
          {(['mermaid', 'sketch'] as const).map((f) => (
            <label key={f} style={{ marginRight: 12 }}>
              <input
                type="radio"
                name="draw-format"
                checked={format === f}
                disabled={busy}
                onChange={() => {
                  clearResult();
                  setFormat(f);
                }}
              />{' '}
              {f === 'mermaid' ? 'Mermaid' : 'Sketch'}
            </label>
          ))}
        </fieldset>
        {format === 'mermaid' ? (
          <label className="field" style={{ marginTop: 0 }}>
            <span>Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as MermaidKind)} disabled={busy || hasResult} aria-label="Diagram type">
              <option value="auto">Best fit</option>
              <option value="flowchart">Flowchart</option>
              <option value="sequence">Sequence</option>
              <option value="state">State</option>
            </select>
          </label>
        ) : (
          <p className="muted small" style={{ alignSelf: 'end' }}>A sketch is simple boxes and arrows.</p>
        )}
      </div>
      {description.length >= MAX_CHARS ? (
        <p className="muted small" role="status">
          {`The description is limited to ${MAX_CHARS.toLocaleString('en-US')} characters; anything beyond that was cut off.`}
        </p>
      ) : null}
      {tooShort ? (
        <p className="muted small" role="status">
          {`Write a little more (at least ${MIN_CHARS} characters) so there is something to draw.`}
        </p>
      ) : null}
      {!hasResult ? (
        <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
          <Button
            type="button"
            variant="primary"
            icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
            onClick={() => void ask()}
            disabled={busy || trimmed.length < MIN_CHARS}
          >
            Draw
          </Button>
        </div>
      ) : null}
      {active.error ? (
        <>
          <div className="ai-dialog__error" role="alert" style={{ marginBottom: 12 }}>
            {active.error.message}
          </div>
          {active.error.diagnostic ? (
            <details className="ai-panel__diagnostic">
              <summary>Diagnostic details</summary>
              <pre>{active.error.diagnostic}</pre>
            </details>
          ) : null}
        </>
      ) : null}
      {format === 'mermaid' && source ? <pre className="ai-sketch__source">{source}</pre> : null}
      {format === 'sketch' && graph && sceneJson ? (
        <p role="status">{`A sketch with ${plural(graph.nodes.length, 'box', 'boxes')} and ${plural(graph.edges.length, 'arrow', 'arrows')} is ready.`}</p>
      ) : null}
      {hasResult ? (
        <div className="ai-draw__change">
          <label className="field">
            <span>Change it</span>
            <AutoResizeTextarea
              className="textarea"
              value={change}
              onChange={(v) => setChange(v.slice(0, MAX_CHANGE_CHARS))}
              minRows={2}
              maxRows={5}
              disabled={busy}
              ariaLabel="Change it"
            />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <Button type="button" variant="ghost" size="sm" disabled={!canChange} onClick={() => void ask(change.trim())}>
              Apply change
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={clearResult}>
              Start over
            </Button>
          </div>
        </div>
      ) : null}
    </AiResultPanel>
  );
}
