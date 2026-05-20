# Electron in Cadence — a practical guide

This document is both a **mini Electron tutorial** and a **walkthrough of how
Cadence actually uses it**. Every concept is paired with a real excerpt from
this repo, so by the end you'll know enough to confidently extend the desktop
side of the app — add IPC handlers, harden security, ship native features.

> If you've never touched Electron before, read sections 1–4 in order. If you
> already know the basics and just want to learn this codebase, jump straight
> to section 3 (Main process) and use the table of contents to navigate.

---

## Table of contents

1. [What is Electron and why we use it](#1-what-is-electron-and-why-we-use-it)
2. [The two-process architecture](#2-the-two-process-architecture)
3. [Main process — `electron/main.cjs`](#3-main-process--electronmaincjs)
   1. [Single-instance lock](#31-single-instance-lock)
   2. [Creating the window](#32-creating-the-window)
   3. [Native application menu](#33-native-application-menu)
   4. [IPC handlers](#34-ipc-handlers)
   5. [Per-user data files](#35-per-user-data-files)
4. [Preload bridge — `electron/preload.cjs`](#4-preload-bridge--electronpreloadcjs)
5. [Renderer process — the React app](#5-renderer-process--the-react-app)
6. [Security model](#6-security-model)
7. [Encryption-at-rest with AES-256-GCM](#7-encryption-at-rest-with-aes-256-gcm)
8. [Auto-update flow with `electron-updater`](#8-auto-update-flow-with-electron-updater)
9. [Native notifications](#9-native-notifications)
10. [LAN sync HTTP server](#10-lan-sync-http-server)
11. [Build pipeline (Vite + electron-builder)](#11-build-pipeline-vite--electron-builder)
12. [Local development workflow](#12-local-development-workflow)
13. [Debugging](#13-debugging)
14. [Common pitfalls](#14-common-pitfalls)
15. [Further reading](#15-further-reading)

---

## 1. What is Electron and why we use it

[Electron](https://www.electronjs.org/) lets you ship a desktop app on macOS,
Windows and Linux using **the same web stack** you already know — HTML, CSS,
JavaScript / TypeScript and React. It does this by combining two well-known
runtimes into one binary:

- **Chromium** (the renderer): renders your UI, runs your React code.
- **Node.js** (the main process): owns the lifecycle, talks to the OS, opens
  windows, reads files, listens to notifications, runs servers.

For Cadence the sales pitch is concrete:

- We need **local files** (no cloud), so we need raw filesystem access — that's
  the Node side.
- We want a **rich UI** — that's the Chromium / React side.
- We want **native niceties**: signed installers, auto-update, OS-level
  notifications, a real menu bar, single-instance behaviour.
- The same React bundle also deploys as a **PWA on GitHub Pages** — so we get
  a mobile build for free.

You can think of Electron as: *"Node.js spawns a Chromium window and they talk
to each other over a tightly-controlled message bus."*

---

## 2. The two-process architecture

```
┌──────────────────────── Electron app ────────────────────────┐
│                                                              │
│   Main process (Node.js)        Renderer process (Chromium)  │
│   ─ electron/main.cjs           ─ index.html + bundled React │
│   ─ Has full Node access        ─ No Node access (sandboxed) │
│   ─ Owns BrowserWindow          ─ Renders the UI             │
│   ─ Filesystem, OS, IPC         ─ Talks to main via IPC      │
│                                                              │
│             ▲                            ▲                   │
│             │ IPC (request/response)     │                   │
│             └──────── Preload ───────────┘                   │
│                  electron/preload.cjs                        │
│            (the only script in renderer's world              │
│             that has both Node access and a window           │
│             handle, exposes a typed surface via              │
│             contextBridge.exposeInMainWorld)                 │
└──────────────────────────────────────────────────────────────┘
```

The **preload** is the security boundary. The renderer never imports `fs`
directly; it only sees the methods we explicitly expose via `contextBridge`.
That way, even if a third-party dependency in the React tree gets compromised,
it cannot reach the disk.

---

## 3. Main process — `electron/main.cjs`

The entry file is set in `package.json`:

```json
"main": "electron/main.cjs"
```

This is the first thing Electron runs. It boots Node, registers IPC handlers,
opens a window, and stays alive as long as windows are open.

### 3.1 Single-instance lock

When the user double-clicks the dock icon a second time, we don't want a new
window — we want to focus the existing one.

```js
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
```

`requestSingleInstanceLock()` is a global per-app primitive. The first
process to call it wins; later processes get `false` and we cleanly quit.
The original instance receives a `second-instance` event so it can re-focus
its window.

### 3.2 Creating the window

```js
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 560,
    title: 'Cadence',
    backgroundColor: '#0b0b10',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}
```

A few highlights:

- `show: false` + `ready-to-show` — standard recipe to avoid the white
  flash on slow machines. Show the window only after the renderer has painted.
- `backgroundColor` — set even before paint to match the dark theme, so the
  brief moment before paint is also dark.
- `contextIsolation: true` and `nodeIntegration: false` — see [§6](#6-security-model).
- `VITE_DEV_SERVER_URL` is set by `npm run dev` so the window can hot-reload
  off Vite during development. In production the bundled `dist/index.html`
  is loaded via the `file://` protocol.

### 3.3 Native application menu

Electron ships with a default menu, but you almost always want a curated one.
We build a familiar Mac-style menu and reuse the standard `role`s for
items like Cut/Copy/Paste so the OS handles them correctly:

```js
const template = [
  ...(isMac ? [{ label: appName, submenu: [{ role: 'about' }, ...] }] : []),
  { label: 'File',  submenu: [...] },
  { label: 'Edit',  submenu: [{ role: 'undo' }, { role: 'redo' }, ...] },
  { label: 'View',  submenu: [{ role: 'reload' }, ...] },
  { label: 'Window', submenu: [...] },
  { role: 'help', submenu: [...] },
];
Menu.setApplicationMenu(Menu.buildFromTemplate(template));
```

`role: 'undo'` etc. are special markers — Electron wires them to the
renderer's editing commands automatically, including the platform-correct
keyboard shortcuts.

### 3.4 IPC handlers

This is the **only** way the renderer can ask the main process to do
something. Pattern: register a handler with `ipcMain.handle('channel', fn)`
and call it from the renderer with `ipcRenderer.invoke('channel', payload)`.
The function can return a promise; its result becomes the resolved value.

```js
ipcMain.handle('data:load', () => {
  const uid = readSessionUserId();
  if (!uid) return null;
  return readUserData(uid);
});

ipcMain.handle('data:save', (_evt, payload) => {
  const uid = readSessionUserId();
  if (!uid) return false;
  return writeUserData(uid, payload);
});
```

We use channel names like `data:load`, `account:login`, `sync:status`. The
prefix is just a convention to keep them tidy in one file.

> Don't use the older `ipcMain.on` + `event.reply` pattern unless you really
> need an async push *from* main *to* renderer. `invoke` + `handle` is
> request/response and matches `Promise` semantics naturally.

### 3.5 Per-user data files

Each signed-in user gets their own JSON file under `app.getPath('userData')`:

```js
function dataPathForUser(userId) {
  return path.join(app.getPath('userData'), `cadence-data-${userId}.json`);
}
```

`userData` resolves to:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Cadence/` |
| Windows | `%APPDATA%/Cadence/` |
| Linux | `~/.config/Cadence/` |

The actual write is atomic — write to a `.tmp` and `rename` over the real
file, so a crash mid-write can never corrupt the user's data:

```js
const tmp = `${filePath}.tmp`;
fs.writeFileSync(tmp, text, 'utf8');
fs.renameSync(tmp, filePath);
```

---

## 4. Preload bridge — `electron/preload.cjs`

The preload runs **before** the renderer's web content, in a special context
that has Node access *and* sees the renderer's `window` object. It's the only
right place to expose privileged APIs.

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cadence', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  accountLogin: (payload) => ipcRenderer.invoke('account:login', payload),
  accountChangePassword: (payload) => ipcRenderer.invoke('account:changePassword', payload),
  syncEnable: () => ipcRenderer.invoke('sync:enable'),
  // …etc.
});
```

After this, the renderer can do `window.cadence.loadData()` and gets a
promise back — but **only the methods listed here**. There's no `fs`, no
`ipcRenderer`, no `process`. That's the whole point of `contextIsolation`.

We give it a TypeScript type so the React side gets autocomplete. See
[`src/vite-env.d.ts`](../src/vite-env.d.ts):

```ts
declare global {
  interface Window {
    cadence?: {
      loadData: () => Promise<unknown>;
      saveData: (data: unknown) => Promise<boolean>;
      accountLogin: (p: { email: string; password: string }) => Promise<{ ok: boolean; user?: AccountUser; error?: string }>;
      // …
    };
  }
}
```

Whenever you add a new IPC handler, the workflow is:

1. Implement `ipcMain.handle('foo:bar', …)` in `electron/main.cjs`.
2. Expose `fooBar: (p) => ipcRenderer.invoke('foo:bar', p)` in `electron/preload.cjs`.
3. Add the type signature to `src/vite-env.d.ts`.
4. Call it from the renderer as `await window.cadence?.fooBar?.(payload)`.

---

## 5. Renderer process — the React app

The renderer doesn't know it's inside Electron. Its world is plain
React + DOM. The only "tell" is the `window.cadence` surface from the
preload, which we treat as **optional** so the same code can run in three
environments:

```ts
async function persist(userId: string, data: AppData) {
  const api = window.cadence;
  if (api?.saveData) {
    await api.saveData(data); // Electron path: encrypted file write
    return;
  }
  try {
    localStorage.setItem(storageKeyForUser(userId), JSON.stringify(data));
  } catch { /* ignore */ }
}
```

So the same React bundle can be:

- the Electron desktop app (talks to Node, encrypts on disk),
- the GitHub Pages PWA (uses `localStorage`, runs the service worker),
- a Vite dev server in your browser for fast UI iteration.

The router auto-detects `file://` and switches between `BrowserRouter` and
`HashRouter` to keep deep links working everywhere:

```ts
const HistoryRouter =
  typeof window !== 'undefined' && window.location.protocol === 'file:'
    ? HashRouter
    : BrowserRouter;
```

---

## 6. Security model

Electron has a long history of CVEs caused by giving the renderer too much
power. Modern apps follow this lockdown checklist; we do too:

| Setting | Why |
|---|---|
| `contextIsolation: true` | Renderer JS cannot reach into preload's globals; `contextBridge` is the only crossing. |
| `nodeIntegration: false` | No `require('fs')` from renderer. |
| `sandbox: false` *(only because preload uses Node)* | Preload would otherwise lose `require('electron')`. We accept the trade-off because the renderer itself stays isolated. |
| `webview` disabled | We block the deprecated `<webview>` tag at the `web-contents-created` event. |
| Strict CSP via `onHeadersReceived` | Limits what the renderer can fetch / execute. |
| Navigation guard via `will-navigate` | Any link to an external URL is opened in the user's default browser. |

CSP installation:

```js
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://api.github.com https://github.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  callback({
    responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
  });
});
```

External-link redirect:

```js
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  return { action: 'deny' };
});
```

---

## 7. Encryption-at-rest with AES-256-GCM

Most Electron apps just write JSON to disk. We don't.

When the user signs in with a password, the main process derives an
**AES-256 key** with `scrypt(password, encSalt)` and keeps it in memory:

```js
function deriveDataKey(password, encSaltHex) {
  const salt = Buffer.from(encSaltHex, 'hex');
  return crypto.scryptSync(String(password), salt, 32);
}

const dataKeys = new Map(); // userId → 32-byte AES key
```

Every `data:save` is wrapped in an AES-256-GCM envelope before writing:

```js
function encryptPayload(plainText, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    magic: 'LDMN1', v: 1, alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  });
}
```

`data:load` is the inverse. We detect plaintext legacy files via the missing
`magic` header and upgrade them transparently on the next save.

Changing the password (`account:changePassword`):

1. Verify the old password against the stored scrypt hash.
2. Decrypt the data file with the current key.
3. Generate a **new** `encSalt` and derive a **new** AES key.
4. Atomically write `accounts.json` (new salt + hash) and the data file
   (re-encrypted with the new key).
5. Update the in-memory `dataKeys` entry. Old key is GC'd.

A logout wipes the key from memory (and the OS-keychain cache below):

```js
ipcMain.handle('account:logout', () => {
  const uid = readSessionUserId();
  if (uid) {
    dataKeys.delete(uid);
    clearPersistedDataKey(uid);
  }
  clearSession();
  return { ok: true };
});
```

### 7.1 "Stay signed in" — OS-keychain key cache

By default, the in-memory key is lost when the Electron process exits.
Before this feature, that meant every app restart looked like a logout
because `account:session` could not decrypt the data file without
asking the user for their password again.

We now wrap the 32-byte AES key with Electron's `safeStorage` and
persist it next to the per-user data file:

```js
function persistDataKey(userId, keyBuffer) {
  if (!isKeyCacheAvailable()) return false;       // libsecret missing → refuse
  const wrapped = safeStorage.encryptString(keyBuffer.toString('hex'));
  fs.writeFileSync(`${userData}/cadence-keycache-${userId}.bin`, wrapped, { mode: 0o600 });
  return true;
}
```

`safeStorage` delegates to:

- **macOS** — the user's Login Keychain (`security` framework).
- **Windows** — DPAPI scoped to the current user.
- **Linux** — libsecret / GNOME Keyring / KWallet.

On Linux without libsecret, `safeStorage.isEncryptionAvailable()` returns
false. We treat that as "the OS cannot keep a secret for us" and **refuse
to persist the key at all** — better to keep asking the user for their
password than to write a hardcoded-obfuscation key to disk.

On the resume path (`account:session`), we:

1. Try `loadPersistedDataKey(uid)` if the user opted in.
2. **Validate** the loaded key against the actual data file by decrypting
   one block. A mismatch (password rotated on another device, file
   restored from backup, etc.) deletes the stale cache and surfaces
   `requiresAuth=true` to the renderer.

The per-user `rememberMe` flag lives in `accounts.json` and defaults to
`true`. Users can flip it from Settings → "Stay signed in"; turning it
off both clears the cached key and persists the preference so future
sessions don't re-cache. PIN protection is independent and continues to
gate the launch UI.

---

## 8. Auto-update flow with `electron-updater`

Hooked up only when the app is **packaged** (not in `npm run dev`):

```js
function setupAutoUpdater() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.on('error', (err) => console.error(err));
  autoUpdater.checkForUpdatesAndNotify().catch(console.error);
}
```

What happens at runtime:

1. On launch, `autoUpdater` reads `latest-mac.yml` from your latest GitHub
   Release. The repository owner is patched into `package.json` by the CI
   workflow before `electron-builder` runs (`scripts/patch-publish.mjs`).
2. If the published version > the installed version, it downloads the new
   `.zip` in the background.
3. macOS shows an OS notification: *"Update ready — restart to install."*
4. The user **quits and relaunches**; the new binary is swapped in by the
   updater on relaunch.

For the launch-time path we use `checkForUpdatesAndNotify`, which silently
downloads and shows an OS notification — minimal noise. For the user-driven
path (Settings → "Check for updates"), the main process bridges every
`autoUpdater` event to the renderer:

```js
function broadcastUpdaterEvent(event) {
  lastUpdaterEvent = event;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('updater:event', event);
  }
}
autoUpdater.on('checking-for-update', () => broadcastUpdaterEvent({ status: 'checking' }));
autoUpdater.on('update-available',     (i) => broadcastUpdaterEvent({ status: 'available', version: i?.version }));
autoUpdater.on('download-progress',    (p) => broadcastUpdaterEvent({ status: 'downloading', percent: p?.percent, ... }));
autoUpdater.on('update-downloaded',    (i) => broadcastUpdaterEvent({ status: 'downloaded', version: i?.version }));
autoUpdater.on('update-not-available', (i) => broadcastUpdaterEvent({ status: 'not-available', version: i?.version }));
autoUpdater.on('error',              (err) => broadcastUpdaterEvent({ status: 'error', message: err?.message }));
```

A dedicated IPC handler runs `quitAndInstall()` when the user clicks the
"Install & restart" button:

```js
ipcMain.handle('app:installUpdate', () => {
  setImmediate(() => autoUpdater.quitAndInstall());
  return { ok: true };
});
```

`setImmediate` matters: without it the IPC reply would race against the
shutdown and the renderer might never see a result.

The renderer subscribes via `window.cadence.onUpdaterEvent(cb)` (returns an
unsubscribe), drives a small state machine — `checking → available →
downloading → downloaded` (or → `not-available` / `error`) — and renders the
modal in [`src/views/Settings.tsx`](../src/views/Settings.tsx). When a
launch-time check has already finished, the IPC re-broadcasts the cached
event so the freshly opened modal lands on the right state instantly.

For the auto-update to actually succeed on macOS the binary **must be signed
and notarized**. See [the README](../README.md#macos-code-signing--notarization)
for the secret setup; the CI release workflow does the rest.

---

## 9. Native notifications

```js
ipcMain.handle('app:showNotification', (_evt, { title, body } = {}) => {
  if (!Notification.isSupported()) return false;
  new Notification({ title: title || 'Cadence', body: body || '' }).show();
  return true;
});
```

The renderer prefers the standard browser `Notification` API (so PWAs work
identically) and only falls back to the IPC bridge when it's running inside
Electron and the browser API is missing. See `useReminderWatcher` in
[`src/AppDataContext.tsx`](../src/AppDataContext.tsx).

---

## 10. LAN sync HTTP server

Electron lets us spin up a tiny HTTP server right inside the main process
using Node's built-in `http` module. We use this for opt-in same-Wi-Fi sync:

```js
const server = http.createServer((req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.headers.authorization !== `Bearer ${cfg.token}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'unauthorised' }));
  }
  // …handle GET/POST /v1/snapshot
});
server.listen(port, '0.0.0.0', resolve);
```

Because the server lives in the same process as the IPC handlers, it can
call `readUserData(uid)` / `writeUserData(uid, payload)` directly — same
encryption, same atomicity. There's no extra database to keep in sync.

The server is started/stopped via `sync:enable` / `sync:disable` IPC
handlers, and its config (token + enabled flag) is persisted to
`sync.json` so it auto-resumes on next launch.

---

## 11. Build pipeline (Vite + electron-builder)

Two tools, one bundle:

1. **Vite** turns the React tree under `src/` into static `dist/` assets.
2. **electron-builder** wraps `dist/` + `electron/main.cjs` + `package.json`
   into a real `.app`/`.dmg`/`.zip` and (in CI) signs + notarizes it.

The relevant scripts in `package.json`:

```json
"scripts": {
  "dev": "concurrently -k \"vite\" \"wait-on http://localhost:5173 && cross-env VITE_DEV_SERVER_URL=http://localhost:5173 electron .\"",
  "build:web": "vite build",
  "build:pwa": "cross-env LEEADMAN_PWA=1 vite build",
  "build": "vite build && electron-builder",
  "build:release": "vite build && electron-builder --publish always"
}
```

The Electron-targeted build sets `base: './'` in `vite.config.ts` so the
generated `index.html` uses **relative** asset paths, which is what
`file://` needs. The PWA-targeted build sets `base: '/cadence/'` so it
works under `https://<user>.github.io/cadence/`.

`electron-builder`'s configuration lives in the same `package.json`
under the `build` key. Highlights:

```json
"build": {
  "appId": "com.cadence.app",
  "productName": "Cadence",
  "files": ["dist/**/*", "electron/**/*", "package.json"],
  "publish": [{ "provider": "github", "owner": "...", "repo": "cadence", "releaseType": "release" }],
  "mac": {
    "target": [{ "target": "dmg", "arch": ["arm64", "x64"] }, { "target": "zip", "arch": ["arm64", "x64"] }],
    "hardenedRuntime": true,
    "entitlements": "build/entitlements.mac.plist",
    "notarize": true
  }
}
```

Read `files` carefully: it's an **allowlist**. If you add a new top-level
folder that the runtime needs (e.g. shared CommonJS modules), you must add
its glob here or it won't be packaged.

---

## 12. Local development workflow

```bash
npm install
npm run dev
```

This runs `vite` and `electron .` in parallel via `concurrently`:

- Vite starts on `http://localhost:5173` and watches your React source.
- Electron starts and points its window at the dev server (because
  `VITE_DEV_SERVER_URL` is set). HMR works for the renderer.
- Edits to `electron/main.cjs` require a manual `q + npm run dev` cycle —
  HMR is renderer-only.
- DevTools open with **⌘ ⌥ I** (default Electron shortcut on macOS).

If you want to see what a packaged build does without the full release
ceremony, use:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build
open release/Cadence-<version>-<arch>.dmg
```

This skips signing entirely; macOS will quarantine the result, so once you
drag it into Applications you'll need to clear the quarantine xattr (see the
README's troubleshooting section).

---

## 13. Debugging

| What | How |
|---|---|
| **Renderer crashes** | The React `ErrorBoundary` shows the stack. Or open DevTools (⌘⌥I) for the live console. |
| **Main-process logs** | They appear in the terminal that launched `npm run dev`. In a packaged app, run `/Applications/Cadence.app/Contents/MacOS/Cadence` from a terminal to see them. |
| **IPC mismatches** | If `window.cadence.foo` is `undefined` after edit, check (a) is the channel registered with `ipcMain.handle`?, (b) is it exposed in `preload.cjs`?, (c) did you restart Electron (preload doesn't HMR)? |
| **CSP violations** | Check the renderer DevTools console — the violation message tells you the directive. Update `onHeadersReceived` if legitimate. |
| **Auto-update issues** | `electron-updater` logs to the system log on macOS (`Console.app`), look for `[ElectronUpdater]`. Or temporarily wire `autoUpdater.on('error'/'update-available'/'update-downloaded', …)` to a `dialog.showMessageBox`. |

---

## 14. Common pitfalls

1. **Forgetting to restart Electron after editing the preload.** The preload
   is loaded once when the BrowserWindow opens. HMR doesn't touch it.
2. **Putting state in module scope of `main.cjs`.** It survives across
   reloads (good) but not across app restarts (obvious in retrospect, easy
   to forget). Persist anything that must survive to a JSON file under
   `userData`.
3. **Using `__dirname` after building.** It works in `main.cjs`, but inside
   the renderer/preload `__dirname` resolves under `app.asar`. Always go
   through `app.getPath('userData')` for writable files.
4. **Calling `ipcRenderer.invoke` from inside the renderer.** It's not
   available — `nodeIntegration: false` enforces this. Always go through
   `window.cadence`.
5. **Loading remote assets that violate CSP.** Either widen the directive
   for that origin (after security review) or proxy the asset through a
   local file you ship.
6. **Forgetting `mac.notarize: true` ↔ Apple secrets.** If you set the
   former without the latter, every release build fails at notarization.
7. **Mixing `ipcMain.on` and `ipcMain.handle`.** They use different reply
   semantics. Stick to `handle` for almost everything — it returns a
   promise, which composes naturally with `await`.
8. **Single-instance lock not held.** If `requestSingleInstanceLock` returns
   false you must `app.quit()` immediately, otherwise you end up with two
   instances fighting over the data file.

---

## 15. Further reading

- [Electron docs — main concepts](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [`contextBridge` reference](https://www.electronjs.org/docs/latest/api/context-bridge)
- [`ipcMain` reference](https://www.electronjs.org/docs/latest/api/ipc-main)
- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [`electron-builder` docs](https://www.electron.build/)
- [`electron-updater` docs](https://www.electron.build/auto-update)
- [Apple notarization docs](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

Once you're comfortable with the topics here, a fun next step is to read
[`electron/main.cjs`](../electron/main.cjs) end-to-end. It's intentionally
a single file (~1000 lines) so the whole desktop side of Cadence fits in
one mental scroll — most of what you read above is right there in
sequence.
