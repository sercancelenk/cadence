import { Link } from 'react-router-dom';
import {
  agendaEntryHref,
  agendaEntryTitle,
  agendaScheduleKindLabel,
  type AgendaEntry,
} from '../../lib/agendaEntries';
import { formatShort, isPast } from '../../lib/datetime';
import { kindLabel } from '../../lib/labels';
import { isTodoOpen } from '../../model';

type Props = {
  overdueCount: number;
  todayPreview: AgendaEntry[];
  todayTotal: number;
  agendaHref: string;
};

export function HomeTodaySection({ overdueCount, todayPreview, todayTotal, agendaHref }: Props) {
  return (
    <section className="home-page__section home-page__today" aria-labelledby="home-today-title">
      <div className="home-page__section-head">
        <h2 id="home-today-title" className="home-page__section-title">
          Today
        </h2>
        <Link className="home-page__section-link small" to={agendaHref}>
          View Agenda
        </Link>
      </div>

      <div className="home-page__panel">
        {overdueCount > 0 ? (
          <Link className="home-today-alert" to={agendaHref}>
            <span className="home-today-alert__label">
              {overdueCount} overdue item{overdueCount === 1 ? '' : 's'}
            </span>
            <span className="home-today-alert__action muted small">Review on Agenda</span>
          </Link>
        ) : null}

        {todayPreview.length === 0 ? (
          <p className="home-today-empty muted">
            Nothing scheduled for today.{' '}
            <Link to={agendaHref} className="home-page__inline-link">
              Open Agenda
            </Link>
          </p>
        ) : (
          <>
            <ul className="home-today-list">
              {todayPreview.map((entry) => (
                <li key={entry.key}>
                  <HomeTodayRow entry={entry} />
                </li>
              ))}
            </ul>
            {todayTotal > todayPreview.length ? (
              <p className="home-today-more muted small">
                +{todayTotal - todayPreview.length} more today —{' '}
                <Link to={agendaHref} className="home-page__inline-link">
                  see all
                </Link>
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function HomeTodayRow({ entry }: { entry: AgendaEntry }) {
  const href = agendaEntryHref(entry);
  const title = agendaEntryTitle(entry);
  const overdue =
    entry.kind === 'item'
      ? !entry.item.done && isPast(entry.when.toISOString())
      : isTodoOpen(entry.todo.status) && isPast(entry.when.toISOString());

  const meta =
    entry.kind === 'item'
      ? [
          kindLabel(entry.item.kind),
          entry.teamName,
          entry.personName,
          agendaScheduleKindLabel(entry.scheduleKind),
          formatShort(entry.when.toISOString()),
        ]
          .filter(Boolean)
          .join(' · ')
      : [`To-do${entry.groupName ? ` · ${entry.groupName}` : ''}`, formatShort(entry.when.toISOString())].join(' · ');

  return (
    <Link className="home-today-row" to={href}>
      <span className="home-today-row__main">
        <span className="home-today-row__title">{title}</span>
        <span className="home-today-row__meta muted small">{meta}</span>
      </span>
      {overdue ? <span className="home-today-row__pill">overdue</span> : null}
    </Link>
  );
}
