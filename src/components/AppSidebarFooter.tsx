import { Link } from 'react-router-dom';
import { useAppVersion } from '../hooks/useAppVersion';
import { formatAppVersion } from '../lib/appVersionLabel';
import { resolveAppProfileLabel } from '../lib/appProfileLabel';
import { useFeatures } from '../lib/features';
import { PATH_SETTINGS } from '../lib/routes';
import { IcSettings } from './icons';

type Props = { collapsed: boolean };

export function AppSidebarFooter({ collapsed }: Props) {
  const { features, managed, source } = useFeatures();
  const version = useAppVersion();
  const profile = resolveAppProfileLabel(features, managed, source);
  const v = formatAppVersion(version);
  // Friendly label up front, with the exact build string in the tooltip.
  const versionTooltip = v.isCalVer ? `${v.label} · build ${v.build} · ${v.raw}` : v.raw;

  if (collapsed) {
    return (
      <div className="app-sidebar__foot">
        <Link
          to={`${PATH_SETTINGS}#app-profile`}
          className="app-sidebar__foot-icon"
          title={`${profile.label} · ${v.label}`}
          aria-label={`App profile: ${profile.label}. Version ${v.label}. Open Settings.`}
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
        title={versionTooltip}
      >
        {v.label}
      </Link>
    </div>
  );
}
