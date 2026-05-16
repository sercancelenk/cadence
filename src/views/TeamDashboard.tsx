import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { IcArrowRight, IcCheck, IcPlus } from '../components/icons';
import { Button } from '../components/ui/Button';
import { useAppData } from '../AppDataContext';
import { PATH_TEAMS } from '../lib/routes';
import { distinctCategoriesForTeam, SUGGESTED_CATEGORIES } from '../lib/categories';
import { formatShort, isPast } from '../lib/datetime';
import { kindLabel } from '../lib/labels';
import { teamLeader, teamMe, teamPerson } from '../lib/teamPaths';
import type { Item, ItemKind, Person } from '../model';
import { getSelfPerson, isLeaderPerson, isSelfPerson } from '../model';

function openTasks(items: Item[]) {
  return items.filter((i) => i.kind === 'task' && !i.done);
}

function openGoals(items: Item[]) {
  return items.filter((i) => i.kind === 'goal' && !i.done);
}

function upcomingReminders(items: Item[]) {
  const now = Date.now();
  const week = now + 7 * 24 * 60 * 60 * 1000;
  return items.filter((i) => {
    if (!i.remindAt || i.done) return false;
    const t = Date.parse(i.remindAt);
    if (Number.isNaN(t)) return false;
    return t >= now && t <= week;
  });
}

