# Cadence — User Guide

A practical guide to daily use, backups, recovery, and storage. For install and developer docs, see the [README](../README.md).

**In the app:** open **Settings → About → User guide**, press **⌘K** and choose *Open user guide*, or visit `/guide`.

---

## Quick start

1. **Create an account** on first launch (desktop) or sign in on the web app. Your password encrypts the workspace file on disk.
2. **Use the sidebar** to move between Home, Teams, Agenda, Planning, To-dos, Notes, Analytics, the Utilities and Settings. Click a group title (Workspace, AI, Insights, Utilities, People, Account) to fold it away; Cadence remembers this on your device.
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

### Tools: Document and JSON / YAML

Scratch pads under **Tools**. They are not notes or to-dos, but they are saved with your workspace like everything else.

- **Document** and **JSON / YAML** both work in tabs: **＋** adds one, double-click (or **F2**) renames it, **←/→** moves between tabs. Closing a tab that has content asks first.
- **Move to Notes** turns the open tab into a note and removes it from Tools. Pick a list or no list. A JSON / YAML tab becomes a note with a code block.
- **⌘S** saves right now. **⇧⌘S** saves the open tab as a file: type the extension you want in the save window (Document: `.md`, `.txt` or `.html`; JSON / YAML: any).
- Notes lists are shown with a yellow folder.

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

Cadence keeps up to **50 rolling snapshots** (default) at launch, sign-in and before saves. Safety copies taken before an import, restore, password change or account recovery are kept **separately** (the newest 50), so routine snapshots never push them out. Each snapshot shows team / task / note counts so you can pick the right one.

- **How many to keep:** under **How many backups to keep** you can choose 10 / 20 / 30 / 50 routine snapshots and 3 / 7 / 14 / 30 daily backup folders. Images are shared between snapshots and cost little disk space; each daily folder holds a full copy of your images, so that is the setting that decides disk use.
- **Lowering a value deletes older backups.** Cadence tells you how many will go and waits for your confirmation; Cancel changes nothing. The newest backup is always kept, and raising a value deletes nothing.

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
- **Tools → Document** tabs are new optional fields; your existing single document becomes the first tab and the old field is kept untouched, so going back to an older version still finds it.
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
- **Connections and routing.** Under *Connections* you can add more than one connection (for example a company gateway and a local Ollama) and, under *Feature routing*, choose which one serves *Notes and tasks* and which serves *People data*. *Test connection* also checks that the connection returns reliable JSON, which task extraction needs.
- **People data stays local unless you allow otherwise.** That means Ask AI on a person's own tasks and goals and the feedback rewrite. AI on that kind of data only uses a connection with *Allow people data* switched on; a model running on this computer is on by default (if that address is a router that forwards to a cloud provider, switch it off for that connection).
- **If a connection's JSON check says "unreliable"**, tasks that need structured replies (Extract tasks, Challenge, Break down, the feedback rewrite) are blocked on it. If you know the model handles it, switch on *Use for JSON tasks anyway* on that connection.
- **Where AI starts:** type `/extract`, `/visualize` or `/challenge` in a note, select text and use the ✨ menu, press ⌘K and choose *AI: Extract tasks from notes*, *AI: Weekly digest*, *AI: Ask your workspace* or *AI: Diagram from a screenshot*, or use *Ask AI* and *Break down* on a task. In Ask AI, *Focus* switches between a plan, a risk check and a first-15-minutes list. Every result shows what was read; click it to see exactly what was sent.
- **Or point Cadence at your own gateway or router** (a router, a proxy or a model server, including one your company runs): choose *Custom gateway*, pick the template for the API format it speaks (or fill the fields yourself), and enter its base URL (usually ending in `/v1`, e.g. `https://gateway.example.com/v1`), the model name exactly as the gateway lists it, and an API key if it needs one.
  - Every provider choice shows an **info box** under the dropdown: where requests go, how they are authenticated, what is sent and the limits.
  - **API format** — pick what the gateway speaks: *OpenAI Chat Completions* (the default and most common), *OpenAI Responses*, *Anthropic Messages* or *Google Gemini*. Tools you already use against the gateway (Codex, OpenCode, …) usually tell you which provider type they use.
  - **Advanced** — the header the key goes in (for example `api-key` or `x-api-key`), whether it is sent as `Bearer <key>`, on its own, or not as a header at all, extra headers such as a tenant id (one `Name: value` per line), and the request path if your gateway does not use the standard one. The path may end in a `?query` (for example `?api-version=2024-02-01`), and `{model}` and `{apiKey}` are replaced by the model name and your key. A line under the form shows the exact address requests go to.
  - *Test connection* checks everything. If it fails, open **Diagnostic details**: it lists the address, header names (values hidden), the HTTP status and the start of the answer, with your key masked, so it is safe to paste into a bug report or send to your gateway's administrator.
  - Plain `http://` is accepted only for localhost and private-network addresses; use `https://` for anything remote. On the desktop app the request is made by Cadence itself, so the gateway does not need to allow browser (CORS) requests; in the web app it does. See [AI integration](./AI-INTEGRATION.md) for the full list of formats and limits.
