import { useMemo, useState } from 'react';
import { applyErdProposal, describeErd, diffErdProposal, type ErdProposal } from '../lib/ai/erdAi';
import { erdTask } from '../lib/ai/prompts/erd';
import { useAiRun } from '../lib/ai/useAiRun';
import type { ErdDocument } from '../lib/erd/erdModel';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { Button } from './ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The diagram as it is now. */
  current: ErdDocument;
  /** Receives the diagram with the accepted additions. */
  onApply: (next: ErdDocument) => void;
};

const MAX_REQUEST_CHARS = 4_000;
const lower = (s: string) => s.trim().toLowerCase();

/**
 * "Design with AI": describe tables and relations in words. The suggestion is compared with the
 * diagram, and only additions can be accepted: existing tables, columns and relations are never
 * changed or removed.
 */
export function AIErdDialog({ open, onClose, current, onApply }: Props) {
  const run = useAiRun(erdTask);
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<ErdProposal | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const currentText = useMemo(() => describeErd(current), [current]);
  const diff = useMemo(() => (proposal ? diffErdProposal(current, proposal) : null), [current, proposal]);

  if (!open || !run.enabled) return null;

  const suggest = async () => {
    setProposal(null);
    setOff(new Set());
    const result = await run.run({ input: { request: request.trim(), current: currentText } });
    if (result?.ok) setProposal(result.value);
  };

  const names = diff ? [...diff.newTables.map((t) => t.name), ...diff.extendedTables.map((t) => t.name)] : [];
  const accepted = new Set(names.filter((n) => !off.has(lower(n))).map(lower));
  const nothing = !!diff && names.length === 0 && diff.newRelations.length === 0;
  const toggle = (name: string) =>
    setOff((cur) => {
      const next = new Set(cur);
      if (next.has(lower(name))) next.delete(lower(name));
      else next.add(lower(name));
      return next;
    });
  const apply = () => {
    if (!proposal || run.truncated || accepted.size === 0) return;
    onApply(applyErdProposal(current, proposal, accepted));
    onClose();
  };

  const chips: AiContextChip[] = [
    { label: 'Diagram', detail: `${current.tables.length} ${current.tables.length === 1 ? 'table' : 'tables'}, ${current.relations.length} ${current.relations.length === 1 ? 'relation' : 'relations'}`, sent: currentText },
    { label: 'Request', detail: `${Math.min(request.trim().length, MAX_REQUEST_CHARS)} characters`, sent: request.trim().slice(0, MAX_REQUEST_CHARS) || undefined },
  ];

  return (
    <AiResultPanel
      open
      title="Design with AI"
      connectionLabel={run.connectionLabel || undefined}
      modelLabel={run.modelLabel || undefined}
      chips={chips}
      status={run.blockedView ? 'blocked' : run.busy ? 'running' : 'ready'}
      message={run.blockedView?.message}
      blockedAction={run.blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: () => run.openSettings(onClose) } : undefined}
      truncated={run.truncated}
      closeLabel={!diff || nothing ? 'Close' : undefined}
      applyLabel={`Add to the diagram (${accepted.size})`}
      onApply={diff && !nothing ? apply : undefined}
      applyDisabled={run.truncated || accepted.size === 0}
      onRegenerate={diff ? () => void suggest() : undefined}
      onClose={onClose}
    >
      {run.fellBack && run.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${run.connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        Say what you need, for example “a blog with users, posts and comments”. The suggestion only adds tables, columns
        and relations; it never changes or removes anything already on the canvas.
      </p>
      {!diff ? (
        <>
          <label className="field" style={{ marginTop: 0 }}>
            <span>Describe the tables or the change</span>
            <AutoResizeTextarea
              className="textarea"
              value={request}
              onChange={setRequest}
              minRows={3}
              maxRows={8}
              submitMode="mod"
              onSubmit={() => request.trim() && void suggest()}
              disabled={run.busy}
              ariaLabel="Describe the tables or the change"
            />
          </label>
          <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
            <Button
              type="button"
              variant="primary"
              icon={run.busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
              onClick={() => void suggest()}
              disabled={run.busy || !request.trim()}
            >
              Suggest
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
      {diff && nothing ? <p>The suggestion adds nothing to what is already in the diagram.</p> : null}
      {diff && !nothing ? (
        <div className="ai-erd">
          {diff.newTables.map((t) => (
            <label key={`n-${t.name}`} className="ai-erd__row">
              <input type="checkbox" checked={!off.has(lower(t.name))} onChange={() => toggle(t.name)} aria-label={`Add table ${t.name}`} />
              <span>
                <strong>{t.name}</strong> <span className="muted small">{t.columns.map((c) => `${c.name} ${c.type}${c.pk ? ' pk' : ''}`).join(', ')}</span>
              </span>
            </label>
          ))}
          {diff.extendedTables.map((t) => (
            <label key={`e-${t.name}`} className="ai-erd__row">
              <input type="checkbox" checked={!off.has(lower(t.name))} onChange={() => toggle(t.name)} aria-label={`Add columns to ${t.name}`} />
              <span>
                <strong>{t.name}</strong> <span className="muted small">+ {t.newColumns.map((c) => `${c.name} ${c.type}`).join(', ')}</span>
              </span>
            </label>
          ))}
          {diff.newRelations.length > 0 ? (
            <p className="muted small">
              {`Relations (added when both tables are kept): ${diff.newRelations.map((r) => `${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}`).join(', ')}`}
            </p>
          ) : null}
        </div>
      ) : null}
    </AiResultPanel>
  );
}
