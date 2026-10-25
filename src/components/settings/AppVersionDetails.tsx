import { formatAppVersion } from '../../lib/appVersionLabel';

/** The body of Settings → About → Application version. A beta build says so and what its updates mean. */
export function AppVersionDetails({ appVersion, schemaVersion }: { appVersion: string; schemaVersion: number }) {
  const v = formatAppVersion(appVersion);
  return (
    <>
      <p>
        Installed release: <strong>{v.label}</strong>
      </p>
      <p className="muted small">
        {v.build !== null ? <>Build {v.build} · </> : null}
        {v.raw ? <>Version {v.raw} · </> : null}
        Data schema v{schemaVersion}
      </p>
      {v.channel ? (
        <p className="small">
          This is a <strong>{v.channel}</strong> build for testing. Updates offer you the next {v.channel} build and the next
          stable release. Export a backup before trying new things.
        </p>
      ) : null}
    </>
  );
}
