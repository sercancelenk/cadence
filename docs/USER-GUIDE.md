# Cadence — User Guide

A practical guide to daily use, backups, recovery, and storage. For install and developer docs, see the [README](../README.md).

**In the app:** open **Settings → About → User guide**, press **⌘K** and choose *Open user guide*, or visit `/guide`.

---

## Quick start

1. **Create an account** on first launch (desktop) or sign in on the web app. Your password encrypts the workspace file on disk.
2. **Use the sidebar** to move between Home, To-dos, Notes, Agenda, Planning, Teams, Analytics, and Settings.
3. Press **⌘K** (Mac) or **Ctrl+K** (Windows/Linux) anywhere to open the command palette — search titles and bodies across notes, tasks, and team items.
4. **Settings → Data & backup → Backup & recovery** is your safety net: export, import, and (on desktop) restore automatic snapshots.
5. **Recovery codes** (optional but recommended on desktop): generate them in **Settings → Account & security → Recovery codes** so you can reset your account password on this device without losing data.

---

## Daily workflow

### To-dos

- Tasks live in **lists** (groups). Each list has its own priority and can be pinned.
- Each task has a **status**: To do, In progress, Done, or Cancelled.
- Use **Add details** (or the 📝 toggle) for rich-text notes on a task — same editor family as Notes.
- **Quick add** (floating + button) creates a task or note from any page.
- **Recurring reminders** (daily / weekly / monthly) fire as desktop notifications when the app is in the background.

### Notes

- Two-pane layout: sidebar list + editor. Drag the divider to resize (220–560 px).
- On desktop, use **←** in the list header to hide the sidebar for a full-width editor; **☰** in the note header brings it back.
- **Preview** is default; switch to **Write** for the formatting toolbar.
- **Pin** important notes; use **Manual** sort mode to drag-reorder within the pinned tier.
- **Lock** sensitive notes with a workspace passphrase (PBKDF2 → AES-256-GCM).
- **Version history** (desktop): open the clock icon on a note to browse and restore earlier revisions.

### Agenda

- Read-only calendar of reminders, due dates, and recurring tasks for the next seven days, plus **Overdue**.
- Click a day or item to jump to the underlying note or task.

### Planning

- **Planning** (sidebar) is your personal Eisenhower matrix: drag tasks into **Do first**, **Schedule**, **Delegate**, or **Eliminate** based on urgency and importance.
- Tasks come from your personal to-do lists; the matrix is a view, not a separate copy.

### People & teams

- Group colleagues into **teams**. Each team has a scratchpad and running agenda.
- **1:1 mode** keeps a shared meeting agenda on each person workspace (Me, leader, skip-level, and roster). **Apply template** inserts a bilingual (EN/TR) outline; **Guide** opens a peer-neutral way-of-working note (balance airtime, keep status elsewhere, prepare ahead, speak candidly, leave with owners). Unchecked `- [ ]` items carry over when you archive.
- **Person Timeline** helps you prep for reviews.

### Analytics

- **Analytics → Overview**: completion rate, created-vs-completed chart, per-team performance.
- **Analytics → Activity**: a chronological activity report — what changed and when, fully local.

---

## Active vs archived

Notes and to-dos support **Active | Archived** in the sidebar:

| Action | What happens |
|--------|----------------|
| **Archive** | Hides the item from Active views and from ⌘K search (notes). Data stays in your workspace file. |
| **Show archived** | Switch the segment to Archived to browse or restore. |
| **Delete** | Permanent removal (with confirmation). |

Archived items still count toward **Settings → Storage & cache → Workspace content** until you delete them. Use archive to declutter without losing history.

---

## Account recovery codes

Recovery codes are **optional** and **local to this device** — like a crypto wallet seed phrase.

| Topic | Detail |
|-------|--------|
| **When to set up** | At first sign-up (welcome tour) or anytime in **Settings → Recovery codes**. |
| **What they do** | Let you reset your **account password** on this machine if you forget it, without wiping encrypted data. |
| **What they don't do** | They do not sync to other devices or to Cadence servers. |
| **After password change** | Old codes are cleared — generate a new set in Settings. |
| **Forgot password** | Sign-in screen → **Recover account** → enter email, all 8 codes, and a new password. |

**Important:** Save codes somewhere safe (password manager or printout). Cadence never stores the plain codes — only an encrypted envelope. When you regenerate codes, the previous set stays active until you confirm you saved the new set.

