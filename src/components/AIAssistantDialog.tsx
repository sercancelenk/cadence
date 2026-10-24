import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAppData } from '../AppDataContext';
import type { AIMessage } from '../lib/ai';
import { hasUsableConnection } from '../lib/ai/connections';
import { coachTask } from '../lib/ai/prompts/coach';
import { runAiTask } from '../lib/ai/runTask';
import { useFeatures } from '../lib/features';
import { Button } from './ui/Button';
import { AppModal } from './ui/AppModal';
import { MarkdownView } from './ui/MarkdownEditor';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { AiContextChips, type AiContextChip } from './ai/AiContextChips';
import { AiLegacyNotice } from './ai/AiLegacyNotice';
import { IcAlertTriangle, IcRefresh, IcSparkles } from './icons';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The task we are reasoning about. */
  task: { title: string; body?: string };
  /** `people` when the task or goal belongs to a person: it then needs a connection allowed for people data. */
  dataClass?: 'content' | 'people';
  /** Extra context the model gets and the user sees as chips. */
  context?: { listName?: string; dueAt?: string; priority?: string; linkedNoteTitle?: string };
  /** Optional callback when the user clicks "Save to task". */
  onAppendToBody?: (markdown: string) => void;
};

type Lens = 'plan' | 'risks' | 'first15';

const LENSES: { value: Lens; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'risks', label: 'Risks' },
  { value: 'first15', label: 'First 15 minutes' },
];

/** The follow-up the Continue button sends. It is part of the conversation but never shown as the user's words. */
const CONTINUE_MESSAGE =
  'Please continue from exactly where you left off — do not repeat anything you already wrote, just resume the next character.';

type Turn = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  /** A message the app sent on the user's behalf (Continue): kept in the conversation, not displayed. */
  hidden?: boolean;
  /**
   * Only meaningful on assistant turns. Captures whether the model was cut off by the token
   * budget so the UI can offer a "Continue" affordance without guessing from the trailing text.
   */
  stopReason?: 'stop' | 'length' | 'other';
};

/**
 * Modal that asks the configured model how to approach a task (the `ai.coach` task).
 *
 * The first request is built from the task itself and is shown as context chips, never as a
 * message the user supposedly typed. Follow-ups are the user's own words. The prompt, the
 * lens text and the stored legacy instructions are handled inside `runAiTask`; nothing of
 * that is shown or editable here. Every open is a fresh question.
 */
