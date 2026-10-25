import { useMemo, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { copyText } from '../lib/clipboard';
import { collectActivity, describeActivity } from '../lib/ai/digest';
import { digestTask } from '../lib/ai/prompts/digest';
import { useAiRun } from '../lib/ai/useAiRun';
import { plainTextFromBodyFields } from '../lib/richTextBody';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Saves the summary as a new note; the new note's id, or null when it could not be saved. */
  onSave: (title: string, markdown: string) => string | null;
  /** Which kind of summary to start with; a retrospective when not given. */
  initialMode?: Mode;
};

type Mode = 'retro' | 'upward';
const MAX_NOTES = 5;
const MODE_TITLE: Record<Mode, string> = { retro: 'Retrospective', upward: 'Status update' };
const dayLabel = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * "Weekly digest": a retrospective, or a status update to send upward, written from counts and
 * titles of what happened. Note text is sent only for notes the user ticks. People records and
 * locked notes are never read.
 */
export function AIDigestDialog({ open, onClose, onSave, initialMode = 'retro' }: Props) {
  const { data } = useAppData();
  const run = useAiRun(digestTask);
  const toast = useToast();
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const now = useMemo(() => new Date(), []);
  const activity = useMemo(() => collectActivity(data, { now, days }), [data, now, days]);
  const activityText = useMemo(() => describeActivity(activity), [activity]);
  const candidates = useMemo(
    () => (data.notes ?? []).filter((n) => !n.locked && !n.archived && activity.notes.some((a) => a.title && a.title === n.title.replace(/\s+/g, ' ').trim().slice(0, 120))).slice(0, 30),
    [data.notes, activity.notes],
  );

  if (!open || !run.enabled) return null;

  // Ticks for notes the chosen period no longer lists do not count against the limit.
  const visiblePicked = candidates.filter((n) => picked.has(n.id));
  const chosen = visiblePicked
    .slice(0, MAX_NOTES)
    .map((n) => ({ title: n.title, text: plainTextFromBodyFields(n) }));
  // With nothing to go on a model could only make something up, so no summary is asked for.
  const quiet = Object.values(activity.counts).every((n) => n === 0) && chosen.length === 0;
  const write = () => void run.run({ input: { activity: activityText, notes: chosen }, options: { mode }, stream: true });
  const text = run.value;
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else if (visiblePicked.length < MAX_NOTES) next.add(id);
      return next;
    });
  const save = () => {
    if (!text || run.truncated) return;
    const id = onSave(`${MODE_TITLE[mode]} ${dayLabel(now)}`, text);
    if (id === null) {
      run.setError({ message: 'The note could not be saved (saving is blocked right now). Nothing was changed.' });
      return;
    }
    toast.showSuccess('Saved as a note', 'You can find it at the top of your notes.');
    onClose();
  };
  const copy = async () => {
    if (!text) return;
    if (await copyText(text)) toast.showSuccess('Copied', 'The summary is on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the text above and copy it by hand.');
  };

  const c = activity.counts;
  const chips: AiContextChip[] = [
    { label: 'Activity', detail: `${c.done} done, ${c.created} created, ${c.overdue} overdue, ${c.notes} notes edited`, sent: activityText },
    ...(chosen.length ? [{ label: 'Note text', detail: `${chosen.length} ${chosen.length === 1 ? 'note' : 'notes'}`, sent: chosen.map((n) => `${n.title}\n${n.text}`).join('\n\n') }] : []),
  ];

  return (
    <AiResultPanel
      open
      title="Weekly digest"
      connectionLabel={run.connectionLabel || undefined}
      modelLabel={run.modelLabel || undefined}
      chips={chips}
      status={run.blockedView ? 'blocked' : run.busy ? 'running' : 'ready'}
      message={run.blockedView?.message}
      blockedAction={run.blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: () => run.openSettings(onClose) } : undefined}
      truncated={run.truncated}
      streamText={run.streamText}
      applyLabel="Save as a note"
      onApply={text ? save : undefined}
      applyDisabled={run.truncated}
      onCopy={text ? () => void copy() : undefined}
      onRegenerate={text ? write : undefined}
      onClose={onClose}
    >
      {run.fellBack && run.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${run.connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        Written from the titles and counts of your tasks and notes. People records and locked notes are never read, and
        a note’s text is sent only if you tick it.
      </p>
      {!text ? (
        <>
          <div className="row" style={{ gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
            <label className="field" style={{ marginTop: 0 }}>
              <span>Period</span>
              <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={run.busy} aria-label="Period">
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </label>
            <fieldset className="field" style={{ marginTop: 0, border: 0, padding: 0 }}>
              <legend className="muted small">Kind</legend>
              <label style={{ marginRight: 12 }}>
                <input type="radio" name="digest-mode" checked={mode === 'retro'} onChange={() => setMode('retro')} disabled={run.busy} /> Retrospective
              </label>
              <label>
                <input type="radio" name="digest-mode" checked={mode === 'upward'} onChange={() => setMode('upward')} disabled={run.busy} /> Status update
              </label>
            </fieldset>
          </div>
          {candidates.length > 0 ? (
            <fieldset className="field" style={{ border: 0, padding: 0 }}>
              <legend className="muted small">{`Also include the text of a note (up to ${MAX_NOTES})`}</legend>
              {candidates.map((n) => (
                <label key={n.id} style={{ display: 'block' }}>
                  <input type="checkbox" checked={picked.has(n.id)} onChange={() => toggle(n.id)} disabled={run.busy || (!picked.has(n.id) && visiblePicked.length >= MAX_NOTES)} /> {n.title}
                </label>
              ))}
            </fieldset>
          ) : null}
          {quiet ? (
            <p className="muted small" role="status">
              {`Nothing to summarise: no tasks or notes changed in the last ${days} days. Try a longer period.`}
            </p>
          ) : null}
          <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
            <Button
              type="button"
              variant="primary"
              icon={run.busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
              onClick={write}
              disabled={run.busy || quiet}
            >
              Write summary
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
      {text ? <pre className="ai-digest__text">{text}</pre> : null}
    </AiResultPanel>
  );
}