---

## Backups & recovery

Everything lives under **Settings → Data & backup → Backup & recovery**. The buttons you see depend on your platform (desktop vs browser vs phone).

### Automatic snapshots (desktop only)

Cadence keeps up to **50 rolling snapshots** at launch, sign-in, before each save, before password changes, and before restores. Each snapshot shows team / task / note counts so you can pick the right one.

- **Restore** always snapshots your *current* state first — you can undo a bad restore.
- **Open data folder** opens the Cadence data directory in Finder / Explorer.
- **Reveal** on a snapshot row shows that file in the OS file manager.

### Manual export & import

| Format | Desktop | Web / mobile | Includes images? | Best for |
|--------|---------|--------------|------------------|----------|
| **Portable ZIP** | ✅ | ✅ | ✅ Yes | Moving to another account or device |
| **Full backup folder** | ✅ | ❌ | ✅ Yes + note version history | Desktop-to-desktop, full restore |
| **JSON only** | ✅ (advanced) | ✅ (advanced) | ❌ Text only | Quick copy, debugging, git |

**Cross-account tip:** If you created a second account and imported JSON only, embedded images will look broken — that's expected. Export a **portable ZIP** (or full folder) from the first account and import that on the second.

### Browser (PWA)

- **Portable ZIP** and JSON export/import work in the browser.
- No automatic on-disk snapshots — export regularly. Clearing site data erases your workspace.
- Full folder backup and note version history require the desktop app.

### If data looks wrong after an update

1. Check the amber **integrity banner** on boot (if shown) — it links to recovery.
2. Open **Backup & recovery** and compare snapshot counts (desktop).
3. Restore the newest snapshot that shows the counts you expect.
4. For to-dos that look empty: toggle **Show archived** — all lists may have been archived in that snapshot.

---

## Upgrading safely (no data loss)

Cadence is designed so **existing users are never forced to migrate**:

- New fields (`recoveryEnvelope`, attachments, note revisions) are **optional** — older workspace files load unchanged.
- **No schema version bump** is required for recovery codes or portable backups.
- Import always runs through `normalizeData()` and snapshots your current state before replacing (desktop).
- If something looks wrong after an update, use **Backup & recovery** — do not delete files manually.

---

## Storage (desktop)

**Settings → Storage & cache** shows:

- **Workspace content** — estimated JSON size by area (notes, tasks, teams, settings).
- **Encrypted workspace files** — total on-disk size (managed automatically).
- **Backups** — rolling snapshot folder size.
- **Clear browser caches** — reclaims Chromium cache only; never touches tasks, notes, keys, or backups.

---

## Sync (optional)

Both are off by default. See [LAN-SYNC.md](./LAN-SYNC.md) and README for setup.

- **Offline device transfer** — export an encrypted backup file, carry it across (AirDrop / Files / USB), and **merge it in** on the other device. Additive and lossless; no cloud, no network link between devices.
- **Cloud sync (Google Drive)** — end-to-end encrypted backup to *your* Drive with a sync passphrase you choose.

---

## AI (optional)

**Settings → Integrations → AI assistant**

- Bring your own API key (Anthropic, OpenAI, or Google Gemini).
- **Task extractor** turns meeting notes into an ordered task list.
- **Coaching** gives next actions on a single stuck task.
- Leave the key blank — the rest of Cadence works identically.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K / Ctrl+K | Command palette (includes *Open user guide*) |
| ⌘B / Ctrl+B | Bold (in rich-text editors) |
| ⌘I / Ctrl+I | Italic |
| ⌘K (in editor) | Insert link |

Native macOS menus expose additional shortcuts when running the desktop build, including **Help → User guide**.

---

## Privacy in one paragraph

Your workspace is encrypted on disk (desktop), stored locally, and never sent to Cadence servers. Network use is limited to: GitHub Releases (auto-update), your chosen AI provider (if configured), and Google Drive (if cloud sync is enabled). No telemetry.

---

## Getting help

- **In-app:** Settings → About → User guide, or ⌘K → *Open user guide*
- [README](../README.md) — install, build, troubleshooting
- [Health check & roadmap](./HEALTH-CHECK-AND-ROADMAP.md) — living product roadmap
- [GitHub Issues](https://github.com/sercancelenk/cadence/issues) — bugs and feature requests
- [Marketing site](https://sercancelenk.github.io/cadence/) — feature overview
