import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { Button } from '../components/ui/Button';
import { IcCheck, IcUndo } from '../components/icons';
import { formatShort, isPast } from '../lib/datetime';
import { kindLabel } from '../lib/labels';
import { teamPerson } from '../lib/teamPaths';
import type { Item, TodoItem } from '../model';
import { isTodoOpen } from '../model';

type AgendaEntry =
  | {
      kind: 'item';
      key: string;
      when: Date;
      item: Item;
      teamId?: string;
      teamName?: string;
      personName?: string;
    }
  | { kind: 'todo'; key: string; when: Date; todo: TodoItem; groupName?: string };

/**
 * Unified agenda: shows reminders + due-dates from team items and personal todos,
 * grouped by day. Today is always shown even if empty; the next 6 days are also
 * shown but only the ones that have entries.
 */
export function AgendaPage() {
  const { data, toggleItemDone, toggleTodoItem } = useAppData();
  const [showCompleted, setShowCompleted] = useState(false);

  const entries = useMemo<AgendaEntry[]>(() => {
    const out: AgendaEntry[] = [];

    for (const it of data.items) {
      if (it.done && !showCompleted) continue;
      const person = data.people.find((p) => p.id === it.personId);
      const team = person ? data.teams.find((t) => t.id === person.teamId) : undefined;
      if (it.remindAt) {
        const d = new Date(it.remindAt);
        if (!Number.isNaN(d.getTime())) {
          out.push({
            kind: 'item',
            key: `${it.id}-r`,
            when: d,
            item: it,
            teamId: team?.id,
            teamName: team?.name,
            personName: person?.name,
          });
        }
      }
      if (it.dueAt) {
        const d = new Date(it.dueAt);
        if (!Number.isNaN(d.getTime())) {
          out.push({
            kind: 'item',
            key: `${it.id}-d`,
            when: d,
            item: it,
            teamId: team?.id,
            teamName: team?.name,
            personName: person?.name,
          });
        }
      }
    }

    for (const t of data.todoItems) {
      // Cancelled todos were explicitly dropped — they no longer
      // belong on the agenda even when "show completed" is on, because
      // there's nothing left to act on. Done todos stay (toggleable)
      // when showCompleted is true so people can review or reopen them.
      if (t.status === 'cancelled') continue;
      if (!isTodoOpen(t.status) && !showCompleted) continue;
      if (!t.dueAt) continue;
      const d = new Date(t.dueAt);
      if (Number.isNaN(d.getTime())) continue;
      const group = data.todoGroups.find((g) => g.id === t.groupId);
      out.push({ kind: 'todo', key: t.id, when: d, todo: t, groupName: group?.name });
    }

    return out.sort((a, b) => a.when.getTime() - b.when.getTime());
  }, [data, showCompleted]);

  const days = useMemo(() => buildWeekStrip(entries), [entries]);
  const overdue = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.when.getTime() < startOfDay(new Date()).getTime() &&
          (e.kind === 'item' ? !e.item.done : isTodoOpen(e.todo.status)),
      ),
    [entries],
  );

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
                    {personName ? ` · ${personName}` : ''} · {formatShort(e.when.toISOString())}
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
                  To-do {groupName ? `· ${groupName}` : ''} · {formatShort(e.when.toISOString())}
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

type DayBucket = {
  key: string;
  label: string;
  subtitle: string;
  isToday: boolean;
  entries: AgendaEntry[];
};

function buildWeekStrip(entries: AgendaEntry[]): DayBucket[] {
  const today = startOfDay(new Date());
  const out: DayBucket[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const dayStart = new Date(today);
    dayStart.setDate(dayStart.getDate() + offset);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const bucket = entries.filter((e) => e.when >= dayStart && e.when < dayEnd);
    if (offset > 0 && bucket.length === 0) continue;
    out.push({
      key: dayKey(dayStart),
      label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : dayStart.toLocaleDateString(undefined, { weekday: 'long' }),
      subtitle: dayStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      isToday: offset === 0,
      entries: bucket,
    });
  }
  return out;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
