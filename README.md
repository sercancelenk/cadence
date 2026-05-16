<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# Leeadman

**A local-first leadership workspace — teams, people, tasks, notes, goals, feedback, 1:1s, reminders.**

[![Release](https://github.com/sercancelenk/leeadman/actions/workflows/release.yml/badge.svg)](https://github.com/sercancelenk/leeadman/actions/workflows/release.yml)
[![CI](https://github.com/sercancelenk/leeadman/actions/workflows/ci.yml/badge.svg)](https://github.com/sercancelenk/leeadman/actions/workflows/ci.yml)
[![Pages](https://github.com/sercancelenk/leeadman/actions/workflows/pages.yml/badge.svg)](https://github.com/sercancelenk/leeadman/actions/workflows/pages.yml)
[![Latest release](https://img.shields.io/github/v/release/sercancelenk/leeadman?display_name=tag&sort=semver)](https://github.com/sercancelenk/leeadman/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

</div>

Leeadman is an Electron + React desktop app that helps people leaders run the boring, important parts of their job — 1:1 follow-ups, goal tracking, feedback logs, structured notes for every direct report, and personal to-dos — **without sending any data to a server**. Everything lives on your machine in JSON files under your user folder. No accounts in the cloud, no telemetry.

The same React bundle also deploys to GitHub Pages as a **mobile PWA**, so you can capture quick to-dos from your phone.

---

## What's in the box

| | |
|---|---|
| **Desktop** | Signed + notarized macOS DMG (Apple Silicon & Intel), auto-updates via GitHub Releases. Optional PIN lock at launch. |
| **Mobile** | Installable PWA (Add to Home Screen) with a slide-in drawer sidebar, full-screen content, iOS safe-area aware. Offline-capable, optimized for To-dos. |
| **Encrypted on disk** | Workspace data is stored as an **AES-256-GCM** envelope keyed by your account password (Electron). Changing the password rotates the key transparently. |
| **Profile** | Avatar upload, view-only by default with an Edit toggle, in-app **Change password** flow that verifies your current password. |
| **Workspaces** | Multi-team, per-team Me / My-leader workspaces, per-person pages with tasks, goals, notes, **feedback** and documents. |
| **1:1 Mode** | A dedicated meeting view per person with a persistent markdown agenda and an archive of past meetings; unchecked action items carry over. |
| **Person Timeline** | Chronological feed of every item attached to a person, grouped by day, filterable by kind. Killer feature for review prep. |
| **Agenda** | Unified Today / This-week view combining reminders + due tasks + personal to-dos, plus an "Overdue" bucket. |
| **Analytics** | Local-only dashboard with daily / weekly / monthly / yearly created-vs-completed charts, per-team and per-person scoreboards, plus to-do completion stats. |
| **LAN sync (no cloud)** | Opt-in tiny HTTP server inside Electron with bearer-token auth and CORS, so a second device on the same Wi-Fi can pull / push a snapshot. |
| **⌘K Command Palette** | Fuzzy search across navigation, teams, people, items and to-dos with keyboard navigation. |
| **Markdown everywhere** | Notes, scratchpads, item bodies and 1:1 agendas use GitHub-flavored markdown (checklists, tables, code, links). |
| **Recurring reminders** | Daily / weekly / monthly cadence for any reminder, auto-advances after firing. |
| **Smart to-do lists** | Drag-and-drop list reordering, pin to top, archive, mark-all-complete, clear-completed, search, count badges. |
| **Quick scheduling** | Per-task presets (Today 5pm, Tomorrow 9am, +3h, Next Mon 9am) plus a custom datetime picker — no more hunting for an obvious schedule control. |

---

## Table of contents

- [Install](#install)
- [Getting started](#getting-started)
- [Concepts](#concepts)
- [Power features](#power-features)
  - [⌘K command palette](#k-command-palette)
  - [Markdown editing](#markdown-editing)
  - [Person Timeline](#person-timeline)
  - [1:1 Mode](#11-mode)
  - [Agenda](#agenda)
  - [Analytics dashboard](#analytics-dashboard)
  - [Recurring reminders](#recurring-reminders)
  - [Feedback log](#feedback-log)
  - [Smart to-do lists](#smart-to-do-lists)
  - [Profile & change password](#profile--change-password)
  - [LAN sync (multi-device, no cloud)](#lan-sync-multi-device-no-cloud)
- [Mobile / PWA](#mobile--pwa)
- [Keyboard & native menus](#keyboard--native-menus)
- [Data, privacy and backups](#data-privacy-and-backups)
- [Auto-updates](#auto-updates)
- [Building from source](#building-from-source)
- [Releasing](#releasing)
- [macOS code signing & notarization](#macos-code-signing--notarization)
- [Project structure](#project-structure)
- [Electron deep dive](#electron-deep-dive)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Install

### macOS desktop (signed + notarized)

1. Go to the [latest release](https://github.com/sercancelenk/leeadman/releases/latest).
2. Download the right DMG:
   - `Leeadman-<version>-arm64.dmg` — Apple Silicon (M1/M2/M3/M4)
   - `Leeadman-<version>-x64.dmg` — Intel Macs
3. Open the DMG and drag `Leeadman.app` into `Applications`.
4. Launch from Launchpad or Spotlight (⌘ + Space → "Leeadman").

Because the DMG is signed with a **Developer ID Application** certificate **and** notarized by Apple, you will not see any "damaged" or "unidentified developer" warning.

### Mobile (PWA on iOS / Android)

1. On your phone, open `https://sercancelenk.github.io/leeadman/` in **Safari** (iOS) or **Chrome** (Android).
2. **iOS:** tap the **Share** button → **Add to Home Screen**.
   **Android:** tap **⋮** → **Install app**.
3. Launch from the home-screen icon. The app opens full-screen and jumps straight to the To-dos page.

> **Mobile data is separate by default.** The PWA stores its own data in the phone's `localStorage` (independent of the desktop's encrypted file). To move data between devices use [LAN sync](#lan-sync-multi-device-no-cloud), or *Settings → Backup → Export JSON / Import JSON* as a manual fallback.

### Unsigned local builds

If you build a DMG yourself **without** code signing, macOS quarantines it ("… is damaged"). Bypass once with:

```bash
xattr -dr com.apple.quarantine /Applications/Leeadman.app
```

The official Releases DMG never needs this.

---

## Getting started

1. Launch Leeadman.
2. Click **Create one** under the sign-in card. Pick an email, display name and a password (8+ chars). The account exists **only on this device**.
3. You land on the Home screen. From there you can:
   - Open the auto-created **My first team**.
   - Create new teams from the *Teams* page.
   - Manage personal lists in *To-dos*.
   - See everything due today/this week in *Agenda*.
4. Press <kbd>⌘ K</kbd> (or <kbd>Ctrl K</kbd>) anywhere to jump to people, items or pages instantly.

> Tip: install Leeadman on a second machine and use *Settings → Backup → Export JSON / Import JSON* to move your data.

---

## Concepts

```
Account
└── App data file (JSON)
    └── Teams[]
        ├── Me              (auto-created per team)
        ├── My leader       (auto-created per team)
        └── People[]
            ├── Profile + scratchpad (markdown)
            ├── 1:1 agenda (markdown, archivable)
            └── Items[]
                ├── Task          (due date, reminders)
                ├── Goal          (status, start, deadline)
                ├── Note          (markdown body)
                ├── Feedback      (praise / coaching / concern)
                └── Document      (URL)

Personal
└── To-do lists (pin, archive, search, bulk ops)
```

- **Account** — local user; password is stored as a salted scrypt hash.
- **Team** — a workspace boundary. Mark teams as Active / Paused / Archived and pin favourites.
- **Me** — your personal space inside a team.
- **My leader** — a dedicated workspace for the relationship with your manager.
- **People** — direct reports / peers; each one has a profile, scratchpad, 1:1 agenda and items.
- **Items** — task, goal, note, **feedback**, document. All can carry markdown body and reminders.
- **To-dos** — personal lists, fully decoupled from teams.

The complete data model is in [`src/model.ts`](./src/model.ts).

---

## Power features

### ⌘K command palette

Press <kbd>⌘ K</kbd> (macOS) or <kbd>Ctrl K</kbd> (Windows / Linux) to open a global fuzzy-search palette:

- **Navigate** — Home, Teams, To-dos, Agenda, Profile, Settings.
- **Teams** — jump straight to any team or its People page.
- **People** — every person across every team.
- **Items** — every task / goal / note / feedback / document by title.
- **To-dos** — every personal task.

Arrow keys to move, <kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close.

### Markdown editing

Notes, item bodies, person scratchpads and 1:1 agendas all use **GitHub-flavored markdown** with a Write / Preview toggle:

- Headings, bold/italic, lists, blockquotes, code blocks.
- Checklists (`- [ ]` / `- [x]`).
- Tables, autolinks, strikethrough.
- External links open in your default browser.

### Person Timeline

Every person page has a **Timeline** tab that shows a chronological feed of *every* item attached to that person — tasks, goals, notes, feedback, documents — grouped by day (Today / Yesterday / Friday / …) and filterable by kind. Designed for review prep ("what happened with Alice in Q3?").

### 1:1 Mode

Every person also has a **1:1 Mode** tab with two halves:

1. **Current agenda** — a persistent markdown document seeded with sections (Wins / Blockers / Action items / Notes). Use `- [ ]` for action items.
2. **Past meetings** — when you click **Archive meeting**, the current agenda becomes a dated note (`1:1 · 15 May 2026`) attached to that person, and the agenda resets. Any unchecked action items are carried over into the new agenda automatically.

The archived meetings are regular notes, so they also show up in the Person Timeline.

### Agenda

The `/agenda` page is a global, **unified view** of:

- **Overdue** — anything past its due date / reminder still open.
- **Today** — always shown, even when empty.
- **The next 6 days** — only shown when they have entries.

It mixes team-item reminders + due dates with personal to-do dues, marks each entry with its origin team / person, and lets you mark-complete or jump to its workspace inline.

### Analytics dashboard

The `/analytics` page is a fully local, dependency-free dashboard that reads
straight from your workspace data:

- **Stat cards** — total / completed / open / overdue / completion rate.
- **Created vs completed** SVG bar chart with a Daily / Weekly / Monthly / Yearly toggle.
- **Per-team performance** — totals, completed, overdue and a completion-rate progress bar per team.
- **Top contributors** — top 10 people by completed-task count, with their team affiliation.
- **Personal to-dos** — a separate stat block for `/todos` items.

Nothing is sent off-device; the chart is rendered as inline SVG.

### Recurring reminders

Any item reminder can be made **daily / weekly / monthly**. When the reminder fires, the next occurrence is computed and assigned automatically — you never have to recreate weekly 1:1 reminders.

### Feedback log

Every person has a dedicated **Feedback log** alongside Tasks/Goals/Notes/Documents. Each entry is tagged with one of:

- **Praise** (green)
- **Coaching** (blue)
- **Concern** (red)

This makes performance-review prep and growth-conversation prep trivial — open the person's Timeline, filter to Feedback, and you have your talking points.

### Smart to-do lists

The `/todos` page scales as your lists grow:

- **Drag-and-drop reorder** — grab the grip handle next to a list title and drop it anywhere; dropping a list across the pinned/unpinned line toggles its pin state automatically.
- **Pin to top** — star a list to keep it above the rest.
- **Archive** — hide a list without losing data; toggle "Show archived" to bring them back.
- **Quick scheduling** — every task row has a `Schedule` chip that opens a popover with **Today 5pm**, **Tomorrow 9am**, **+3h**, **Next Mon 9am** presets, plus a custom datetime picker and a one-tap "Clear schedule" action.
- **Compact / Comfortable toggle** — clearly labelled in the top-right (was a confusing icon-only button before).
- **Mark all complete** / **Clear completed** — bulk operations with confirmations.
- **Search** — filter tasks across all lists in real time.
- **Inline rename** — click the list title to edit.
- **Counts** — every list shows `<open> / <total>` at a glance.

### Profile & change password

`/profile` is a card-first, view-by-default page:

- **Avatar** — upload any image; it's downscaled to 384 px and stored as a JPEG `data:` URL on your profile, so it shows up in the top-bar avatar everywhere.
- **View mode** — name, role, department, phone, email and bio rendered as a read-only grid; an **Edit** button (top-right) flips the same card into form mode with a Save / Cancel pair.
- **Change password** — a secondary tab that asks for **Current password**, **New password** and **Confirm**. On Electron the new password is also used to **re-encrypt your data file** in a single atomic swap; the old key is wiped from memory immediately.

### LAN sync (multi-device, no cloud)

`Settings → Multi-device sync` lets two devices on the same Wi-Fi share a workspace without any cloud service:

- The Electron app runs an optional, opt-in HTTP server (default port `9787`) protected by a **bearer token** stored in `sync.json`.
- Endpoints: `GET /v1/snapshot` returns the active user's data, `POST /v1/snapshot` replaces it. CORS is permissive so the PWA can call into the desktop.
- Settings shows the host's reachable LAN URLs, the token (with a Rotate button) and a **Pair with another device** form for the *client* side: paste the URL + token and tap **Pull from host** or **Push to host**.
- The server auto-resumes on next launch if you previously enabled it.

> **HTTPS PWA caveat:** browsers block plain-HTTP requests from HTTPS pages. To use sync from the GitHub Pages PWA you either need to open it via `http://` on your LAN or run the desktop app on both endpoints. Two desktops, or a desktop + an Android phone over LAN HTTP, both work directly.

---

## Mobile / PWA

Leeadman ships as a **Progressive Web App** in addition to the desktop Electron build. The same React bundle is deployed to GitHub Pages and installable on iOS/Android.

### Setup (repository owner — one-time)

1. **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`. The [`pages.yml`](.github/workflows/pages.yml) workflow runs, builds with `LEEADMAN_PWA=1`, and publishes to `https://<user>.github.io/leeadman/`.

### Install on your phone

1. Open the URL above in Safari (iOS) or Chrome (Android).
2. **Share → Add to Home Screen** / **⋮ → Install app**.
3. The app installs with its own icon and launches full-screen, going straight to the To-dos page.

### What works offline

- The app shell (HTML / CSS / JS / icons) is cached on first visit.
- All your data lives in the phone's `localStorage`, so reads and edits work fully offline.
- New deploys are picked up silently the next time the device is online (service worker uses *network-first* for navigation, *stale-while-revalidate* for hashed assets).

### Building the PWA locally

```bash
# Regenerate icons after editing public/icon.svg
npm run icons

# Build for GitHub Pages (sets base path to /leeadman/)
npm run build:pwa
```

### Mobile-specific UX

- **Slide-in drawer sidebar** — on screens ≤700 px the sidebar starts hidden so the content gets the full viewport. Tap the hamburger to slide it in over a backdrop; tap any link or the backdrop to dismiss. Body scroll is locked while the drawer is open.
- **No iOS auto-zoom** — every input/select/textarea renders at ≥16 px on phones, so Safari doesn't zoom in on focus.
- **Full-screen command palette** on mobile.
- **Single-column to-do row layout** with 40 px touch targets and a wrapped section header.
- **Launching from the home-screen shortcut** auto-redirects `/` → `/todos`.
- **iOS safe-area** padding is honoured (status bar / home indicator).

### Files added for PWA support

```
public/
  manifest.webmanifest      # PWA metadata
  sw.js                     # Service worker (offline cache, auto-update)
  icon.svg                  # Source vector logo
  icon-192.png              # Manifest icon (any)
  icon-512.png              # Manifest icon (any) + splash
  icon-maskable-512.png     # Adaptive icon for Android (safe-zone padded)
  apple-touch-icon.png      # 180×180 iOS home-screen icon
  favicon-32.png            # Browser tab icon
scripts/
  generate-pwa-icons.mjs    # sharp-powered icon rasteriser
src/pwa.ts                  # SW registration (skipped under Electron/file://)
.github/workflows/pages.yml # Automated Pages deploy
```

---

## Keyboard & native menus

Leeadman ships with a native menu bar (English):

- **Leeadman** — About, Check for Updates…, Quit
- **File** — Close window / Quit
- **Edit** — Undo / Redo / Cut / Copy / Paste / Select All
- **View** — Reload, Zoom, Toggle Full Screen
- **Window** — Minimize, Zoom
- **Help** — Project on GitHub, Report an Issue

Standard shortcuts apply (⌘ Q, ⌘ W, ⌘ R, ⌘ F, ⌘ , …). The global **⌘ K** opens the command palette from anywhere.

---

## Data, privacy and backups

- **Where data lives** (macOS): `~/Library/Application Support/Leeadman/`
  - `leeadman-accounts.json` — user list (email, salted **scrypt** password hash, per-user `encSalt`).
  - `leeadman-session.json` — id of the signed-in user.
  - `leeadman-data-<userId>.json` — your workspace data, per account, **encrypted at rest**.
  - `auth-lock.json` — optional PIN hash.
  - `sync.json` — LAN sync server config (token + enabled flag) when sync is on.
- **Encryption-at-rest** (Electron): your data file is wrapped in **AES-256-GCM**. The 256-bit key is derived from your password with `scrypt(password, encSalt)` at login and lives only in main-process memory until logout. Changing your password atomically decrypts with the old key, derives a fresh `encSalt`, and re-encrypts under the new key. Legacy plaintext files from older versions are upgraded silently on the first save after login.
- **PIN protection** is an additional launch-time UI barrier (not the encryption key). It can be enabled/disabled independently in Settings.
- **Mobile PWA**: data lives in the browser's `localStorage` for the Pages origin and is **not** encrypted by the app — rely on the device's keychain / disk encryption.
- **No telemetry, no analytics.** Sync only happens when you explicitly use the LAN server (or Export/Import).
- **Backups**: use *Settings → Backup → Export JSON* periodically. The export is the **decrypted** data so you can diff / migrate it; treat it like a sensitive file. Use *Import JSON* to restore — it replaces your current data.

---

## Auto-updates

The packaged desktop app checks GitHub Releases on launch via [`electron-updater`](https://www.electron.build/auto-update):

1. Reads `latest-mac.yml` from the latest release.
2. If the published version is higher than the installed one, downloads the new build in the background.
3. Shows an OS notification when the download is ready ("Update available — restart to install"). Quit and relaunch to apply.

You can also force an interactive check from *Settings → Auto updates → Check for updates*. A dialog walks you through the full flow:

- *Checking…* spinner.
- If you're current: *"You're on the latest version (vX.Y.Z)."* with an OK button.
- If a newer release exists: progress bar with percent and MB transferred.
- When the download finishes: an *Install & restart* button — clicking it runs `quitAndInstall` so the app closes, swaps in the new binary, and relaunches without you having to manually quit. *Later* defers the install until next launch.
- Errors are surfaced inline with the message from `electron-updater`.

You can also trigger the same check from the menu bar via *Leeadman → Check for Updates…*. Development builds (`npm run dev`) short-circuit the check and the dialog shows a "disabled in development mode" notice.

The PWA "updates" itself silently via the service worker — the next time the device is online and you reopen the app, the new build is fetched and applied on the following navigation. Bumping `CACHE_VERSION` in `public/sw.js` invalidates every old cache.

---

## Building from source

### Requirements

- Node.js 20+
- npm 10+
- macOS 12+ (only for producing a macOS DMG)

### Install

```bash
git clone https://github.com/sercancelenk/leeadman.git
cd leeadman
npm install
```

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts Vite at `http://localhost:5173` and launches Electron pointed at it with hot reload. |
| `npm run build:web` | Builds the Electron-targeted React bundle (`base: ./`) into `dist/`. |
| `npm run build:pwa` | Builds the GitHub-Pages-targeted PWA bundle (`base: /leeadman/`) into `dist/`. |
| `npm run build` | `build:web` + `electron-builder` (local desktop bundle). |
| `npm run build:release` | `build:web` + `electron-builder --publish always` (used by the release workflow). |
| `npm run icons` | Regenerates PWA icons from `public/icon.svg` (uses `sharp`). |
| `npm run preview` | Vite preview server for the last build. |

### Local DMG without Apple credentials

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build
```

> New to Electron? Have a look at the [**Electron deep dive**](#electron-deep-dive)
> below — it explains the main / renderer / preload split, the IPC patterns
> we use and the build pipeline this command actually runs.

---

## Releasing

Both the desktop release and the PWA deploy are **manual**, and **nothing
runs automatically on push or pull request**. To publish, open the *Actions*
tab and pick the workflow you want; CI runs first as a gate inside it.

### Workflows at a glance

| Workflow | Trigger | What it does |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | reusable (`workflow_call`) + manual (`Run workflow`) | `tsc --noEmit` + `npm run build:web`. Invoked as the green-light gate by Release & Pages; you can also fire it on demand to sanity-check a branch. |
| [`pages.yml`](.github/workflows/pages.yml) | manual (`Run workflow`) | Calls CI → `npm run build:pwa` → publishes to GitHub Pages. |
| [`release.yml`](.github/workflows/release.yml) | manual (`Run workflow`) | Calls CI → bumps version to `0.2.<run_number>` → `electron-builder --publish always` → signs + notarizes the `.app` → uploads DMG/ZIP/`latest-mac.yml` to a new GitHub Release. |

### Cutting a desktop release

1. **Actions** tab → **Release** → **Run workflow** (on `main`).
2. The reusable CI job runs first; if it goes red the macOS job is skipped, no DMG built, no Apple minutes burned.
3. On green, the macOS runner signs + notarizes + publishes. Once the release shows up on GitHub, every installed Leeadman picks it up via [`electron-updater`](#auto-updates).

### Updating the mobile PWA

1. **Actions** tab → **Deploy PWA to GitHub Pages** → **Run workflow**.
2. Same CI gate, then the PWA bundle is rebuilt and Pages is updated. The service worker `CACHE_VERSION` invalidation makes existing installs pull the new shell on next visit.

Required repository permissions: **Settings → Actions → General → Workflow permissions = Read and write**.

---

## macOS code signing & notarization

For DMGs to open without the "… is damaged and can't be opened" Gatekeeper error on someone else's Mac, the build **must** be:

1. Signed with a **Developer ID Application** certificate from a paid Apple Developer Program account, and
2. Notarized by Apple's `notarytool` service.

This repo's release workflow does both automatically. You only need to set up the secrets once.

### 1. Create a Developer ID Application certificate

1. In **Keychain Access**, open *Certificate Assistant → Request a Certificate From a Certificate Authority…*. Save the CSR to disk.
2. In [developer.apple.com → Certificates](https://developer.apple.com/account/resources/certificates/list), click **+**, choose **Developer ID Application** under *Software*, then *G2 Sub-CA (Xcode 11.4.1 or later)*.
3. Upload the CSR, download the resulting `.cer`, and double-click to install it into the **login** keychain.
4. In *Keychain Access → My Certificates*, verify that "Developer ID Application: \<Your Name\> (\<TEAM\_ID\>)" appears with a private key under it.

### 2. Export the certificate as `.p12`

1. Right-click the certificate → **Export…** → format **Personal Information Exchange (.p12)**.
2. Set a strong export password (this becomes `CSC_KEY_PASSWORD` below).
3. Save as `developer-id.p12`.

### 3. Create an App-Specific Password

1. Go to <https://appleid.apple.com>.
2. *Sign-In and Security → App-Specific Passwords → +*.
3. Save the generated `xxxx-xxxx-xxxx-xxxx` password.

### 4. Add GitHub repository secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret name                   | Value                                                                 |
| ----------------------------- | --------------------------------------------------------------------- |
| `CSC_LINK`                    | base64 of `developer-id.p12` — `base64 -i developer-id.p12 \| pbcopy` |
| `CSC_KEY_PASSWORD`            | `.p12` export password                                                |
| `APPLE_ID`                    | Apple Developer account email                                         |
| `APPLE_APP_SPECIFIC_PASSWORD` | the `xxxx-xxxx-xxxx-xxxx` password                                    |
| `APPLE_TEAM_ID`               | 10-character Team ID (e.g. `ME5ER9CA9Q`)                              |

The Team ID is also configured in `package.json` under `build.mac.notarize.teamId` — update it there if you fork this project.

### 5. Verify locally

After installing a signed build:

```bash
codesign -dv --verbose=4 /Applications/Leeadman.app
spctl -a -t exec -vv /Applications/Leeadman.app
xcrun stapler validate /Applications/Leeadman.app
```

`spctl` should respond with `accepted source=Notarized Developer ID`. If it does, every user can install your DMG without any warning.

### Entitlements

The signed binary uses the entitlements at [`build/entitlements.mac.plist`](./build/entitlements.mac.plist):

- `com.apple.security.cs.allow-jit` — required by V8 in Electron.
- `com.apple.security.cs.allow-unsigned-executable-memory` — JIT support.
- `com.apple.security.cs.disable-library-validation` — load Electron framework dylibs.
- `com.apple.security.cs.allow-dyld-environment-variables` — used by Electron's bootstrap.
- `com.apple.security.network.client` / `server` — outbound update checks and IPC.

---

## Project structure

```
.
├── electron/
│   ├── main.cjs                    # Main process: window, menu, IPC, auth, CSP, updater
│   └── preload.cjs                 # contextBridge surface exposed as window.leeadman
├── src/
│   ├── App.tsx                     # Router + protected shells, PWA-launch redirect
│   ├── main.tsx                    # React entry; StrictMode + ErrorBoundary + SW
│   ├── pwa.ts                      # Service-worker registration (web build only)
│   ├── AccountContext.tsx          # Account sign-in/up state
│   ├── AuthContext.tsx             # PIN lock state
│   ├── AppDataContext.tsx          # Workspace data, debounce-save, reminder watcher
│   ├── ThemeContext.tsx            # Dark / light theme
│   ├── actions.ts                  # Pure reducers operating on AppData
│   ├── model.ts                    # Domain types + migrations + normalization
│   ├── components/
│   │   ├── AppSidebar.tsx
│   │   ├── CommandPalette.tsx      # ⌘K palette
│   │   ├── ErrorBoundary.tsx
│   │   ├── Layout.tsx / TeamLayout.tsx / TopBar.tsx
│   │   ├── icons.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       └── MarkdownEditor.tsx  # GFM markdown editor + viewer
│   ├── lib/                        # Pure helpers (datetime, routes, sorting, categories…)
│   └── views/
│       ├── HomePage.tsx
│       ├── HomeTeams.tsx
│       ├── TodosPage.tsx           # Drag-drop lists, quick-schedule presets
│       ├── AgendaPage.tsx          # Today / This-week unified agenda
│       ├── AnalyticsPage.tsx       # Local analytics dashboard (SVG charts)
│       ├── People.tsx              # Person workspace + Timeline + 1:1 Mode tabs
│       ├── ProfilePage.tsx         # Avatar, view/edit toggle, change-password tab
│       ├── Settings.tsx            # Theme, PIN, backups, LAN sync host + client
│       └── LoginPage.tsx / RegisterPage.tsx
├── public/                         # PWA static assets (manifest, sw.js, icons)
├── docs/
│   └── electron-guide.md           # Practical Electron tutorial walking through this codebase
├── build/
│   └── entitlements.mac.plist
├── scripts/
│   ├── generate-pwa-icons.mjs      # sharp-powered icon rasteriser
│   └── patch-publish.mjs           # Rewrites build.publish.owner at build time
├── .github/workflows/
│   ├── ci.yml
│   ├── release.yml                 # macOS signed + notarized release pipeline
│   └── pages.yml                   # PWA → GitHub Pages
├── vite.config.ts                  # Env-aware base path (Electron vs Pages)
├── package.json
└── README.md
```

---

## Electron deep dive

If you want to go beyond "build it and ship it" and actually understand how
the desktop side of Leeadman works under the hood, there's a dedicated guide
that doubles as a hands-on Electron tutorial:

> **[docs/electron-guide.md](docs/electron-guide.md)** — a practical Electron
> tutorial walking through this codebase: the two-process model, the preload
> bridge, IPC patterns, the security checklist, AES-256-GCM encryption at
> rest, the auto-update flow, the LAN sync HTTP server, the build pipeline,
> debugging tips and the most common pitfalls.

It's written so a developer who has never touched Electron can read it
top-to-bottom and end up confidently extending `electron/main.cjs` and
`electron/preload.cjs`.

---

## Troubleshooting

<details>
<summary><strong>macOS says "Leeadman.app is damaged and can't be opened"</strong></summary>

For official releases this should not happen — they are signed + notarized. If it does, the file was likely tampered with in transit; download again from the [releases page](https://github.com/sercancelenk/leeadman/releases). For DIY (unsigned) builds, run:

```bash
xattr -dr com.apple.quarantine /Applications/Leeadman.app
```

</details>

<details>
<summary><strong>The app opens but the window is blank</strong></summary>

That usually means the renderer crashed before painting. The ErrorBoundary should display the stack trace; please file an issue with that text. In development you can open DevTools with <kbd>⌘ ⌥ I</kbd>.

</details>

<details>
<summary><strong>"Update check failed: net::ERR_NAME_NOT_RESOLVED"</strong></summary>

You're offline or behind a captive portal. Auto-update will retry on next launch; nothing to fix.

</details>

<details>
<summary><strong>The PWA shows a stale build after I deployed a new one</strong></summary>

The service worker uses network-first for navigation, so a second visit when online should fetch the new shell. If you want to force-refresh: from the installed PWA, pull-to-refresh or close-and-reopen the app. From a browser, hard-refresh and clear site data once.

</details>

<details>
<summary><strong>I forgot my account password</strong></summary>

Passwords are not recoverable (they're stored as salted scrypt hashes locally). You can edit `leeadman-accounts.json` in `~/Library/Application Support/Leeadman/` and remove the user entry, then sign up again. Your workspace JSON file is named `leeadman-data-<userId>.json` — keep it if you want to import it into the new account.

</details>

---

## Roadmap

### ✅ Tier 1 — shipped

| # | Feature |
|---|---|
| 1.1 | Markdown editor for notes, scratchpads, item bodies and 1:1 agendas |
| 1.2 | Feedback log (praise / coaching / concern item kind) |
| 1.3 | Recurring reminders (daily / weekly / monthly cadence) |
| 1.4 | Person Timeline — chronological feed per person, filterable by kind |
| 1.5 | Today / This-week unified Agenda page |
| 1.6 | 1:1 Mode — persistent agenda + archive + carry-over |
| 1.7 | ⌘K command palette + global search |
| 1.8 | Smart to-do list management (pin, archive, move, bulk ops, search) |
| 1.9 | Mobile PWA build + GitHub Pages deploy |
| 1.10 | **AES-256-GCM encryption of the data file** with key derived from password |
| 1.11 | **Profile redesign** — avatar upload, view/edit toggle, change-password with old-password verification |
| 1.12 | **Drag-and-drop reordering** for to-do lists (handle + drop targets) |
| 1.13 | **Quick-schedule presets** for tasks (Today / Tomorrow / +3h / Next Mon) |
| 1.14 | **Analytics dashboard** with SVG bar chart, per-team and per-person stats |
| 1.15 | **LAN sync** — Electron HTTP server with token auth + pair UI in Settings |
| 1.16 | **Mobile drawer sidebar** + iOS-safe input sizing |

### Tier 2 — next

| # | Feature | Why it matters |
|---|---|---|
| 2.1 | Cycle / Quarter scope for goals + progress % | OKR support: parent/child (Objective → Key Result), quarter tagging, progress with history. |
| 2.2 | Templates (1:1, skip-level, perf review, onboarding) | Apply a template to a new note/meeting and get a structured outline instantly. |
| 2.3 | Person attributes | Start date, timezone, location, level, manager (dotted-line), pronouns, skills. Auto-computed tenure. |
| 2.4 | iCal (`.ics`) export | Read-only feed so macOS Calendar / Google Calendar can subscribe. |
| 2.5 | HTTPS for LAN sync (self-signed) | Lets the GitHub Pages PWA pull from the desktop without mixed-content blocking. |
| 2.6 | Field-level merge in sync (last-write-wins per item) | Today's `Pull` / `Push` replace the whole snapshot; per-item merge would let two devices edit in parallel. |
| 2.7 | QR-code rendering of the LAN pairing URL+token | Faster pairing on phones — point camera, no typing. |

### Tier 3 — nice to have

| # | Feature |
|---|---|
| 3.1 | Cadence heatmap (1:1 / feedback frequency per person, 12-week strip) |
| 3.2 | Tags + saved filter views (`#growth`, `#blocker`, "All overdue tasks") |
| 3.3 | Decisions log (team-level ADRs) |
| 3.4 | Kanban view for tasks (Today / This week / Later / Done) |
| 3.5 | Watch-folder mode — write notes as real `.md` files for Obsidian compatibility |
| 3.6 | Bulk operations on items (multi-select → mass reschedule / move / delete) |
| 3.7 | Per-team / per-person filter on the Analytics page |

### Long-term

- Per-person reminders with timezone-aware scheduling
- Windows MSI + Linux AppImage signed builds
- i18n framework (English is the primary language; community translations welcome)

---

## Contributing

Issues and pull requests are welcome. Please:

1. Use Node 20+, install with `npm install`, and run `npm run dev`.
2. Keep all UI strings in English (no in-code i18n yet).
3. Before sending a PR, run:
   - `npx tsc --noEmit` — strict type-check.
   - `npm run build:web` — Electron-targeted Vite build.
   - `npm run build:pwa` — Pages-targeted Vite build.

---

## License

MIT © Sercan Çelenk

See [LICENSE](./LICENSE) if present, otherwise refer to the [MIT License](https://opensource.org/licenses/MIT).
