import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { copyText } from '../lib/clipboard';
import { resolveConnection } from '../lib/ai/connections';
import { workspaceTask } from '../lib/ai/prompts/workspace';
import { checkCitations, rerankWithEmbeddings, retrieve, type Source } from '../lib/ai/retrieve';
import { useAiRun } from '../lib/ai/useAiRun';
import { useFeatures } from '../lib/features';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

type Props = { open: boolean; onClose: () => void };

const LIMIT = 8;
const CANDIDATES = 24;
const KIND_LABEL: Record<Source['kind'], string> = { note: 'Note', task: 'Task', person: 'Person record' };

/**
 * "Ask your workspace": the most relevant notes and tasks are picked on this computer, and only
 * those snippets go to the model with the question. The answer cites them as [n]. Locked and
 * archived items are never read; people records are included only when ticked, which also makes
 * the request people data.
 */
export function AIWorkspaceDialog({ open, onClose }: Props) {
  const { data } = useAppData();
  const { features } = useFeatures();
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [includePeople, setIncludePeople] = useState(false);
  const run = useAiRun(workspaceTask, includePeople ? { dataClass: 'people' } : {});
  const [sources, setSources] = useState<Source[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [nothing, setNothing] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);

  // Closing the dialog also stops a meaning search that is still running.
  useEffect(() => () => searchAbort.current?.abort(), []);

  const answer = run.value;
  const citations = useMemo(() => (answer && sources ? checkCitations(answer, sources) : null), [answer, sources]);

  if (!open || !run.enabled) return null;

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    run.reset();
    setSources(null);
    setNothing(false);
    setSearching(true);
    searchAbort.current?.abort();
    const ctrl = new AbortController();
    searchAbort.current = ctrl;
    try {
      const dataClass = includePeople ? 'people' : 'content';
      let picked = retrieve(data, q, { includePeople, limit: CANDIDATES });
      if (picked.length === 0) {
        setNothing(true);
        return;
      }
      const resolved = resolveConnection(data.aiSettings, dataClass, workspaceTask.id);
      // People records go to an embeddings endpoint only on a connection allowed for people data.
      if (resolved.ok && (!includePeople || resolved.connection.allowsPeopleData)) {
        picked = await rerankWithEmbeddings({ settings: resolved.connection.settings, query: q, sources: picked, limit: LIMIT, dataClass, signal: ctrl.signal });
      } else {
        picked = picked.slice(0, LIMIT).map((s, i) => ({ ...s, n: i + 1 }));
      }
      setSources(picked);
      await run.run({ input: { question: q, sources: picked }, stream: true });
    } finally {
      setSearching(false);
    }
  };
  const copy = async () => {
    if (!answer) return;
    if (await copyText(answer)) toast.showSuccess('Copied', 'The answer is on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the text above and copy it by hand.');
  };

  const busy = run.busy || searching;
  const chips: AiContextChip[] = [
    { label: 'Question', detail: `${Math.min(question.trim().length, 1000)} characters`, sent: question.trim().slice(0, 1000) || undefined },
    {
      label: 'Sources',
      detail: sources ? `${sources.length} items` : 'picked when you ask',
      sent: sources?.map((s) => `[${s.n}] ${s.title}\n${s.snippet}`).join('\n\n'),
    },
  ];

  return (
    <AiResultPanel
      open
      title="Ask your workspace"
      connectionLabel={run.connectionLabel || undefined}
      modelLabel={run.modelLabel || undefined}
      chips={chips}
      status={run.blockedView ? 'blocked' : busy ? 'running' : 'ready'}
      message={run.blockedView?.message}
      blockedAction={run.blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: () => run.openSettings(onClose) } : undefined}
      truncated={run.truncated}
      streamText={run.streamText}
      onCopy={answer ? () => void copy() : undefined}
      onClose={onClose}
    >
      {run.fellBack && run.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${run.connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        The best matches in your notes and tasks are found on this computer; only those short excerpts are sent with
        your question. Locked and archived notes are never read.
      </p>
      <label className="field" style={{ marginTop: 0 }}>
        <span>Your question</span>
        <AutoResizeTextarea
          className="textarea"
          value={question}
          onChange={setQuestion}
          minRows={2}
          maxRows={6}
          submitMode="mod"
          onSubmit={() => void ask()}
          disabled={busy}
          ariaLabel="Your question"
        />
      </label>
      {features.aiPeople ? (
        <label style={{ display: 'block', marginTop: 8 }}>
          <input type="checkbox" checked={includePeople} onChange={(e) => setIncludePeople(e.target.checked)} disabled={busy} /> Include people
          records (1:1 notes, goals, feedback). This sends them as people data.
        </label>
      ) : null}
      <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
        <Button
          type="button"
          variant="primary"
          icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
          onClick={() => void ask()}
          disabled={busy || !question.trim()}
        >
          Ask
        </Button>
      </div>
      {nothing ? <p>Nothing in your notes and tasks matches that question, so there is nothing to answer from.</p> : null}
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
      {answer ? <pre className="ai-digest__text">{answer}</pre> : null}
      {citations && citations.unknown.length > 0 ? (
        <p className="muted small" role="status">
          {`The answer cites a source that was not given: ${citations.unknown.map((n) => `[${n}]`).join(' ')}. Check it before relying on it.`}
        </p>
      ) : null}
      {answer && sources && sources.length > 0 ? (
        <section aria-label="Sources">
          <h4 className="ai-challenge__title">Sources</h4>
          <ul className="ai-challenge__list">
            {sources.map((s) => (
              <li key={`${s.kind}-${s.id}`}>
                {`[${s.n}] `}
                {s.href ? (
                  <Link to={s.href} onClick={onClose}>
                    {s.title}
                  </Link>
                ) : (
                  s.title
                )}
                <span className="muted small">{` · ${KIND_LABEL[s.kind]}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AiResultPanel>
  );
}
