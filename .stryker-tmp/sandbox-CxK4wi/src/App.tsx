// @ts-nocheck
import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AccountProvider, useAccount } from './providers/AccountContext';
import { AuthGate, AuthProvider } from './providers/AuthContext';
import { AppDataProvider, useAppData, useElectronReminderBridge, usePwaReminderBridge, useReminderWatcher } from './providers/AppDataContext';
import { Layout } from './components/Layout';
import { TeamLayout } from './components/TeamLayout';
import { ThemeProvider } from './providers/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { PATH_TEAMS } from './lib/routes';
import { CommandPalette } from './components/CommandPalette';
import { NotesUnlockProvider } from './providers/NotesUnlockContext';
import { WelcomeTour } from './components/WelcomeTour';
import { useSyncAutoSync } from './lib/useSyncAutoSync';
import { useAppDeepLink } from './hooks/useAppDeepLink';
import { FeaturesProvider, useFeatures } from './lib/features';
import './app.css';

// Each route lives in its own JS chunk. The Markdown editor and `react-markdown`
// only ship with the `People` chunk because that's the only place that needs
// them — initial bundle drops dramatically (especially on the mobile PWA).
const HomePage = lazy(() => import('./views/HomePage').then((m) => ({ default: m.HomePage })));
const HomeTeams = lazy(() => import('./views/HomeTeams').then((m) => ({ default: m.HomeTeams })));
const LoginPage = lazy(() => import('./views/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./views/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const TodosPage = lazy(() => import('./views/TodosPage').then((m) => ({ default: m.TodosPage })));
const AgendaPage = lazy(() => import('./views/AgendaPage').then((m) => ({ default: m.AgendaPage })));
const AnalyticsPage = lazy(() => import('./views/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const ProfilePage = lazy(() => import('./views/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const Settings = lazy(() => import('./views/Settings').then((m) => ({ default: m.Settings })));
const NotesPage = lazy(() => import('./views/NotesPage').then((m) => ({ default: m.NotesPage })));
const UtilitiesDocumentPage = lazy(() =>
  import('./views/UtilitiesDocumentPage').then((m) => ({ default: m.UtilitiesDocumentPage })),
);
const UtilitiesStructuredPage = lazy(() =>
  import('./views/UtilitiesStructuredPage').then((m) => ({ default: m.UtilitiesStructuredPage })),
);
const TeamDashboard = lazy(() => import('./views/TeamDashboard').then((m) => ({ default: m.TeamDashboard })));
// All four People routes share the same chunk (they import each other) — using
// individual lazy() calls is fine: Rollup keeps them in one file and Vite
// dedupes the dynamic import promise.
const PeoplePage = lazy(() => import('./views/People').then((m) => ({ default: m.People })));
const PersonRoute = lazy(() => import('./views/People').then((m) => ({ default: m.PersonRoute })));
const TeamMePage = lazy(() => import('./views/People').then((m) => ({ default: m.TeamMePage })));
const TeamLeaderPage = lazy(() => import('./views/People').then((m) => ({ default: m.TeamLeaderPage })));

/**
 * Pick the router and its basename based on where this bundle is being
 * served from. There are four distinct runtime contexts the same source
 * has to support:
 *
 *   1. Electron desktop (`file://`)   — BASE_URL='./' → HashRouter, no basename.
 *   2. Vite dev server (`http://localhost:5173/`) — BASE_URL='/' → BrowserRouter, '/'.
 *   3. GitHub Pages PWA (`/cadence/app/`)         — BASE_URL='/cadence/app/' → BrowserRouter, '/cadence/app'.
 *   4. LAN sync server (`https://<lan-ip>:9787/`) — the Electron-built bundle
 *      gets served over HTTPS to mobile devices. BASE_URL='./' here too,
 *      which means BrowserRouter would activate with basename='.', a
 *      string React Router cannot parse — every route silently fails to
 *      match and the page renders as a bare <body> ("black screen").
 *
 * The fix: any build that emitted relative asset paths (BASE_URL='./')
 * is an Electron-style bundle. Treat it as HashRouter regardless of how
 * it's being delivered, so it survives being mirrored from the LAN sync
 * server too.
 */
const baseUrl = import.meta.env.BASE_URL || '/';
const isElectronStyleBundle = baseUrl === './';
const isFileProtocol =
  typeof window !== 'undefined' && window.location.protocol === 'file:';
const HistoryRouter = isFileProtocol || isElectronStyleBundle ? HashRouter : BrowserRouter;
const routerBasename = (() => {
  // HashRouter ignores basename entirely; only the PWA build (with an
  // absolute Vite base) needs a basename for BrowserRouter to keep its
  // history segments aligned with the GitHub Pages sub-path.
  if (isFileProtocol || isElectronStyleBundle) return undefined;
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed || '/';
})();

function BootLoading({ label }: { label: string }) {
  return (
    <div className="boot">
      <div className="boot__card">{label}</div>
    </div>
  );
}

function ProtectedShell() {
  const { user, loading } = useAccount();
  const location = useLocation();
  if (loading) return <BootLoading label="Loading session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return (
    <AppDataProvider key={user.id}>
      <AuthProvider>
        <AuthGate>
          <NotesUnlockProvider>
            <Boot />
          </NotesUnlockProvider>
        </AuthGate>
      </AuthProvider>
    </AppDataProvider>
  );
}

/**
 * When the app is launched from the iOS/Android home-screen shortcut
 * (start_url has `?source=pwa`) and the user lands on `/`, jump straight
 * into the To-dos screen — the primary mobile use-case.
 */
function MobileStartRedirect({ children }: { children: ReactElement }) {
  const location = useLocation();
  const isPwaLaunch =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('source') === 'pwa';
  if (isPwaLaunch && location.pathname === '/') {
    return <Navigate to="/todos" replace />;
  }
  return children;
}

export default function App() {
  return (
    <HistoryRouter basename={routerBasename}>
      <ThemeProvider>
        {/* ToastProvider sits inside ThemeProvider so toasts inherit the
            active CSS theme variables. It sits OUTSIDE the routed surfaces
            (Routes / ProtectedShell) so a toast queued by a route can
            survive a navigation that unmounts that route's tree. */}
        <ToastProvider>
          {/* FeaturesProvider must wrap AccountProvider — login/register routes
              also consult the feature flags (e.g. to hide "Sign up" if a strict
              shared-device policy is in place). */}
          <FeaturesProvider>
            <AccountProvider>
              <Suspense fallback={<BootLoading label="Loading…" />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="*" element={<ProtectedShell />} />
                </Routes>
              </Suspense>
            </AccountProvider>
          </FeaturesProvider>
        </ToastProvider>
      </ThemeProvider>
    </HistoryRouter>
  );
}

function Boot() {
  const { ready } = useAppData();
  if (!ready) {
    return (
      <div className="boot">
        <div className="boot__card">Loading data…</div>
      </div>
    );
  }
  return <AppRoutes />;
}

function AppRoutes() {
  useAppDeepLink();
  useElectronReminderBridge();
  usePwaReminderBridge();
  useReminderWatcher();
  // Keep this device's workspace in sync with the paired host (if any).
  // No-op when the user hasn't paired yet, so safe to mount unconditionally —
  // BUT when policy disables both sync backends we don't even want to
  // start the polling timer. Saves battery on shared/work devices and
  // avoids any debug-log noise that might hint at a hidden code path.
  const { features } = useFeatures();
  useSyncAutoSync({ enabled: features.sync.lan || features.sync.cloud });
  return (
    <>
      <CommandPalette />
      <WelcomeTour />
      <Suspense fallback={<BootLoading label="Loading…" />}>
        <Routes>
          <Route element={<Layout />}>
            <Route
              index
              element={
                <MobileStartRedirect>
                  <HomePage />
                </MobileStartRedirect>
              }
            />
            <Route path={PATH_TEAMS.replace(/^\//, '')} element={<HomeTeams />} />
            <Route path="todos" element={<TodosPage />} />
            <Route path="agenda" element={<AgendaPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="utilities/document" element={<UtilitiesDocumentPage />} />
            <Route path="utilities/structured" element={<UtilitiesStructuredPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<Settings />} />
            <Route path="teams/:teamId" element={<TeamLayout />}>
              <Route index element={<TeamDashboard />} />
              <Route path="me" element={<TeamMePage />} />
              <Route path="leader" element={<TeamLeaderPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="people/:personId" element={<PersonRoute />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
