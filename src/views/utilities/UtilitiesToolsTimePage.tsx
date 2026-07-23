import { useMemo, useState } from 'react';
import { CopyButton } from '../../features/utilityTools/CopyButton';
import { explainCron } from '../../lib/utilityTools/cronExplain';
import {
  DURATION_UNITS,
  convertDurationAll,
  isDurationUnit,
  parseDurationAmount,
  type DurationUnit,
} from '../../lib/utilityTools/durationConvert';
import {
  formatEpochViews,
  isoToEpochMs,
  parseEpochInput,
} from '../../lib/utilityTools/epochConvert';

export function UtilitiesToolsTimePage() {
  const [epochIn, setEpochIn] = useState(() => String(Math.trunc(Date.now() / 1000)));
  const [isoIn, setIsoIn] = useState(() => new Date().toISOString());
  const [cronIn, setCronIn] = useState('0 0 * * *');
  const [durationAmount, setDurationAmount] = useState('90');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('min');

  const fromEpoch = useMemo(() => parseEpochInput(epochIn), [epochIn]);
  const fromIso = useMemo(() => isoToEpochMs(isoIn), [isoIn]);
  const cron = useMemo(() => explainCron(cronIn), [cronIn]);
  const durationParsed = useMemo(() => parseDurationAmount(durationAmount), [durationAmount]);
  const duration = useMemo(() => {
    if (!durationParsed.ok) return durationParsed;
    return convertDurationAll(durationParsed.value, durationUnit);
  }, [durationParsed, durationUnit]);

  const epochViews = fromEpoch.ok ? formatEpochViews(fromEpoch.ms) : null;
  const isoViews = fromIso.ok ? formatEpochViews(fromIso.ms) : null;

  return (
    <div className="utilities-tools-panels">
      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>Duration converter</h2>
          <p className="muted small">
            Convert between ms, seconds, minutes, hours, days, weeks, months, and years. Month and
            year use mean Gregorian lengths (≈30.44 d / 365.2425 d) — not calendar months.
          </p>
        </header>
        <div className="utilities-tools-inline">
          <label className="utilities-tools-field utilities-tools-field--grow">
            <span>Amount</span>
            <input
              className="utilities-tools-input"
              value={durationAmount}
              onChange={(e) => setDurationAmount(e.target.value)}
              inputMode="decimal"
              spellCheck={false}
            />
          </label>
          <label className="utilities-tools-field utilities-tools-field--narrow">
            <span>Unit</span>
            <select
              className="utilities-tools-input"
              value={durationUnit}
              onChange={(e) => {
                const next = e.target.value;
                if (isDurationUnit(next)) setDurationUnit(next);
              }}
            >
              {DURATION_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                  {u.approximate ? ' (approx.)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!duration.ok ? (
          <p className="utilities-tools-error" role="alert">
            {duration.error}
          </p>
        ) : (
          <ul className="utilities-tools-kv">
            {duration.rows.map((row) => (
              <li key={row.unit}>
                <div className="utilities-tools-panel__actions">
                  <span className="small muted">
                    {row.label}
                    {row.approximate ? ' · approx.' : ''}
                  </span>
                  <CopyButton text={row.display} />
                </div>
                <pre className="utilities-tools-pre">
                  {row.display} {row.shortLabel}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>Unix epoch converter</h2>
          <p className="muted small">Accepts 10-digit seconds or 13-digit milliseconds.</p>
        </header>
        <label className="utilities-tools-field">
          <span>Timestamp</span>
          <input
            className="utilities-tools-input"
            value={epochIn}
            onChange={(e) => setEpochIn(e.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="utilities-tools-inline">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setEpochIn(String(Math.trunc(Date.now() / 1000)))}
          >
            Now (seconds)
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setEpochIn(String(Date.now()))}
          >
            Now (ms)
          </button>
        </div>
        {!fromEpoch.ok ? (
          <p className="utilities-tools-error" role="alert">
            {fromEpoch.error}
          </p>
        ) : epochViews ? (
          <ul className="utilities-tools-kv">
            <li>
              <span className="small muted">Detected</span>
              <strong>{fromEpoch.unit === 'ms' ? 'milliseconds' : 'seconds'}</strong>
            </li>
            <li>
              <div className="utilities-tools-panel__actions">
                <span className="small muted">Local</span>
                <CopyButton text={epochViews.local} />
              </div>
              <pre className="utilities-tools-pre">{epochViews.local}</pre>
            </li>
            <li>
              <div className="utilities-tools-panel__actions">
                <span className="small muted">UTC</span>
                <CopyButton text={epochViews.utc} />
              </div>
              <pre className="utilities-tools-pre">{epochViews.utc}</pre>
            </li>
            <li>
              <div className="utilities-tools-panel__actions">
                <span className="small muted">ISO</span>
                <CopyButton text={epochViews.iso} />
              </div>
              <pre className="utilities-tools-pre">{epochViews.iso}</pre>
            </li>
          </ul>
        ) : null}

        <label className="utilities-tools-field" style={{ marginTop: '1rem' }}>
          <span>ISO → epoch</span>
          <input
            className="utilities-tools-input"
            value={isoIn}
            onChange={(e) => setIsoIn(e.target.value)}
            spellCheck={false}
          />
        </label>
        {!fromIso.ok ? (
          <p className="utilities-tools-error" role="alert">
            {fromIso.error}
          </p>
        ) : isoViews ? (
          <div className="utilities-tools-panel__actions">
            <pre className="utilities-tools-pre">
              {isoViews.seconds} s · {isoViews.millis} ms
            </pre>
            <CopyButton text={String(isoViews.millis)} label="Copy ms" />
          </div>
        ) : null}
      </section>

      <section className="utilities-tools-panel">
        <header className="utilities-tools-panel__head">
          <h2>Cron explainer</h2>
          <p className="muted small">Classic 5-field cron: minute hour day-of-month month day-of-week.</p>
        </header>
        <label className="utilities-tools-field">
          <span>Expression</span>
          <input
            className="utilities-tools-input"
            value={cronIn}
            onChange={(e) => setCronIn(e.target.value)}
            spellCheck={false}
            placeholder="0 0 * * *"
          />
        </label>
        {!cron.ok ? (
          <p className="utilities-tools-error" role="alert">
            {cron.error}
          </p>
        ) : (
          <>
            <p className="utilities-tools-cron-summary">{cron.summary}</p>
            <ul className="utilities-tools-kv">
              {cron.parts.map((p) => (
                <li key={p} className="muted small">
                  {p}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
