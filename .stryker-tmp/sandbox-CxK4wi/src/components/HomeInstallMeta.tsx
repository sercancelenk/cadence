// @ts-nocheck
import { Link } from 'react-router-dom';
import { useAppVersion } from '../hooks/useAppVersion';
import { resolveAppProfileLabel } from '../lib/appProfileLabel';
import { useFeatures } from '../lib/features';
import { PATH_SETTINGS } from '../lib/routes';

/** Home hero strip — mirrors sidebar footer (profile + version). */
export function HomeInstallMeta({ className = '' }: { className?: string }) {
  const { features, managed, source } = useFeatures();
  const version = useAppVersion();
  const profile = resolveAppProfileLabel(features, managed, source);

  return (
    <p className={`home-page__install-meta muted small${className ? ` ${className}` : ''}`}>
      <Link to={`${PATH_SETTINGS}#app-profile`} className="home-page__install-link">
        {profile.label}
      </Link>
      <span className="home-page__install-sep" aria-hidden>
        ·
      </span>
      <Link to={`${PATH_SETTINGS}#version`} className="home-page__install-link">
        v{version}
      </Link>
    </p>
  );
}
