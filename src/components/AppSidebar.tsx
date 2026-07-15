import { NavLink, useMatch } from 'react-router-dom';
import {
  IcCalendar,
  IcChartBar,
  IcFileText,
  IcBraces,
  IcFolder,
  IcHome,
  IcLayoutGrid,
  IcListTodo,
  IcSettings,
  IcSliders,
  IcStickyNote,
  IcTarget,
  IcUser,
  IcUsers,
} from './icons';
import { useAppDataSelector } from '../AppDataContext';
import { brandIconUrl } from '../lib/appBranding';
import { useMobileWeb } from '../lib/runtime';
import {
  PATH_HOME,
  PATH_PLANNING,
  PATH_TEAMS,
  PATH_UTILITIES_DOCUMENT,
  PATH_UTILITIES_STRUCTURED,
  PATH_UTILITIES_TOOLS,
} from '../lib/routes';
import {
  teamLeader,
  teamMe,
  teamPeople as teamPeopleRoute,
  teamBase,
  teamSkipLevel,
} from '../lib/teamPaths';
import { AppSidebarFooter } from './AppSidebarFooter';

const linkCls = ({ isActive }: { isActive: boolean }) => `app-sidebar__link${isActive ? ' app-sidebar__link--active' : ''}`;

type Props = { collapsed: boolean };

