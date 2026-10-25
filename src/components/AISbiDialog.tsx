import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { hasUsableConnection } from '../lib/ai/connections';
import type { AiEditorTarget } from '../lib/ai/editorTarget';
import { copyText } from '../lib/clipboard';
import {
  candorParts,
  candorTask,
  partsToText,
  reviewParts,
  reviewTask,
  type FeedbackPart,
} from '../lib/ai/prompts/feedback';
import { sbiTask, type SbiOut } from '../lib/ai/prompts/sbi';
import { runAiTask, type RunTaskResult } from '../lib/ai/runTask';
import { useFeatures } from '../lib/features';
import { PATH_SETTINGS } from '../lib/routes';
import type { FeedbackKind } from '../model';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The selected feedback text. */
  text: string;
  kind?: FeedbackKind;
  target: AiEditorTarget;
  /** Called just before the text is replaced. */
  /** Called just before the edit; may return a function that is run only once the edit really went in (the restore point). */
  beforeApply?: () => void | (() => void);
};

const MAX_TEXT_CHARS = 8_000;

type Framework = 'sbi' | 'candor' | 'review';
const FRAMEWORKS: Array<{ id: Framework; radio: string; action: string; version: string }> = [
  { id: 'sbi', radio: 'SBI', action: 'Rewrite as SBI', version: 'SBI version' },
  { id: 'candor', radio: 'Radical Candor', action: 'Rewrite as Radical Candor', version: 'Radical Candor version' },
  { id: 'review', radio: 'Review draft', action: 'Draft a review', version: 'Review draft version' },
];

const sbiParts = (out: SbiOut): FeedbackPart[] =>
  (
    [
      ['situation', 'Situation'],
      ['behavior', 'Behavior'],
      ['impact', 'Impact'],
    ] as const
  )
    .filter(([key]) => out[key])
    .map(([key, label]) => ({ key, label, text: out[key] }));

const mapValue = <T,>(r: RunTaskResult<T>, f: (v: T) => FeedbackPart[]): RunTaskResult<FeedbackPart[]> =>
  r.ok ? { ...r, value: f(r.value) } : r;

/**
 * "Rewrite as SBI": feedback in Situation-Behavior-Impact form, shown beside the original. The same
 * dialog can also restate it as Radical Candor or turn rough notes into a review draft.
 * Feedback is people data, so it only goes to a connection allowed for it. The selection is
 * replaced only when the user presses the button and the text is still exactly as it was; the
 * edit is one undo step.
 */
