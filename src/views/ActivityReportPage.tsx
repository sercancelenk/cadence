import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { TODO_STATUS_OPTIONS } from '../model';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import {
  ACTIVITY_PERIOD_OPTIONS,
  ACTIVITY_SOURCE_OPTIONS,
  buildActivityReportFromData,
  getActivityPeriod,
  getActivityPeriodFromDates,
  type ActivityPeriodPreset,
  type ActivityReportEntry,
  type ActivitySource,
} from '../lib/todoActivityReport';
import { PATH_ANALYTICS } from '../lib/routes';

function fmtWhen(d: Date): string {
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: ActivityReportEntry['status']): string {
  return TODO_STATUS_OPTIONS.find((o) => o.value === status)?.shortLabel ?? status;
}

function ActivityRow({
  entry,
  timestampLabel,
}: {
  entry: ActivityReportEntry;
  timestampLabel: string;
}) {
  const body = (
    <>
      <div className="activity-section__main">
        <span className="activity-section__task-title">{entry.title}</span>
        <span className="activity-section__context muted small">{entry.contextLabel}</span>
      </div>
      <div className="activity-section__meta muted small">
        <span className={`activity-section__status activity-section__status--${entry.status}`}>
          {statusLabel(entry.status)}
        </span>
        {entry.planInHub ? (
          <span className="activity-section__hub-tag" title="In planning hub">
            Planning
          </span>
        ) : null}
        <span className="activity-section__when" title={timestampLabel}>
          {fmtWhen(entry.displayAt)}
        </span>
      </div>
    </>
  );

  if (entry.navPath) {
    return (
      <li className="activity-section__item">
        <Link to={entry.navPath} className="activity-section__row activity-section__row--link">
          {body}
        </Link>
      </li>
    );
  }

  return <li className="activity-section__row">{body}</li>;
}

