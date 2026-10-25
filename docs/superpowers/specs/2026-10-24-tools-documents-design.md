# Tools documents: multi-document tabs, move to Notes, file save, yellow list icon

Date: 2026-10-24. Status: draft for review. Not committed (the owner asked that nothing be committed).

## Intent

The owner keeps working drafts in **Tools → Document** and **Tools → JSON/YAML**. Today Document holds exactly one document, so it cannot be used the way JSON/YAML tabs are. When a draft is worth keeping, there is no way to turn it into a real note. And ⌘S / ⇧⌘S do not behave on these pages the way they do in Notes.

Four changes, one release:

1. **Document becomes multi-document**, with tabs, like JSON/YAML.
2. **Move to Notes** for any tab on either page. The tab is removed from Tools once the note exists.
3. **⌘S and ⇧⌘S on both Tools pages behave like Notes.**
4. **The list (folder) icon in the Notes sidebar is yellow with a gradient.**

Product promise that outranks all of it: a user never loses a document they wrote, including across version upgrades (see `.cursor/rules/zero-data-loss.mdc` and `AGENTS.md`).

## Goals

- Document tabs: add, close, rename, switch; the active tab is remembered. Same interaction model as the JSON/YAML tabs.
- Closing a tab that has content asks for confirmation, as JSON/YAML does today.
- Every tab on both pages has a "Move to Notes" action. The user picks a destination: any existing list, or no list (a root note).
- The note and the removal of the tab happen as one change: if the note does not exist afterwards, the tab is still there.
- ⌘S / Ctrl+S on both pages writes now, and includes the very last keystrokes.
- ⇧⌘S / Ctrl+Shift+S saves the open tab to a file via the system save dialog, on both pages.
- Notes list icon: yellow, filled, gradient; readable in light and dark themes, normal and selected states.

## Non-goals

- Moving a note back into Tools. Moving several tabs at once. Dragging tabs between pages.
- Changing autosave timing, the Notes editor, or Notes ⌘S behaviour.
- Removing or rewriting the old single-document field `utilityDocument`.
- Any change to sync, import/export bundles, or the diff view of JSON/YAML beyond what is listed.
- A format dropdown on the Tools pages (see File save).

## Anti-goals (a failure even if it technically works)

- A tab removed from Tools and no note created. A document's pasted images being garbage-collected because a new place that holds document bodies was not taught to the attachment scan. A note created twice. A moved document reappearing in Tools after a restart.
- The existing single document disappearing, being emptied, or being duplicated on upgrade.
- The last keystrokes missing from a ⌘S, a window blur, or a quit.
- An older Cadence build losing documents it can still see.

## Constraints

- Local-first, no backend, no telemetry. TypeScript strict, no `any`. English identifiers, comments and commit messages.
- Zero-data-loss hot zones are touched: `src/core/model/**`, `src/providers/AppDataContext.tsx`, `electron/main.cjs`. Changes there are additive and covered by tests that fail first.
- Upgrades are expand-only. `DATA_VERSION` is not bumped.

## What the owner decided

- When a tab is moved to Notes it is **deleted from Tools** afterwards.
- Destination is a list or the root (no list).
- On Tools pages ⌘S "saves what I wrote, like Notes". ⇧⌘S saves to a file, like Notes.
- File save has **no format dropdown on Tools pages**: the user types the extension in the system save dialog.
- Owner approved the proposals below that are marked "agreed".

## Design

### 1. Document tabs (agreed)

New optional fields on the workspace: `utilityDocumentTabs?: UtilityDocumentTab[]`, `activeDocumentTabId?: string` and `utilityDocumentLegacySeenAt?: string`. A tab carries `id`, `title`, `body`, `bodyFormat?`, `bodyPlainText?`, `updatedAt`, mirroring `UtilityDocument` plus identity.

Migration (follows the existing JSON/YAML precedent in `ensureStructuredTabs`):

