import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useMatch } from 'react-router-dom';
import { IcArrowRight, IcLock, IcLogOut, IcMenu, IcMoon, IcSettings, IcStar, IcSun, IcUser } from './icons';
import { useAccount } from '../AccountContext';
import { useSession } from '../AuthContext';
import { useAppData } from '../AppDataContext';
import { sortedTeams } from '../lib/teamSort';
import { TEAM_STATUS_OPTIONS, teamStatusLabel } from '../lib/teamStatus';
import { PATH_HOME, PATH_TEAMS } from '../lib/routes';
import { teamBase } from '../lib/teamPaths';
import { useTheme } from '../ThemeContext';
import type { AppData, TeamStatus } from '../model';

function breadcrumbFromPath(data: AppData, pathname: string): string {
  if (pathname === PATH_HOME) return 'Home';
  if (pathname === PATH_TEAMS) return 'Teams';
  if (pathname === '/todos') return 'To-dos';
  if (pathname === '/profile') return 'Profile';
  if (pathname === '/settings') return 'Settings';
  const tm = pathname.match(/^\/teams\/([^/]+)/);
  if (!tm) return 'Leeadman';
  const id = tm[1];
  const base = `/teams/${id}`;
  const t = data.teams.find((x) => x.id === id);
  const tn = t?.name ?? 'Team';
  if (pathname === base) return `${tn} · Overview`;
  if (pathname.startsWith(`${base}/me`)) return `${tn} · Me`;
  if (pathname.startsWith(`${base}/leader`)) return `${tn} · My leader`;
  if (pathname.startsWith(`${base}/people/`)) {
    const rest = pathname.slice(`${base}/people/`.length);
    if (rest && !rest.includes('/')) {
      const person = data.people.find((p) => p.id === rest);
      return `${tn} · ${person?.name ?? 'Person'}`;
    }
  }
  if (pathname === `${base}/people`) return `${tn} · Members`;
  return tn;
}

type TopBarProps = { navCollapsed: boolean; onToggleNav: () => void };

export function TopBar({ navCollapsed, onToggleNav }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const teamMatch = useMatch({ path: '/teams/:teamId/*', end: false });
  const activeTeamId = teamMatch?.params.teamId;
  const { data, rememberTeam, toggleFavoriteTeam, updateTeam } = useAppData();
  const { user, logout } = useAccount();
  const { theme, toggle } = useTheme();
  const { pinEnabled, lockSession } = useSession();
  const profile = data.profile ?? { displayName: 'Me', favoriteTeamIds: [] };
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const teamsSorted = useMemo(() => sortedTeams(data), [data]);
  const currentTeam = activeTeamId ? data.teams.find((t) => t.id === activeTeamId) : undefined;
  const favSet = useMemo(() => new Set(profile.favoriteTeamIds), [profile.favoriteTeamIds]);

  useEffect(() => {
    if (!teamMenuOpen) return;
    const h = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setTeamMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [teamMenuOpen]);

  const initials = profile.displayName.trim().slice(0, 2).toUpperCase() || 'ME';
  const crumb = useMemo(() => breadcrumbFromPath(data, location.pathname), [data, location.pathname]);

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className="icon-btn topbar__menu-btn"
          aria-expanded={!navCollapsed}
          aria-label="Toggle sidebar"
          onClick={onToggleNav}
        >
          <IcMenu size={20} />
        </button>
        <div className="topbar__crumb muted" title={crumb}>
          {crumb}
        </div>
      </div>

      <div className="topbar__center">
        <div className="team-switcher" ref={switcherRef}>
          <button
            type="button"
            className="team-switcher__trigger"
            aria-expanded={teamMenuOpen}
            onClick={() => setTeamMenuOpen((o) => !o)}
          >
            {currentTeam ? (
              <>
                <span className={`team-dot team-dot--${currentTeam.status ?? 'active'}`} />
                <span className="team-switcher__name">{currentTeam.name}</span>
                <span className="team-switcher__caret" aria-hidden />
              </>
            ) : (
              <span className="team-switcher__placeholder">Select a team</span>
            )}
          </button>
          {teamMenuOpen ? (
            <div className="team-switcher__menu">
              {teamsSorted.map((t) => (
                <div key={t.id} className="team-switcher__row">
                  <button
                    type="button"
                    className="team-switcher__row-main"
                    onClick={() => {
                      rememberTeam(t.id);
                      navigate(teamBase(t.id));
                      setTeamMenuOpen(false);
                    }}
                  >
                    <span className={`team-dot team-dot--${t.status ?? 'active'}`} />
                    <span className="team-switcher__row-name">{t.name}</span>
                    <span className="team-switcher__row-meta">{teamStatusLabel(t.status)}</span>
                  </button>
                  <button
                    type="button"
                    className={`fav-star${favSet.has(t.id) ? ' fav-star--on' : ''}`}
                    title={favSet.has(t.id) ? 'Remove from favourites' : 'Add to favourites'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoriteTeam(t.id);
                    }}
                  >
                    <IcStar size={18} />
                  </button>
                </div>
              ))}
              <Link to={PATH_TEAMS} className="team-switcher__foot" onClick={() => setTeamMenuOpen(false)}>
                <IcArrowRight size={14} />
                Manage teams
              </Link>
            </div>
          ) : null}
        </div>
        {currentTeam ? (
          <select
            className="select select--compact topbar__status"
            value={currentTeam.status ?? 'active'}
            onChange={(e) => updateTeam(currentTeam.id, { status: e.target.value as TeamStatus })}
            aria-label="Team status"
          >
            {TEAM_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="topbar__right">
        <button type="button" className="icon-btn" title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggle}>
          {theme === 'dark' ? <IcSun size={20} /> : <IcMoon size={20} />}
        </button>
        <details className="profile-menu">
          <summary className="profile-menu__trigger">
            <span className="profile-avatar" title={profile.displayName}>
              {initials}
            </span>
          </summary>
          <div className="profile-menu__panel">
            <div className="profile-menu__head">{profile.displayName}</div>
            {user?.email ? <div className="muted small profile-menu__email">{user.email}</div> : null}
            <NavLink to="/profile" className="profile-menu__link">
              <IcUser size={16} />
              Profile
            </NavLink>
            <NavLink to="/settings" className="profile-menu__link">
              <IcSettings size={16} />
              All settings
            </NavLink>
            <button
              type="button"
              className="profile-menu__link profile-menu__link--danger"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              <IcLogOut size={16} />
              Sign out
            </button>
            {pinEnabled ? (
              <button type="button" className="profile-menu__link profile-menu__link--muted" onClick={() => lockSession()}>
                <IcLock size={16} />
                Lock session (PIN)
              </button>
            ) : null}
          </div>
        </details>
      </div>
    </header>
  );
}
