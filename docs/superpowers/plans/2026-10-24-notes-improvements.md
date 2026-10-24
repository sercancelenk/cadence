# Notes Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faster typing with a longer autosave interval, a verified select-all copy, Cmd+S export, file import, and nested, archivable note lists.

**Architecture:** Renderer changes stay in `src/` (editor, notes feature, core model/actions); file dialogs and disk writes go through new IPC handlers in `electron/main.cjs` exposed via `electron/preload.cjs`. Nested lists add an optional `parentId` to `NoteGroup` (expand-only); archived state of a list is a single flag and descendants/notes derive their visibility from it.

**Tech Stack:** Electron, React, TypeScript (strict, no `any`), TipTap/ProseMirror, vitest.

**Spec:** Agreed in chat on 2026-10-24 (no separate spec file). Decisions: export formats `.md` (default) / `.txt` / `.html`, user-changeable and remembered; archiving a list archives its sub-lists and notes by derivation, restore returns everything to the same place; lists nest to depth 5; open file = import as new note.

## Global Constraints

- ZERO DATA LOSS: no change may delete, empty, or silently replace notes/todos. Model changes are expand-only (new optional fields, dual-read). Failed loads must block persist.
- Never mutate `Note.archived` of notes inside an archived list; visibility is derived.
- Legacy data (no `parentId`) must load unchanged and round-trip byte-equivalent for existing fields.
- Strict TS, no `any`. Code, identifiers, comments, commit messages in English. Tests colocated as `*.test.ts(x)`.
- Verification for every task: `npx vitest run` and `npm run typecheck` pass.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Legacy `NoteGroup` with no `parentId` loads as a root list and is not rewritten on load.
- `parentId` pointing at a missing list, itself, or forming a cycle: list kept, treated as root, no throw.
- Archive a parent whose child was archived earlier: restoring the parent leaves the child archived and in place.
- Deleting a list with sub-lists and notes: both move to the parent (or root/ungrouped); nothing is dropped.
- Cmd+S on a locked, unopened note must not write plaintext; on an empty note it still writes a valid file.
- Importing a large, non-UTF-8, or script-containing HTML file must not freeze the UI or inject executable markup.
- Raising debounce must not lose the last keystrokes on blur, note switch, lock, window close, or app quit.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/ui/RichTextEditor.tsx` | Editor change debounce (modify) |
| `src/providers/AppDataContext.tsx` | `SAVE_DEBOUNCE_MS` and quit flush (modify) |
| `src/features/notes/NotesBodyEditor.tsx` | Keep body out of re-render path (modify) |
| `src/lib/noteExport.ts` (+ test) | Convert a note doc to md/txt/html strings (create) |
| `src/lib/noteImport.ts` (+ test) | Convert file text to a rich-text doc (create; reuse existing rich-text import) |
| `electron/main.cjs`, `electron/preload.cjs`, `src/vite-env.d.ts` | `note:saveAs`, `note:openFile` IPC + typings (modify) |
| `src/features/notes/useNoteFileActions.ts` (+ test) | Cmd+S, Open file, format preference (create) |
| `src/core/model/index.ts` | `NoteGroup.parentId`, parse/validate, tree helpers (modify) |
| `src/core/model/noteGroupTree.ts` (+ test) | Pure tree helpers (create) |
| `src/core/actions/index.ts` | Group create-under, move, archive, delete-with-reparent (modify) |
| `src/features/notes/NotesSidebar.tsx`, new `NotesGroupTree.tsx`, `NotesGroupContextMenu.tsx` | Tree UX (modify/create) |

---

### Task 1: Measure typing cost and cut it

**Files:**
- Modify: `src/components/ui/RichTextEditor.tsx:64`, `src/providers/AppDataContext.tsx:367`, `src/features/notes/NotesBodyEditor.tsx`
- Test: `src/providers/AppDataContext.*.test.tsx` (existing persist tests), `src/lib/pendingSaveFlush.test.ts`

**Interfaces:**
- Produces: constants `DEFAULT_ON_CHANGE_DEBOUNCE_MS = 600` and `SAVE_DEBOUNCE_MS = 1800` (values are my call; adjust after measuring).

- [ ] **Step 1: Profile.** In the dev app, open a note of ~100K characters, type continuously, record React Profiler commit time and `saveTimings` output. Write findings (top three costs) into the PR description. Expected: flush (`getJSON` + normalize), editor-pane re-render, full AppData save dominate.
- [ ] **Step 2: Failing test** `flushes pending editor text on beforeFlush hook before debounce elapses` in `src/lib/pendingSaveFlush.test.ts`: register editor hook, call flush-all, assert `onChange` payload delivered with fake timers not advanced.
- [ ] **Step 3: Failing test** `scheduleSave persists latest data after SAVE_DEBOUNCE_MS and not earlier` using fake timers in the AppDataContext persist test file; assert `runPersist` not called at 1799 ms, called once at 1800 ms with the latest data.
- [ ] **Step 4: Implement** the two constants; verify `onBlur`, note switch, lock, and unmount still call `flushPending`.
- [ ] **Step 5: Implement** a `before-quit` / window-close flush: renderer flushes via existing `pendingSaveFlush` before `attachWindowCloseHandler` allows quit (verify the handler in `electron/main.cjs` already waits; add if not).
- [ ] **Step 6: Reduce re-render.** In `NotesBodyEditor`, stop passing the live `editorBody` while the editor owns the note (pass the body only on note switch / external sync); keep behavior covered by `useNotesEditor.test.tsx` and `richTextExternalSync.test.ts`.
- [ ] **Step 7: Verify** `npx vitest run && npm run typecheck`; re-profile and confirm lower commit time; manual check: type, immediately Cmd+Q, relaunch, text present.
- [ ] **Step 8: Commit** `perf(notes): lengthen autosave debounce and trim editor re-renders`.

### Task 2: Verify select-all copy in the live app

**Files:**
- Modify (temporary diagnostics, removed before commit): `src/components/ui/RichTextEditor.tsx` copy handler
- Test: `src/lib/richTextClipboard.test.ts`

- [ ] **Step 1:** After Task 1, run the app, press Cmd+A then Cmd+C in a long note, paste elsewhere. If it works, add a regression test `selectAll then copy yields full plain text for a mixed document` (tasks, table, code, image) and stop.
- [ ] **Step 2 (only if still broken):** add a temporary `console.debug` in the `copy` DOM handler logging `selection.constructor.name`, `selection.empty`, `view.hasFocus()`. Ask the user for the output.
- [ ] **Step 3:** Fix the confirmed cause (expected candidate: `setExternalContentPreservingSelection` resetting an `AllSelection`; preserve selection type) with a failing test first.
- [ ] **Step 4: Verify** suite; **Commit** `fix(notes): keep selection stable so select-all copy works`.

### Task 3: Cmd+S export with multiple formats

**Files:**
- Create: `src/lib/noteExport.ts`, `src/lib/noteExport.test.ts`, `src/features/notes/useNoteFileActions.ts`
- Modify: `electron/main.cjs` (handler near `data:exportBundle`, ~line 3999), `electron/preload.cjs`, `src/vite-env.d.ts`, `src/features/notes/notePreferences.ts`, `src/views/NotesPage.tsx`, `electron/ipc/policyGuard.cjs` (register channel)
- Test: `src/lib/noteExport.test.ts`, `src/features/notes/useNoteFileActions.test.tsx`

**Interfaces:**
- Produces: `type NoteExportFormat = 'md' | 'txt' | 'html'`; `exportNoteContent(doc: RichTextDoc, title: string, format: NoteExportFormat): string`; preload `saveNoteFile(payload: { suggestedName: string; format: NoteExportFormat; content: string }): Promise<{ ok: true; path: string } | { ok: false; canceled?: boolean; error?: string }>`; preference `getNoteExportFormat(): NoteExportFormat` (default `'md'`) / `setNoteExportFormat`.

- [ ] **Step 1: Failing tests** in `noteExport.test.ts`: markdown keeps headings, ordered/bullet/task lists (`- [x]`), code fences, tables; txt matches `serializeRichNodesToClipboardPlainText`; html escapes `<script>` in text; empty doc returns a valid file body.
- [ ] **Step 2: Implement** `exportNoteContent` (reuse any existing doc→markdown helper in `src/lib`; add only what is missing).
- [ ] **Step 3: Failing test** in `useNoteFileActions.test.tsx`: Cmd+S (`metaKey` and `ctrlKey`) calls `saveNoteFile` with the selected note's title-based file name and the stored format; locked, not-unlocked note shows an error and does not call it.
- [ ] **Step 4: Implement** the `note:saveAs` handler: `dialog.showSaveDialog` with filters for the three formats, sanitize file name, write with `durableWrite`; no path from the renderer is trusted.
- [ ] **Step 5: Implement** the hook (flush pending editor text first, then export), keybinding on the notes page and editor `handleKeyDown`, a File menu item "Save Note…" with `CmdOrCtrl+S`, and a format picker (small dropdown beside the export action) persisted via `notePreferences`.
- [ ] **Step 6: Verify** suite and a manual save of each format; **Commit** `feat(notes): save note to disk with Cmd+S in md/txt/html`.

### Task 4: Open a file as a new note

**Files:**
- Create: `src/lib/noteImport.ts`, `src/lib/noteImport.test.ts`
- Modify: `electron/main.cjs` (`note:openFile`), `electron/preload.cjs`, `src/vite-env.d.ts`, `src/features/notes/useNoteFileActions.ts`, `src/features/notes/NotesSidebar.tsx` (action), `src/views/NotesPage.tsx` (drop zone)
- Test: `src/lib/noteImport.test.ts`, `src/features/notes/useNoteFileActions.test.tsx`

**Interfaces:**
- Consumes: `NoteExportFormat` from Task 3.
- Produces: preload `openNoteFile(): Promise<{ ok: true; name: string; ext: string; text: string } | { ok: false; canceled?: boolean; error?: string }>`; `importFileToDoc(text: string, ext: string): RichTextDoc`.

- [ ] **Step 1: Failing tests:** `.md` becomes headings/lists; `.txt` becomes paragraphs per line; `.html` has `<script>` and `on*` attributes stripped; files over 5 MB are rejected with a message; BOM and CRLF handled.
- [ ] **Step 2: Implement** `importFileToDoc` reusing the existing rich-text import/sanitize path in `src/lib`.
- [ ] **Step 3: Implement** `note:openFile` (`dialog.showOpenDialog`, extensions md/markdown/txt/html/htm, read as UTF-8, enforce size cap in main) and the "Open file…" action plus drag-and-drop; the import always creates a **new** note (title from file name) and never overwrites.
- [ ] **Step 4: Verify** suite; manual import of md/txt/html; **Commit** `feat(notes): import md/txt/html files as new notes`.

### Task 5: Nested list model, archive, delete rules

**Files:**
- Create: `src/core/model/noteGroupTree.ts`, `src/core/model/noteGroupTree.test.ts`
- Modify: `src/core/model/index.ts` (`NoteGroup`, `parseNoteGroups` ~1343), `src/core/actions/index.ts` (~1250-1290), `src/features/notes/useNotesSelection.ts`, `src/views/NotesPage.tsx:120` (archived count)
- Test: `src/core/model/noteGroupTree.test.ts`, `src/core/model/model.test.ts`, `src/core/actions/actions.mutation.test.ts`, a legacy-fixture test

**Interfaces:**
- Produces: `NoteGroup.parentId?: string`; `MAX_NOTE_GROUP_DEPTH = 5`; `effectiveParentId(groups, id): string | undefined` (null-safe, cycle-safe); `isGroupEffectivelyArchived(groups, id): boolean` (self or any ancestor); `isNoteEffectivelyArchived(note, groups): boolean` (`note.archived` or its group effectively archived); `groupDescendants(groups, id): NoteGroup[]`; actions `addNoteGroup(data, name, id?, parentId?)`, `moveNoteGroup(data, groupId, newParentId | undefined)` (rejects cycles/depth > 5), `setNoteGroupArchived(data, groupId, archived)`, `removeNoteGroup` updated to re-parent children and notes to the deleted list's parent.

- [ ] **Step 1: Failing tests** for the Review Focus cases: legacy group without `parentId`; missing/self/cyclic `parentId` treated as root, list retained; parse then serialize leaves legacy groups without a new `parentId` key.
- [ ] **Step 2: Failing tests** for derivation: archiving parent makes child lists and their notes effectively archived with `note.archived` untouched; restoring returns identical `parentId`/`sortOrder`; earlier-archived child stays archived after parent restore.
- [ ] **Step 3: Failing tests** for `removeNoteGroup`: sub-lists and notes move to the parent (root → ungrouped); counts before/after equal; `moveNoteGroup` rejects moving into own descendant and depth over 5.
- [ ] **Step 4: Implement** model field, tolerant parser, tree helpers, and actions; switch every notes visibility check (active/archived lists, counts, selection auto-switch in `useNotesSelection.ts:48`, search, command palette) to the effective helpers.
- [ ] **Step 5: Verify** suite against legacy fixtures and backup restore paths named in `.cursor/rules/zero-data-loss.mdc`; **Commit** `feat(notes): nested note lists with derived archive`.

### Task 6: Sidebar tree UX

**Files:**
- Create: `src/features/notes/NotesGroupTree.tsx`, `src/features/notes/NotesGroupContextMenu.tsx`, `src/features/notes/NotesGroupTree.test.tsx`
- Modify: `src/features/notes/NotesSidebar.tsx` (replace header "New list" form at ~227-262), `src/features/notes/useNoteGroupExpand.ts`, `src/styles/notes.css`

**Interfaces:**
- Consumes: Task 5 helpers and actions.

- [ ] **Step 1: Failing tests:** Enter on inline "new list" input creates a list (under the chosen parent), Esc cancels; F2 / double click renames inline; context menu lists New note, New sub-list, Rename, Archive, Delete; Delete opens a confirmation showing how many notes and sub-lists move and offers Undo afterwards; Archived view shows only top-most archived lists with their subtree, and Restore returns them in place; descendant of an archived list has no Restore.
- [ ] **Step 2: Implement** the collapsible tree (expand state persisted by `useNoteGroupExpand`), hover "+" menu, inline create/rename, context menu, delete confirmation with Undo toast, archived-tree rendering.
- [ ] **Step 3 (second pass, optional):** drag a list into another list via `useNotesSidebarDnD`, calling `moveNoteGroup`.
- [ ] **Step 4: Verify** suite and manual walkthrough (create nested, archive parent, restore, delete with contents); **Commit** `feat(notes): tree sidebar with inline create, context menu, safe delete`.

---

## Self-Review

- **Coverage:** typing speed + interval (T1), copy (T2), Cmd+S + formats (T3), open file (T4), archive lists + restore in place, nested lists, cascade archive (T5/T6), create/delete UX (T6).
- **Unverified assumptions to confirm during execution:** existence of a reusable doc→markdown helper and rich-text import path in `src/lib`; whether `attachWindowCloseHandler` already awaits renderer flush; exact name of the AppDataContext persist test file.
- **Types:** `NoteExportFormat` defined in T3 and consumed in T4; tree helpers defined in T5 and consumed in T6.
