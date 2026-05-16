import { useMemo, useState } from 'react';
import { useAppData } from '../AppDataContext';
import type { AppData, Person, Team, TodoItem } from '../model';
import { isLeaderPerson, isSelfPerson } from '../model';

type Range = 'day' | 'week' | 'month' | 'year';

type Bucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

type TaskRecord = {
  createdAt: Date;
  done: boolean;
  doneAt: Date | null;
  dueAt: Date | null;
  personId?: string;
  teamId?: string;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // make Monday the first day
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function startOfYear(d: Date) {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}

function buildBuckets(range: Range): Bucket[] {
  const out: Bucket[] = [];
  const now = new Date();
  if (range === 'day') {
    for (let i = 13; i >= 0; i--) {
      const start = startOfDay(new Date(now));
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      out.push({
        key: start.toISOString().slice(0, 10),
        label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        start,
        end,
      });
    }
  } else if (range === 'week') {
    for (let i = 11; i >= 0; i--) {
      const start = startOfWeek(new Date(now));
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      out.push({
        key: `w-${start.toISOString().slice(0, 10)}`,
        label: `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
        start,
        end,
      });
    }
  } else if (range === 'month') {
    for (let i = 11; i >= 0; i--) {
      const start = startOfMonth(new Date(now));
      start.setMonth(start.getMonth() - i);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      out.push({
        key: `m-${start.getFullYear()}-${start.getMonth() + 1}`,
        label: start.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        start,
        end,
      });
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const start = startOfYear(new Date(now));
      start.setFullYear(start.getFullYear() - i);
      const end = new Date(start);
      end.setFullYear(end.getFullYear() + 1);
      out.push({
        key: `y-${start.getFullYear()}`,
        label: String(start.getFullYear()),
        start,
        end,
      });
    }
  }
  return out;
}

function collectTaskRecords(data: AppData): TaskRecord[] {
  const personById = new Map<string, Person>(data.people.map((p) => [p.id, p]));
  const records: TaskRecord[] = [];

  for (const it of data.items) {
    if (it.kind !== 'task' && it.kind !== 'goal') continue;
    const created = parseSafeDate(it.createdAt);
    if (!created) continue;
    const person = personById.get(it.personId);
    records.push({
      createdAt: created,
      done: !!it.done,
      doneAt: it.done ? parseSafeDate(it.doneAt) ?? created : null,
      dueAt: parseSafeDate(it.dueAt),
      personId: it.personId,
      teamId: person?.teamId,
    });
  }

  for (const t of data.todoItems) {
    const created = parseSafeDate(t.createdAt);
    if (!created) continue;
    records.push({
      createdAt: created,
      done: !!t.done,
      doneAt: t.done ? parseSafeDate(t.updatedAt) ?? created : null,
      dueAt: parseSafeDate(t.dueAt),
    });
  }

  return records;
}

function parseSafeDate(v: string | Date | undefined | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function withinBucket(d: Date | null, b: Bucket): boolean {
  if (!d) return false;
  return d >= b.start && d < b.end;
}

type Series = { created: number; completed: number };

function bucketSeries(records: TaskRecord[], buckets: Bucket[]): Series[] {
  return buckets.map((b) => ({
    created: records.filter((r) => withinBucket(r.createdAt, b)).length,
    completed: records.filter((r) => r.done && withinBucket(r.doneAt, b)).length,
  }));
}

type TeamStats = {
  team: Team;
  total: number;
  completed: number;
  overdue: number;
  rate: number;
};

function teamStats(data: AppData, records: TaskRecord[]): TeamStats[] {
  const now = Date.now();
  const teamRecs = records.filter((r) => !!r.teamId);
  return data.teams.map((t) => {
    const own = teamRecs.filter((r) => r.teamId === t.id);
    const completed = own.filter((r) => r.done).length;
    const overdue = own.filter((r) => !r.done && r.dueAt && r.dueAt.getTime() < now).length;
    const total = own.length;
    return {
      team: t,
      total,
      completed,
      overdue,
      rate: total === 0 ? 0 : completed / total,
    };
  });
}

type PersonStats = {
  person: Person;
  team?: Team;
  total: number;
  completed: number;
  overdue: number;
  rate: number;
};

function personStats(data: AppData, records: TaskRecord[]): PersonStats[] {
  const now = Date.now();
  const teamById = new Map<string, Team>(data.teams.map((t) => [t.id, t]));
  const records$ = records.filter((r) => !!r.personId);
  return data.people
    .filter((p) => !isSelfPerson(p) && !isLeaderPerson(p))
    .map((p) => {
      const own = records$.filter((r) => r.personId === p.id);
      const completed = own.filter((r) => r.done).length;
      const overdue = own.filter((r) => !r.done && r.dueAt && r.dueAt.getTime() < now).length;
      const total = own.length;
      return {
        person: p,
        team: teamById.get(p.teamId),
        total,
        completed,
        overdue,
        rate: total === 0 ? 0 : completed / total,
      };
    });
}

function fmtPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function AnalyticsPage() {
  const { data } = useAppData();
  const [range, setRange] = useState<Range>('day');

  const records = useMemo(() => collectTaskRecords(data), [data]);
  const buckets = useMemo(() => buildBuckets(range), [range]);
  const series = useMemo(() => bucketSeries(records, buckets), [records, buckets]);

  const totals = useMemo(() => {
    const now = Date.now();
    const total = records.length;
    const completed = records.filter((r) => r.done).length;
    const overdue = records.filter((r) => !r.done && r.dueAt && r.dueAt.getTime() < now).length;
    const open = total - completed;
    return { total, completed, overdue, open, rate: total === 0 ? 0 : completed / total };
  }, [records]);

  const teamRows = useMemo(() => teamStats(data, records), [data, records]);
  const peopleRows = useMemo(
    () =>
      personStats(data, records)
        .filter((p) => p.total > 0)
        .sort((a, b) => b.completed - a.completed || b.total - a.total)
        .slice(0, 10),
    [data, records],
  );

  const todoTotals = useMemo(() => {
    const now = Date.now();
    const total = data.todoItems.length;
    const completed = data.todoItems.filter((t) => t.done).length;
    const overdue = data.todoItems.filter((t: TodoItem) => !t.done && t.dueAt && new Date(t.dueAt).getTime() < now).length;
    return { total, completed, overdue, rate: total === 0 ? 0 : completed / total };
  }, [data.todoItems]);

  return (
    <div className="page analytics-page">
      <header className="page-head">
        <h1>Analytics</h1>
        <p className="muted">
          A simple overview of your tasks: how many were created and completed, who's keeping up,
          and where you're falling behind. All numbers are local to this device.
        </p>
      </header>

      <div className="analytics-cards">
        <StatCard label="Total tasks" value={totals.total} />
        <StatCard label="Completed" value={totals.completed} tone="ok" />
        <StatCard label="Open" value={totals.open} />
        <StatCard label="Overdue" value={totals.overdue} tone={totals.overdue ? 'danger' : undefined} />
        <StatCard label="Completion rate" value={fmtPercent(totals.rate)} tone="info" />
      </div>

      <section className="card">
        <div className="row row--between" style={{ flexWrap: 'wrap' }}>
          <h2 className="card__title" style={{ margin: 0 }}>
            Created vs completed
          </h2>
          <div className="seg">
            {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`seg__btn${range === r ? ' seg__btn--on' : ''}`}
                onClick={() => setRange(r)}
              >
                {r === 'day' ? 'Daily' : r === 'week' ? 'Weekly' : r === 'month' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
        </div>
        <BarChart buckets={buckets} series={series} />
        <div className="analytics-legend muted small">
          <span>
            <span className="analytics-legend__sw analytics-legend__sw--created" /> Created
          </span>
          <span>
            <span className="analytics-legend__sw analytics-legend__sw--completed" /> Completed
          </span>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="card__title">Per-team performance</h2>
          {teamRows.length === 0 ? (
            <p className="muted">No teams yet.</p>
          ) : (
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Total</th>
                  <th>Done</th>
                  <th>Overdue</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((row) => (
                  <tr key={row.team.id}>
                    <td>{row.team.name}</td>
                    <td>{row.total}</td>
                    <td>{row.completed}</td>
                    <td className={row.overdue ? 'analytics-table__danger' : undefined}>{row.overdue}</td>
                    <td>
                      <ProgressBar value={row.rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="card__title">Top contributors</h2>
          {peopleRows.length === 0 ? (
            <p className="muted">No tracked tasks for team members yet.</p>
          ) : (
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Team</th>
                  <th>Total</th>
                  <th>Done</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {peopleRows.map((row) => (
                  <tr key={row.person.id}>
                    <td>{row.person.name}</td>
                    <td className="muted">{row.team?.name ?? '—'}</td>
                    <td>{row.total}</td>
                    <td>{row.completed}</td>
                    <td>
                      <ProgressBar value={row.rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="card__title">Personal to-dos</h2>
        <div className="analytics-cards">
          <StatCard label="Total" value={todoTotals.total} />
          <StatCard label="Done" value={todoTotals.completed} tone="ok" />
          <StatCard label="Overdue" value={todoTotals.overdue} tone={todoTotals.overdue ? 'danger' : undefined} />
          <StatCard label="Completion rate" value={fmtPercent(todoTotals.rate)} tone="info" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'danger' | 'info' }) {
  return (
    <div className={`stat-card${tone ? ` stat-card--${tone}` : ''}`}>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="progress" title={fmtPercent(v)}>
      <span className="progress__bar" style={{ width: `${v * 100}%` }} />
      <span className="progress__label">{fmtPercent(v)}</span>
    </div>
  );
}

function BarChart({ buckets, series }: { buckets: Bucket[]; series: Series[] }) {
  const width = Math.max(560, buckets.length * 48);
  const height = 200;
  const pad = { top: 12, right: 12, bottom: 24, left: 28 };
  const max = Math.max(1, ...series.flatMap((s) => [s.created, s.completed]));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slotW = innerW / Math.max(1, buckets.length);
  const barW = Math.max(4, slotW * 0.32);

  return (
    <div className="analytics-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Created versus completed tasks bar chart">
        {/* Grid + y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = pad.top + innerH * (1 - p);
          const v = Math.round(max * p);
          return (
            <g key={i}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="currentColor" opacity={0.12} />
              <text x={pad.left - 6} y={y + 3} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>
                {v}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {buckets.map((b, i) => {
          const s = series[i] ?? { created: 0, completed: 0 };
          const cx = pad.left + slotW * i + slotW / 2;
          const createdH = (s.created / max) * innerH;
          const completedH = (s.completed / max) * innerH;
          const baseline = pad.top + innerH;
          return (
            <g key={b.key}>
              <rect
                x={cx - barW - 1}
                y={baseline - createdH}
                width={barW}
                height={createdH}
                fill="var(--accent)"
                opacity={0.6}
                rx={3}
              />
              <rect
                x={cx + 1}
                y={baseline - completedH}
                width={barW}
                height={completedH}
                fill="var(--ok, #4ade80)"
                opacity={0.85}
                rx={3}
              />
              <text x={cx} y={height - 6} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.65}>
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
