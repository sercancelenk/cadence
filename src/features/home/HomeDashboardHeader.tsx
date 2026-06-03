import { HomeInstallMeta } from '../../components/HomeInstallMeta';
import { homeGreeting } from './homeGreeting';

type Props = {
  displayName: string;
  email?: string | null;
  activitySummary: string;
};

export function HomeDashboardHeader({ displayName, email, activitySummary }: Props) {
  const greeting = homeGreeting();

  return (
    <header className="home-page__header">
      <div className="home-page__header-main">
        <p className="home-page__eyebrow muted small">Dashboard</p>
        <h1 className="home-page__headline">
          {greeting}, <span className="home-page__headline-name">{displayName}</span>
        </h1>
        <p className="home-page__summary muted">{activitySummary}</p>
        {email ? <p className="home-page__email-line muted small">{email}</p> : null}
      </div>
      <HomeInstallMeta className="home-page__header-meta" />
    </header>
  );
}