export function AppSidebar({ collapsed }: Props) {
  const mobileWeb = useMobileWeb();
  const m = useMatch({ path: '/teams/:teamId/*', end: false });
  const teamId = m?.params.teamId;
  const sidebarData = useAppDataSelector(
    (d) => ({
      teams: d.teams,
      todoGroups: d.todoGroups,
      todoItems: d.todoItems,
      notes: d.notes,
    }),
    (a, b) =>
      a.teams === b.teams &&
      a.todoGroups === b.todoGroups &&
      a.todoItems === b.todoItems &&
      a.notes === b.notes,
  );
  const team = teamId ? sidebarData.teams.find((t) => t.id === teamId) : undefined;

  // Compute small badges for nav links that have a "hidden by filter"
  // failure mode. The point is to make data presence obvious from the
  // sidebar so a user who walks into an "empty" Todos / Notes page can
  // tell at a glance that the data is on disk and just filtered out.
  //
  // - Todos: open-todo count by default, plus an "(N archived)" hint
  //   when every todo group has been archived (the exact failure mode
  //   the user reported). Showing it in the sidebar means the user sees
  //   the warning even before they click into the page.
  // - Notes: locked vs unlocked split, again only when relevant.
  const todoSummary = (() => {
    const totalGroups = sidebarData.todoGroups.length;
    const archivedGroups = sidebarData.todoGroups.filter((g) => g.archived).length;
    const openTodos = sidebarData.todoItems.filter(
      (t) => t.status !== 'done' && t.status !== 'cancelled' && t.archived !== true,
    ).length;
    const allArchived = totalGroups > 0 && archivedGroups === totalGroups;
    return { openTodos, allArchived, archivedGroups, totalGroups };
  })();
  const notesSummary = (() => {
    const total = sidebarData.notes.filter((n) => n.archived !== true).length;
    const locked = sidebarData.notes.filter((n) => n.locked && n.archived !== true).length;
    return { total, locked };
  })();

  return (
    <aside className="app-sidebar" aria-label="Main navigation">
      <div className="app-sidebar__brand">
        <img className="app-sidebar__logo" src={brandIconUrl()} alt="" aria-hidden />
        {!collapsed ? (
          <div className="app-sidebar__brand-text">
            <span className="app-sidebar__title">Cadence</span>
            <span className="app-sidebar__subtitle">Leadership workspace</span>
          </div>
        ) : null}
      </div>

      <nav className="app-sidebar__nav">
        {/* "App" carries the day-to-day surfaces in roughly the order a
            user moves through them: glance at the dashboard, scan the
            day on Agenda, work the queue on To-dos, capture thoughts in
            Notes, dip into Teams when a 1:1 comes up. Analytics moved
            to "Account" because it's a meta / personal-stats surface,
            not a work-in-progress one. */}
        <div className="app-sidebar__section">
          {!collapsed ? <div className="app-sidebar__section-label">App</div> : null}
          {!mobileWeb ? (
            <NavLink to={PATH_HOME} end className={linkCls} title="Home">
              <span className="app-sidebar__ic">
                <IcHome size={18} />
              </span>
              {!collapsed ? <span>Home</span> : null}
            </NavLink>
          ) : null}
          <NavLink to="/agenda" className={linkCls} title="Agenda">
            <span className="app-sidebar__ic">
              <IcCalendar size={18} />
            </span>
            {!collapsed ? <span>Agenda</span> : null}
          </NavLink>
          <NavLink to={PATH_PLANNING} className={linkCls} title="Planning — personal Eisenhower matrix">
            <span className="app-sidebar__ic">
              <IcTarget size={18} />
            </span>
            {!collapsed ? <span>Planning</span> : null}
          </NavLink>
          <NavLink
            to="/todos"
            className={linkCls}
            title={
              todoSummary.allArchived
                ? `To-dos — all ${todoSummary.archivedGroups} lists archived (${todoSummary.openTodos} open todos hidden)`
                : `To-dos — ${todoSummary.openTodos} open`
            }
          >
            <span className="app-sidebar__ic">
              <IcListTodo size={18} />
            </span>
            {!collapsed ? <span>To-dos</span> : null}
            {!collapsed && (todoSummary.openTodos > 0 || todoSummary.allArchived) ? (
              <span
                className={`app-sidebar__badge${todoSummary.allArchived ? ' app-sidebar__badge--warn' : ''}`}
                aria-label={
                  todoSummary.allArchived
                    ? `${todoSummary.openTodos} open todos hidden in archived lists`
                    : `${todoSummary.openTodos} open todos`
                }
              >
                {todoSummary.allArchived ? `${todoSummary.openTodos} ⚠` : todoSummary.openTodos}
              </span>
            ) : null}
          </NavLink>
          <NavLink
            to="/notes"
            className={linkCls}
            title={
              notesSummary.locked > 0
                ? `Notes — ${notesSummary.total} total (${notesSummary.locked} locked)`
                : `Notes — ${notesSummary.total} total`
            }
          >
            <span className="app-sidebar__ic">
              <IcStickyNote size={18} />
            </span>
            {!collapsed ? <span>Notes</span> : null}
            {!collapsed && notesSummary.total > 0 ? (
              <span className="app-sidebar__badge">{notesSummary.total}</span>
            ) : null}
          </NavLink>
          {!mobileWeb ? (
            <NavLink to={PATH_TEAMS} end className={linkCls} title="Teams">
              <span className="app-sidebar__ic">
                <IcFolder size={18} />
              </span>
              {!collapsed ? <span>Teams</span> : null}
            </NavLink>
          ) : null}
        </div>

        {!mobileWeb ? (
        <div className="app-sidebar__section">
          {!collapsed ? <div className="app-sidebar__section-label">Utilities</div> : null}
          <NavLink to={PATH_UTILITIES_DOCUMENT} className={linkCls} title="Document — scratch pad">
            <span className="app-sidebar__ic">
              <IcFileText size={18} />
            </span>
            {!collapsed ? <span>Document</span> : null}
          </NavLink>
          <NavLink to={PATH_UTILITIES_STRUCTURED} className={linkCls} title="JSON / YAML editor">
            <span className="app-sidebar__ic">
              <IcBraces size={18} />
            </span>
            {!collapsed ? <span>JSON / YAML</span> : null}
          </NavLink>
          <NavLink to={PATH_UTILITIES_TOOLS} className={linkCls} title="Stateless developer tools">
            <span className="app-sidebar__ic">
              <IcSliders size={18} />
            </span>
            {!collapsed ? <span>Tools</span> : null}
          </NavLink>
        </div>
        ) : null}

        <div className="app-sidebar__section">
          {!collapsed ? <div className="app-sidebar__section-label">Account</div> : null}
          {!mobileWeb ? (
          <NavLink to="/analytics" className={linkCls} title="Analytics">
            <span className="app-sidebar__ic">
              <IcChartBar size={18} />
            </span>
            {!collapsed ? <span>Analytics</span> : null}
          </NavLink>
          ) : null}
          <NavLink to="/profile" className={linkCls} title="Profile">
            <span className="app-sidebar__ic">
              <IcUser size={18} />
            </span>
            {!collapsed ? <span>Profile</span> : null}
          </NavLink>
          <NavLink to="/settings" className={linkCls} title="Settings">
            <span className="app-sidebar__ic">
              <IcSettings size={18} />
            </span>
            {!collapsed ? <span>Settings</span> : null}
          </NavLink>
        </div>

        {teamId && team ? (
          <div className="app-sidebar__section app-sidebar__section--team">
            {!collapsed ? (
              <div className="app-sidebar__section-label">
                Team <span className="app-sidebar__team-name">{team.name}</span>
              </div>
            ) : null}
            <NavLink to={teamBase(teamId)} end className={linkCls} title="Overview">
              <span className="app-sidebar__ic">
                <IcLayoutGrid size={18} />
              </span>
              {!collapsed ? <span>Overview</span> : null}
            </NavLink>
            <NavLink to={teamMe(teamId)} className={linkCls} title="Me">
              <span className="app-sidebar__ic">
                <IcUser size={18} />
              </span>
              {!collapsed ? <span>Me</span> : null}
            </NavLink>
            <NavLink to={teamLeader(teamId)} className={linkCls} title="My leader">
              <span className="app-sidebar__ic">
                <IcTarget size={18} />
              </span>
              {!collapsed ? <span>My leader</span> : null}
            </NavLink>
            <NavLink to={teamSkipLevel(teamId)} className={linkCls} title="Skip-level leader">
              <span className="app-sidebar__ic">
                <IcChartBar size={18} />
              </span>
              {!collapsed ? <span>Skip-level</span> : null}
            </NavLink>
            <NavLink to={teamPeopleRoute(teamId)} className={linkCls} title="Team members">
              <span className="app-sidebar__ic">
                <IcUsers size={18} />
              </span>
              {!collapsed ? <span>Members</span> : null}
            </NavLink>
          </div>
        ) : null}
      </nav>

      <AppSidebarFooter collapsed={collapsed} />
    </aside>
  );
}
