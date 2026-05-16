import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AccountProvider, useAccount } from './AccountContext';
import { AuthGate, AuthProvider } from './AuthContext';
import { AppDataProvider, useAppData, useReminderWatcher } from './AppDataContext';
import { Layout } from './components/Layout';
import { TeamLayout } from './components/TeamLayout';
import { ThemeProvider } from './ThemeContext';
import { PATH_TEAMS } from './lib/routes';
import { HomePage } from './views/HomePage';
import { HomeTeams } from './views/HomeTeams';
import { LoginPage } from './views/LoginPage';
import { People, PersonRoute, TeamLeaderPage, TeamMePage } from './views/People';
import { ProfilePage } from './views/ProfilePage';
import { RegisterPage } from './views/RegisterPage';
import { Settings } from './views/Settings';
import { TeamDashboard } from './views/TeamDashboard';
import { TodosPage } from './views/TodosPage';
import './app.css';

/** Electron .app / loadFile() uses the `file:` protocol where BrowserRouter renders blank; HashRouter is required there. */
const HistoryRouter =
  typeof window !== 'undefined' && window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

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
          <Boot />
        </AuthGate>
      </AuthProvider>
    </AppDataProvider>
  );
}

export default function App() {
  return (
    <HistoryRouter>
      <ThemeProvider>
        <AccountProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="*" element={<ProtectedShell />} />
          </Routes>
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
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path={PATH_TEAMS.replace(/^\//, '')} element={<HomeTeams />} />
        <Route path="todos" element={<TodosPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="teams/:teamId" element={<TeamLayout />}>
          <Route index element={<TeamDashboard />} />
          <Route path="me" element={<TeamMePage />} />
          <Route path="leader" element={<TeamLeaderPage />} />
          <Route path="people" element={<People />} />
          <Route path="people/:personId" element={<PersonRoute />} />
        </Route>
      </Route>
    </Routes>
  );
}
