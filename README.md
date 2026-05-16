<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# Leeadman

**A local-first leadership workspace — teams, people, tasks, notes, goals, reminders.**

[![Release](https://github.com/sercancelenk/leeadman/actions/workflows/release.yml/badge.svg)](https://github.com/sercancelenk/leeadman/actions/workflows/release.yml)
[![CI](https://github.com/sercancelenk/leeadman/actions/workflows/ci.yml/badge.svg)](https://github.com/sercancelenk/leeadman/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/sercancelenk/leeadman?display_name=tag&sort=semver)](https://github.com/sercancelenk/leeadman/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

</div>

Leeadman is an Electron + React desktop app that helps people leaders run the boring, important parts of their job — 1:1 follow-ups, personal to-dos, goal tracking, and structured notes for every direct report — **without sending any data to a server**. Everything is stored on your machine, in JSON files under your user folder. No accounts in the cloud. No telemetry.

The app is delivered as a signed and notarized macOS DMG via GitHub Releases (Windows/Linux builds are easy to enable, see [Building](#building-from-source)).

---

## Table of contents

- [Highlights](#highlights)
- [Screens](#screens)
- [Install](#install)
  - [macOS (Apple Silicon & Intel)](#macos-apple-silicon--intel)
  - [Removing Gatekeeper quarantine (only for unsigned builds)](#removing-gatekeeper-quarantine-only-for-unsigned-builds)
- [Getting started](#getting-started)
- [Concepts](#concepts)
- [Keyboard & native menus](#keyboard--native-menus)
- [Data, privacy and backups](#data-privacy-and-backups)
- [Auto-updates](#auto-updates)
- [Building from source](#building-from-source)
- [Releasing](#releasing)
- [macOS code signing & notarization](#macos-code-signing--notarization)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Highlights

- 🧭 **Multi-team workspace.** Each team has its own *Me* and *My leader* workspaces plus per-person pages.
- ✅ **Tasks, goals, notes, documents.** Tag entries with optional categories (Initiative, Operations, Stakeholder…).
- ⏰ **Reminders.** Native desktop notifications fire at the time you choose.
- 📝 **Personal to-dos.** Independent of any team; group by lists, set due times.
- 🌓 **Dark / light theme.** Remembered per device.
- 🔐 **Optional PIN lock** at app launch (data files are still plain JSON — see [Privacy](#data-privacy-and-backups)).
- 💾 **JSON import/export** for backup and migration.
- 🔄 **Auto-update** via GitHub Releases (`electron-updater`).
- ✍️ **Code-signed + notarized** macOS DMG (Universal builds for both arm64 and x64).
- 🛡️ **Hardened renderer** with `contextIsolation`, no `nodeIntegration`, strict CSP, blocked external navigation.

---

## Screens

> Screenshots live in the latest [GitHub Release](https://github.com/sercancelenk/leeadman/releases/latest). The UI is in English.

---

## Install

### macOS (Apple Silicon & Intel)

1. Go to the [latest release](https://github.com/sercancelenk/leeadman/releases/latest).
2. Download the right DMG:
   - `Leeadman-<version>-arm64.dmg` — Apple Silicon (M1/M2/M3/M4)
   - `Leeadman-<version>-x64.dmg` — Intel Macs
3. Open the DMG and drag `Leeadman.app` into `Applications`.
4. Launch from Launchpad or Spotlight (⌘+Space → "Leeadman").

Because the DMG is signed with a **Developer ID Application** certificate **and** notarized by Apple, you will not see any "damaged" or "unidentified developer" warning.

### Removing Gatekeeper quarantine (only for unsigned builds)

If you build the DMG yourself **without** code signing, macOS will refuse to open it ("… is damaged and can't be opened"). That's Gatekeeper enforcing the quarantine attribute that gets attached to anything downloaded from the internet. To bypass it for personal builds:

```bash
xattr -dr com.apple.quarantine /Applications/Leeadman.app
```

For the official, signed builds from this repo's Releases page, you do **not** need to run this command.

---

## Getting started

1. Launch Leeadman.
2. Click **Create one** under the sign-in card. Pick an email, a display name and a password (8+ chars). The account exists **only on this device**.
3. You land on the Home screen. From there you can:
   - Open the auto-created **My first team**.
   - Create new teams from the *Teams* page.
   - Add personal to-dos in the *To-dos* page.

> Tip: install Leeadman on a second machine and use **Settings → Backup → Export JSON / Import JSON** to move your data.

---

## Concepts

```
Account
└── App data file (JSON)
    └── Teams[]
        ├── Me              (auto-created per team)
        ├── My leader       (auto-created per team)
        └── People[]
            └── Items[]: Task | Goal | Note | Document
```

- **Account** — local user; backed by a salted-scrypt password.
- **Team** — a workspace boundary. Mark teams as Active, Paused or Archived and pin favourites.
- **Me** — your personal space inside a team for tasks, goals, notes and documents.
- **My leader** — a dedicated workspace for the relationship with your manager.
- **People** — your direct reports/peers; each has structured items plus a free-form scratchpad.
- **Items** — tasks (with due dates), goals (with status, start, deadline), notes, documents (with URL).
- **To-dos** — personal lists, separate from any team.

The full data model lives in [`src/model.ts`](./src/model.ts).

---

## Keyboard & native menus

Leeadman ships with a native menu bar (English):

- **Leeadman** — About, Check for Updates…, Quit
- **File** — Close window / Quit
- **Edit** — Undo / Redo / Cut / Copy / Paste / Select All
- **View** — Reload, Zoom, Toggle Full Screen
- **Window** — Minimize, Zoom
- **Help** — Project on GitHub, Report an Issue

Standard shortcuts apply (⌘+Q, ⌘+W, ⌘+R, ⌘+F, ⌘+, etc.).

---

## Data, privacy and backups

- **Where data lives** (macOS): `~/Library/Application Support/Leeadman/`
  - `leeadman-accounts.json` — user list (emails + salted scrypt hashes).
  - `leeadman-session.json` — id of the signed-in user.
  - `leeadman-data-<userId>.json` — your workspace data, per account.
  - `auth-lock.json` — optional PIN hash.
- **No telemetry, no analytics, no remote sync.**
- **PIN protection** is a launch-time barrier; it does **not** encrypt the data file. For real privacy enable full-disk encryption (macOS FileVault, Windows BitLocker, Linux LUKS).
- **Backups**: use *Settings → Backup → Export JSON* periodically. The file is plain JSON, easy to diff and migrate.

---

## Auto-updates

The packaged app checks GitHub Releases on launch via [`electron-updater`](https://www.electron.build/auto-update). When a new version is published, it is downloaded in the background and applied on next quit (or via *Leeadman → Check for Updates…*). Development builds (`npm run dev`) skip the check.

---

## Building from source

### Requirements

- Node.js 20+
- npm 10+
- macOS 12+ (only for producing a macOS DMG — Linux/Windows builds work cross-platform but unsigned)

### Install dependencies

```bash
git clone https://github.com/sercancelenk/leeadman.git
cd leeadman
npm install
```

### Run in development

```bash
npm run dev
```

This starts Vite at `http://localhost:5173` and launches Electron pointed at it, with full hot reload.

### Build a local production bundle (no publish)

```bash
npm run build
```

Output goes to `release/` (DMG + ZIP + blockmap files). For local-only DMGs you can skip Apple credentials by setting `CSC_IDENTITY_AUTO_DISCOVERY=false`:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build
```

---

## Releasing

A push to `main` (or a manual *Release* workflow run) triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Sets the version to `0.2.<run_number>`.
2. Runs `vite build` → `electron-builder --publish always`.
3. Signs `.app` with Developer ID Application certificate.
4. Notarizes with Apple's `notarytool`, then staples the ticket onto the `.app`.
5. Publishes the signed/notarized DMG + ZIP to a new GitHub Release.

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
- `com.apple.security.network.client`/`server` — outbound update checks and IPC.

---

## Project structure

```
.
├── electron/
│   ├── main.cjs              # Main process: window, menu, IPC, auth, CSP, updater
│   └── preload.cjs           # contextBridge surface exposed as window.leeadman
├── src/
│   ├── App.tsx               # Router + shells (login, protected, team layouts)
│   ├── main.tsx              # React entry; StrictMode + ErrorBoundary
│   ├── AccountContext.tsx    # Account sign-in/up state
│   ├── AuthContext.tsx       # PIN lock state
│   ├── AppDataContext.tsx    # Workspace data (load, debounce-save, reminders)
│   ├── ThemeContext.tsx      # Dark/light theme
│   ├── actions.ts            # Pure reducers operating on AppData
│   ├── model.ts              # Domain types + migrations + normalization
│   ├── components/
│   │   ├── AppSidebar.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Layout.tsx
│   │   ├── TeamLayout.tsx
│   │   ├── TopBar.tsx
│   │   ├── icons.tsx
│   │   └── ui/Button.tsx
│   ├── lib/                  # Pure helpers (datetime, routes, sorting, categories…)
│   └── views/                # Pages (Home, Teams, People, TodosPage, …)
├── build/
│   └── entitlements.mac.plist
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml           # macOS signed + notarized release pipeline
├── scripts/patch-publish.mjs # Rewrites build.publish.owner at build time
├── package.json
└── README.md
```

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

That usually means the renderer crashed before painting. Open the DevTools view (development only: <kbd>⌘ ⌥ I</kbd>). For packaged builds the ErrorBoundary will display the stack trace; please file an issue with that text.

</details>

<details>
<summary><strong>"Update check failed: net::ERR_NAME_NOT_RESOLVED"</strong></summary>

You're offline or behind a captive portal. Auto-update will retry on next launch; nothing to fix.

</details>

<details>
<summary><strong>I forgot my account password</strong></summary>

Passwords are not recoverable (they're stored as salted scrypt hashes locally). You can edit `leeadman-accounts.json` in `~/Library/Application Support/Leeadman/` and remove the user entry, then sign up again. Your workspace JSON file is named `leeadman-data-<userId>.json` — keep it if you want to import it into the new account.

</details>

---

## Roadmap

- iCloud Drive / Dropbox folder sync (opt-in)
- Encrypted-at-rest data file (passphrase-derived key)
- Per-person reminders with timezone-aware scheduling
- Calendar (`.ics`) export
- Windows MSI + Linux AppImage signed builds
- i18n framework (English is the primary language; community translations welcome)

---

## Contributing

Issues and pull requests are welcome. Please:

1. Use Node 20+, install with `npm install`, and run `npm run dev`.
2. Keep all UI strings in English (no in-code i18n yet).
3. Run `npm run build:web` before sending a PR to ensure TypeScript and Vite are happy.

---

## License

MIT © Sercan Çelenk

See [LICENSE](./LICENSE) if present, otherwise refer to the [MIT License](https://opensource.org/licenses/MIT).
