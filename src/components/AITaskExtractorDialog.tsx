import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { AIError, extractTasksFromNotes, isAIConfigured } from '../lib/ai';
import type { ExtractedTask } from '../lib/ai';
import { useFeatures } from '../lib/features';
import type { Priority, TodoGroup } from '../model';
import { PRIORITY_OPTIONS } from '../model';
import { Button } from './ui/Button';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { IcCheck, IcPlus, IcRefresh, IcSparkles, IcTrash, IcX } from './icons';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pre-selected target list. Falls back to the first available group. */
  defaultGroupId?: string;
};

type Row = {
  /** Local UI id (separate from any future server id) so React keys are stable across edits. */
  rowId: string;
  title: string;
  notes?: string;
  priority?: Priority;
  groupId: string;
  added: boolean;
};

/**
 * "Brain dump → tasks" assistant. The user pastes a wall of notes; we ask the
 * configured LLM to return a structured JSON list of tasks; the user edits
 * titles, picks target lists, and clicks Add (per row or all at once).
 *
 * Design notes:
 *   - We deliberately do NOT auto-add anything. The model can hallucinate,
 *     duplicate, or misclassify, so the user is always the final filter.
 *   - "Added" rows stay in the list but turn into a muted, non-editable
 *     summary so the user can see what's already in the workspace.
 *   - We reuse the .ai-dialog backdrop/dialog CSS to keep the look consistent
 *     with the existing per-task AI assistant.
 */
