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

- **Custom AI gateway and one request engine for every AI provider.** Settings → AI Assistant has a new provider, *Custom gateway*, for routers and proxies such as OmniRoute, LiteLLM, Ollama or a company gateway. You set the address, model and (optional) key, choose the **API format** it speaks (OpenAI Chat Completions, OpenAI Responses, Anthropic Messages or Google Gemini) and, under *Advanced*, the auth header, how the key is written (or no header), extra headers and the request path. The path may carry a `?query` and the placeholders `{model}` and `{apiKey}`, so gateways that need an API version in the address work. A *Start from a template* list, by API format (OpenAI-compatible, OpenAI Responses, Anthropic, OpenAI, Gemini), fills the form, and every provider choice now shows an info box: address, format, authentication, what is sent and the limits. Anthropic, OpenAI and Gemini now run through the same engine as presets, so they gain the desktop request path, diagnostics and policy checks. *Test connection* offers copyable **diagnostic details** with the API key masked everywhere. Existing provider settings load exactly as before; every new field is optional and older settings are never rewritten. A build that predates the gateway keeps the gateway's URL, model and key but does not recognise the provider choice, so after opening the workspace in an older version you re-select *Custom gateway* once; notes and tasks are never affected. The *No auth header* choice is likewise not known to an older build, which would send the key as a header instead.
- **AI compatibility (this version).** Formats: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Google Gemini. Abilities: text in, text out for the task assistant and the task extractor. Limits: no streaming, images, files or tool calls; replies capped at 4,000 tokens; 120-second timeout and about 4 MB reply cap on desktop; redirects refused; plain `http://` only for localhost and private networks. Full reference: [docs/AI-INTEGRATION.md](docs/AI-INTEGRATION.md).
- **AI foundation.** Several connections with *Feature routing* (Settings → AI Assistant): choose which connection serves notes and tasks and which serves people data (1:1, feedback, a person's own tasks and goals), with a *JSON replies* check in Test connection. People data only goes to connections you allow (a model on this computer is allowed by default); Ask AI on a person's task or goal counts as people data. Prompts are now internal, versioned and tested; they are never shown, and the old free-text boxes are gone (stored instructions are kept under *Previous instructions* and still applied as a short, constrained focus note). A shared result panel (Extract tasks) and *what was read / what was sent* chips (Extract tasks and Ask AI). **Ask AI** no longer shows a machine-written "You" message; it has a *Focus* choice (Plan / Risks / First 15 minutes) and also receives the task's list, due date and priority. **Extract tasks** now knows today's date and your lists, suggests a list and a due date per task, and is reachable from the slash menu (`/extract`), the ✨ menu on a selection, and ⌘K. New policy flags `features.aiPeople` and `features.aiFocusNote`. Existing settings load unchanged; nothing is rewritten or removed. Going back to an older version: extra connections, routing and the default's metadata are kept (Cadence stores a default API format as a marker when no other setting exists); notes and tasks are never affected. Changing a connection's provider or address clears its people-data permission, and re-running *Extract tasks* never offers tasks you already added.
- **AI compatibility (foundation).** Structured (JSON) replies are requested with OpenAI Chat `response_format`, OpenAI Responses `text.format` and Gemini `responseMimeType`; Anthropic has no schema-less JSON mode, so its replies are validated by Cadence. Streaming and image input are not part of this version. Reference: [docs/AI-INTEGRATION.md](docs/AI-INTEGRATION.md).
- **Hardening after an independent code review.** Desktop AI requests use Electron's network stack (`net.fetch`), so the system proxy and the OS certificate store apply on corporate networks (checked in Electron 41: abort and `redirect: 'error'` work). The window's content-security policy no longer lists the AI hosts, so a request cannot bypass the main-process policy checks. The web path now also refuses redirects and times out after 120 seconds. Changing the provider in Settings no longer carries the previous provider's key and model to the new one (it used to be possible to send an OpenAI key to a gateway). *— Disabled —* can now actually be saved. *Remove* also clears gateway settings left over after switching to a hosted provider (they can hold tokens in headers). A reply that is valid JSON but not what was expected (`null`, a list, parts-style `content`) is reported as an AI error with diagnostics instead of a raw script error. Header names that differ only in case are flagged. Short flag values such as `true` are no longer masked in diagnostics, while tokens in extra headers are masked in the visible message too.
- **Updated default models after checking each provider's published information.** Anthropic: `claude-sonnet-5-5` (was `claude-3-5-sonnet-latest`). OpenAI: `gpt-5.4-mini` (was `gpt-4o-mini`, which OpenAI has announced it will shut down on 2027-01-14). Gemini: `gemini-3.8-flash` (was `gemini-2.0-flash`, which Google shut down on 2026-06-01). A model you already chose is never changed. OpenAI requests now send `max_completion_tokens`, because OpenAI deprecated `max_tokens` and its reasoning models reject it; a custom gateway can pick either under *Advanced → Token limit field*. The Gemini system instruction no longer carries a role, matching Google's examples, and a reply that ran out of tokens before writing anything now says so instead of "empty response".
- **Organization policy: `features.aiAllowedHosts`.** An optional list of hosts AI requests may go to (`*.suffix` matches subdomains; bare host names only, the port is ignored). When the key is present it always restricts: a list with no valid entry allows nothing, so a typo cannot switch the restriction off. Enforced in the desktop main process for every AI request. See [docs/ENTERPRISE.md](docs/ENTERPRISE.md).
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
