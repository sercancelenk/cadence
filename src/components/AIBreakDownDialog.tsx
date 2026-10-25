import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { hasUsableConnection } from '../lib/ai/connections';
import { breakdownTask, type BreakdownStep } from '../lib/ai/prompts/breakdown';
import { runAiTask } from '../lib/ai/runTask';
import { copyText } from '../lib/clipboard';
import { useFeatures } from '../lib/features';
import { PATH_SETTINGS } from '../lib/routes';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles, IcTrash } from './icons';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  task: { title: string; body?: string };
  context: { listName?: string; dueAt?: string; priority?: string; linkedNoteTitle?: string };
  /** Default apply: the host adds these as a checklist in the task's details. */
  onAppendChecklist: (titles: string[]) => boolean | void;
  /**
   * Alternative apply: the host creates one task per step in the same list. `{ created }` reports a
   * partial save: that many of the LAST steps were added (new tasks go in last to first).
   */
  onCreateTasks: (steps: BreakdownStep[]) => boolean | void | { created: number };
};

type Row = { rowId: string; title: string; detail?: string };
type Mode = 'checklist' | 'tasks';

const MAX_CHARS = 16_000;

/**
 * "Break down": splits a task into steps. The steps can be edited or removed; nothing is
 * written until the user chooses where they go (a checklist in the task's details, or new tasks).
 */
