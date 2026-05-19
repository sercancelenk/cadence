import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AccountProvider, useAccount } from './AccountContext';
import { AuthGate, AuthProvider } from './AuthContext';
import { AppDataProvider, useAppData, useReminderWatcher } from './AppDataContext';
import { Layout } from './components/Layout';
import { TeamLayout } from './components/TeamLayout';
import { ThemeProvider } from './ThemeContext';
import { PATH_TEAMS } from './lib/routes';
import { CommandPalette } from './components/CommandPalette';
import { NotesUnlockProvider } from './lib/NotesUnlockContext';
import { useLanSyncAutoPull } from './lib/useLanSyncAutoPull';
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
const TeamDashboard = lazy(() => import('./views/TeamDashboard').then((m) => ({ default: m.TeamDashboard })));
// All four People routes share the same chunk (they import each other) — using
// individual lazy() calls is fine: Rollup keeps them in one file and Vite
// dedupes the dynamic import promise.
const PeoplePage = lazy(() => import('./views/People').then((m) => ({ default: m.People })));
const PersonRoute = lazy(() => import('./views/People').then((m) => ({ default: m.PersonRoute })));
const TeamMePage = lazy(() => import('./views/People').then((m) => ({ default: m.TeamMePage })));
const TeamLeaderPage = lazy(() => import('./views/People').then((m) => ({ default: m.TeamLeaderPage })));

/** Electron .app / loadFile() uses the `file:` protocol where BrowserRouter renders blank; HashRouter is required there. */
const isFileProtocol =
  typeof window !== 'undefined' && window.location.protocol === 'file:';
const HistoryRouter = isFileProtocol ? HashRouter : BrowserRouter;
/**
 * On GitHub Pages the app is served from `/cadence/`. Without a basename the
 * React Router would push `/login` etc. directly under the domain root and the
 * browser would 404 on hard refreshes / SW takeovers. Vite already exposes the
 * configured `base` via `import.meta.env.BASE_URL`, so we just trim the
 * trailing slash for React Router. Electron's HashRouter ignores basename.
 */
const routerBasename = (() => {
  if (isFileProtocol) return undefined;
  const raw = import.meta.env.BASE_URL || '/';
  const trimmed = raw.replace(/\/+$/, '');
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
        <AccountProvider>
          <Suspense fallback={<BootLoading label="Loading…" />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="*" element={<ProtectedShell />} />
            </Routes>
          </Suspense>
        </AccountProvider>
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
  useReminderWatcher();
  // Keep this device's workspace in sync with the paired host (if any).
  // No-op when the user hasn't paired yet, so safe to mount unconditionally.
  useLanSyncAutoPull();
  return (
    <>
      <CommandPalette />
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
