// @ts-nocheck
import { Link } from 'react-router-dom';
import { useAppVersion } from '../hooks/useAppVersion';
import { resolveAppProfileLabel } from '../lib/appProfileLabel';
import { useFeatures } from '../lib/features';
import { PATH_SETTINGS } from '../lib/routes';
import { IcSettings } from './icons';

type Props = { collapsed: boolean };

export function AppSidebarFooter({ collapsed }: Props) {
  const { features, managed, source } = useFeatures();
  const version = useAppVersion();
  const profile = resolveAppProfileLabel(features, managed, source);

  if (collapsed) {
    return (
      <div className="app-sidebar__foot">
        <Link
          to={`${PATH_SETTINGS}#app-profile`}
          className="app-sidebar__foot-icon"
          title={`${profile.label} · v${version}`}
          aria-label={`App profile: ${profile.label}. Version ${version}. Open Settings.`}
        >
          <IcSettings size={16} />
        </Link>
      </div>
    );
  }

  return (
    <div className="app-sidebar__foot">
      <Link
        to={`${PATH_SETTINGS}#app-profile`}
        className={`app-sidebar__foot-profile${profile.managed ? ' app-sidebar__foot-profile--managed' : ''}`}
        title="Change app profile in Settings"
      >
        {profile.label}
      </Link>
      <Link
        to={`${PATH_SETTINGS}#version`}
        className="app-sidebar__foot-version muted small"
        title="Application version"
      >
        v{version}
      </Link>
    </div>
  );
}
