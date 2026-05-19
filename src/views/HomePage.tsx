import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { IcArrowRight, IcCalendar, IcFolder, IcLayoutGrid, IcListTodo, IcSettings, IcUser } from '../components/icons';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import { isTodoOpen } from '../model';
import { brandIconUrl } from '../lib/appBranding';
import { PATH_TEAMS } from '../lib/routes';
import { sortedTeams } from '../lib/teamSort';
import { teamBase } from '../lib/teamPaths';

export function HomePage() {
  const { user } = useAccount();
  const { data } = useAppData();
  const profile = data.profile ?? { displayName: 'Me' };
  const teamsSorted = useMemo(() => sortedTeams(data), [data]);
  const lastTeam = data.lastTeamId ? data.teams.find((t) => t.id === data.lastTeamId) : undefined;
  const openTasksAll = useMemo(
    () =>
      data.items.filter((it) => !it.done && it.kind === 'task' && data.people.some((p) => p.id === it.personId)).length,
    [data.items, data.people],
  );
  // "Open" = still actively pending (todo or in_progress). Cancelled rows
  // were dropped on purpose and don't belong in the open count any more
  // than done rows do.
  const openTodos = useMemo(
    () => data.todoItems.filter((t) => isTodoOpen(t.status)).length,
    [data.todoItems],
  );
  const peopleCount = data.people.filter((p) => !p.id.startsWith('__')).length;

  return (
    <div className="page home-page">
      <header className="home-page__hero">
        <div className="home-page__brand">
          <img className="home-page__logo" src={brandIconUrl()} alt="" aria-hidden />
          <div>
            <h1 className="home-page__title">Cadence</h1>
            <p className="home-page__tagline">A local-first leadership workspace — teams, personal to-dos and 1:1 follow-ups.</p>
          </div>
        </div>
        <p className="home-page__welcome muted">
          Hello, <strong className="home-page__name">{profile.displayName}</strong>
          {user?.email ? (
            <>
              {' '}
              · <span className="home-page__email">{user.email}</span>
            </>
          ) : null}
        </p>
      </header>

      <div className="home-page__stats">
        <div className="home-page__stat">
          <span className="home-page__stat-value">{data.teams.length}</span>
          <span className="home-page__stat-label">Teams</span>
        </div>
        <div className="home-page__stat">
          <span className="home-page__stat-value">{openTasksAll}</span>
          <span className="home-page__stat-label">Open tasks</span>
        </div>
        <div className="home-page__stat">
          <span className="home-page__stat-value">{openTodos}</span>
          <span className="home-page__stat-label">To-dos</span>
        </div>
        <div className="home-page__stat">
          <span className="home-page__stat-value">{peopleCount}</span>
          <span className="home-page__stat-label">People</span>
        </div>
      </div>

      <h2 className="home-page__section-title">Quick access</h2>
      <div className="home-page__tiles">
        <Link className="home-tile" to={PATH_TEAMS}>
          <span className="home-tile__ic">
            <IcFolder size={22} />
          </span>
          <span className="home-tile__title">Teams</span>
          <span className="home-tile__desc">Manage your teams, members and tasks.</span>
          <span className="home-tile__arrow" aria-hidden>
            <IcArrowRight size={18} />
          </span>
        </Link>

        <Link className="home-tile" to="/todos">
          <span className="home-tile__ic">
            <IcListTodo size={22} />
          </span>
          <span className="home-tile__title">To-dos</span>
          <span className="home-tile__desc">Personal lists, independent from any team.</span>
          <span className="home-tile__arrow" aria-hidden>
            <IcArrowRight size={18} />
          </span>
        </Link>

        <Link className="home-tile" to="/agenda">
          <span className="home-tile__ic">
            <IcCalendar size={22} />
          </span>
          <span className="home-tile__title">Agenda</span>
          <span className="home-tile__desc">Today and the upcoming week across teams and to-dos.</span>
          <span className="home-tile__arrow" aria-hidden>
            <IcArrowRight size={18} />
          </span>
        </Link>

        {lastTeam ? (
          <Link className="home-tile home-tile--accent" to={teamBase(lastTeam.id)}>
            <span className="home-tile__ic">
              <IcLayoutGrid size={22} />
            </span>
            <span className="home-tile__title">Last team</span>
            <span className="home-tile__desc">{lastTeam.name} · open overview</span>
            <span className="home-tile__arrow" aria-hidden>
              <IcArrowRight size={18} />
            </span>
          </Link>
        ) : teamsSorted[0] ? (
          <Link className="home-tile home-tile--accent" to={teamBase(teamsSorted[0].id)}>
            <span className="home-tile__ic">
              <IcLayoutGrid size={22} />
            </span>
            <span className="home-tile__title">Your first team</span>
            <span className="home-tile__desc">{teamsSorted[0].name} · open overview</span>
            <span className="home-tile__arrow" aria-hidden>
              <IcArrowRight size={18} />
            </span>
          </Link>
        ) : null}

        <Link className="home-tile" to="/profile">
          <span className="home-tile__ic">
            <IcUser size={22} />
          </span>
          <span className="home-tile__title">Profile</span>
          <span className="home-tile__desc">Display name and personal details.</span>
          <span className="home-tile__arrow" aria-hidden>
            <IcArrowRight size={18} />
          </span>
        </Link>

        <Link className="home-tile" to="/settings">
          <span className="home-tile__ic">
            <IcSettings size={22} />
          </span>
          <span className="home-tile__title">Settings</span>
          <span className="home-tile__desc">Theme, PIN lock, backup and version.</span>
          <span className="home-tile__arrow" aria-hidden>
            <IcArrowRight size={18} />
          </span>
        </Link>
      </div>

      {teamsSorted.length > 0 ? (
        <>
          <h2 className="home-page__section-title">Your teams</h2>
          <ul className="home-page__team-chips">
            {teamsSorted.slice(0, 6).map((t) => {
              const n = data.people.filter((p) => p.teamId === t.id).length;
              return (
                <li key={t.id}>
                  <Link className="home-team-chip" to={teamBase(t.id)}>
                    <span className={`team-dot team-dot--${t.status ?? 'active'}`} aria-hidden />
                    <span className="home-team-chip__name">{t.name}</span>
                    <span className="home-team-chip__meta muted small">{n} {n === 1 ? 'member' : 'members'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {teamsSorted.length > 6 ? (
            <p className="muted small home-page__more">
              +{teamsSorted.length - 6} more — <Link to={PATH_TEAMS}>view all</Link>
            </p>
          ) : null}
        </>
      ) : (
        <p className="muted home-page__hint">
          No teams yet. Create your first team from the <Link to={PATH_TEAMS}>Teams</Link> page.
        </p>
      )}
    </div>
  );
}
