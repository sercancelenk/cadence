# Releasing: beta first, then stable

Releases are cut by hand: **Actions → Release → Run workflow**, and the only choice is the **channel**.

| Channel | What it publishes | Who is offered it |
|---|---|---|
| **beta** (default) | GitHub **pre-release** `v2026.10.150-beta.1`, update files `beta-mac.yml` / `beta.yml` | Only installs that are themselves a beta |
| **stable** | Normal GitHub release `v2026.10.150`, update files `latest-mac.yml` / `latest.yml` | Every install (stable and beta) |

## How the updater keeps the two apart (read from `electron-updater`, not assumed)

- A **stable** install has no prerelease tag in its version, so `allowPrerelease` is false: it asks GitHub for the
  *latest non-prerelease* release and never sees a beta.
- A **beta** install (`...-beta.1`) turns `allowPrerelease` on. It walks the release feed, takes the newest entry and
  reads `beta-mac.yml` (or `beta.yml` on Windows) for a beta tag, `latest-mac.yml` for a stable tag. So a beta tester is
  offered the next beta, and also the next stable release as soon as one exists, and then continues on stable.
- A beta is the **same build number plus `-beta.1`**: it sorts below its own stable release and above every earlier
  build, so promoting is just running the workflow again with `stable` (a new build number, a higher version).

## Cutting a beta and using it

1. Make sure `main` is what you want to test and that CI is green.
2. Run **Release** with channel **beta**. Wait for the macOS and Windows jobs.
3. Download the `.dmg` (or the Windows installer) from the **pre-release** on the Releases page and install it over
   your normal Cadence. Your data folder is shared, so **export a backup first** (Settings → Data & backup).
4. Settings → About shows the version as e.g. `October 2026 (beta)`. Use it for a few days.
5. Happy? Run **Release** with channel **stable**. Beta installs update to it automatically; stable installs get it
   as a normal update.
6. Found a problem? Fix it and run **beta** again; beta installs get the new beta. Stable users saw nothing.

## Rules this relies on

- The version guard (`scripts/validate-release-config.mjs --check-version`) compares the numeric part against the
  latest **stable** release, so a beta can only be cut with a build number above it. A beta can never lower the
  version stable users are offered.
- Never use `electron-builder --publish always` on your own machine. For a local test package see "Local package"
  below.

## Local package (nothing is uploaded)

```bash
npm run build:reminder-helper && npm run build:web
npx electron-builder --mac dmg --arm64 --publish never \
  -c.extraMetadata.version=2026.10.900-beta.1 -c.mac.notarize=false
```

The result is in `release/`. Use a version above the latest published one so the app does not try to "update"
itself to an older number.

To check that a packaged build starts without touching your data (it uses a throwaway data folder through
`CADENCE_USER_DATA_DIR`), build an unpacked copy and run the smoke script:

```bash
npx electron-builder --mac dir --arm64 --publish never -c.mac.identity=null -c.mac.notarize=false \
  -c.directories.output=/tmp/cadence-pack
codesign --force --deep -s - /tmp/cadence-pack/mac-arm64/Cadence.app   # Apple Silicon will not start an unsigned copy
node scripts/smoke-packaged.mjs /tmp/cadence-pack/mac-arm64/Cadence.app/Contents/MacOS/Cadence
```

## Support window

Every change must keep working for data written by the **current and the two previous** releases. See
`docs/COMPATIBILITY.md`.
