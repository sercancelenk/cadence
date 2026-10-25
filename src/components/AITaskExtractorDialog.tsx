import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { hasUsableConnection } from '../lib/ai/connections';
import { extractTask, type ExtractedRow } from '../lib/ai/prompts/extract';
import { runAiTask } from '../lib/ai/runTask';
import { useFeatures } from '../lib/features';
import { fromLocalDatetimeValue } from '../lib/datetime';
import { PATH_SETTINGS } from '../lib/routes';
import { defaultTodoGroupId } from '../lib/todoGroupPick';
import type { Priority, TodoGroup } from '../model';
import { PRIORITY_OPTIONS } from '../model';
import { noteDisplayTitle } from '../features/notes/noteDisplay';
import { Button } from './ui/Button';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { AiResultPanel } from './ai/AiResultPanel';
import { AiLegacyNotice } from './ai/AiLegacyNotice';
import type { AiContextChip } from './ai/AiContextChips';
import { IcCheck, IcPlus, IcRefresh, IcSparkles, IcTrash } from './icons';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pre-selected target list. Falls back to the first available group. */
  defaultGroupId?: string;
  /**
   * When the extractor is launched from a specific note, every task
   * we create gets a `sourceNoteId` (and a `noteTodoLinks` join row).
   * Both sides surface the link via shared EntityLinkPills.
   */
  sourceNoteId?: string;
  /**
   * Optional pre-filled notes content. When the extractor is opened
   * from a note we seed the textarea with that note's body so the
   * user can review/trim before running extraction instead of pasting
   * it themselves.
   */
  initialNotes?: string;
};

type Row = {
  /** Local UI id (separate from any future server id) so React keys are stable across edits. */
  rowId: string;
  title: string;
  notes?: string;
  priority?: Priority;
  /** `YYYY-MM-DD`, from the model only when the source stated an unambiguous date. */
  due?: string;
  groupId: string;
  added: boolean;
};

const MAX_NOTES_CHARS = 16_000;

/**
 * "Brain dump → tasks". The user pastes a wall of notes; the `ai.extract` task asks the
 * configured model for a structured list; the user edits titles, lists and dates and adds
 * rows one by one or all at once.
 *
 * - Nothing is added automatically: the model can hallucinate, duplicate or misclassify, so
 *   the user is always the final filter.
 * - The prompt is an internal, versioned asset (`src/lib/ai/prompts/extract.ts`); the user
 *   never sees or edits it. A stored legacy `extractionGuidance` is still passed, as a
 *   constrained focus note.
 * - Errors are shown inline (not in a separate state) so the pasted notes stay editable.
 */
