import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { Button } from '../components/ui/Button';
import { IcCheck, IcUndo } from '../components/icons';
import {
  buildAgendaWeekStrip,
  collectAgendaEntries,
  filterOverdueAgendaEntries,
  agendaScheduleKindLabel,
  type AgendaEntry,
} from '../lib/agendaEntries';
import { formatShort, isPast } from '../lib/datetime';
import { kindLabel } from '../lib/labels';
import { teamPerson } from '../lib/teamPaths';
import { isTodoOpen } from '../model';

/**
 * Unified agenda: shows reminders + due-dates from team items and personal todos,
 * grouped by day. Today is always shown even if empty; the next 6 days are also
 * shown but only the ones that have entries.
 */
export function AgendaPage() {
  const { data, toggleItemDone, toggleTodoItem } = useAppData();
  const [showCompleted, setShowCompleted] = useState(false);

  const entries = useMemo(
    () => collectAgendaEntries(data, { showCompleted }),
    [data, showCompleted],
  );
  const days = useMemo(() => buildAgendaWeekStrip(entries), [entries]);
  const overdue = useMemo(() => filterOverdueAgendaEntries(entries), [entries]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Agenda</h1>
        <p className="muted">Reminders, due tasks and personal to-dos for the next seven days.</p>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            <span className="small">Include completed</span>
          </label>
        </div>
      </header>

      {overdue.length > 0 ? (
        <section className="card">
          <h2 className="card__title">
            Overdue <span className="pill pill--danger">{overdue.length}</span>
          </h2>
          <EntryList entries={overdue} onToggleItem={toggleItemDone} onToggleTodo={toggleTodoItem} />
        </section>
      ) : null}

      {days.map((d) => (
        <section className="card" key={d.key}>
          <h2 className="card__title">
            {d.label} <span className="muted small">{d.subtitle}</span>
            {d.entries.length > 0 ? <span className="pill">{d.entries.length}</span> : null}
          </h2>
          {d.entries.length === 0 ? (
            d.isToday ? (
              <p className="muted">Nothing scheduled for today.</p>
            ) : null
          ) : (
            <EntryList entries={d.entries} onToggleItem={toggleItemDone} onToggleTodo={toggleTodoItem} />
          )}
        </section>
      ))}
    </div>
  );
}

function EntryList({
  entries,
  onToggleItem,
  onToggleTodo,
}: {
  entries: AgendaEntry[];
  onToggleItem: (id: string) => void;
  onToggleTodo: (id: string) => void;
}) {
  return (
    <ul className="list">
      {entries.map((e) => {
        if (e.kind === 'item') {
          const { item, teamId, teamName, personName } = e;
          const overdue = !item.done && isPast(e.when.toISOString());
          return (
            <li key={e.key} className="list__block">
              <div className="row row--between">
                <div>
                  <div className="list__title">
                    {item.title || '(untitled)'} {item.done ? <span className="pill pill--ok">done</span> : null}
                    {overdue ? <span className="pill pill--danger">overdue</span> : null}
                  </div>
                  <div className="muted small">
                    {kindLabel(item.kind)}
                    {teamName ? ` · ${teamName}` : ''}
                    {personName ? ` · ${personName}` : ''} · {agendaScheduleKindLabel(e.scheduleKind)} ·{' '}
                    {formatShort(e.when.toISOString())}
                  </div>
                </div>
                <div className="row">
                  {teamId ? (
                    <Link className="btn btn--ghost btn--sm" to={teamPerson(teamId, item.personId)}>
                      Open
                    </Link>
                  ) : null}
                  {item.kind === 'task' || item.kind === 'goal' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={item.done ? <IcUndo size={16} /> : <IcCheck size={16} />}
                      onClick={() => onToggleItem(item.id)}
                    >
                      {item.done ? 'Reopen' : 'Done'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        }
        const { todo, groupName } = e;
        const open = isTodoOpen(todo.status);
        const overdue = open && isPast(e.when.toISOString());
        return (
          <li key={e.key} className="list__block">
            <div className="row row--between">
              <div>
                <div className="list__title">
                  {todo.title || '(untitled)'}{' '}
                  {todo.status === 'done' ? <span className="pill pill--ok">done</span> : null}
                  {todo.status === 'in_progress' ? <span className="pill pill--info">in progress</span> : null}
                  {overdue ? <span className="pill pill--danger">overdue</span> : null}
                </div>
                <div className="muted small">
                  To-do {groupName ? `· ${groupName}` : ''} · {agendaScheduleKindLabel(e.scheduleKind)} ·{' '}
                  {formatShort(e.when.toISOString())}
                </div>
              </div>
              <div className="row">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={open ? <IcCheck size={16} /> : <IcUndo size={16} />}
                  onClick={() => onToggleTodo(todo.id)}
                >
                  {open ? 'Done' : 'Reopen'}
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
