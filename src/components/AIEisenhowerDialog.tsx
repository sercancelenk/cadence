import { useMemo, useRef, useState } from 'react';
import { legacyBodyPlainText } from '../features/todos/todoBody';
import { toLocalDatetimeValue } from '../lib/datetime';
import { eisenhowerTask, type EisenhowerItem } from '../lib/ai/prompts/eisenhower';
import { planningQuadrantFromItem, PLANNING_QUADRANT_META } from '../lib/planningMatrix';
import { useAiRun } from '../lib/ai/useAiRun';
import type { TodoGroup, TodoItem } from '../model';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { Button } from './ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The unsorted tasks to classify. */
  tasks: TodoItem[];
  groups: TodoGroup[];
  /** Writes the two axes for the accepted rows; false when saving did not happen. */
  onApply: (assignments: Array<{ id: string; important: boolean; urgent: boolean }>) => boolean;
  /** Team members a task can be handed to. Only names are shown here; they are never sent to the model. */
  delegates?: Array<{ id: string; name: string; teamName?: string }>;
  /** Adds one new task for that person (title only); false when saving did not happen. */
  onDelegate?: (personId: string, title: string) => boolean;
  /** The notes a task is linked to (title and start of the text); sent with the task as background. */
  notesFor?: (taskId: string) => Array<{ title: string; text: string }>;
};

const MAX_TASKS = 40;

type Row = {
  id: string;
  important: boolean;
  urgent: boolean;
  reason?: string;
  include: boolean;
};

/**
 * "Classify with AI": suggests the two Eisenhower axes for tasks that have none. Each suggestion
 * can be edited or left out, and nothing is written until Apply. Only the two axes are touched.
 */
