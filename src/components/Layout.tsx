import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { useAppData } from '../AppDataContext';
import { IcAlertTriangle, IcX } from './icons';
import { PATH_SETTINGS } from '../lib/routes';

const MOBILE_BREAKPOINT = 700;

function detectIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

export function Layout() {
  const [isMobile, setIsMobile] = useState<boolean>(detectIsMobile);
  // On phones we want the user to see content first; the sidebar opens as a
  // slide-in drawer when the hamburger is tapped. On desktop the sidebar is
  // visible by default and the toggle just switches between full / collapsed.
  const [navCollapsed, setNavCollapsed] = useState<boolean>(detectIsMobile);
  const location = useLocation();

  // Track viewport changes (rotate / resize). When transitioning from desktop
  // to mobile we collapse, and vice-versa we expand for the desktop default.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      setNavCollapsed(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // On mobile, dismiss the drawer whenever the route changes so taps on a
  // sidebar link don't leave the overlay covering the page.
  useEffect(() => {
    if (isMobile) setNavCollapsed(true);
  }, [location.pathname, isMobile]);

  // Lock the body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!isMobile) return;
    const open = !navCollapsed;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, navCollapsed]);

  const drawerOpen = isMobile && !navCollapsed;

  return (
    <div
      className={[
        'app-shell',
        navCollapsed ? 'app-shell--nav-collapsed' : '',
        isMobile ? 'app-shell--mobile' : '',
        drawerOpen ? 'app-shell--drawer-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TopBar
        navCollapsed={navCollapsed}
        onToggleNav={() => setNavCollapsed((c) => !c)}
      />
      <SaveErrorBanner />
      <DataIntegrityBanner />
      <div className="app-shell__body">
        <AppSidebar collapsed={navCollapsed && !isMobile} />
        {drawerOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="app-shell__backdrop"
            onClick={() => setNavCollapsed(true)}
          />
        ) : null}
        <main className="main main--scroll main--canvas">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * High-priority banner shown when boot detects that the freshly loaded
 * workspace is meaningfully smaller than the last-known-good
 * fingerprint we persisted on the previous successful save. This is
 * how we surface "looks like data may have been lost" without ever
 * silently mutating the user's file — the user decides whether to
 * restore a backup, dismiss the alarm (= accept the current state),
 * or just inspect.
 *
 * UX choices:
 *   - Yellow / amber tone, NOT red. Red is reserved for "save failed
 *     right now"; this banner reports a historical suspicion.
 *   - The numbers are spelled out ("12 items → 0 items") because
 *     percentage-only is too abstract under stress.
 *   - "Open Backups & Recovery" is the primary action — it's almost
 *     always what the user wants.
 *   - Dismiss is not destructive: it just rebases the fingerprint to
 *     the current shape. If the user signs out and back in, no banner.
 */
function DataIntegrityBanner() {
  const { dataLossSuspicion, dismissDataLossSuspicion } = useAppData();
  const navigate = useNavigate();
  if (!dataLossSuspicion) return null;
  const { current, previous } = dataLossSuspicion;
  return (
    <div role="alert" className="data-integrity-banner">
      <span className="data-integrity-banner__icon" aria-hidden>
        <IcAlertTriangle size={16} />
      </span>
      <div className="data-integrity-banner__text">
        <strong>Looks like data may be missing.</strong>{' '}
        <span className="data-integrity-banner__detail">
          Your previous session had <strong>{previous.total} items</strong> (
          {previous.teams} teams, {previous.todoItems} todos, {previous.notes} notes);
          this boot loaded <strong>{current.total} items</strong> (
          {current.teams} teams, {current.todoItems} todos, {current.notes} notes).
          Open Backups & Recovery to inspect or restore an earlier snapshot.
        </span>
      </div>
      <div className="data-integrity-banner__actions">
        <button
          type="button"
          className="data-integrity-banner__btn data-integrity-banner__btn--primary"
          onClick={() => navigate(`${PATH_SETTINGS}#backups`)}
        >
          Open Backups
        </button>
        <button
          type="button"
          className="data-integrity-banner__btn"
          onClick={dismissDataLossSuspicion}
          aria-label="Dismiss (accept current state as the new normal)"
          title="Dismiss (accept current state as the new normal)"
        >
          <IcX size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Top-of-screen banner that warns the user when an autosave failed. Shown
 * regardless of which page they're on, because losing a write silently is
 * the worst failure mode for a local-first app. Dismiss is best-effort —
 * the next successful save clears it automatically.
 */
function SaveErrorBanner() {
  const { lastSaveError, clearSaveError } = useAppData();
  const navigate = useNavigate();
  if (!lastSaveError) return null;
  const reason = lastSaveError.reason ?? 'unknown';
  const detail = lastSaveError.error ?? 'Autosave failed.';
  return (
    <div role="alert" className="save-error-banner">
      <span className="save-error-banner__icon" aria-hidden>
        <IcAlertTriangle size={16} />
      </span>
      <div className="save-error-banner__text">
        <strong>Autosave failed.</strong>{' '}
        <span className="save-error-banner__detail">
          {detail} (reason: {reason})
        </span>
      </div>
      <div className="save-error-banner__actions">
        <button
          type="button"
          className="save-error-banner__btn save-error-banner__btn--primary"
          onClick={() => navigate(`${PATH_SETTINGS}#backups`)}
        >
          Open Backups
        </button>
        <button
          type="button"
          className="save-error-banner__btn"
          onClick={clearSaveError}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <IcX size={14} />
        </button>
      </div>
    </div>
  );
}