export function AISbiDialog({ open, onClose, text, kind, target, beforeApply }: Props) {
  const { data } = useAppData();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [framework, setFramework] = useState<Framework>('sbi');
  const [result, setResult] = useState<FeedbackPart[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [stale, setStale] = useState(false);
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<{ message: string; diagnostic?: string } | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; canOpenSettings: boolean } | null>(null);
  const [connectionLabel, setConnectionLabel] = useState('');
  const [modelLabel, setModelLabel] = useState('');
  const [fellBack, setFellBack] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open || !features.ai || !features.aiPeople) return null;

  const configured = hasUsableConnection(data.aiSettings);
  const trimmed = text.trim();
  // Only this much is sent; replacing a longer selection would delete the part that was never read.
  const tooLong = trimmed.length > MAX_TEXT_CHARS;

  const rewrite = async () => {
    if (!trimmed) {
      setError({ message: 'There is no feedback text to rewrite.' });
      return;
    }
    setBusy(true);
    setError(null);
    setBlocked(null);
    setResult(null);
    setTruncated(false);
    setStale(false);
    setTaken({});
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const base = {
        input: { text: trimmed, kind },
        settings: data.aiSettings,
        features: { ai: features.ai, aiPeople: features.aiPeople, aiFocusNote: features.aiFocusNote },
        signal: ctrl.signal,
      };
      const run =
        framework === 'candor'
          ? mapValue(await runAiTask({ task: candorTask, ...base }), candorParts)
          : framework === 'review'
            ? mapValue(await runAiTask({ task: reviewTask, ...base }), reviewParts)
            : mapValue(await runAiTask({ task: sbiTask, ...base }), sbiParts);
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

  /** What would be written: only the parts the user kept ticked. */
  const chosenText = result ? partsToText(result.filter((p) => taken[p.key] !== false)) : '';
  const current = FRAMEWORKS.find((f) => f.id === framework) ?? FRAMEWORKS[0]!;

  const replace = () => {
    if (!result || !chosenText) return;
    const commitRestorePoint = beforeApply?.();
    if (!target.replaceSelection(chosenText)) {
      setStale(true);
      setError({
        message:
          'Nothing was replaced: the text changed while this was open, or the selection holds images or formatting that would be lost. You can copy the result and paste it where you want it.',
      });
      return;
    }
    if (typeof commitRestorePoint === 'function') commitRestorePoint();
    toast.showSuccess('Feedback rewritten', 'Press ⌘Z to get your original text back.');
    onClose();
  };

  const copy = async () => {
    if (!result || !chosenText) return;
    if (await copyText(chosenText)) toast.showSuccess('Copied', `The ${current.radio} version is on your clipboard.`);
    else toast.showWarning('Could not copy', 'Select the text above and copy it by hand.');
  };

  const chips: AiContextChip[] = [
    {
      label: 'Feedback text',
      detail: `${Math.min(trimmed.length, MAX_TEXT_CHARS)} characters`,
      sent: trimmed.slice(0, MAX_TEXT_CHARS) || undefined,
    },
    ...(kind ? [{ label: 'Type', detail: kind }] : []),
    { label: 'People data', detail: 'feedback text only, no names; sent only to a connection you allowed for it' },
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

  const missing =
    result && framework === 'sbi'
      ? ['situation', 'impact'].filter((k) => !result.some((p) => p.key === k))
      : [];

  return (
    <AiResultPanel
      open
      title={current.action}
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
      applyLabel="Replace selection"
      onApply={result ? replace : undefined}
      applyDisabled={truncated || stale || tooLong || !chosenText}
      onCopy={result && chosenText ? () => void copy() : undefined}
      onRegenerate={result ? () => void rewrite() : undefined}
      onClose={onClose}
    >
      {fellBack && connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        Your feedback, restated using only what you wrote. Your text is replaced only when you press Replace
        selection.
      </p>
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend className="muted small">Framework</legend>
        {FRAMEWORKS.map((f) => (
          <label key={f.id} style={{ marginRight: 12 }}>
            <input
              type="radio"
              name="feedback-framework"
              checked={framework === f.id}
              disabled={busy}
              onChange={() => {
                setFramework(f.id);
                setResult(null);
                setTruncated(false);
                setStale(false);
                setError(null);
                setTaken({});
              }}
            />{' '}
            {f.radio}
          </label>
        ))}
      </fieldset>
      {tooLong ? (
        <p className="muted small" role="status">
          {`Only the first ${MAX_TEXT_CHARS.toLocaleString('en-US')} characters are sent. Select less text to replace it; with this much you can still read the result and copy it.`}
        </p>
      ) : null}
      {!result ? (
        <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
          <Button
            type="button"
            variant="primary"
            icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
            onClick={() => void rewrite()}
            disabled={busy || !trimmed}
          >
            {current.action}
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

      {result ? (
        <>
          <div className="ai-sbi__cols">
            <section>
              <h4 className="ai-challenge__title">Your text</h4>
              <p className="ai-sbi__text">{trimmed}</p>
            </section>
            <section>
              <h4 className="ai-challenge__title">{current.version}</h4>
              <ul className="ai-sbi__elements">
                {result.map((part) => (
                  <li key={part.key}>
                    <label className="ai-sbi__element">
                      <input
                        type="checkbox"
                        checked={taken[part.key] !== false}
                        onChange={(e) => setTaken((cur) => ({ ...cur, [part.key]: e.target.checked }))}
                        aria-label={part.label}
                      />
                      <span style={part.list ? { whiteSpace: 'pre-line' } : undefined}>
                        <strong>{part.label}:</strong> {part.text}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          {missing.length > 0 ? (
            <p className="muted small">
              {`No ${missing.join(' or ')} is stated in your text, so it was left out. Consider adding ${
                missing.length > 1 ? 'them' : 'it'
              }.`}
            </p>
          ) : null}
        </>
      ) : null}
    </AiResultPanel>
  );
}
