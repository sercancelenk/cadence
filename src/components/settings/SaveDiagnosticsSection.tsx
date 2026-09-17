import { useCallback, useEffect, useRef, useState } from 'react';
import { CollapsibleCard } from '../ui/CollapsibleCard';
import type { SaveDiagnostics, SaveTimingSummary } from '../../vite-env';

/**
 * Human-readable names for the save-path stages recorded in
 * `electron/persistence/saveTimings.cjs`. Anything not listed falls back to the
 * raw stage id so a newly added stage still shows up.
 */
const STAGE_LABELS: Record<string, string> = {
  'empty-guard': 'Empty-overwrite guard (read + decrypt)',
  serialize: 'Serialize + shard split check + size check',
  snapshot: 'Pre-save backup snapshot',
  'encrypt-write': 'Encrypt + write + fsync + verify',
  commit: 'Commit (rename + archived month cleanup)',
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

function formatMs(ms: number): string {
  if (ms >= 100) return `${Math.round(ms)} ms`;
  if (ms >= 10) return `${ms.toFixed(1)} ms`;
  return `${ms.toFixed(2)} ms`;
}

function isSupported(): boolean {
  return typeof window !== 'undefined' && !!window.cadence?.saveDiagnosticsGet;
}

function SummaryRows({ summary }: { summary: SaveTimingSummary }) {
  if (summary.sampleCount === 0) {
    return (
      <p className="muted small">
        No saves recorded yet. Type in a note for a few seconds, then refresh.
      </p>
    );
  }

  return (
    <ul className="cache-stats">
      {summary.stages.map((s) => (
        <li key={s.stage}>
          <span>{stageLabel(s.stage)}</span>
          <span title={`max ${formatMs(s.max)}`}>
            {formatMs(s.p50)} · p95 {formatMs(s.p95)}
          </span>
        </li>
      ))}
      <li>
        <span>
          <strong>Total per save</strong>
        </span>
        <span title={`max ${formatMs(summary.totalMs.max)}`}>
          <strong>
            {formatMs(summary.totalMs.p50)} · p95 {formatMs(summary.totalMs.p95)}
          </strong>
        </span>
      </li>
    </ul>
  );
}

/**
 * Opt-in view of how long each stage of a workspace save takes in the main
 * process. That process also routes input events, so a slow save is felt as
 * typing lag — these numbers are how we tell which stage is responsible.
 *
 * Recording is off by default, lives only in main-process memory, and is never
 * uploaded anywhere. Stage durations carry no workspace content.
 */
export function SaveDiagnosticsSection() {
  const supported = isSupported();
  const [diagnostics, setDiagnostics] = useState<SaveDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings can be closed while a diagnostics call is still in flight, and the
  // reply must not land on a component that is no longer mounted.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (call: () => Promise<SaveDiagnostics>) => {
      if (!supported) return;
      setBusy(true);
      setError(null);
      try {
        const next = await call();
        if (mounted.current) setDiagnostics(next);
      } catch (err) {
        if (mounted.current) setError(String(err));
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [supported],
  );

  useEffect(() => {
    void run(() => window.cadence!.saveDiagnosticsGet!());
  }, [run]);

  if (!supported) return null;

  const enabled = diagnostics?.enabled ?? false;
  const summary = diagnostics?.summary;

  return (
    <CollapsibleCard
      id="save-diagnostics"
      title="Save performance diagnostics"
      defaultOpen={false}
      badge={enabled ? 'Recording' : undefined}
    >
      <p className="muted small" style={{ marginBottom: 12 }}>
        Measures how long each stage of an autosave takes on this device. Turn it on, use the app
        normally for a minute, then read the numbers. Nothing leaves your computer, and the
        measurements are discarded when you turn recording off.
      </p>

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(() => window.cadence!.saveDiagnosticsSetEnabled!({ enabled: !enabled }))
          }
        >
          {enabled ? 'Stop recording' : 'Start recording'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !enabled}
          onClick={() => void run(() => window.cadence!.saveDiagnosticsGet!())}
        >
          Refresh
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !enabled || (summary?.sampleCount ?? 0) === 0}
          onClick={() => void run(() => window.cadence!.saveDiagnosticsClear!())}
        >
          Clear samples
        </button>
      </div>

      {error ? (
        <p className="small" role="alert">
          {error}
        </p>
      ) : null}

      {enabled && summary ? (
        <>
          <p className="small" style={{ margin: '0 0 8px', fontWeight: 600 }}>
            Last {summary.sampleCount} saves — median · p95
          </p>
          <SummaryRows summary={summary} />
        </>
      ) : null}
    </CollapsibleCard>
  );
}
