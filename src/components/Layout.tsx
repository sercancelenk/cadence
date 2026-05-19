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
