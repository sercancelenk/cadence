import { useMemo, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { MAX_MOCK_RECORDS, parseSampleRecords, validateMockRecords } from '../lib/ai/mockData';
import { mockDataTask } from '../lib/ai/prompts/mockdata';
import { useAiRun } from '../lib/ai/useAiRun';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  tabTitle: string;
  /** The JSON on the tab. */
  sampleText: string;
  /** Adds the records as a new JSON tab; the new tab's id, or null when it could not be saved. */
  onApply: (title: string, content: string) => string | null;
};

/**
 * "Generate mock data": more records shaped like the JSON on the tab. Every record is checked
 * against the sample's shape before it is shown, and the result becomes a new tab only on request.
 */
const DEFAULT_COUNT = 10;
/** The typed count as a whole number in range; an empty or unreadable box means the default. */
const clampCount = (text: string): number => {
  const n = Math.floor(Number(text));
  return text.trim() === '' || !Number.isFinite(n) ? DEFAULT_COUNT : Math.min(MAX_MOCK_RECORDS, Math.max(1, n));
};

export function AIMockDataDialog({ open, onClose, tabTitle, sampleText, onApply }: Props) {
  const run = useAiRun(mockDataTask);
  const toast = useToast();
  const [countText, setCountText] = useState('10');
  const [kept, setKept] = useState<{ records: Record<string, unknown>[]; dropped: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const sample = useMemo(() => parseSampleRecords(sampleText), [sampleText]);

  if (!open || !run.enabled) return null;

  const generate = async () => {
    if (!sample.ok) return;
    setKept(null);
    setProblem(null);
    const n = clampCount(countText);
    const result = await run.run({ input: { sample: sampleText.trim(), count: n } });
    if (!result?.ok) return;
    const checked = validateMockRecords(sample.records, result.value);
    if (checked.records.length === 0) {
      setProblem('None of the records matched the shape of your sample. Try again, or use a smaller, simpler sample.');
      return;
    }
    setKept(checked);
  };

  const content = kept ? JSON.stringify(kept.records, null, 2) : '';
  const add = () => {
    if (!kept || run.truncated) return;
    if (onApply(`Mock: ${tabTitle}`, content) === null) {
      setProblem('The new tab could not be saved (saving is blocked right now). Nothing was changed.');
      return;
    }
    toast.showSuccess('Mock data added', 'It is a new JSON tab; your sample tab is unchanged.');
    onClose();
  };
  const copy = async () => {
    if (!kept) return;
    if (await copyText(content)) toast.showSuccess('Copied', 'The records are on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the text above and copy it by hand.');
  };

  const chips: AiContextChip[] = [
    { label: 'JSON sample', detail: `${sampleText.trim().length} characters`, sent: sampleText.trim().slice(0, 8000) || undefined },
  ];

  return (
    <AiResultPanel
      open
      title="Generate mock data"
      connectionLabel={run.connectionLabel || undefined}
      modelLabel={run.modelLabel || undefined}
      chips={chips}
      status={run.blockedView ? 'blocked' : run.busy ? 'running' : 'ready'}
      message={run.blockedView?.message}
      blockedAction={run.blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: () => run.openSettings(onClose) } : undefined}
      truncated={run.truncated}
      applyLabel="Add as a new tab"
      onApply={kept ? add : undefined}
      applyDisabled={run.truncated}
      onCopy={kept ? () => void copy() : undefined}
      onRegenerate={kept ? () => void generate() : undefined}
      onClose={onClose}
    >
      {run.fellBack && run.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${run.connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        More records with the same keys and kinds of values as your sample, using invented data. Your tab is not changed;
        the records become a new JSON tab when you press Add.
      </p>
      {!sample.ok ? (
        <div className="ai-dialog__error" role="alert">
          {sample.error}
        </div>
      ) : null}
      {!kept ? (
        <div className="row" style={{ marginTop: 10, marginBottom: 12, gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="field" style={{ margin: 0 }}>
            <span>How many records</span>
            <input
              className="input"
              type="number"
              min={1}
              max={MAX_MOCK_RECORDS}
              value={countText}
              onChange={(e) => setCountText(e.target.value.replace(/^0+(?=\d)/, ''))}
              onBlur={() => setCountText(String(clampCount(countText)))}
              style={{ width: 120 }}
            />
          </label>
          <Button
            type="button"
            variant="primary"
            icon={run.busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
            onClick={() => void generate()}
            disabled={run.busy || !sample.ok}
          >
            Generate
          </Button>
        </div>
      ) : null}
      {run.error || problem ? (
        <>
          <div className="ai-dialog__error" role="alert" style={{ marginBottom: 12 }}>
            {problem ?? run.error?.message}
          </div>
          {run.error?.diagnostic && !problem ? (
            <details className="ai-panel__diagnostic">
              <summary>Diagnostic details</summary>
              <pre>{run.error.diagnostic}</pre>
            </details>
          ) : null}
        </>
      ) : null}
      {kept ? (
        <>
          <p className="small">
            {`${kept.records.length} ${kept.records.length === 1 ? 'record' : 'records'}`}
            {kept.dropped > 0 ? ` · ${kept.dropped} left out because they did not match your sample` : ''}
          </p>
          <pre className="ai-diagram__source">{content.length > 4000 ? `${content.slice(0, 4000)}\n…` : content}</pre>
        </>
      ) : null}
    </AiResultPanel>
  );
}