export function AIBreakDownDialog({ open, onClose, task, context, onAppendChecklist, onCreateTasks }: Props) {
  const { data } = useAppData();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>('checklist');
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<{ message: string; diagnostic?: string } | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; canOpenSettings: boolean } | null>(null);
  const [connectionLabel, setConnectionLabel] = useState('');
  const [modelLabel, setModelLabel] = useState('');
  const [fellBack, setFellBack] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const generated = useRef<Map<string, string>>(new Map());

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open || !features.ai) return null;

  const configured = hasUsableConnection(data.aiSettings);

  const breakDown = async () => {
    setBusy(true);
    setError(null);
    setBlocked(null);
    setTruncated(false);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await runAiTask({
        task: breakdownTask,
        input: { title: task.title, body: task.body, ...context },
        settings: data.aiSettings,
        features: { ai: features.ai, aiPeople: features.aiPeople, aiFocusNote: features.aiFocusNote },
        signal: ctrl.signal,
      });
      if (!result.ok) {
        if (result.reason === 'cancelled') return;
        if (result.reason === 'not-configured' || result.reason === 'capability' || result.reason === 'blocked-people') {
          setBlocked({ message: result.message, canOpenSettings: true });
        } else if (result.reason === 'policy') {
          setBlocked({ message: result.message, canOpenSettings: false });
        } else {
          setError({ message: result.message, diagnostic: result.diagnostic });
        }
        return;
      }
      setConnectionLabel(result.connectionName);
      setModelLabel(result.model);
      setFellBack(result.fellBack);
      setTruncated(result.stopReason === 'length');
      const fresh = result.value.map((s) => ({ rowId: `s${++seq.current}`, title: s.title, detail: s.detail }));
      generated.current = new Map(fresh.map((r) => [r.rowId, r.title]));
      setRows(fresh);
      setStarted(true);
    } finally {
      if (abortRef.current === ctrl) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  };

  const edited = rows.length !== generated.current.size || rows.some((r) => generated.current.get(r.rowId) !== r.title);
  const regenerate = () => {
    if (edited && !window.confirm('Regenerate replaces the steps, including your edits and removals. Continue?')) return;
    void breakDown();
  };

  const kept = rows.map((r) => ({ title: r.title.trim(), detail: r.detail })).filter((r) => r.title);
  const canApply = kept.length > 0 && !truncated;

  const apply = () => {
    if (!canApply) return;
    const done: boolean | void | { created: number } =
      mode === 'checklist'
        ? onAppendChecklist(kept.map((r) => r.title))
        : onCreateTasks(kept.map((r) => (r.detail ? { title: r.title, detail: r.detail } : { title: r.title })));
    if (done && typeof done === 'object' && done.created > 0) {
      // The last `created` steps are in; keep only the ones still missing so a retry cannot duplicate.
      const total = kept.length;
      const missing = new Set(rows.filter((r) => r.title.trim()).slice(0, Math.max(0, total - done.created)).map((r) => r.rowId));
      setRows((cur) => cur.filter((r) => missing.has(r.rowId)));
      setError({ message: `${done.created} of ${total} tasks were created before saving stopped. The steps not created are still here; nothing was duplicated.` });
      return;
    }
    if (done === false || (done && typeof done === 'object')) {
      setError({ message: 'The steps could not be saved (saving is blocked or the task is gone). Nothing was changed; they are still here.' });
      return;
    }
    onClose();
  };

  const copy = async () => {
    if (kept.length === 0) return;
    if (await copyText(kept.map((r) => `- [ ] ${r.title}`).join('\n'))) toast.showSuccess('Copied', 'The steps are on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the steps and copy them by hand.');
  };

  const sent = [task.title.trim(), task.body?.trim()].filter(Boolean).join('\n\n').slice(0, MAX_CHARS);
  const chips: AiContextChip[] = [
    { label: 'Task', detail: `${sent.length} characters`, sent: sent || undefined },
    ...(context.listName ? [{ label: 'List', detail: context.listName }] : []),
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
      title="Break down"
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
      applyLabel={mode === 'checklist' ? 'Add checklist to details' : `Create ${kept.length} ${kept.length === 1 ? 'task' : 'tasks'}`}
      onCopy={started && kept.length > 0 ? () => void copy() : undefined}
      onApply={started && rows.length > 0 ? apply : undefined}
      applyDisabled={!canApply}
      onRegenerate={started ? regenerate : undefined}
      onClose={onClose}
    >
      {fellBack && connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        The assistant suggests small steps for “{task.title}”. Edit or remove any of them; nothing is saved until you
        choose where they go.
      </p>
      {!started ? (
        <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
          <Button
            type="button"
            variant="primary"
            icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
            onClick={() => void breakDown()}
            disabled={busy || !task.title.trim()}
          >
            Break down
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

      {started ? (
        <>
          <ul className="ai-extract-list">
            {rows.map((r) => (
              <li key={r.rowId} className="ai-extract-row">
                <div className="ai-extract-row__main">
                  <AutoResizeTextarea
                    className="textarea"
                    value={r.title}
                    onChange={(v) => setRows((cur) => cur.map((x) => (x.rowId === r.rowId ? { ...x, title: v } : x)))}
                    minRows={1}
                    maxRows={4}
                    submitMode="mod"
                    ariaLabel="Step title"
                  />
                  {r.detail ? (
                    <p className="muted small" style={{ margin: '4px 0 0' }}>
                      {r.detail}
                    </p>
                  ) : null}
                </div>
                <div className="ai-extract-row__meta">
                  <button
                    type="button"
                    className="ai-extract-row__discard"
                    aria-label="Remove step"
                    title="Remove step"
                    onClick={() => setRows((cur) => cur.filter((x) => x.rowId !== r.rowId))}
                  >
                    <IcTrash size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <fieldset className="ai-breakdown__mode">
            <legend className="muted small">Where should the steps go?</legend>
            <label>
              <input type="radio" name="breakdown-mode" checked={mode === 'checklist'} onChange={() => setMode('checklist')} />{' '}
              Add as a checklist in the task&apos;s details
            </label>
            <label>
              <input type="radio" name="breakdown-mode" checked={mode === 'tasks'} onChange={() => setMode('tasks')} />{' '}
              Create separate tasks in the same list
            </label>
          </fieldset>
        </>
      ) : null}
    </AiResultPanel>
  );
}