function DashSpark({ d }: { d: string }) {
  return (
    <svg className="dash-stat__spark" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TeamDashboard() {
  const { teamId } = useParams();
  const { data, addItem, toggleItemDone } = useAppData();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [personId, setPersonId] = useState('');
  const [kind, setKind] = useState<ItemKind>('task');

  const team = teamId ? data.teams.find((t) => t.id === teamId) : undefined;
  const self = teamId ? getSelfPerson(data, teamId) : undefined;
  const allInTeam = useMemo(
    () => [...data.people].filter((p) => p.teamId === teamId).sort((a, b) => a.name.localeCompare(b.name)),
    [data.people, teamId],
  );

  const categoryHints = useMemo(() => {
    if (!teamId) return [...SUGGESTED_CATEGORIES];
    const d = distinctCategoriesForTeam(data, teamId);
    return [...new Set([...SUGGESTED_CATEGORIES, ...d])];
  }, [data, teamId]);

  const personIds = useMemo(() => new Set(allInTeam.map((p) => p.id)), [allInTeam]);
  const items = useMemo(() => data.items.filter((i) => personIds.has(i.personId)), [data.items, personIds]);

  const tasks = useMemo(() => openTasks(items).sort(compareDue), [items]);
  const goals = useMemo(() => openGoals(items).sort(compareDue), [items]);
  const reminders = useMemo(() => upcomingReminders(items).sort(compareRemind), [items]);

  useEffect(() => {
    setPersonId(self?.id ?? '');
  }, [self?.id, teamId]);

  if (!teamId || !team) return <Navigate to={PATH_TEAMS} replace />;

  const defaultPerson = self?.id ?? allInTeam[0]?.id ?? '';
  const effectivePersonId = personId && personIds.has(personId) ? personId : defaultPerson;

  return (
    <div className="page">
      <header className="page-head">
        <h1>{team.name}</h1>
        <p className="muted">Team overview: tasks, goals and reminders at a glance.</p>
      </header>

      <div className="dash-stat-grid" aria-label="Team overview">
        <article className="dash-stat dash-stat--violet">
          <div className="dash-stat__value">{tasks.length}</div>
          <div className="dash-stat__label">Open tasks</div>
          <DashSpark d="M0 22 L18 18 L36 24 L54 12 L72 16 L90 6 L108 14 L120 8" />
        </article>
        <article className="dash-stat dash-stat--blue">
          <div className="dash-stat__value">{goals.length}</div>
          <div className="dash-stat__label">Active goals</div>
          <DashSpark d="M0 14 L20 22 L40 10 L60 18 L80 8 L100 20 L120 12" />
        </article>
        <article className="dash-stat dash-stat--amber">
          <div className="dash-stat__value">{reminders.length}</div>
          <div className="dash-stat__label">Reminders (7 days)</div>
          <DashSpark d="M0 20 L24 8 L48 22 L72 14 L96 24 L120 16" />
        </article>
        <article className="dash-stat dash-stat--rose">
          <div className="dash-stat__value">{allInTeam.length}</div>
          <div className="dash-stat__label">Team members</div>
          <DashSpark d="M0 26 L22 20 L44 28 L66 12 L88 18 L110 10 L120 14" />
        </article>
      </div>

      <section className="card">
        <h2 className="card__title">Quick add</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const t = title.trim();
            if (!t || !effectivePersonId) return;
            addItem(effectivePersonId, kind, { title: t, category: category.trim() || undefined });
            setTitle('');
            setCategory('');
          }}
        >
          <input
            className="input input--grow"
            placeholder="Title (e.g. 1:1 note, follow-up…)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="input"
            style={{ minWidth: 140 }}
            placeholder="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list={`dash-cat-${teamId}`}
          />
          <datalist id={`dash-cat-${teamId}`}>
            {categoryHints.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <select className="select" value={effectivePersonId} onChange={(e) => setPersonId(e.target.value)}>
            {allInTeam.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {isSelfPerson(p) ? ' (you)' : ''}
                {isLeaderPerson(p) ? ' (leader)' : ''}
              </option>
            ))}
          </select>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
            <option value="task">Task</option>
            <option value="note">Note</option>
            <option value="goal">Goal</option>
            <option value="document">Document</option>
          </select>
          <Button type="submit" variant="primary" icon={<IcPlus size={18} />}>
            Add
          </Button>
        </form>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="card__title">Open tasks</h2>
          {tasks.length === 0 ? (
            <p className="muted">No open tasks in this team.</p>
          ) : (
            <ul className="list">
              {tasks.slice(0, 12).map((it) => (
                <li key={it.id} className="list__row">
                  <div>
                    <div className="list__title">{it.title}</div>
                    <div className="muted small">
                      {personName(data, it.personId)} · {it.dueAt ? `Due: ${formatShort(it.dueAt)}` : 'No due date'}
                      {it.dueAt && isPast(it.dueAt) ? ' · overdue' : ''}
                      {it.category ? ` · ${it.category}` : ''}
                    </div>
                  </div>
                  <div className="row">
                    <Link
                      className="btn btn--primary btn--icon"
                      to={personLink(data, teamId, it.personId)}
                      title="Open person workspace"
                      aria-label="Open person workspace"
                    >
                      <span className="btn__icon">
                        <IcArrowRight size={17} />
                      </span>
                    </Link>
                    <Button type="button" variant="secondary" size="sm" icon={<IcCheck size={16} />} onClick={() => toggleItemDone(it.id)}>
                      Done
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="card__title">Active goals</h2>
          {goals.length === 0 ? (
            <p className="muted">No active goals.</p>
          ) : (
            <ul className="list">
              {goals.slice(0, 10).map((it) => (
                <li key={it.id} className="list__row">
                  <div>
                    <div className="list__title">{it.title}</div>
                    <div className="muted small">
                      {personName(data, it.personId)}
                      {it.category ? ` · ${it.category}` : ''}
                    </div>
                  </div>
                  <Button type="button" variant="secondary" size="sm" icon={<IcCheck size={16} />} onClick={() => toggleItemDone(it.id)}>
                    Complete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="card__title">Upcoming reminders (7 days)</h2>
        {reminders.length === 0 ? (
          <p className="muted">No reminders in this window.</p>
        ) : (
          <ul className="list">
            {reminders.map((it) => {
              const to = personLink(data, teamId, it.personId);
              return (
                <li key={it.id} className="list__row">
                  <div>
                    <div className="list__title">
                      {it.title} <span className="pill">{kindLabel(it.kind)}</span>
                    </div>
                    <div className="muted small">
                      {personName(data, it.personId)} · {formatShort(it.remindAt)}
                      {it.category ? ` · ${it.category}` : ''}
                    </div>
                  </div>
                  <Link className="btn btn--ghost btn--icon" to={to} title="Open person workspace" aria-label="Open person workspace">
                    <span className="btn__icon">
                      <IcArrowRight size={17} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function personName(data: { people: { id: string; name: string }[] }, id: string) {
  return data.people.find((p) => p.id === id)?.name ?? 'Unknown';
}

function personLink(data: { people: Person[] }, teamId: string, personId: string): string {
  const p = data.people.find((x) => x.id === personId);
  if (!p) return teamMe(teamId);
  if (isSelfPerson(p)) return teamMe(teamId);
  if (isLeaderPerson(p)) return teamLeader(teamId);
  return teamPerson(teamId, personId);
}

function compareDue(a: Item, b: Item) {
  const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
  const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
  if (ad !== bd) return ad - bd;
  return b.updatedAt.localeCompare(a.updatedAt);
}

function compareRemind(a: Item, b: Item) {
  const ar = a.remindAt ? Date.parse(a.remindAt) : 0;
  const br = b.remindAt ? Date.parse(b.remindAt) : 0;
  return ar - br;
}
