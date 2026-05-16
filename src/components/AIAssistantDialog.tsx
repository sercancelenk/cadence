import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAppData } from '../AppDataContext';
import { askAI, AIError, buildTaskPrompt, isAIConfigured } from '../lib/ai';
import { Button } from './ui/Button';
import { MarkdownView } from './ui/MarkdownEditor';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { IcRefresh, IcSparkles, IcX } from './icons';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The task we are reasoning about. */
  task: { title: string; body?: string };
  /** Optional callback when the user clicks "Save to notes". */
  onAppendToBody?: (markdown: string) => void;
};

/**
 * Modal that asks the configured LLM how to approach a task. We keep the
 * dialog stateless about the conversation across openings — every open is a
 * fresh question — to avoid surprising the user with stale context, but inside
 * an open session we keep follow-ups so they can refine ("make it shorter",
 * "give me a different angle").
 */
export function AIAssistantDialog({ open, onClose, task, onAppendToBody }: Props) {
  const { data } = useAppData();
  const aiSettings = data.aiSettings;

  type Turn = { id: number; role: 'user' | 'assistant'; content: string };
  const [turns, setTurns] = useState<Turn[]>([]);
  const [followup, setFollowup] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const turnIdRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Reset whenever the dialog is reopened so each open starts fresh.
  useEffect(() => {
    if (!open) return;
    setTurns([]);
    setFollowup('');
    setError('');
    setBusy(false);
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

  const send = async (prompt: string) => {
    if (!isAIConfigured(aiSettings)) {
      setError('AI is not configured. Open Settings to add a provider and key.');
      return;
    }
    const userTurn: Turn = { id: ++turnIdRef.current, role: 'user', content: prompt };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setBusy(true);
    setError('');

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const reply = await askAI({
        settings: aiSettings,
        messages: nextTurns.map((t) => ({ role: t.role, content: t.content })),
        signal: ctrl.signal,
      });
      setTurns((cur) => [...cur, { id: ++turnIdRef.current, role: 'assistant', content: reply }]);
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        // Cancelled by the user; no error message.
      } else if (err instanceof AIError) {
        setError(err.message);
      } else {
        setError(`Unexpected error: ${(err as Error)?.message ?? String(err)}`);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const startInitial = () => {
    if (busy || turns.length > 0) return;
    void send(buildTaskPrompt({ title: task.title, body: task.body }));
  };

  const submitFollowup = (e: FormEvent) => {
    e.preventDefault();
    const text = followup.trim();
    if (!text || busy) return;
    setFollowup('');
    void send(text);
  };

  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
  const canSaveToNotes = !!onAppendToBody && !!lastAssistant?.content;

  return (
    <div className="ai-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ai-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="ai-dialog__header">
          <span className="ai-dialog__icon">
            <IcSparkles size={18} />
          </span>
          <div className="ai-dialog__titlewrap">
            <h2 className="ai-dialog__title">AI Assistant</h2>
            <p className="ai-dialog__sub" title={task.title}>
              {trimForDisplay(task.title, 110)}
            </p>
          </div>
          <button type="button" className="ai-dialog__close" aria-label="Close" onClick={onClose}>
            <IcX size={18} />
          </button>
        </header>

        {!isAIConfigured(aiSettings) ? (
          <div className="ai-dialog__empty">
            <p>You haven't configured an AI provider yet.</p>
            <p className="muted small">
              Open <strong>Settings → AI Assistant</strong> to choose a provider (Claude, ChatGPT, or Gemini) and paste
              your API key. Keys live only on this device.
            </p>
          </div>
        ) : (
          <>
            <div className="ai-dialog__scroll" ref={scrollerRef}>
              {turns.length === 0 && !busy ? (
                <div className="ai-dialog__intro">
                  <p>
                    Ask the assistant how to approach <strong>{trimForDisplay(task.title, 80)}</strong>. Your task
                    title{task.body ? ' and notes are' : ' is'} sent to {providerLabel(aiSettings.provider)}.
                  </p>
                  <Button type="button" variant="primary" icon={<IcSparkles size={16} />} onClick={startInitial}>
                    Ask for recommendations
                  </Button>
                </div>
              ) : (
                <ul className="ai-thread">
                  {turns.map((t) => (
                    <li key={t.id} className={`ai-turn ai-turn--${t.role}`}>
                      <div className="ai-turn__role">{t.role === 'user' ? 'You' : 'Assistant'}</div>
                      {t.role === 'assistant' ? (
                        <MarkdownView value={t.content} />
                      ) : (
                        <p className="ai-turn__text">{t.content}</p>
                      )}
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
              )}
              {error ? <div className="ai-dialog__error">{error}</div> : null}
            </div>

            {turns.length > 0 ? (
              <form className="ai-dialog__followup" onSubmit={submitFollowup}>
                <AutoResizeTextarea
                  className="textarea ai-dialog__followup-input"
                  placeholder="Ask a follow-up — Enter to send, Shift+Enter for a new line"
                  value={followup}
                  onChange={setFollowup}
                  minRows={1}
                  maxRows={5}
                  disabled={busy}
                  onSubmit={() => {
                    const text = followup.trim();
                    if (!text || busy) return;
                    setFollowup('');
                    void send(text);
                  }}
                  ariaLabel="Follow-up question"
                />
                <div className="ai-dialog__actions">
                  {busy ? (
                    <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>
                      Stop
                    </Button>
                  ) : (
                    <Button type="submit" variant="primary" disabled={!followup.trim()}>
                      Send
                    </Button>
                  )}
                  {canSaveToNotes ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (!lastAssistant) return;
                        onAppendToBody?.(lastAssistant.content);
                      }}
                    >
                      Save to notes
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function providerLabel(p: string | undefined): string {
  if (p === 'anthropic') return 'Anthropic';
  if (p === 'openai') return 'OpenAI';
  if (p === 'gemini') return 'Google Gemini';
  return 'your AI provider';
}

function trimForDisplay(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : `${flat.slice(0, n - 1)}…`;
}
