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

- **Custom AI gateway.** Settings → AI Assistant has a new provider, *Custom gateway*, for routers and proxies such as OmniRoute, LiteLLM or a company gateway. Choose the **API format** it speaks (OpenAI Chat Completions, OpenAI Responses, Anthropic Messages or Google Gemini) and, under *Advanced*, the auth header and how the key is written, extra headers and the request path; a live line shows the exact address. *Test connection* now offers copyable **diagnostic details** with the API key and header values hidden. On desktop the main process makes the request (no CSP/CORS limits; the URL, path and headers are re-validated there and the organization `ai` policy is enforced there too). Plain `http://` is limited to localhost and private-network hosts. Existing provider settings load exactly as before; every new field is optional and older settings are never rewritten. A build that predates the gateway keeps the gateway's URL, model and key but does not recognise the provider choice, so after opening the workspace in an older version you re-select *Custom gateway* once; notes and tasks are never affected.
- **Fixed:** *Remove* and *— Disabled —* in the AI settings now actually clear the selected provider (it used to stay selected after its key was removed).
- **Renamed** the AI assistant's *Save to notes* button to *Save to task*, which is what it does.
- **Tools → Document is now multi-document.** Tabs like JSON / YAML: add, rename (double-click or F2), switch with the arrow keys, close with a confirmation when there is content. Your existing single document becomes the first tab; the old field is never rewritten or removed, and a document an older version edited afterwards comes back as a "Document (from older version)" tab.
- **Move to Notes** for any Tools tab (Document and JSON / YAML). Choose a list or no list; the note is created and the tab removed in one step. JSON / YAML content becomes a code block.
- **Save to a file with ⇧⌘S** on both Tools pages, like Notes. The extension you type in the save window decides the format (Document: md / txt / html).
- **Notes ⇄ files.** Open `.md`, `.txt` or `.html` files (or drop them on the Notes page) as new notes, and save a note as `.md`, `.txt` or `.html`.
- **Nested note lists** with sub-lists, derived archive, safe delete and a yellow gradient folder icon for lists.
- **Notes ⌘S saves now; ⇧⌘S saves to a file.** Typing is written every 30 seconds, structural changes within ~300 ms, and note switches, blur, lock and quit write immediately.
- **Strikethrough moved to ⇧⌘X** in rich-text editors so ⇧⌘S can save to a file.
- **Choose how many backups to keep** (Settings → Data & backup, desktop). Daily backup folders: newest 3 / 7 / 14 / 30 (default 30). In-app snapshots: newest 10 / 20 / 30 / 50 (default 50). Lowering a value shows exactly how many older backups will be deleted and does nothing until you confirm; cancelling changes nothing. Raising a value deletes nothing. The newest backup is always kept. The choice is stored per account on this computer, so existing installs behave exactly as before until you change it.

- **Account recovery codes.** Optional MetaMask-style codes for resetting your account password on this device without losing encrypted data. Generate at sign-up (welcome tour) or in Settings; envelope is saved only after you confirm you stored the codes. `/recover` for forgotten passwords. Existing accounts without codes are unchanged.
- **Portable ZIP backup.** Cross-platform export/import with workspace JSON and image sidecars. Primary backup on web/mobile; desktop also offers full backup folders (with note version history). Legacy JSON and folder imports still work.
- **In-app user guide.** New `/guide` route (Settings → About, ⌘K, Welcome tour, Electron Help menu) renders `docs/USER-GUIDE.md`.
- **Notes sidebar collapse.** Hide the note list on desktop for a full-width editor; preference saved per account.
- **Note version history** (desktop). Browse and restore prior revisions; stored in full backup folders.

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

### Fixed (data safety)

- **Last keystrokes in JSON / YAML.** The editor's 150 ms buffer was only drained when a tab closed; ⌘S, switching windows and quitting could miss the last characters. It now drains on every flush.
- **Saving the very last edit.** A flush right after typing (quit, lock, ⌘S) could write a stale snapshot and leave the edit unsaved for up to 30 s. The workspace now updates synchronously.
- **Images in Document tabs** are protected from attachment cleanup, in the app and in the desktop main process.
- **Older versions on the same machine.** Notes, todos and items an older version wrote to the main data file are no longer replaced by older copies kept in the monthly files, in normal reads, backup restores and rollback.
- **Older versions that do not know notes** can no longer wipe notes silently: a note count dropping to zero blocks saving and offers a restore, and sync refuses a remote copy without a notes list.
- **Deleting an archived list** keeps its notes and sub-lists archived instead of bringing them back to the active view.
- **Importing a file** reports an error instead of "Note imported" when the workspace is write-protected.
- **Saving a note to a file** refuses instead of overwriting a file named `<your file>.tmp` next to it.
- **Shift+⌘S no longer strikes through the selection** in the editor before saving.

### Changed

- **Safety copies are no longer pushed out by routine snapshots.** The copies taken right before an import, restore, password change or account recovery now have their own quota (newest 50) instead of sharing the rolling snapshot list with the constant pre-save snapshots, which used to evict them after a few hours of editing. Nothing is deleted by this change.
- **Every page in the left menu now fills the window**, like Notes, instead of sitting in a centred column on maximised or wide windows.
- **Daily backup folders are counted, not dated.** The folder keeps the newest N *complete* daily folders instead of everything from the last 30 calendar days, so a computer that was off for a week never ends up with a single backup. Damaged or half-written folders, and folders dated in the future (a wrong clock), are neither counted nor deleted, and other accounts' folders in the same directory are never touched. Restoring a snapshot can no longer lose its own images because the safety copy taken first pruned it.
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