- If `utilityDocumentTabs` is **present, even as an empty array**, it is authoritative and the legacy field is never re-read. The array being present is the "already migrated" marker.
- If it is **absent** and the legacy `utilityDocument` exists, the legacy document becomes tab #1 verbatim (body, format, plain text, `updatedAt`), titled "Document".
- The legacy field is never deleted or rewritten. A downgrade finds the last-migrated content there.
- Why the marker matters: moving the only tab to Notes empties the array. Without "present means migrated", the next load would resurrect the legacy document as a new tab. An empty array must therefore survive a save/load and must not be dropped by the compact-for-persist step.
- A new workspace with neither field stays untouched; the page seeds its first tab lazily, like JSON/YAML.
- Unknown keys on a tab survive round trips (the same `withExtras` pattern as other collections).
- **Edits made in an older build are recovered, never discarded.** The workspace records `utilityDocumentLegacySeenAt`: the `updatedAt` of the legacy `utilityDocument` that has already been accounted for (set to its value at migration time). It lives on the workspace, not on a tab, so it survives the migrated tab being moved or closed. On load, if the legacy document is newer than that record and its content differs from every existing tab, an older build edited it. It is added as a new tab titled "Document (from older version)" and the record advances. The legacy field is still never written. Loading twice before a save yields one persisted tab. (Tabs 2..N and later edits to tab #1 made in this version are invisible to an older build; that build keeps seeing the last-migrated document and keeps the new fields as unknown keys. That is accepted: nothing is lost, and older builds neither show nor delete them.)
- **Persistence audit (builder verifies, and adds a test per item):** `compactAppDataForPersist` keeps `utilityDocumentTabs: []` (an empty array is meaningful) and `activeDocumentTabId`; `mergeWorkspace` already treats `utility*` as singletons never taken from a remote, so nothing is merged; monthly shards only hold notes, todos and items, so tabs live in the base file only; `dataIntegrity` shapes count notes, todos and items and are unaffected (a moved document raises the note count, never lowers it); `syncSnapshotGuard` needs no change.
- A Document tab body has exactly the same fields as a note body (`body`, `bodyFormat`, `bodyPlainText`, same rich-text payload), so moving it copies them verbatim with no conversion.

Page: the Document page gets the same tab strip behaviour as JSON/YAML (add, close with confirm when it has content, rename, switch). Tab editor: the same rich-text editor Notes uses, so formatting, paste handling and the before-flush hook already work. Typing in a tab saves with the `typing` kind, like today's single document.

### 2. Move to Notes (agreed)

One action on each tab, on both pages: choose destination (list or no list), confirm.

- **Atomic:** a single workspace update creates the note, fills it, and removes the tab. It is one pure function so the result is either both or neither. The note id is generated before the update, and the operation is idempotent for that id (running it twice cannot create two notes).
- **Durability.** The note and the tab removal live in one workspace snapshot, and a save writes that whole snapshot in one commit. A crash therefore leaves either the old state (tab only, no note) or the new state (note only, no tab); never both and never neither. The move uses the immediate (structural) save kind, so it reaches disk within about 300 ms. The app navigates to Notes right away; it does not wait for the save, and a failed save surfaces through the existing save-error banner exactly as for any other edit. The in-memory move is not rolled back on a failed save, because the banner and retry path already protect it.
- **Refusal.** The move uses the normal `update` path. When the workspace is write-protected (failed load, `persistBlocked`), `update` returns false: nothing changes and the user sees the same "Saving is temporarily blocked" warning other write paths show.
- Note content:
  - Document tab: title = tab title; body, format and plain text copied verbatim.
  - JSON/YAML tab: title = tab title; body is the content in a code block labelled with the tab's language, built with the same conversion Notes uses when importing a file. Diff panes are not moved (they are scratch).
  - Empty title falls back to the note default.
- After moving: the active tab on the Tools page is repaired to a neighbour (or the page seeds a fresh tab), and the app navigates to Notes with the new note open, expanding its list.
- The flush hooks run before the move so the latest keystrokes are in the tab being moved.
- Before reading the tab to move, the before-flush hooks run, so the latest keystrokes from either editor are in the data. Hook failures are already isolated by the flush machinery and do not abort the move.

### 3. Keys

- ⌘S / Ctrl+S: already handled once for the whole app (`Layout`) by flushing the open editor and writing. The Document editor registers its before-flush hook already. The JSON/YAML editor does **not**: it keeps a 150 ms buffer that is only drained on unmount, so a ⌘S, window blur, lock or quit within that window misses the last keystrokes. Fix: the JSON/YAML editor and its diff panes register a before-flush hook (editor phase) that drains their buffer. This is a data-safety fix, tested independently.
- ⇧⌘S / Ctrl+Shift+S: each Tools page registers a window listener while it has an active tab, mirroring `isSaveNoteShortcut` and `useNoteFileActions`. Pages are route-based and unmount on navigation, so the Notes listener and a Tools listener are never mounted together; there is no split view. Focus can be anywhere on the page, including the diff panes. In JSON/YAML diff mode the file saved is the tab's edit buffer, because the diff panes are scratch and not a document.

### 4. File save with the extension chosen in the dialog (agreed)

Notes today fix the format first (dropdown) and the main process shows a dialog filtered to it. On Tools pages the user decides in the system dialog.

- **Document tab:** the renderer prepares the content in every supported format (md, txt, html, by the same exporters Notes uses) and sends them with a default format. The main process, after the user confirms a path, picks the variant matching the typed extension. If the extension is unknown or missing, it writes the default variant (Markdown) to exactly the path chosen. It never renames what the user typed.
- **JSON/YAML tab:** the content is written verbatim. Any extension is accepted; the dialog suggests `.json` / `.yaml` according to the tab language, with `.txt` and "All files" as other filters.
- The existing validation stays: size cap per variant (5 MB), suggested file name sanitisation, signed-in and policy checks, and the refusal to write when `<chosen>.tmp` already exists. The dialog result, not the renderer, decides the path.
- This is a **new IPC channel** for Tools pages. (Superseded later: Notes now use this same channel, sending md/txt/html, and the Notes format dropdown and the `note:saveAs` channel were removed.) The handler reuses the same helpers in `electron/noteFileIo.cjs` (payload validation, 5 MB cap, file-name sanitising, the `<chosen>.tmp` collision check) and the same durable writer, so the checks are shared code, not copies. Because `main.cjs` is a hot zone, the extension-to-variant choice lives in `noteFileIo.cjs` as a pure function with its own unit tests.

### 5. Yellow list icon (agreed)

The Notes list icon becomes a filled folder with a vertical yellow gradient (lighter top, deeper amber bottom) and a slightly darker edge. Scope: the two places in the Notes feature where a folder marks a note list: the list tree rows (`NotesGroupTree`, both the row icon and the move/destination list) and the sidebar's list entry (`NotesSidebar`). The generic `IcFolder` used by Home quick access, the command palette and the app sidebar means "folder/section" in a different sense and is not changed. Colours come from theme tokens added for it, so dark mode gets a tuned variant. Gradient ids must be unique per rendered icon.

## Data safety checklist (what must be proven by tests)

- Legacy `utilityDocument` becomes tab #1 once, unchanged, and remains untouched in the file.
- A workspace with `utilityDocumentTabs: []` does not re-migrate the legacy document after save and reload.
- Moving a tab: note exists with the right content and list; tab gone; both in one update; running twice yields one note.
- Persist blocked: moving does nothing and reports it.
- Two tabs, move one: the other is untouched; the active tab repairs.
- The 150 ms JSON/YAML buffer is drained by a flush before ⌘S, blur and quit.
- Every historical workspace fixture under `src/core/model/__fixtures__/legacy` still loads unchanged, and a new fixture with tabs round-trips.
- Older builds: the file still opens, the legacy field still holds the last-migrated document, unknown tab fields survive.

## Left to the builder

- Exact component names, CSS, and the destination picker's layout, reusing existing dialogs and the notes list tree where possible.
- How to build the code-block note body, using the existing import/conversion helpers.
- Where the shared tab strip logic is extracted so the two pages do not duplicate it.
- Tab title defaults ("Untitled N" style) and the confirm wording.

## Calls the builder-side author made (owner can override)

- Legacy single document is titled "Document" when it becomes tab #1.
- After moving, the app opens the new note in Notes.
- Diff panes of a JSON/YAML tab are not carried over.
- Default file variant for an unknown extension is Markdown.
- The recovery tab for edits made in an older build (see Document tabs) is an addition beyond what was asked, chosen to honour "never lose a document in any version". It adds a tab only when an older build actually changed the legacy document, and never writes the legacy field. It can be dropped without affecting anything else.
- The Tools save channel is new rather than an extension of the Notes channel, to keep Notes untouched.
- Move does not wait for the disk write before navigating; the single-snapshot commit makes that safe.

