import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { hasUsableConnection } from '../lib/ai/connections';
import type { AiEditorTarget } from '../lib/ai/editorTarget';
import { visualizeTask } from '../lib/ai/prompts/visualize';
import { runAiTask, type RunTaskFailure } from '../lib/ai/runTask';
import { useFeatures } from '../lib/features';
import { copyText } from '../lib/clipboard';
import { renderMermaidSvg, validateMermaid } from '../lib/richTextMermaid';
import { PATH_SETTINGS } from '../lib/routes';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The selection, or the whole note when nothing was selected. */
  text: string;
  target: AiEditorTarget;
  /** Called just before the note is changed, to save a restore point of it. */
  /** Called just before the edit; may return a function that is run only once the edit really went in (the restore point). */
  beforeApply?: () => void | (() => void);
  /** The note is a locked note that was unlocked in this session: its text is part of what is sent. */
  noteUnlocked?: boolean;
};

type Kind = 'auto' | 'flowchart' | 'sequence' | 'state';

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: 'auto', label: 'Best fit' },
  { value: 'flowchart', label: 'Flowchart' },
  { value: 'sequence', label: 'Sequence diagram' },
  { value: 'state', label: 'State diagram' },
];

const MAX_TEXT_CHARS = 16_000;

/**
 * "Visualize": turns the selected text (or the note) into a Mermaid diagram. The source is
 * checked with Mermaid's own parser, with one repair attempt, before it is offered; nothing
 * reaches the note until the user presses Insert, and then only as a new block.
 */
