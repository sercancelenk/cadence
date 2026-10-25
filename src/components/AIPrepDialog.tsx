import { useMemo, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { copyText } from '../lib/clipboard';
import { collectPersonContext, describePersonContext } from '../lib/ai/personContext';
import { prepTask, type PrepOut } from '../lib/ai/prompts/prep';
import { useAiRun } from '../lib/ai/useAiRun';
import type { RichTextBodyFields } from '../lib/richTextBody';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  personId: string;
  /** Adds the preparation to the person as one note item; false when it could not be saved. */
  onAdd: (fields: RichTextBodyFields & { title: string; category: string }) => boolean;
};

const SECTIONS: { key: keyof PrepOut; heading: string }[] = [
  { key: 'followUps', heading: 'Follow-ups' },
  { key: 'openGoals', heading: 'Open goals' },
  { key: 'feedbackToGive', heading: 'Feedback to give' },
  { key: 'questions', heading: 'Questions to ask' },
];

const toMarkdown = (out: PrepOut): string =>
  SECTIONS.filter((s) => out[s.key].length > 0)
    .map((s) => `## ${s.heading}\n${out[s.key].map((i) => `- ${i}`).join('\n')}`)
    .join('\n\n');

const dayLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * "Prepare a 1:1": follow-ups, open goals, feedback to give and questions, from this person's
 * recorded items. That is people data, so only a connection allowed for it is used. The person's
 * name is never sent. Nothing is saved unless the user adds the result as one note item.
 */
export function AIPrepDialog({ open, onClose, personId, onAdd }: Props) {
  const { data } = useAppData();
  const run = useAiRun(prepTask);
  const toast = useToast();
  const [weeks, setWeeks] = useState(8);
  const now = useMemo(() => new Date(), []);
  const context = useMemo(() => collectPersonContext(data, personId, { now, weeks }), [data, personId, now, weeks]);
  const contextText = useMemo(() => describePersonContext(context), [context]);

  if (!open || !run.enabled) return null;

  const out = run.value;
  const prepare = () => void run.run({ input: { context: contextText } });
  const add = () => {
    if (!out || run.truncated) return;
    const body = toMarkdown(out);
    const saved = onAdd({ title: `1:1 prep · ${dayLabel(now)}`, body, bodyFormat: 'markdown', bodyPlainText: body, category: '1:1' });
    if (!saved) {
      run.setError({ message: 'The note could not be saved (saving is blocked right now). Nothing was changed.' });
      return;
    }
    toast.showSuccess('Added to this person', 'It is a new note in their records.');
    onClose();
  };
  const copy = async () => {
    if (!out) return;
    if (await copyText(toMarkdown(out))) toast.showSuccess('Copied', 'The preparation is on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the text above and copy it by hand.');
  };

  const chips: AiContextChip[] = [
    { label: 'People data', detail: `1 person · last ${weeks} weeks`, sent: contextText },
  ];
  const empty = context.entries.length === 0;

  return (
    <AiResultPanel
      open
      title="Prepare a 1:1"
      connectionLabel={run.connectionLabel || undefined}
      modelLabel={run.modelLabel || undefined}
      chips={chips}
      status={run.blockedView ? 'blocked' : run.busy ? 'running' : 'ready'}
      message={run.blockedView?.message}
      blockedAction={run.blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: () => run.openSettings(onClose) } : undefined}
      truncated={run.truncated}
      applyLabel="Add as a note"
      onApply={out ? add : undefined}
      applyDisabled={run.truncated}
      onCopy={out ? () => void copy() : undefined}
      onRegenerate={out ? prepare : undefined}
      onClose={onClose}
    >
      {run.fellBack && run.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${run.connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        Built from this person’s recorded tasks, goals, notes and feedback. Their name is not sent, and nothing is saved
        unless you add the result as a note.
      </p>
      {!out ? (
        <>
          {empty ? <p>There is nothing recorded for this person in that period, so there is nothing to prepare from.</p> : null}
          <label className="field" style={{ marginTop: 0 }}>
            <span>Period</span>
            <select className="input" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} disabled={run.busy} aria-label="Period">
              <option value={4}>Last 4 weeks</option>
              <option value={8}>Last 8 weeks</option>
              <option value={12}>Last 12 weeks</option>
            </select>
          </label>
          <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
            <Button
              type="button"
              variant="primary"
              icon={run.busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
              onClick={prepare}
              disabled={run.busy || empty}
            >
              Prepare
            </Button>
          </div>
        </>
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
      {out
        ? SECTIONS.filter((s) => out[s.key].length > 0).map((s) => (
            <section key={s.key} className="ai-challenge__section">
              <h4 className="ai-challenge__title">{s.heading}</h4>
              <ul className="ai-challenge__list">
                {out[s.key].map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))
        : null}
    </AiResultPanel>
  );
}
