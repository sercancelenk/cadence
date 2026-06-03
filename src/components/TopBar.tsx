import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useMatch } from 'react-router-dom';
import {
  IcArrowRight,
  IcLock,
  IcLogOut,
  IcMenu,
  IcMoon,
  IcSearch,
  IcSettings,
  IcStar,
  IcSun,
  IcUser,
} from './icons';
import { CMD_PALETTE_OPEN_EVENT } from './CommandPalette';
import { useAccount } from '../AccountContext';
import { useSession } from '../AuthContext';
import { useAppDataActions, useAppDataSelector } from '../AppDataContext';
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
  if (pathname === '/agenda') return 'Agenda';
  if (pathname === '/analytics') return 'Analytics';
  if (pathname === '/profile') return 'Profile';
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/utilities/document') return 'Utilities · Document';
  if (pathname === '/utilities/structured') return 'Utilities · JSON / YAML';
  const tm = pathname.match(/^\/teams\/([^/]+)/);
  if (!tm) return 'Cadence';
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
  const { rememberTeam, toggleFavoriteTeam, updateTeam, flushPendingSave } = useAppDataActions();
  const topBarData = useAppDataSelector(
    (d) => ({
      profile: d.profile ?? { displayName: 'Me', favoriteTeamIds: [] as string[] },
      teams: d.teams,
      people: d.people,
    }),
    (a, b) => a.profile === b.profile && a.teams === b.teams && a.people === b.people,
  );
  const breadcrumb = useMemo(
    () => breadcrumbFromPath({ teams: topBarData.teams, people: topBarData.people } as AppData, location.pathname),
    [topBarData.teams, topBarData.people, location.pathname],
  );
  const { user, logout } = useAccount();
  const { theme, toggle } = useTheme();
  const { pinEnabled, lockSession } = useSession();
  const profile = topBarData.profile;
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const teamsSorted = useMemo(
    () => sortedTeams({ teams: topBarData.teams, profile: topBarData.profile } as AppData),
    [topBarData.teams, topBarData.profile],
  );
  const currentTeam = activeTeamId ? topBarData.teams.find((t) => t.id === activeTeamId) : undefined;
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
  const crumb = breadcrumb;

  /** Detect the platform once for the keyboard-shortcut badge — Mac users
   *  see ⌘K, everyone else sees Ctrl+K. We can't rely on the OS in the
   *  Electron environment, but `navigator.platform` is good enough here
   *  for a label that's purely cosmetic. */
  const shortcutLabel = useMemo(() => {
    if (typeof navigator === 'undefined') return 'Ctrl K';
    return /mac|iphone|ipad/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  }, []);

  const openSearch = () => window.dispatchEvent(new Event(CMD_PALETTE_OPEN_EVENT));

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
        {/* Global search trigger. Clicking (or focusing + Enter) opens
            the existing ⌘K command palette via a custom DOM event — the
            palette is the single source of truth for cross-app search.
            We deliberately use a button instead of a real <input> here so
            the keyboard shortcut and focus behaviour stay consistent and
            we don't have to wire two parallel search states. */}
        <button
          type="button"
          className="topbar__search"
          onClick={openSearch}
          onKeyDown={(e) => {
            if (e.key === '/') {
              e.preventDefault();
              openSearch();
            }
          }}
          aria-label="Search across notes, teams, people, items and to-dos"
        >
          <IcSearch size={16} />
          <span className="topbar__search-text">Search teams, notes, tasks…</span>
          <kbd className="topbar__search-kbd">{shortcutLabel}</kbd>
        </button>
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
            {profile.avatarDataUrl ? (
              <img
                src={profile.avatarDataUrl}
                alt=""
                className="profile-avatar profile-avatar--image"
                title={profile.displayName}
              />
            ) : (
              <span className="profile-avatar" title={profile.displayName}>
                {initials}
              </span>
            )}
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
                // CRITICAL data-loss guard: there may be a debounced save
                // pending for the CURRENT user. If we logout first, the
                // session is cleared, and the in-flight save either
                //   (a) silently drops (uid null → data:save returns false), or
                //   (b) — worse — writes the current user's payload into the
                //       NEXT signed-in user's file if a fast logout→login
                //       happens before the IPC resolves.
                // Flushing here guarantees the user's last keystrokes are
                // persisted under the right account before we tear the
                // session down. The defence-in-depth `expectedUid` guard
                // in the main process backstops this if something else
                // bypasses the flow.
                try { await flushPendingSave(); } catch { /* best effort */ }
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
