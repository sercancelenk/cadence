import { useMemo, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { describeGraph, mermaidNoteFields, sceneToGraph } from '../lib/ai/sketchGraph';
import { sketchTask } from '../lib/ai/prompts/sketch';
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
  /** The sketch as it is on the canvas now (Excalidraw scene JSON). */
  sceneJson: string;
  /** Adds the diagram as a new note; the new note's id, or null when it could not be saved. */
  onApply: (title: string, fields: RichTextBodyFields) => string | null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "Convert to Mermaid": the sketch is read on this computer into shapes and arrows, and only that
 * list of labels is sent. The sketch itself is never changed; the diagram becomes a new note.
 */
export function AISketchDialog({ open, onClose, sceneJson, onApply }: Props) {
  const run = useAiRun(sketchTask);
  const toast = useToast();
  const [source, setSource] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const graph = useMemo(() => sceneToGraph(sceneJson), [sceneJson]);

  if (!open || !run.enabled) return null;

  const convert = async () => {
    if (!graph.ok) return;
    setSource(null);
    setChecking(true);
    try {
      const result = await run.run({ input: { graph: describeGraph(graph.value) } });
      if (!result?.ok) return;
      const check = await validateMermaid(result.value.source);
      if (!check.ok) {
        run.setError({ message: 'The assistant could not make a diagram that renders. Try again.' });
        return;
      }
      setSource(result.value.source);
    } finally {
      setChecking(false);
    }
  };
  const add = () => {
    if (!source || run.truncated) return;
    const id = onApply('Sketch as a diagram', mermaidNoteFields(source));
    if (id === null) {
      run.setError({ message: 'The note could not be saved (saving is blocked right now). Nothing was changed.' });
      return;
    }
    toast.showSuccess('Diagram added', 'It is a new note; your sketch is unchanged.');
    onClose();
  };
  const copy = async () => {
    if (!source) return;
    if (await copyText(source)) toast.showSuccess('Copied', 'The Mermaid source is on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the source above and copy it by hand.');
  };

  const busy = run.busy || checking;
  const chips: AiContextChip[] = [
    {
      label: 'Sketch',
      detail: graph.ok
        ? `${plural(graph.value.nodes.length, 'shape', 'shapes')}, ${plural(graph.value.edges.length, 'arrow', 'arrows')}`
        : 'nothing to read',
      sent: graph.ok ? describeGraph(graph.value) : undefined,
    },
  ];

  return (
    <AiResultPanel
      open
      title="Convert to Mermaid"
      connectionLabel={run.connectionLabel || undefined}
      modelLabel={run.modelLabel || undefined}
      chips={chips}
      status={run.blockedView ? 'blocked' : busy ? 'running' : 'ready'}
      message={run.blockedView?.message}
      blockedAction={run.blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: () => run.openSettings(onClose) } : undefined}
      truncated={run.truncated}
      applyLabel="Add as a new note"
      onApply={source ? add : undefined}
      applyDisabled={run.truncated}
      onCopy={source ? () => void copy() : undefined}
      onRegenerate={source ? () => void convert() : undefined}
      onClose={onClose}
    >
      {run.fellBack && run.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${run.connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        The sketch is read on this computer; only the labels of its shapes and the arrows between them are sent. Your
        sketch stays as it is, and the diagram becomes a new note when you press Add.
      </p>
      {!graph.ok ? <p>{graph.error}</p> : null}
      {graph.ok && graph.value.cut ? (
        <p className="muted small">The sketch has more than 40 shapes; only the first 40 (top to bottom) are used.</p>
      ) : null}
      {!source ? (
        <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
          <Button
            type="button"
            variant="primary"
            icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
            onClick={() => void convert()}
            disabled={busy || !graph.ok}
          >
            Convert
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
      {source ? <pre className="ai-sketch__source">{source}</pre> : null}
    </AiResultPanel>
  );
}
