import { NavLink, useMatch } from 'react-router-dom';
import {
  IcCalendar,
  IcChartBar,
  IcFolder,
  IcHome,
  IcLayoutGrid,
  IcListTodo,
  IcSettings,
  IcStickyNote,
  IcTarget,
  IcUser,
  IcUsers,
} from './icons';
import { useAppData } from '../AppDataContext';
import { brandIconUrl } from '../lib/appBranding';
import { PATH_HOME, PATH_TEAMS } from '../lib/routes';
import { teamLeader, teamMe, teamPeople as teamPeopleRoute, teamBase } from '../lib/teamPaths';

const linkCls = ({ isActive }: { isActive: boolean }) => `app-sidebar__link${isActive ? ' app-sidebar__link--active' : ''}`;

type Props = { collapsed: boolean };

export function AppSidebar({ collapsed }: Props) {
  const m = useMatch({ path: '/teams/:teamId/*', end: false });
  const teamId = m?.params.teamId;
  const { data } = useAppData();
  const team = teamId ? data.teams.find((t) => t.id === teamId) : undefined;

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
        <div className="app-sidebar__section">
          {!collapsed ? <div className="app-sidebar__section-label">App</div> : null}
          <NavLink to={PATH_HOME} end className={linkCls} title="Home">
            <span className="app-sidebar__ic">
              <IcHome size={18} />
            </span>
            {!collapsed ? <span>Home</span> : null}
          </NavLink>
          <NavLink to={PATH_TEAMS} end className={linkCls} title="Teams">
            <span className="app-sidebar__ic">
              <IcFolder size={18} />
            </span>
            {!collapsed ? <span>Teams</span> : null}
          </NavLink>
          <NavLink to="/todos" className={linkCls} title="To-dos">
            <span className="app-sidebar__ic">
              <IcListTodo size={18} />
            </span>
            {!collapsed ? <span>To-dos</span> : null}
          </NavLink>
          <NavLink to="/agenda" className={linkCls} title="Agenda">
            <span className="app-sidebar__ic">
              <IcCalendar size={18} />
            </span>
            {!collapsed ? <span>Agenda</span> : null}
          </NavLink>
          <NavLink to="/notes" className={linkCls} title="Notes">
            <span className="app-sidebar__ic">
              <IcStickyNote size={18} />
            </span>
            {!collapsed ? <span>Notes</span> : null}
          </NavLink>
          <NavLink to="/analytics" className={linkCls} title="Analytics">
            <span className="app-sidebar__ic">
              <IcChartBar size={18} />
            </span>
            {!collapsed ? <span>Analytics</span> : null}
          </NavLink>
        </div>

        <div className="app-sidebar__section">
          {!collapsed ? <div className="app-sidebar__section-label">Account</div> : null}
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
            <NavLink to={teamPeopleRoute(teamId)} className={linkCls} title="Team members">
              <span className="app-sidebar__ic">
                <IcUsers size={18} />
              </span>
              {!collapsed ? <span>Members</span> : null}
            </NavLink>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