export function AIAssistantDialog({ open, onClose, task, dataClass, context, onAppendToBody }: Props) {
  const { data } = useAppData();
  const { features } = useFeatures();
  const aiSettings = data.aiSettings;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [lens, setLens] = useState<Lens>('plan');
  const [followup, setFollowup] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; diagnostic?: string } | null>(null);
  const [connectionLabel, setConnectionLabel] = useState('');
  const [fellBack, setFellBack] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const turnIdRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Reset whenever the dialog is reopened so each open starts fresh.
  useEffect(() => {
    if (!open) return;
    setTurns([]);
    setLens('plan');
    setFollowup('');
    setError(null);
    setBusy(false);
    setConnectionLabel('');
    setFellBack(false);
    abortRef.current?.abort();
    abortRef.current = null;
    turnIdRef.current = 0;
  }, [open]);

  // Scroll to bottom on new content.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [turns, busy]);

  // Cancel any in-flight request when the dialog closes/unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!open) return null;
  // Defence in depth — if a parent forgets to gate this dialog under the `features.ai` policy,
  // the dialog itself refuses to open.
  if (!features.ai) return null;

  /**
   * Runs the opening request (`pending` empty) or a follow-up (`pending` = the conversation so
   * far, ending with the user's new message). The opening request is never part of `pending`.
   */
  const send = async (pending: Turn[], withLens: Lens) => {
    setBusy(true);
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const conversation: AIMessage[] = pending.map((t) => ({ role: t.role, content: t.content }));
      const result = await runAiTask({
        task: coachTask,
        input: { title: task.title, body: task.body, ...context },
        options: { lens: withLens },
        dataClass,
        settings: aiSettings,
        features: { ai: features.ai, aiPeople: features.aiPeople, aiFocusNote: features.aiFocusNote },
        legacyFocusNote: aiSettings?.systemPrompt,
        conversation,
        signal: ctrl.signal,
      });
      if (!result.ok) {
        if (result.reason !== 'cancelled') setError({ message: result.message, diagnostic: result.diagnostic });
        return;
      }
      setConnectionLabel(result.connectionName);
      setFellBack(result.fellBack);
      setTurns((cur) => [
        ...cur,
        { id: ++turnIdRef.current, role: 'assistant', content: result.value, stopReason: result.stopReason },
      ]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const startInitial = () => {
    if (busy || turns.length > 0) return;
    void send([], lens);
  };

  const changeLens = (next: Lens) => {
    setLens(next);
    // Once there is an answer, a different lens means a fresh answer, not a follow-up.
    if (turns.length === 0 || busy) return;
    setTurns([]);
    void send([], next);
  };

  const sendFollowup = (text: string, hidden = false) => {
    const turn: Turn = { id: ++turnIdRef.current, role: 'user', content: text, hidden };
    const next = [...turns, turn];
    setTurns(next);
    void send(next, lens);
  };

  const submitFollowup = (e: FormEvent) => {
    e.preventDefault();
    const text = followup.trim();
    if (!text || busy) return;
    setFollowup('');
    sendFollowup(text);
  };

  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
  const canSaveToTask = !!onAppendToBody && !!lastAssistant?.content;

  /**
   * The latest assistant turn was cut off by the token budget — the provider explicitly reported
   * `stop_reason: 'max_tokens'` (or its equivalent). We do not trust heuristics on the trailing
   * text: code blocks legitimately end with `>` or `}`, and clean prose can end on a bullet.
   */
  const lastWasTruncated = !busy && lastAssistant?.stopReason === 'length';

  const continueGeneration = () => {
    if (busy) return;
    sendFollowup(CONTINUE_MESSAGE, true);
  };

  const bodyText = task.body?.trim() ?? '';
  const chips: AiContextChip[] = [
    {
      label: 'Task',
      detail: bodyText ? `details included (${bodyText.length} characters)` : 'title only',
      sent: bodyText ? `${task.title.trim()}\n\n${bodyText}` : task.title.trim(),
    },
    ...(context?.listName ? [{ label: 'List', detail: context.listName }] : []),
    ...(context?.dueAt ? [{ label: 'Due', detail: context.dueAt }] : []),
    ...(context?.priority ? [{ label: 'Priority', detail: context.priority }] : []),
    ...(context?.linkedNoteTitle ? [{ label: 'Linked note', detail: context.linkedNoteTitle }] : []),
  ];

  const followupFooter =
    turns.length > 0 ? (
      <form className="ai-dialog__followup" onSubmit={submitFollowup}>
        <AutoResizeTextarea
          className="textarea ai-dialog__followup-input"
          placeholder="Ask a follow-up — Enter to send, Shift+Enter for a new line"
          value={followup}
          onChange={setFollowup}
          minRows={1}
          maxRows={5}
          submitMode="enter"
          disabled={busy}
          onSubmit={() => {
            const text = followup.trim();
            if (!text || busy) return;
            setFollowup('');
            sendFollowup(text);
          }}
          ariaLabel="Follow-up question"
        />
        <div className="ai-dialog__actions">
          {lastWasTruncated ? (
            <Button
              type="button"
              variant="ghost"
              onClick={continueGeneration}
              title="The provider reported it cut the reply off at the token budget — click to resume."
            >
              Continue
            </Button>
          ) : null}
          {busy ? (
            <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={!followup.trim()}>
              Send
            </Button>
          )}
          {canSaveToTask ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!lastAssistant) return;
                onAppendToBody?.(lastAssistant.content);
              }}
            >
              Save to task
            </Button>
          ) : null}
        </div>
      </form>
    ) : undefined;

  const lensPicker = (
    <label className="field ai-dialog__lens">
      <span>Focus</span>
      <select className="input" value={lens} onChange={(e) => changeLens(e.target.value as Lens)} disabled={busy}>
        {LENSES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );

  const visibleTurns = turns.filter((t) => !t.hidden);

  return (
    <AppModal
      onClose={onClose}
      title="AI Assistant"
      description={trimForDisplay(task.title, 110)}
      icon={<IcSparkles size={18} />}
      size="lg"
      layout="flex"
      showCloseButton
      bodyRef={scrollerRef}
      bodyClassName="ai-dialog__scroll"
      footer={followupFooter}
    >
      {!hasUsableConnection(aiSettings) ? (
        <div className="ai-dialog__empty">
          <p>You haven't configured an AI provider yet.</p>
          <p className="muted small">
            Open <strong>Settings → AI Assistant</strong> to choose a provider (Claude, ChatGPT, Gemini) or your own
            gateway. Keys live only on this device.
          </p>
        </div>
      ) : (
        <>
          <AiLegacyNotice active={features.aiFocusNote && !!aiSettings?.systemPrompt?.trim()} />
          <AiContextChips chips={chips} />
          {fellBack && connectionLabel && !busy ? (
            <p className="ai-dialog__fallback muted small">
              {`The connection chosen for this was not available, so “${connectionLabel}” was used.`}
            </p>
          ) : null}
          {turns.length === 0 && !busy ? (
            <div className="ai-dialog__intro">
              <p>
                Ask the assistant how to approach <strong>{trimForDisplay(task.title, 80)}</strong>. What it will read
                is listed above; nothing is sent until you ask.
              </p>
              {lensPicker}
              <Button type="button" variant="primary" icon={<IcSparkles size={16} />} onClick={startInitial}>
                Ask for recommendations
              </Button>
            </div>
          ) : (
            <>
              {lensPicker}
              <ul className="ai-thread">
                {visibleTurns.map((t) => (
                  <li key={t.id} className={`ai-turn ai-turn--${t.role}`}>
                    <div className="ai-turn__role">{t.role === 'user' ? 'You' : 'Assistant'}</div>
                    {t.role === 'assistant' ? <MarkdownView value={t.content} /> : <p className="ai-turn__text">{t.content}</p>}
                    {t.role === 'assistant' && t.stopReason === 'length' ? (
                      <p className="ai-turn__truncated muted small">
                        <IcAlertTriangle size={12} />
                        <span>
                          Response hit the token limit and was cut off — click <strong>Continue</strong> below to
                          resume from where it stopped.
                        </span>
                      </p>
                    ) : null}
                  </li>
                ))}
                {busy ? (
                  <li className="ai-turn ai-turn--assistant ai-turn--busy">
                    <div className="ai-turn__role">Assistant</div>
                    <p className="ai-turn__text muted">
                      <IcRefresh size={14} className="ai-spin" /> Thinking…
                    </p>
                  </li>
                ) : null}
              </ul>
              {connectionLabel && !busy && lastAssistant ? (
                <p className="muted small ai-dialog__via">via {connectionLabel}</p>
              ) : null}
            </>
          )}
          {error ? (
            <>
              <div className="ai-dialog__error" role="alert">
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
        </>
      )}
    </AppModal>
  );
}

function trimForDisplay(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : `${flat.slice(0, n - 1)}…`;
}