function ActivitySection({
  title,
  tone,
  entries,
  emptyHint,
  timestampLabel,
}: {
  title: string;
  tone?: 'ok' | 'info' | 'warn' | 'muted';
  entries: ActivityReportEntry[];
  emptyHint: string;
  timestampLabel: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className={`activity-section${tone ? ` activity-section--${tone}` : ''}`}>
      <button type="button" className="activity-section__head" onClick={() => setOpen((v) => !v)}>
        <span className="activity-section__title">{title}</span>
        <span className="activity-section__count">{entries.length}</span>
        <span className="activity-section__chev" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        entries.length === 0 ? (
          <p className="activity-section__empty muted small">{emptyHint}</p>
        ) : (
          <ul className="activity-section__list">
            {entries.map((entry) => (
              <ActivityRow
                key={`${entry.source}-${entry.id}`}
                entry={entry}
                timestampLabel={timestampLabel}
              />
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

function presetEndInclusive(period: ReturnType<typeof getActivityPeriod>): Date {
  const end = new Date(period.end);
  end.setDate(end.getDate() - 1);
  return end;
}

export function ActivityReportPage() {
  const { data } = useAppData();
  const [preset, setPreset] = useState<ActivityPeriodPreset>('this_week');
  const [source, setSource] = useState<ActivitySource>('personal');
  const [planningHubOnly, setPlanningHubOnly] = useState(false);
  const [teamId, setTeamId] = useState<string>('');

  const initialWeek = useMemo(() => getActivityPeriod('this_week'), []);
  const [customStart, setCustomStart] = useState(() => initialWeek.start);
  const [customEnd, setCustomEnd] = useState(() => presetEndInclusive(initialWeek));

  const report = useMemo(
    () =>
      buildActivityReportFromData(data, {
        source,
        planningHubOnly: source === 'personal' ? planningHubOnly : false,
        preset: preset === 'custom' ? undefined : preset,
        period:
          preset === 'custom' ? getActivityPeriodFromDates(customStart, customEnd) : undefined,
        teamId: source === 'team' && teamId ? teamId : undefined,
      }),
    [data, preset, customStart, customEnd, source, planningHubOnly, teamId],
  );

  function selectPreset(next: ActivityPeriodPreset) {
    if (next === 'custom' && preset !== 'custom') {
      const period = getActivityPeriod(preset);
      setCustomStart(period.start);
      setCustomEnd(presetEndInclusive(period));
    }
    setPreset(next);
  }

  return (
    <div className="page page--wide activity-page">
      <header className="page-head activity-page__head">
        <div>
          <h1>Activity</h1>
          <p className="muted">
            Task ledger for a time window — what you finished, opened, dropped, and what is still
            open. Personal to-dos and team work use separate data; planning hub tasks are personal
            to-dos with an extra lens.
          </p>
          <p className="activity-page__period-label muted small">{report.period.label}</p>
        </div>
      </header>

      <div className="activity-page__toolbar card">
        <div className="seg activity-page__source-seg" role="group" aria-label="Data source">
          {ACTIVITY_SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`seg__btn${source === opt.value ? ' seg__btn--on' : ''}`}
              title={opt.label}
              onClick={() => {
                setSource(opt.value);
                if (opt.value === 'team') setPlanningHubOnly(false);
                else setTeamId('');
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="activity-page__filters">
          <div className="seg activity-page__seg" role="group" aria-label="Time period">
            {ACTIVITY_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`seg__btn${preset === opt.value ? ' seg__btn--on' : ''}`}
                title={opt.label}
                onClick={() => selectPreset(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {source === 'personal' ? (
            <label className="activity-page__check">
              <input
                type="checkbox"
                checked={planningHubOnly}
                onChange={(e) => setPlanningHubOnly(e.target.checked)}
              />
              <span>Planning hub only</span>
            </label>
          ) : (
            <label className="activity-page__scope">
              <span className="muted small">Team</span>
              <select
                className="select select--compact activity-page__select"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">All teams</option>
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {preset === 'custom' ? (
          <DateRangePicker
            className="activity-page__range-picker"
            start={customStart}
            end={customEnd}
            onChange={(start, end) => {
              setCustomStart(start);
              setCustomEnd(end);
            }}
          />
        ) : null}

        {source === 'personal' && planningHubOnly ? (
          <p className="activity-page__scope-hint muted small">
            Showing only personal to-dos opted into the Eisenhower matrix.
          </p>
        ) : null}
      </div>

      <div className="analytics-cards activity-page__summary">
        <div className="stat-card stat-card--ok">
          <div className="stat-card__value">{report.summary.completed}</div>
          <div className="stat-card__label">Completed</div>
        </div>
        <div className="stat-card stat-card--info">
          <div className="stat-card__value">{report.summary.opened}</div>
          <div className="stat-card__label">Opened</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{report.summary.stillOpen}</div>
          <div className="stat-card__label">Still open</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{report.summary.cancelled}</div>
          <div className="stat-card__label">Cancelled</div>
        </div>
      </div>

      <div className="activity-page__sections">
        <ActivitySection
          title="Completed"
          tone="ok"
          entries={report.completed}
          emptyHint="Nothing completed in this window."
          timestampLabel="Completed at"
        />
        <ActivitySection
          title="Opened"
          tone="info"
          entries={report.opened}
          emptyHint="No new tasks in this window."
          timestampLabel="Created at"
        />
        <ActivitySection
          title="Still open"
          entries={report.stillOpen}
          emptyHint="No open backlog for this window."
          timestampLabel="Due / updated"
        />
        <ActivitySection
          title="Cancelled"
          tone="muted"
          entries={report.cancelled}
          emptyHint="Nothing cancelled in this window."
          timestampLabel="Cancelled at"
        />
      </div>

      <p className="activity-page__foot muted small">
        Metrics overview lives on{' '}
        <Link to={PATH_ANALYTICS} className="activity-page__link">
          Analytics
        </Link>
        . Still-open counts use today for current periods and the period end for last year.
      </p>
    </div>
  );
}
