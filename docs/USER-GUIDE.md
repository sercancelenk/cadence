# Cadence — User Guide

A practical guide to daily use, archiving, backups, and storage. For install and developer docs, see the [README](../README.md).

---

## Quick start

1. **Create an account** on first launch (desktop) or sign in on the web app. Your password encrypts the workspace file on disk.
2. **Use the sidebar** to move between Home, To-dos, Notes, Agenda, Planning, People, Analytics, and Settings.
3. Press **⌘K** (Mac) or **Ctrl+K** (Windows/Linux) anywhere to open the command palette — search titles and bodies across notes, tasks, and team items.
4. **Settings → Backup & recovery** is your safety net: export manually, restore automatic snapshots, or open the data folder.

---

## Daily workflow

### To-dos

- Tasks live in **lists** (groups). Each list has its own priority and can be pinned.
- Each task has a **status**: To do, In progress, Done, or Cancelled.
- Use **Add details** (or the 📝 toggle) for Markdown notes on a task — same Write / Preview editor as Notes.
- **Quick add** (floating + button) creates a task or note from any page.
- **Recurring reminders** (daily / weekly / monthly) fire as desktop notifications when the app is in the background.

### Notes

- Two-pane layout: sidebar list + editor. Drag the divider to resize (220–560 px).
- **Preview** is default; switch to **Write** for the Markdown toolbar.
- **Pin** important notes; use **Manual** sort mode to drag-reorder within the pinned tier.
- **Lock** sensitive notes with a workspace passphrase (PBKDF2 → AES-256-GCM).

### Agenda

- Read-only calendar of reminders, due dates, and recurring tasks for the next seven days, plus **Overdue**.
- Click a day or item to jump to the underlying note or task.

### Planning

- **Planning** (sidebar) is your personal Eisenhower matrix: drag tasks into **Do first**, **Schedule**, **Delegate**, or **Eliminate** based on urgency and importance.
- Tasks come from your personal to-do lists; the matrix is a view, not a separate copy.

### People & teams

- Group colleagues into **teams**. Each team has a scratchpad and running agenda.
- **1:1 mode** keeps a persistent meeting agenda; unchecked items carry over to the next session.
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

## Backups & recovery

Everything lives under **Settings → Data & backup → Backup & recovery**.

### Automatic snapshots (desktop)

Cadence keeps up to **50 rolling snapshots** at launch, sign-in, before each save, before password changes, and before restores. Each snapshot shows team / task / note counts so you can pick the right one.

- **Restore** always snapshots your *current* state first — you can undo a bad restore.
- **Open data folder** opens `~/Library/Application Support/Cadence/` (macOS) so you can inspect files in Finder.
- **Reveal** on a snapshot row shows that file in the OS file manager.

### Manual export

| Button | Use when |
|--------|----------|
| **Export JSON** | Lightweight backup; good for version control or moving text data. Attachment pointers only — not image files. |
| **Export full backup** | Desktop only. Folder with JSON + attachment images. Use before major changes or when moving machines. |
| **Import JSON** | Replaces the entire workspace. Export first if unsure. |
| **Import folder** | Desktop only. Restores a full backup folder including images. |

### Browser (PWA)

- JSON export/import works in the browser.
- No automatic snapshots — export regularly. Clearing site data erases your workspace.
- Full folder backup requires the desktop app.

### If data looks wrong after an update

1. Check the amber **integrity banner** on boot (if shown) — it links to recovery.
2. Open **Backup & recovery** and compare snapshot counts.
3. Restore the newest snapshot that shows the counts you expect.
4. For to-dos that look empty: toggle **Show archived** — all lists may have been archived in that snapshot.

---

## Storage (desktop)

**Settings → Storage & cache** shows:

- **Workspace content** — estimated JSON size by area (notes, tasks, teams, settings). Useful for spotting large note bodies or heavy archives.
- **Encrypted workspace files** — total on-disk size of your workspace (the app manages file layout automatically; you do not need to edit files by hand).
- **Backups** — rolling snapshot folder size.
- **Clear browser caches** — reclaims Chromium cache only; never touches tasks, notes, keys, or backups.

---

## Sync (optional)

Both are off by default. See [LAN-SYNC.md](./LAN-SYNC.md) and README for setup.

- **LAN sync** — same Wi-Fi, QR pairing, TLS between your devices. No Cadence cloud.
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
| ⌘K / Ctrl+K | Command palette |
| ⌘B / Ctrl+B | Bold (in Markdown editors) |
| ⌘I / Ctrl+I | Italic |
| ⌘K (in editor) | Insert link |

Native macOS menus expose additional shortcuts when running the desktop build.

---

## Privacy in one paragraph

Your workspace is encrypted on disk (desktop), stored locally, and never sent to Cadence servers. Network use is limited to: GitHub Releases (auto-update), your chosen AI provider (if configured), LAN sync (if enabled), and Google Drive (if cloud sync is enabled). No telemetry.

---

## Getting help

- [README](../README.md) — install, build, troubleshooting
- [GitHub Issues](https://github.com/sercancelenk/cadence/issues) — bugs and feature requests
- [Marketing site](https://sercancelenk.github.io/cadence/) — feature overview