export function AIVisualizeDialog({ open, onClose, text, target, beforeApply, noteUnlocked }: Props) {
  const { data } = useAppData();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const toast = useToast();

  const [kind, setKind] = useState<Kind>('auto');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [error, setError] = useState<{ message: string; diagnostic?: string } | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; canOpenSettings: boolean } | null>(null);
  const [connectionLabel, setConnectionLabel] = useState('');
  const [modelLabel, setModelLabel] = useState('');
  const [fellBack, setFellBack] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    setSvg(null);
    setPreviewError(null);
    if (!source) return;
    let cancelled = false;
    void renderMermaidSvg(source).then((r) => {
      if (cancelled) return;
      if (r.ok) setSvg(r.svg);
      else setPreviewError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (!open || !features.ai) return null;

  const configured = hasUsableConnection(data.aiSettings);
  const trimmed = text.trim();

  const onFailure = (result: RunTaskFailure) => {
    if (result.reason === 'cancelled') return;
    if (result.reason === 'not-configured' || result.reason === 'capability' || result.reason === 'blocked-people') {
      setBlocked({ message: result.message, canOpenSettings: true });
    } else if (result.reason === 'policy') {
      setBlocked({ message: result.message, canOpenSettings: false });
    } else {
      setError({ message: result.message, diagnostic: result.diagnostic });
    }
  };

  const generate = async () => {
    if (!trimmed) {
      setError({ message: 'There is no text to turn into a diagram.' });
      return;
    }
    setBusy(true);
    setError(null);
    setBlocked(null);
    setSource('');
    setTruncated(false);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const base = {
      task: visualizeTask,
      input: { text: trimmed },
      options: { kind },
      settings: data.aiSettings,
      features: { ai: features.ai, aiPeople: features.aiPeople, aiFocusNote: features.aiFocusNote },
      signal: ctrl.signal,
    };
    try {
      let result = await runAiTask(base);
      if (!result.ok) return onFailure(result);
      let check = await validateMermaid(result.value.source);
      if (!check.ok) {
        // One repair attempt, with the parser's own message.
        result = await runAiTask({
          ...base,
          conversation: [
            { role: 'assistant', content: result.value.source },
            {
              role: 'user',
              content: `That diagram failed the Mermaid parser: ${check.error} Return only the corrected Mermaid source.`,
            },
          ],
        });
        if (!result.ok) return onFailure(result);
        check = await validateMermaid(result.value.source);
        if (!check.ok) {
          setError({
            message: 'The assistant could not make a diagram that renders. Try again, or choose a diagram type.',
          });
          return;
        }
      }
      setConnectionLabel(result.connectionName);
      setModelLabel(result.model);
      setFellBack(result.fellBack);
      setTruncated(result.stopReason === 'length');
      setSource(result.value.source);
    } finally {
      // Only the newest request may clear the busy flag and the abort handle.
      if (abortRef.current === ctrl) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  };

  const insert = () => {
    if (!source) return;
    const commitRestorePoint = beforeApply?.();
    const placed = target.insertBlocks(
      [{ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: source }] }],
      'after-selection',
    );
    if (placed === null) {
      setError({ message: 'The diagram could not be inserted. The note may be read-only.' });
      return;
    }
    if (typeof commitRestorePoint === 'function') commitRestorePoint();
    if (placed === 'end') {
      toast.showWarning(
        'Added at the end of the note',
        'The note changed while this was open, so the diagram was placed at the end.',
      );
    } else {
      toast.showSuccess('Diagram inserted', 'Press ⌘Z to undo.');
    }
    onClose();
  };

  const copy = async () => {
    if (!source) return;
    if (await copyText(source)) toast.showSuccess('Copied', 'The Mermaid source is on your clipboard.');
    else toast.showWarning('Could not copy', 'Choose Show source and copy it by hand.');
  };

  const chips: AiContextChip[] = [
    {
      label: 'Text',
      detail: `${Math.min(trimmed.length, MAX_TEXT_CHARS)} characters`,
      sent: trimmed.slice(0, MAX_TEXT_CHARS) || undefined,
    },
    ...(noteUnlocked ? [{ label: 'Note', detail: 'unlocked this session, so its text is included' }] : []),
  ];

  const blockedView =
    blocked ??
    (!configured
      ? {
          message:
            "You haven't configured an AI provider yet. Open Settings → AI Assistant to connect one (a hosted provider, or your own gateway).",
          canOpenSettings: true,
        }
      : null);

  return (
    <AiResultPanel
      open
      title="Visualize"
      connectionLabel={connectionLabel || undefined}
      modelLabel={modelLabel || undefined}
      chips={chips}
      status={blockedView ? 'blocked' : busy ? 'running' : 'ready'}
      message={blockedView?.message}
      blockedAction={
        blockedView?.canOpenSettings
          ? {
              label: 'Open AI settings',
              onClick: () => {
                onClose();
                navigate(`${PATH_SETTINGS}#ai`);
              },
            }
          : undefined
      }
      truncated={truncated}
      applyLabel="Insert diagram"
      onCopy={source ? () => void copy() : undefined}
      onApply={source ? insert : undefined}
      applyDisabled={truncated || !svg}
      onRegenerate={source ? () => void generate() : undefined}
      onClose={onClose}
    >
      {fellBack && connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        {`The diagram is drawn only from this text. It is added to your note as a new block, ${
          target.selectedText ? 'after the selection' : 'after the paragraph where your cursor is'
        }, and only when you press Insert.`}
      </p>
      <label className="field" style={{ marginTop: 0 }}>
        <span>Diagram type</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)} disabled={busy}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {!source ? (
        <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
          <Button
            type="button"
            variant="primary"
            icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
            onClick={() => void generate()}
            disabled={busy || !trimmed}
          >
            Generate
          </Button>
        </div>
      ) : null}

      {error ? (
        <>
          <div className="ai-dialog__error" role="alert" style={{ marginBottom: 12 }}>
            {error.message}
          </div>
          {error.diagnostic ? (
            <details className="ai-panel__diagnostic">
              <summary>Diagnostic details</summary>
              <pre>{error.diagnostic}</pre>
            </details>
          ) : null}
        </>
      ) : null}

      {source ? (
        <div className="ai-diagram">
          {previewError ? (
            <p className="ai-dialog__error" role="alert">
              {previewError}
            </p>
          ) : svg ? (
            <div
              className="ai-diagram__svg"
              // Mermaid draws this SVG locally from validated source with securityLevel 'strict'.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="muted small" role="status">
              Drawing the diagram…
            </p>
          )}
          <Button type="button" variant="ghost" onClick={() => setShowSource((v) => !v)}>
            {showSource ? 'Hide source' : 'Show source'}
          </Button>
          {showSource ? <pre className="ai-diagram__source">{source}</pre> : null}
        </div>
      ) : null}
    </AiResultPanel>
  );
}