export function AITaskExtractorDialog({ open, onClose, defaultGroupId, sourceNoteId, initialNotes }: Props) {
  const { data, addTodoItem } = useAppData();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const aiSettings = data.aiSettings;
  const groups = data.todoGroups;

  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; diagnostic?: string } | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; canOpenSettings: boolean } | null>(null);
  const [connectionLabel, setConnectionLabel] = useState('');
  const [modelLabel, setModelLabel] = useState('');
  const [fellBack, setFellBack] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const rowSeq = useRef(0);

  // Each time the dialog reopens we want a clean slate. When the host passes `initialNotes`
  // (opening the extractor from a specific note) the textarea is pre-filled so the user can
  // review before running extraction.
  useEffect(() => {
    if (!open) return;
    setNotes(initialNotes ?? '');
    setRows([]);
    setBusy(false);
    setError(null);
    setBlocked(null);
    setConnectionLabel('');
    setFellBack(false);
    setTruncated(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open, initialNotes]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const fallbackGroupId = useMemo(() => {
    if (defaultGroupId && groups.some((g) => g.id === defaultGroupId)) return defaultGroupId;
    // The first list in the lists' own order that is not archived, so added tasks stay visible.
    return defaultTodoGroupId(groups) ?? '';
  }, [defaultGroupId, groups]);

  const listsForModel = useMemo(
    () => groups.filter((g) => !g.archived).map((g) => ({ id: g.id, name: g.name })),
    [groups],
  );

  if (!open) return null;
  // Defence in depth — refuse to render if the AI feature is disabled by policy, even if a
  // parent route forgot to gate the entry-point button.
  if (!features.ai) return null;

  const configured = hasUsableConnection(aiSettings);

  const extract = async () => {
    const text = notes.trim();
    if (!text) {
      setError({ message: 'Paste some notes first.' });
      return;
    }
    setBusy(true);
    setError(null);
    setBlocked(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await runAiTask({
        task: extractTask,
        input: { notes: text, lists: listsForModel },
        settings: aiSettings,
        features: { ai: features.ai, aiPeople: features.aiPeople, aiFocusNote: features.aiFocusNote },
        legacyFocusNote: aiSettings?.extractionGuidance,
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
      // Tasks already added stay as they are. A new run must not offer them again, or Add all
      // would create them twice.
      const keptAdded = rows.filter((r) => r.added);
      const alreadyAdded = new Set(keptAdded.map((r) => normalizeTitle(r.title)));
      const fresh = result.value
        .map((r) => toRow(r, groups, fallbackGroupId, rowSeq))
        .filter((r) => !alreadyAdded.has(normalizeTitle(r.title)));
      if (fresh.length === 0) {
        setError({
          message:
            keptAdded.length > 0
              ? 'No new tasks beyond the ones you already added.'
              : 'AI did not find any actionable tasks in those notes.',
        });
      }
      setRows([...keptAdded, ...fresh]);
    } finally {
      // Only the newest request may clear the busy flag and the abort handle.
      if (abortRef.current === ctrl) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  };

  const patchRow = (rowId: string, patch: Partial<Row>) => {
    setRows((cur) => cur.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };
  const removeRow = (rowId: string) => {
    setRows((cur) => cur.filter((r) => r.rowId !== rowId));
  };

  /**
   * Build the `extras` blob passed to `addTodoItem`. `sourceNoteId` is included here (and not
   * at the call site) so the single-row and bulk paths can't drift out of sync.
   */
  const extrasFor = (row: Row): Parameters<typeof addTodoItem>[2] => {
    const out: NonNullable<Parameters<typeof addTodoItem>[2]> = {};
    if (row.priority) out.priority = row.priority;
    if (sourceNoteId) out.sourceNoteId = sourceNoteId;
    // A date without a time is stored at local midday so it can never slip to the next day.
    const dueAt = row.due ? fromLocalDatetimeValue(`${row.due}T12:00`) : undefined;
    if (dueAt) out.dueAt = dueAt;
    // The model's one-line note ("by Friday", the recipient) goes into the task, not just the preview.
    const note = row.notes?.trim();
    if (note) {
      out.body = note;
      out.bodyFormat = 'markdown';
      out.bodyPlainText = note;
    }
    return Object.keys(out).length ? out : undefined;
  };

  const notSaved = {
    message:
      'A task could not be saved (saving is blocked right now). Nothing was marked as added for it; try again in a moment.',
  };

  const addRow = (row: Row) => {
    if (truncated || !row.groupId || row.added || !row.title.trim()) return;
    if (addTodoItem(row.groupId, row.title.trim(), extrasFor(row)) === false) {
      setError(notSaved);
      return;
    }
    patchRow(row.rowId, { added: true });
  };

  const addAll = () => {
    if (truncated) return;
    const target = rows.filter((r) => !r.added && r.title.trim() && r.groupId);
    if (target.length === 0) return;
    const done = new Set<string>();
    for (const r of target) {
      if (addTodoItem(r.groupId, r.title.trim(), extrasFor(r)) === false) {
        setError(notSaved);
        break;
      }
      done.add(r.rowId);
    }
    setRows((cur) => cur.map((r) => (done.has(r.rowId) ? { ...r, added: true } : r)));
  };

  const setBulkGroup = (groupId: string) => {
    setRows((cur) => cur.map((r) => (r.added ? r : { ...r, groupId })));
  };

  const pendingCount = rows.filter((r) => !r.added).length;
  const addedCount = rows.filter((r) => r.added).length;
  const noGroups = groups.length === 0;

  const sourceNote = sourceNoteId ? data.notes.find((n) => n.id === sourceNoteId) : undefined;
  const chips: AiContextChip[] = [
    {
      label: 'Notes',
      detail: `${Math.min(notes.trim().length, MAX_NOTES_CHARS)} characters`,
      sent: notes.trim().slice(0, MAX_NOTES_CHARS) || undefined,
    },
    {
      label: 'Lists',
      detail: listsForModel.map((l) => l.name).join(', ') || 'none',
      sent: listsForModel.map((l) => l.name).join('\n') || undefined,
    },
    ...(sourceNoteId
      ? [
          {
            label: 'From note',
            detail: `${sourceNote ? noteDisplayTitle(sourceNote) : 'Untitled note'}${
              sourceNote?.locked ? ' (unlocked this session, so its text is included)' : ''
            }`,
          },
        ]
      : []),
  ];

  const openSettings = () => {
    onClose();
    navigate(`${PATH_SETTINGS}#ai`);
  };

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
      title="Extract tasks from notes"
      connectionLabel={connectionLabel || undefined}
      modelLabel={modelLabel || undefined}
      chips={chips}
      status={blockedView ? 'blocked' : busy ? 'running' : 'ready'}
      message={blockedView?.message}
      blockedAction={blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: openSettings } : undefined}
      truncated={truncated}
      closeLabel={addedCount > 0 ? 'Close' : undefined}
      applyLabel={`Add all (${pendingCount})`}
      onApply={rows.length > 0 && pendingCount > 0 ? addAll : undefined}
      applyDisabled={truncated}
      onRegenerate={rows.length > 0 ? () => void extract() : undefined}
      onClose={onClose}
    >
      <AiLegacyNotice active={features.aiFocusNote && !!aiSettings?.extractionGuidance?.trim()} />
      {fellBack && connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        {sourceNoteId
          ? `Every task you add keeps a link back to “${sourceNote ? noteDisplayTitle(sourceNote) : 'this note'}”.`
          : 'Paste a brain dump, meeting transcript or Slack thread. The assistant turns it into crisp tasks you can drop into any of your lists.'}
      </p>
      {noGroups ? (
        <div className="ai-dialog__empty">
          <p>You don't have any to-do lists yet.</p>
          <p className="muted small">Create a list first; then come back and the extracted tasks will land in it.</p>
        </div>
      ) : (
        <>
          <label className="field" style={{ marginTop: 0 }}>
            <span>Notes</span>
            <AutoResizeTextarea
              className="textarea"
              placeholder="Paste meeting notes, voice-memo transcript, your weekend brain dump — anything. Up to ~16k characters."
              value={notes}
              onChange={setNotes}
              minRows={6}
              maxRows={14}
              submitMode="mod"
              onSubmit={() => void extract()}
              disabled={busy}
              ariaLabel="Notes to extract tasks from"
            />
          </label>

          <div className="row" style={{ marginTop: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="primary"
              icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
              onClick={() => void extract()}
              disabled={busy || !notes.trim()}
            >
              {rows.length > 0 ? 'Re-extract' : 'Extract tasks'}
            </Button>
          </div>

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

          {rows.length > 0 ? (
            <>
              <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                <label className="todos-toolbar__filter" style={{ marginLeft: 'auto' }}>
                  <span className="muted small">Add all to</span>
                  <select
                    className="input"
                    value={pendingCount === 0 ? '' : (rows.find((r) => !r.added)?.groupId ?? fallbackGroupId)}
                    onChange={(e) => setBulkGroup(e.target.value)}
                    disabled={pendingCount === 0}
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {labelForGroup(g)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <ul className="ai-extract-list">
                {rows.map((r) => (
                  <li key={r.rowId} className={`ai-extract-row ${r.added ? 'ai-extract-row--added' : ''}`}>
                    <div className="ai-extract-row__main">
                      <AutoResizeTextarea
                        className="textarea"
                        value={r.title}
                        onChange={(v) => patchRow(r.rowId, { title: v })}
                        minRows={1}
                        maxRows={4}
                        submitMode="mod"
                        disabled={r.added}
                        ariaLabel="Task title"
                      />
                      {r.notes ? (
                        <p className="muted small" style={{ margin: '4px 0 0' }}>
                          {r.notes}
                        </p>
                      ) : null}
                    </div>

                    <div className="ai-extract-row__meta">
                      <select
                        className="input"
                        value={r.priority ?? ''}
                        onChange={(e) =>
                          patchRow(r.rowId, { priority: (e.target.value || undefined) as Priority | undefined })
                        }
                        disabled={r.added}
                        aria-label="Priority"
                      >
                        <option value="">No priority</option>
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="input"
                        value={r.due ?? ''}
                        onChange={(e) => patchRow(r.rowId, { due: e.target.value || undefined })}
                        disabled={r.added}
                        aria-label="Due date"
                      />
                      <select
                        className="input"
                        value={r.groupId}
                        onChange={(e) => patchRow(r.rowId, { groupId: e.target.value })}
                        disabled={r.added}
                        aria-label="Target list"
                      >
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {labelForGroup(g)}
                          </option>
                        ))}
                      </select>
                      {r.added ? (
                        <span className="ai-extract-row__added">
                          <IcCheck size={14} /> Added
                        </span>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            icon={<IcPlus size={14} />}
                            onClick={() => addRow(r)}
                            disabled={truncated || !r.title.trim() || !r.groupId}
                          >
                            Add
                          </Button>
                          <button
                            type="button"
                            className="ai-extract-row__discard"
                            aria-label="Discard"
                            title="Discard"
                            onClick={() => removeRow(r.rowId)}
                          >
                            <IcTrash size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {addedCount > 0 ? (
                <p className="muted small" style={{ marginTop: 10 }}>
                  {addedCount} task{addedCount === 1 ? '' : 's'} added so far. You can close this dialog any time —
                  everything is already saved.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </AiResultPanel>
  );
}

const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

/** Match the model's list name to a real, non-archived list; otherwise the default list. */
function toRow(t: ExtractedRow, groups: TodoGroup[], fallbackGroupId: string, seqRef: { current: number }): Row {
  const wanted = t.list?.trim().toLowerCase();
  const match = wanted ? groups.find((g) => !g.archived && g.name.trim().toLowerCase() === wanted) : undefined;
  return {
    rowId: `r${++seqRef.current}`,
    title: t.title,
    notes: t.notes,
    priority: t.priority as Priority | undefined,
    due: t.due,
    groupId: match?.id ?? fallbackGroupId,
    added: false,
  };
}

function labelForGroup(g: TodoGroup): string {
  if (g.archived) return `${g.name} (archived)`;
  if (g.pinned) return `★ ${g.name}`;
  return g.name;
}