export function AIEisenhowerDialog({ open, onClose, tasks, groups, onApply, delegates, onDelegate, notesFor }: Props) {
  const run = useAiRun(eisenhowerTask);
  const [rows, setRows] = useState<Row[]>([]);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [delegated, setDelegated] = useState<Record<string, string>>({});
  const suggested = useRef<Map<string, { important: boolean; urgent: boolean }>>(new Map());

  const sent = useMemo(() => tasks.slice(0, MAX_TASKS), [tasks]);
  const byId = useMemo(() => new Map(sent.map((t) => [t.id, t])), [sent]);
  const groupName = (t: TodoItem) => groups.find((g) => g.id === t.groupId)?.name;

  if (!open || !run.enabled) return null;

  /** Rows the user changed, left out, or picked a delegate for would be lost by asking again. */
  const edited =
    Object.entries(picked).some(([id, person]) => person && !delegated[id]) ||
    rows.some((r) => {
      const was = suggested.current.get(r.id);
      return !r.include || !was || was.important !== r.important || was.urgent !== r.urgent;
    });
  const regenerate = () => {
    if (edited && !window.confirm('Regenerate replaces the suggestions, including the changes you made. Continue?')) return;
    void classify();
  };

  const classify = async () => {
    setRows([]);
    setApplyError(null);
    setPicked({});
    const result = await run.run({
      input: {
        tasks: sent.map((t) => {
          const notes = notesFor?.(t.id) ?? [];
          return {
            id: t.id,
            title: t.title,
            body: legacyBodyPlainText(t) || undefined,
            due: t.dueAt ? toLocalDatetimeValue(t.dueAt).slice(0, 10) || undefined : undefined,
            priority: t.priority,
            list: groupName(t),
            ...(notes.length > 0 ? { notes } : {}),
          };
        }),
      },
    });
    if (result?.ok) {
      const fresh = result.value.filter((i: EisenhowerItem) => byId.has(i.id)).map((i: EisenhowerItem) => ({ ...i, include: true }));
      suggested.current = new Map(fresh.map((r: Row) => [r.id, { important: r.important, urgent: r.urgent }]));
      setRows(fresh);
    }
  };

  const chosen = rows.filter((r) => r.include);
  const apply = () => {
    if (chosen.length === 0 || run.truncated) return;
    if (onApply(chosen.map(({ id, important, urgent }) => ({ id, important, urgent }))) === false) {
      setApplyError('The tasks could not be saved (saving is blocked right now). Nothing was changed.');
      return;
    }
    onClose();
  };

  const delegateTask = (taskId: string) => {
    const title = byId.get(taskId)?.title;
    const person = delegates?.find((d) => d.id === picked[taskId]);
    if (!title || !person || !onDelegate || delegated[taskId]) return;
    if (!onDelegate(person.id, title)) {
      setApplyError(`The task could not be saved for ${person.name} (saving is blocked right now). Nothing was changed.`);
      return;
    }
    setApplyError(null);
    setDelegated((cur) => ({ ...cur, [taskId]: person.name }));
  };
  const listArchived = (t: TodoItem | undefined) => !!t && groups.find((g) => g.id === t.groupId)?.archived === true;
  const canDelegate = !!onDelegate && (delegates?.length ?? 0) > 0;

  const patch = (id: string, change: Partial<Row>) => setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const quadrantTitle = (r: Row) =>
    PLANNING_QUADRANT_META.find(
      (m) =>
        m.id ===
        planningQuadrantFromItem({
          planImportant: r.important,
          planUrgent: r.urgent,
        }),
    )?.title ?? '';
  const missing = sent.filter((t) => !rows.some((r) => r.id === t.id));

  const chips: AiContextChip[] = [
    {
      label: 'Tasks',
      detail: `${sent.length} ${sent.length === 1 ? 'task' : 'tasks'}: titles, details, due dates, priority and list names${notesFor ? ', plus the start of any linked notes' : ''}`,
      sent: sent.map((t) => `${t.title}${t.dueAt ? ` (due ${toLocalDatetimeValue(t.dueAt).slice(0, 10)})` : ''}`).join('\n') || undefined,
    },
  ];

  return (
    <AiResultPanel
      open
      title="Classify with AI"
      connectionLabel={run.connectionLabel || undefined}
      modelLabel={run.modelLabel || undefined}
      chips={chips}
      status={run.blockedView ? 'blocked' : run.busy ? 'running' : 'ready'}
      message={run.blockedView?.message}
      blockedAction={
        run.blockedView?.canOpenSettings
          ? {
              label: 'Open AI settings',
              onClick: () => run.openSettings(onClose),
            }
          : undefined
      }
      truncated={run.truncated}
      closeLabel={rows.length === 0 ? 'Close' : undefined}
      applyLabel={`Apply to ${chosen.length} ${chosen.length === 1 ? 'task' : 'tasks'}`}
      onApply={rows.length > 0 ? apply : undefined}
      applyDisabled={run.truncated || chosen.length === 0}
      onRegenerate={rows.length > 0 ? regenerate : undefined}
      onClose={onClose}
    >
      {run.fellBack && run.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">{`The connection chosen for this was not available, so “${run.connectionLabel}” was used.`}</p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        Suggests whether each task is important and urgent. Only those two settings change, and only for the rows you keep ticked. You can undo it
        right after.
      </p>
      {tasks.length > MAX_TASKS ? (
        <p className="muted small">{`Only the first ${MAX_TASKS} of ${tasks.length} tasks are classified at a time.`}</p>
      ) : null}
      {rows.length === 0 ? (
        <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
          <Button
            type="button"
            variant="primary"
            icon={run.busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
            onClick={() => void classify()}
            disabled={run.busy || sent.length === 0}
          >
            {`Classify ${sent.length} ${sent.length === 1 ? 'task' : 'tasks'}`}
          </Button>
        </div>
      ) : null}

      {run.error || applyError ? (
        <>
          <div className="ai-dialog__error" role="alert" style={{ marginBottom: 12 }}>
            {applyError ?? run.error?.message}
          </div>
          {run.error?.diagnostic && !applyError ? (
            <details className="ai-panel__diagnostic">
              <summary>Diagnostic details</summary>
              <pre>{run.error.diagnostic}</pre>
            </details>
          ) : null}
        </>
      ) : null}

      {rows.length > 0 ? (
        <>
          <ul className="ai-extract-list">
            {rows.map((r) => (
              <li key={r.id} className="ai-extract-row">
                <div className="ai-extract-row__main">
                  <label className="ai-eisenhower__include">
                    <input
                      type="checkbox"
                      checked={r.include}
                      aria-label={`Include ${byId.get(r.id)?.title ?? 'task'}`}
                      onChange={(e) => patch(r.id, { include: e.target.checked })}
                    />
                    <strong>{byId.get(r.id)?.title}</strong>
                  </label>
                  {r.reason ? (
                    <p className="muted small" style={{ margin: '4px 0 0' }}>
                      {r.reason}
                    </p>
                  ) : null}
                  {canDelegate && !r.important && r.urgent && !listArchived(byId.get(r.id)) ? (
                    delegated[r.id] ? (
                      <p className="muted small" style={{ margin: '4px 0 0' }}>{`Added to ${delegated[r.id]} as a task.`}</p>
                    ) : (
                      <div className="row" style={{ gap: 8, marginTop: 6 }}>
                        <select
                          className="input"
                          aria-label={`Delegate ${byId.get(r.id)?.title ?? 'task'} to`}
                          value={picked[r.id] ?? ''}
                          onChange={(e) =>
                            setPicked((cur) => ({
                              ...cur,
                              [r.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Choose a person…</option>
                          {delegates?.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.teamName ? `${d.name} (${d.teamName})` : d.name}
                            </option>
                          ))}
                        </select>
                        <Button type="button" variant="ghost" size="sm" disabled={!picked[r.id]} onClick={() => delegateTask(r.id)}>
                          {`Add as a task for ${delegates?.find((d) => d.id === picked[r.id])?.name ?? '…'}`}
                        </Button>
                      </div>
                    )
                  ) : null}
                </div>
                <div className="ai-extract-row__meta">
                  <label className="small">
                    <input
                      type="checkbox"
                      checked={r.important}
                      onChange={(e) => patch(r.id, { important: e.target.checked })}
                      aria-label="Important"
                    />{' '}
                    Important
                  </label>
                  <label className="small">
                    <input type="checkbox" checked={r.urgent} onChange={(e) => patch(r.id, { urgent: e.target.checked })} aria-label="Urgent" />{' '}
                    Urgent
                  </label>
                  <span className="pill">{quadrantTitle(r)}</span>
                </div>
              </li>
            ))}
          </ul>
          {missing.length > 0 ? (
            <p className="muted small">{`No suggestion for ${missing.length} ${missing.length === 1 ? 'task' : 'tasks'}: ${missing.map((t) => t.title).join(', ')}.`}</p>
          ) : null}
        </>
      ) : null}
    </AiResultPanel>
  );
}
