# Changelog

All notable changes to Cadence are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres loosely to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(loose, because data-format changes that break older installs always
ship with a migration, not a major version bump).

The CI release workflow auto-bumps the version to `0.2.<run_number>` on every
manual GitHub Actions run, so the entries below collect changes by theme
rather than per build number.

## Unreleased

### Added

- **Stay signed in.** New per-user setting wraps the data-encryption key with
  Electron's `safeStorage` (macOS Keychain / Windows DPAPI / Linux libsecret)
  so the app no longer asks for the account password on every launch. PIN
  protection still gates the workspace as before. Logout always purges the
  cached key. Linux without libsecret refuses to cache rather than fall back
  to a hardcoded-obfuscation key — same security promise on every platform.
- **Quick-add FAB.** Floating "+" action in the bottom-right opens a small
  menu for adding a task or a note from anywhere in the app, with dialogs
  that respect the active list / note encryption settings.
- **`+` next to each Todo list title** as the primary "add task" affordance,
  in addition to the global FAB.
- **In-app toast notifications** (`src/components/ui/Toast.tsx`) replacing the
  old `window.alert()` modals. Non-blocking, theme-aware, with auto-dismiss
  + manual close + `aria-live` for screen readers.
- **CHANGELOG.md** (this file) and a top-level **LICENSE** file (MIT) to make
  the license grant explicit alongside the README badge.

### Changed

- **Settings reorganised.** Cards are now grouped into five named sections:
  Account & security · Data & backup · Sync · Integrations · About. The
  "Appearance" card was removed (theme toggle already lives in the top bar).
  Each group has a small eyebrow heading + short description.
- **Notes pane fills the route shell.** Replaces `min-height: calc(100vh − 120px)`
  with a proper `height: 100%` chain so the panel sits flush top-to-bottom
  instead of floating above empty canvas.
- **Todo row redesign.** Chips reordered (Group · Priority · Status · Schedule),
  title clamps to 2 lines and expands on click, edit mode is now a single
  Markdown editor on double-click instead of an "Add details" detour.
- **Help menu links** in the desktop app now point at
  `github.com/sercancelenk/cadence` instead of the stale pre-rename URL.
- **App ID** is now `com.cadence.app` (matches the new product name). Users
  of the pre-rename `com.leeadman.app` build need a one-time manual download
  of the new DMG; the data-migration code copies their workspace across
  automatically on first launch.

### Fixed

- **Display name no longer reset on restart.** `normalizeData()` now reads
  the `profile` object back from disk via `parseProfile()` — regression
  introduced when the profile model was added in a previous build.

### Security

- The OS-keychain key cache validates the loaded key against the actual
  data file on resume; a stale cache (e.g. password rotated on another
  device) silently deletes itself and the user falls back to re-auth
  rather than seeing a corrupt-looking workspace.
- Toast and dialog content uses theme variables only — no `dangerouslySetInnerHTML`
  added beyond the existing QR-SVG render.

---

Older changes (pre-public release) live in the Git history and were not
backfilled into a changelog file. See `git log --oneline` if you need
the full audit trail.