export function AITaskExtractorDialog({ open, onClose, defaultGroupId }: Props) {
  const { data, addTodoItem, updateAISettings } = useAppData();
  const { features } = useFeatures();
  const aiSettings = data.aiSettings;
  const groups = data.todoGroups;

  const [notes, setNotes] = useState('');
  const [guidance, setGuidance] = useState('');
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const rowSeq = useRef(0);

  // Each time the dialog reopens we want a clean slate — except for the
  // persisted user guidance, which is restored from the last extraction.
  useEffect(() => {
    if (!open) return;
    setNotes('');
    setRows([]);
    setBusy(false);
    setError('');
    const remembered = aiSettings?.extractionGuidance ?? '';
    setGuidance(remembered);
    setGuidanceOpen(remembered.trim().length > 0);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open, aiSettings?.extractionGuidance]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const fallbackGroupId = useMemo(() => {
    if (defaultGroupId && groups.some((g) => g.id === defaultGroupId)) return defaultGroupId;
    return groups[0]?.id ?? '';
  }, [defaultGroupId, groups]);

  if (!open) return null;
  // Defence in depth — refuse to render if the AI feature is disabled
  // by policy, even if a parent route forgot to gate the entry-point
  // button. See the same guard in AIAssistantDialog.
  if (!features.ai) return null;

  const extract = async () => {
    if (!features.ai) {
      setError('AI is disabled by your organization policy.');
      return;
    }
    if (!isAIConfigured(aiSettings)) {
      setError('AI is not configured. Open Settings → AI Assistant to add a provider and key.');
      return;
    }
    const text = notes.trim();
    if (!text) {
      setError('Paste some notes first.');
      return;
    }
    setBusy(true);
    setError('');
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Persist the guidance so the next open remembers it. Empty string clears.
    const trimmedGuidance = guidance.trim();
    if ((aiSettings?.extractionGuidance ?? '') !== trimmedGuidance) {
      updateAISettings({ extractionGuidance: trimmedGuidance || undefined });
    }
    try {
      const tasks = await extractTasksFromNotes({
        settings: aiSettings,
        notes: text,
        userGuidance: trimmedGuidance || undefined,
        signal: ctrl.signal,
      });
      if (tasks.length === 0) {
        setError('AI did not find any actionable tasks in those notes.');
        setRows([]);
        return;
      }
      setRows(tasks.map((t) => toRow(t, fallbackGroupId, rowSeq)));
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        // user cancelled
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

  const patchRow = (rowId: string, patch: Partial<Row>) => {
    setRows((cur) => cur.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };
  const removeRow = (rowId: string) => {
    setRows((cur) => cur.filter((r) => r.rowId !== rowId));
  };

  const addRow = (row: Row) => {
    if (!row.groupId || row.added || !row.title.trim()) return;
    addTodoItem(row.groupId, row.title.trim(), row.priority ? { priority: row.priority } : undefined);
    patchRow(row.rowId, { added: true });
  };

  const addAll = () => {
    const target = rows.filter((r) => !r.added && r.title.trim() && r.groupId);
    if (target.length === 0) return;
    for (const r of target) {
      addTodoItem(r.groupId, r.title.trim(), r.priority ? { priority: r.priority } : undefined);
    }
    setRows((cur) => cur.map((r) => (target.includes(r) ? { ...r, added: true } : r)));
  };

  const setBulkGroup = (groupId: string) => {
    setRows((cur) => cur.map((r) => (r.added ? r : { ...r, groupId })));
  };

  const pendingCount = rows.filter((r) => !r.added).length;
  const addedCount = rows.filter((r) => r.added).length;
  const noGroups = groups.length === 0;

  return (
    <div className="ai-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ai-dialog ai-dialog--wide" onClick={(e) => e.stopPropagation()}>
        <header className="ai-dialog__header">
          <span className="ai-dialog__icon">
            <IcSparkles size={18} />
          </span>
          <div className="ai-dialog__titlewrap">
            <h2 className="ai-dialog__title">Extract tasks from notes</h2>
            <p className="ai-dialog__sub">
              Paste a brain dump, meeting transcript or Slack thread. The assistant turns it into a list of crisp tasks
              you can drop into any of your lists.
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
        ) : noGroups ? (
          <div className="ai-dialog__empty">
            <p>You don't have any to-do lists yet.</p>
            <p className="muted small">Create a list first; then come back and the extracted tasks will land in it.</p>
          </div>
        ) : (
          <div className="ai-dialog__scroll">
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

            <details
              className="ai-extract-guidance"
              open={guidanceOpen}
              onToggle={(e) => setGuidanceOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>
                <span className="ai-extract-guidance__label">
                  <span className="ai-extract-guidance__chev" aria-hidden>▸</span>
                  Custom guidance for the AI
                </span>
                <span className="muted small">
                  {guidance.trim() ? 'on' : 'optional'}
                </span>
              </summary>
              <p className="muted small" style={{ marginTop: 6, marginBottom: 6 }}>
                Steer the extractor without weakening the JSON contract. Examples:
                {' '}<em>"Only this week's deliverables"</em>,{' '}
                <em>"Skip personal/social items"</em>,{' '}
                <em>"Cevapları Türkçe ver"</em>.
              </p>
              <AutoResizeTextarea
                className="textarea"
                placeholder="e.g. Only emit tasks assigned to me; ignore items owned by other teammates."
                value={guidance}
                onChange={setGuidance}
                minRows={2}
                maxRows={6}
                submitMode="never"
                disabled={busy}
                ariaLabel="Custom guidance for the extractor"
              />
              <p className="muted small" style={{ marginTop: 4 }}>
                Your guidance is remembered on this device for next time. Leave blank to clear.
              </p>
            </details>

            <div className="row" style={{ marginTop: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="primary"
                icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
                onClick={() => void extract()}
                disabled={busy || !notes.trim()}
              >
                {busy ? 'Extracting…' : rows.length > 0 ? 'Re-extract' : 'Extract tasks'}
              </Button>
              {busy ? (
                <Button type="button" variant="ghost" onClick={() => abortRef.current?.abort()}>
                  Stop
                </Button>
              ) : null}
              <span className="muted small" style={{ alignSelf: 'center' }}>
                Your task title{notes ? 's' : ''} and notes are sent to {providerLabel(aiSettings.provider)}.
              </span>
            </div>

            {error ? <div className="ai-dialog__error" style={{ marginBottom: 12 }}>{error}</div> : null}

            {rows.length > 0 ? (
              <>
                <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                  <label className="todos-toolbar__select" style={{ marginLeft: 'auto' }}>
                    <span className="muted small">Add all to</span>
                    <select
                      className="input"
                      value={pendingCount === 0 ? '' : rows.find((r) => !r.added)?.groupId ?? fallbackGroupId}
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
                  <Button
                    type="button"
                    variant="primary"
                    icon={<IcPlus size={16} />}
                    onClick={addAll}
                    disabled={pendingCount === 0}
                  >
                    Add all ({pendingCount})
                  </Button>
                </div>

                <ul className="ai-extract-list">
                  {rows.map((r) => (
                    <li
                      key={r.rowId}
                      className={`ai-extract-row ${r.added ? 'ai-extract-row--added' : ''}`}
                    >
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
                            patchRow(r.rowId, {
                              priority: (e.target.value || undefined) as Priority | undefined,
                            })
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
                              disabled={!r.title.trim() || !r.groupId}
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
            ) : !busy ? (
              <p className="muted small" style={{ marginTop: 4 }}>
                Tip: keep ⌘/Ctrl + Enter as a shortcut to fire the extraction without leaving the textarea.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function toRow(t: ExtractedTask, fallbackGroupId: string, seqRef: { current: number }): Row {
  return {
    rowId: `r${++seqRef.current}`,
    title: t.title,
    notes: t.notes,
    priority: t.priority as Priority | undefined,
    groupId: fallbackGroupId,
    added: false,
  };
}

function labelForGroup(g: TodoGroup): string {
  if (g.archived) return `${g.name} (archived)`;
  if (g.pinned) return `★ ${g.name}`;
  return g.name;
}

function providerLabel(p: string | undefined): string {
  if (p === 'anthropic') return 'Anthropic';
  if (p === 'openai') return 'OpenAI';
  if (p === 'gemini') return 'Google Gemini';
  return 'your AI provider';
}