- **Task extractor** turns meeting notes into an ordered task list.
- **Coaching** gives next actions on a single stuck task.
- **Visualize** — select text in a note (or use `/visualize`) to turn it into a Mermaid flowchart, sequence or state diagram. You see the picture first; *Insert diagram* adds it as a new block after your selection.
- **Challenge my idea** — `/challenge` or the ✨ menu: assumptions, risks, alternatives and open questions about the text. *Add to note* puts them in a separate block at the end of the note.
- **Break down** — the list button on a task splits it into steps you can edit. Add them as a checklist in the task's details, or create them as separate tasks in the same list.
- **Rewrite as SBI** — select feedback text in a person's *Feedback log* item and use the ✨ menu: the text is restated as Situation, Behavior and Impact, using only what you wrote (an element you did not state is left out). The dialog also offers *Radical Candor* (care and challenge) and *Review draft* (summary, strengths and growth areas from rough notes). It is people data, so it only goes to a connection you allowed for it. You can untick an element you do not want, then *Replace selection* swaps in the rest; ⌘Z brings your text back. A text longer than 8,000 characters can be read and copied but not replaced, because only the first 8,000 characters are sent.
- **Classify with AI** — on the Planning matrix, while some tasks are unsorted: suggests whether each is important and urgent (up to 40 tasks at a time). For a task that lands in *Delegate* you can choose a team member and add it to them as a new task; your original task stays as it is. Only those two settings change, only for the rows you keep ticked, and an **Undo** button restores them.
- **Draw from a description** — ⌘K, the **AI** group in the left menu, *Draw with AI* on Tools → Sketch or the card on Tools: describe a system or a flow in words, pick Mermaid (flowchart, sequence or state) or Sketch (simple boxes and arrows), and preview the result. *Add as a new note* or *Add as a new board* keeps it; your open sketch and your notes are never changed. Use *Change it* to ask for follow-ups ("add a cache after the gateway"); the current diagram is sent with the request.
- **Structure this document** — *Structure with AI* on Tools → Document makes a copy as a new tab, in the format you choose: Outline (title, sections, lists), RFC, Meeting summary (with decisions and action items) or a Table. Your document is not changed. Afterwards *Draw as Mermaid* adds a diagram of the structured copy as a new note, and *Draw as Sketch* adds simple boxes and arrows as a new board in Tools → Sketch (nothing existing is replaced).
- **Mock data** — *Mock data with AI* on Tools → JSON / YAML (a JSON tab with content) invents up to 50 more records shaped like your sample, as a new JSON tab.
- **Design with AI** — on Tools → ER diagram: describe tables in words; you tick what to add. It only adds; existing tables, columns and relations are never changed or removed.
- **Convert to Mermaid** — on Tools → Sketch: the labels of your shapes and the arrows between them are read on your computer and turned into a Mermaid diagram, added as a new note. The sketch itself is not sent or changed.
- **Diagram from a screenshot** — ⌘K or Tools: pick or paste a picture (PNG, JPEG, WebP or GIF, up to 5 MB) and see it before sending. The result is Mermaid or an HTML mock-up (shown in a frame without scripts), added as a new note. Needs a connection confirmed with *Check images*.
- **Weekly digest** — ⌘K, the **AI** group in the left menu, or the tile on Home (at the end of the week the tile suggests it). On a manager's or skip-level leader's page, *Prepare an update* opens it as a status update. When nothing changed in the period it says so instead of writing: a retrospective or a status update to send upward, written from the titles and counts of your tasks and notes over 7, 14 or 30 days. Note text is sent only for notes you tick. Locked notes and people records are never read. The text appears as it is written; *Save as a note* keeps it.
- **Prepare a 1:1** — *Prepare with AI* in a person's 1:1 area: follow-ups, open goals, feedback to give and questions, from that person's recorded items (their name is not sent). It is people data. *Add as a note* adds one note item to the person.
- **Ask your workspace** — ⌘K: ask a question and get an answer that cites your own notes and tasks as [1], [2], each a link. The best matches are found on your computer and only short excerpts are sent. Tick *Include people records* to search 1:1 items too (this sends them as people data). If you set an *Embedding model* on the connection, matches are also re-ordered by meaning.
- On a connection, **Check images** and **Check live replies** test those abilities; **Embedding model** (optional) is used only by Ask your workspace.
- Nothing from these features is written until you press the button. A change to a note or to feedback text is a single undo step (⌘Z), and for a note Cadence first saves a restore point named *Before AI change* in its version history. On the To-dos page, *Break down* (checklist) and *Save to task* show an **Undo** button (it waits while you hover or focus it) that only undoes while the task has not been edited since; on a person's page *Save to task* has no Undo button. Created tasks are ordinary tasks you can delete. Every result also has **Copy**.
- **Exports do not contain your AI keys.** JSON, portable ZIP and full backup folders leave out API keys and extra connection headers; restoring on this device keeps the keys it already has (for the same address), and on a new device you enter them again.
- Leave the key blank — the rest of Cadence works identically.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K / Ctrl+K | Command palette (includes *Open user guide*) |
| ⌘B / Ctrl+B | Bold (in rich-text editors) |
| ⌘I / Ctrl+I | Italic |
| ⌘K (in editor) | Insert link |
| ⌘S / Ctrl+S | Save now (every page) |
| ⇧⌘S / Ctrl+Shift+S | Save the open note or Tools tab as a file |
| ⇧⌘X / Ctrl+Shift+X | Strikethrough (in rich-text editors) |

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
