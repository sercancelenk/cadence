import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { challengeToBlocks, challengeToText } from '../lib/ai/challengeBlocks';
import { copyText } from '../lib/clipboard';
import { hasUsableConnection } from '../lib/ai/connections';
import type { AiEditorTarget } from '../lib/ai/editorTarget';
import { challengeTask, type ChallengeOut } from '../lib/ai/prompts/challenge';
import { runAiTask } from '../lib/ai/runTask';
import { useFeatures } from '../lib/features';
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

const MAX_TEXT_CHARS = 16_000;

const SECTIONS: Array<{ key: keyof ChallengeOut; label: string }> = [
  { key: 'assumptions', label: 'Assumptions' },
  { key: 'risks', label: 'Risks' },
  { key: 'alternatives', label: 'Alternatives' },
  { key: 'questions', label: 'Open questions' },
];

/**
 * "Challenge my idea": a critical read of the note. The result is shown first; it is added to
 * the note as a separate block at the end, only when the user presses Add to note.
 */
export function AIChallengeDialog({ open, onClose, text, target, beforeApply, noteUnlocked }: Props) {
  const { data } = useAppData();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ChallengeOut | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<{ message: string; diagnostic?: string } | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; canOpenSettings: boolean } | null>(null);
  const [connectionLabel, setConnectionLabel] = useState('');
  const [modelLabel, setModelLabel] = useState('');
  const [fellBack, setFellBack] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open || !features.ai) return null;

  const configured = hasUsableConnection(data.aiSettings);
  const trimmed = text.trim();

  const challenge = async () => {
    if (!trimmed) {
      setError({ message: 'There is no text to challenge.' });
      return;
    }
    setBusy(true);
    setError(null);
    setBlocked(null);
    setResult(null);
    setTruncated(false);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const run = await runAiTask({
        task: challengeTask,
        input: { text: trimmed },
        settings: data.aiSettings,
        features: { ai: features.ai, aiPeople: features.aiPeople, aiFocusNote: features.aiFocusNote },
        signal: ctrl.signal,
      });
      if (!run.ok) {
        if (run.reason === 'cancelled') return;
        if (run.reason === 'not-configured' || run.reason === 'capability' || run.reason === 'blocked-people') {
          setBlocked({ message: run.message, canOpenSettings: true });
        } else if (run.reason === 'policy') {
          setBlocked({ message: run.message, canOpenSettings: false });
        } else {
          setError({ message: run.message, diagnostic: run.diagnostic });
        }
        return;
      }
      setConnectionLabel(run.connectionName);
      setModelLabel(run.model);
      setFellBack(run.fellBack);
      setTruncated(run.stopReason === 'length');
      setResult(run.value);
    } finally {
      // Only the newest request may clear the busy flag and the abort handle.
      if (abortRef.current === ctrl) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  };

  const add = () => {
    if (!result) return;
    const commitRestorePoint = beforeApply?.();
    const placed = target.insertBlocks(challengeToBlocks(result), 'end');
    if (placed === null) {
      setError({ message: 'The result could not be added. The note may be read-only.' });
      return;
    }
    if (typeof commitRestorePoint === 'function') commitRestorePoint();
    toast.showSuccess('Added to your note', 'It is at the end of the note. Press ⌘Z to undo.');
    onClose();
  };

  const copy = async () => {
    if (!result) return;
    if (await copyText(challengeToText(result))) toast.showSuccess('Copied', 'The points are on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the text above and copy it by hand.');
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
      title="Challenge my idea"
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
      applyLabel="Add to note"
      onCopy={result ? () => void copy() : undefined}
      onApply={result ? add : undefined}
      applyDisabled={truncated}
      onRegenerate={result ? () => void challenge() : undefined}
      onClose={onClose}
    >
      {fellBack && connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        A critical read of this text: assumptions, risks, alternatives and open questions. Your note is not changed
        until you press Add to note, and then it is added as a separate block at the end.
      </p>
      {!result ? (
        <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
          <Button
            type="button"
            variant="primary"
            icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
            onClick={() => void challenge()}
            disabled={busy || !trimmed}
          >
            Challenge this
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

      {result
        ? SECTIONS.filter((s) => result[s.key].length > 0).map((s) => (
            <section key={s.key} className="ai-challenge__section">
              <h4 className="ai-challenge__title">{s.label}</h4>
              <ul className="ai-challenge__list">
                {result[s.key].map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))
        : null}
    </AiResultPanel>
  );
}
