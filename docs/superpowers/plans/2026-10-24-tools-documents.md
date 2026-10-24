# Tools Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-document tabs on Tools → Document, "Move to Notes" for tabs on both Tools pages, Notes-like ⌘S / ⇧⌘S on both pages, and a yellow gradient list icon in Notes.

**Architecture:** Additive workspace fields (`utilityDocumentTabs`, `activeDocumentTabId`, `utilityDocumentLegacySeenAt`) with a load-time migration from the legacy single document, pure reducers in `core/actions`, thin provider actions, shared UI pieces under `src/features/tools`. Moving is one pure update so note creation and tab removal are atomic.

**Tech Stack:** TypeScript strict, React 18, Electron (cjs main process), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-24-tools-documents-design.md`. Read it first; this plan only records decisions the spec leaves open.

## Global Constraints

- **Nothing is committed.** The owner asked for no commits; omit commit steps and leave all changes in the working tree.
- Zero data loss (`.cursor/rules/zero-data-loss.mdc`): additive fields only, `DATA_VERSION` unchanged, legacy `utilityDocument` is never written or deleted, unknown keys survive.
- English identifiers, comments and messages. No `any`. Colocate `*.test.ts(x)`.
- Every task: write the failing test, watch it fail, implement, watch it pass. After each task run `npx tsc --noEmit`.
- Gate commands: `npx vitest run <path>`, `npx tsc --noEmit`, final `npx vitest run --coverage`, `npm run build:web`, `npx playwright test`.
- Existing legacy workspace fixtures (`src/core/model/__fixtures__/legacy/*.json`) must keep passing unchanged.

## Review Focus

Failure modes the spec implies that the tasks' main tests do not exercise, most likely first. Each has a test in the owning task.

1. A document with pasted images, living in a tab or moved to a note, must not lose its images to attachment garbage collection (renderer index and Electron main scan). → Task 3
2. Moving the only Document tab and reloading must not bring the legacy document back as a tab. → Tasks 1, 4
3. Pressing "Move" twice quickly (double click, Enter twice) must yield one note. → Task 4
4. A typed extension that is unknown, uppercase or missing (`.docx`, `.MD`, none) must still write a file at exactly the path chosen. → Task 8
5. ⌘S, window blur or quit within 150 ms of the last JSON/YAML keystroke must include that keystroke. → Task 5
6. Moving while the workspace is write-protected (failed load) must change nothing and tell the user. → Task 4

## File Structure

| Path | Responsibility |
|---|---|
| `src/core/model/index.ts` | New types, parse, `ensureDocumentTabs` migration and recovery |
| `src/core/actions/index.ts` | Pure reducers for document tabs and the two move operations |
| `src/lib/richTextAttachmentIndex.ts`, `electron/attachmentRefs.cjs` | Attachment reference scans know about tabs |
| `src/lib/workspaceStorageStats.ts` | Stats count tabs |
| `src/providers/AppDataContext.tsx` | Provider actions (`*DocumentTab`, move) |
| `src/hooks/useDebouncedEmit.ts` | Registers a before-flush hook that drains its buffer |
| `src/features/tools/UtilityTabStrip.tsx` | Tab strip shared by both Tools pages |
| `src/features/tools/MoveToNoteDialog.tsx`, `useMoveTabToNote.ts` | Destination picker and move flow |
| `src/features/notes/noteGroupForest.ts` | `noteDestinations` helper |
| `electron/noteFileIo.cjs`, `electron/main.cjs`, `electron/preload.cjs`, `src/vite-env.d.ts` | New `tools:saveAs` channel |
| `src/lib/toolFileExport.ts`, `src/features/tools/useToolFileSave.ts` | Renderer side of ⇧⌘S |
| `src/components/icons.tsx`, `src/styles/notes.css`, notes tree/sidebar | Yellow gradient list icon |

---

### Task 1: Document tabs in the model

**Files:**
- Modify: `src/core/model/index.ts` (types near `UtilityDocument`, `AppData` fields near `utilityDocument`, parse next to `utilityStructuredTabs`, new `ensureDocumentTabs` beside `ensureStructuredTabs` and called wherever that is)
- Create: `src/core/model/documentTabs.test.ts`
- Create: `src/core/model/__fixtures__/legacy/12-document-tabs.json` (copy of `11-nested-lists.json` plus the new fields, one tab and one legacy document)

**Interfaces:**
- Produces: `interface UtilityDocumentTab { id: string; title: string; body: string; bodyFormat?: 'markdown' | 'prosemirror'; bodyPlainText?: string; updatedAt: string }`; `AppData.utilityDocumentTabs?: UtilityDocumentTab[]`, `AppData.activeDocumentTabId?: string`, `AppData.utilityDocumentLegacySeenAt?: string`; `ensureDocumentTabs(data: AppData): AppData` (internal).

- [ ] **Step 1: Write failing tests** in `documentTabs.test.ts` (use `normalizeData`, `compactAppDataForPersist`; T1/T2 are ISO strings, T2 later):
  - `migrates the legacy document into tab 1 verbatim`: legacy `{ body, bodyFormat: 'prosemirror', bodyPlainText, updatedAt: T1 }` gives one tab titled `Document` with identical fields, `activeDocumentTabId` equal to its id, `utilityDocumentLegacySeenAt === T1`, and `data.utilityDocument` deep-equals the input.
  - `does not re-migrate when the tabs array exists but is empty`: input has legacy + `utilityDocumentTabs: []` + `utilityDocumentLegacySeenAt: T1`; after `normalizeData`, tabs is `[]`; after compact → JSON → `normalizeData` it is still `[]` and the compact output still contains the key.
  - `keeps existing tabs authoritative and repairs a dangling active id` (active id points nowhere → first tab id).
  - `adds a recovery tab when an older build edited the legacy document`: one tab, seen T1, legacy updated T2 with a different body → two tabs, second titled `Document (from older version)` carrying the legacy body; `utilityDocumentLegacySeenAt === T2`; round-tripping the result through compact → `normalizeData` still gives exactly two tabs.
  - `does not add a recovery tab when the legacy body equals an existing tab body`.
  - `leaves a workspace with neither field untouched` (both undefined).
  - `ignores a non-array utilityDocumentTabs and falls back to migrating`.
  - `keeps unknown keys on a tab`.
- [ ] **Step 2: Run** `npx vitest run src/core/model/documentTabs.test.ts` → FAIL (fields missing).
- [ ] **Step 3: Implement** types, `parseUtilityDocumentTabs(raw: unknown): UtilityDocumentTab[] | undefined` (undefined for non-arrays, `[]` preserved, tabs without a string id dropped, `withExtras` per tab), the three `AppData` fields emitted by `normalizeData`, and `ensureDocumentTabs` with the rules in the spec ("Document tabs"). Comparison of timestamps by `Date.parse`; unparsable legacy `updatedAt` never triggers recovery. Recovery tab ids come from `uuid()`.
- [ ] **Step 4: Run** the new test plus `npx vitest run src/core/model` → PASS (legacy fixtures and the new `12-document-tabs.json` included; the fixture test already loops the directory).

### Task 2: Pure reducers

**Files:**
- Modify: `src/core/actions/index.ts` (after the JSON/YAML tab reducers)
- Create: `src/core/actions/documentTabs.actions.test.ts`

**Interfaces:**
- Consumes: Task 1 types; existing `addNote(data, id, groupId?)`, `nowIso`, `uuid`.
- Produces:
  - `addDocumentTab(data: AppData, id: string): AppData` (title `Untitled N`, same numbering rule as `nextUntitledTitle`, becomes active)
  - `closeDocumentTab(data, id): AppData` (neighbour becomes active; closing the last tab leaves one fresh empty tab, mirroring `closeStructuredTab`)
  - `renameDocumentTab(data, id, title): AppData` (trim; empty is a no-op)
  - `setActiveDocumentTab(data, id): AppData`
  - `patchDocumentTab(data, id, patch: Partial<Pick<UtilityDocumentTab, 'body' | 'bodyFormat' | 'bodyPlainText'>>): AppData`
  - `type MoveToNoteFields = { title: string; body: string; bodyFormat?: 'markdown' | 'prosemirror'; bodyPlainText?: string }`
  - `moveDocumentTabToNote(data, args: { tabId: string; noteId: string; groupId?: string }): AppData`
  - `moveStructuredTabToNote(data, args: { tabId: string; noteId: string; groupId?: string; fields: MoveToNoteFields }): AppData`

- [ ] **Step 1: Write failing tests**:
  - add/close/rename/patch/setActive: new tab active; closing the active tab activates its neighbour; closing the last tab leaves one empty tab; patch touches only the target and bumps its `updatedAt`; other tabs are the same object references.
  - `moveDocumentTabToNote creates the note with the tab's fields and removes the tab`: note id/title/body/bodyFormat/bodyPlainText equal the tab's, `groupId` set when the list exists, tab gone, other tabs untouched, active repaired to a neighbour.
  - `moves into a root note when groupId is missing or unknown`.
  - `is idempotent for the same noteId` (second call returns the same data reference) and `is a no-op for an unknown tab`.
  - `moving the only tab leaves an empty array, not undefined` (the migration marker).
  - `moveStructuredTabToNote` uses `fields` for the note, drops the tab, keeps `utilityStructuredTabs: []` allowed, and does not copy diff panes.
  - `does not touch legacy utilityDocument or utilityStructuredText`.
- [ ] **Step 2: Run** `npx vitest run src/core/actions/documentTabs.actions.test.ts` → FAIL.
- [ ] **Step 3: Implement** the signatures above; the move functions compose `addNote` then overwrite body fields and `updatedAt`, and remove the tab in the same returned object.
- [ ] **Step 4: Run** the file and `npx vitest run src/core/actions` → PASS.

### Task 3: Attachments and stats know about tabs

**Files:**
- Modify: `src/lib/richTextAttachmentIndex.ts` (collector near line 101), `src/lib/richTextAttachmentIndex.test.ts`, `src/lib/workspaceStorageStats.ts` (+ its test file if one exists, else add cases to a new `workspaceStorageStats.tabs.test.ts`)
- Create: `electron/attachmentRefs.cjs`, `electron/attachmentRefs.test.ts`
- Modify: `electron/main.cjs` (replace lines ~764-855 helpers and `collectReferencedAttachmentIdsFromPayload` with a `require`)

**Interfaces:**
- Produces: `electron/attachmentRefs.cjs` exports `sanitizeAttachmentId(id: unknown): string | null`, `collectReferencedAttachmentIdsFromPayload(payload: unknown): Set<string>`, `ATTACHMENT_URI_PREFIX`. Behaviour for notes, todos, items, people and the legacy document is moved verbatim.

- [ ] **Step 1: Write failing tests**:
  - renderer: an attachment id referenced only from `utilityDocumentTabs[1].body` (prosemirror image node) is in the referenced list; one referenced only from the legacy `utilityDocument` still is; a markdown-format tab body with the URI is found.
  - main module: same three cases through `collectReferencedAttachmentIdsFromPayload`, plus: malformed prosemirror falls back to the URI scan, notes' `attachmentRefs` are honoured, an invalid id is ignored, missing arrays do not throw.
  - stats: adding a long tab body increases the "other" bytes figure.
- [ ] **Step 2: Run** the three files → FAIL.
- [ ] **Step 3: Implement**: scan `utilityDocumentTabs` bodies in both scans; move the pure helpers into `attachmentRefs.cjs` and import them in `main.cjs` (also import `sanitizeAttachmentId` for its other uses there); include tabs in `workspaceStorageStats`'s "other" object.
- [ ] **Step 4: Run** the three files, `npx vitest run electron`, and `node --check electron/main.cjs` → PASS.

### Task 4: Provider actions

**Files:**
- Modify: `src/providers/AppDataContext.tsx` (`Api` type near `patchStructuredTab`, the actions object near line ~1484, the bridge object near line ~1590)
- Create: `src/providers/AppDataContext.tools.test.tsx` (harness copied from `AppDataContext.flush.test.tsx`)
- Create: `src/lib/structuredTabNote.ts` + `structuredTabNote.test.ts`

**Interfaces:**
- Consumes: Task 2 reducers; `importFileToDoc`, `richPayloadFromDoc`, `richBodyFieldsFromPayload` as used in `noteFileActions.createNoteFromText`.
- Produces on `Api`: `addDocumentTab(): string`, `closeDocumentTab(id)`, `renameDocumentTab(id, title)`, `setActiveDocumentTab(id)`, `patchDocumentTab(id, patch)` (kind `'typing'`), `moveDocumentTabToNote(tabId: string, groupId?: string): Promise<string | null>`, `moveStructuredTabToNote(tabId: string, groupId?: string): Promise<string | null>`; and `structuredTabNoteFields(tab: Pick<UtilityStructuredTab, 'title' | 'content' | 'language'>): MoveToNoteFields` (title = tab title, body = the content inside a fenced block labelled with the language, converted like an imported `.md` file).

- [ ] **Step 1: Write failing tests**:
  - `structuredTabNoteFields` builds a prosemirror body whose plain text contains the content and whose code block carries the language.
  - provider: `moveDocumentTabToNote returns the note id; the note exists and the tab is gone in the same snapshot, and a flush writes both` (inspect `saveData` payload).
  - `moves the freshest editor text`: an editor-phase before-flush hook patches the tab body during the move; the note holds that text.
  - `returns null and changes nothing when persistence is blocked` (`loadDataResult` reason `parse`).
  - `moving the same tab twice yields one note` (second call returns null).
  - `moving the only tab keeps utilityDocumentTabs as [] after save and reload`.
  - structured variant of the first and third cases.
- [ ] **Step 2: Run** the two test files → FAIL.
- [ ] **Step 3: Implement**: actions use `update` (move uses kind `'structural'`); move functions `await runBeforeFlushHooks()`, generate the note id with `uuid()`, read the tab from `getLatestSnapshot()`, call `update`, and return the id only if `update` returned true and the snapshot contains the note.
- [ ] **Step 4: Run** both files and the existing `AppDataContext.flush.test.tsx` → PASS.

### Task 5: JSON/YAML buffers drain on flush

**Files:**
- Modify: `src/hooks/useDebouncedEmit.ts`
- Create: `src/hooks/useDebouncedEmit.test.ts`

**Interfaces:**
- Produces: `useDebouncedEmit` additionally returns `flushPending: () => void` and registers `registerBeforeFlushHook(() => flushPending(), 'editor')` for its lifetime.

- [ ] **Step 1: Write failing tests** with fake timers: `schedule('a')` then `await runBeforeFlushHooks()` emits `a` once and the timer no longer fires a second emit; with nothing pending the hook emits nothing; after unmount the hook is unregistered; unmount still emits a pending value (existing behaviour).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `flushPending` (emit `pendingValue` through `flush`, clear the timer) and the registration in an effect.
- [ ] **Step 4: Run** the file and `npx vitest run src/components/ui` → PASS.

### Task 6: Shared tab strip and the multi-document page

**Files:**
- Create: `src/features/tools/UtilityTabStrip.tsx`, `UtilityTabStrip.test.tsx`
- Modify: `src/views/UtilitiesStructuredPage.tsx` (use the strip, no behaviour change), `src/views/UtilitiesDocumentPage.tsx`
- Create: `src/views/UtilitiesDocumentPage.test.tsx`

**Interfaces:**
- Produces: `UtilityTabStrip` props `{ tabs: { id: string; title: string }[]; activeId: string; onSelect(id): void; onAdd(): void; onClose(id): void; onRename(id, title): void; trailing?: ReactNode }` reproducing the current JSON/YAML strip (double-click rename, Enter/Esc, close button, add button).

- [ ] **Step 1: Write failing tests**: strip renders tabs and marks the active one, fires `onSelect`/`onAdd`/`onClose`, renames on double-click + Enter, cancels on Esc. Document page (mock `useAppData`, `useAccount`, and `RichTextDocumentPane` to a stub exposing its props): seeds exactly one tab when none exist; shows one tab per entry; the editor receives `editorKey`/`attachmentScope.documentId` equal to the active tab id and its body; switching tabs changes them; closing a tab with content asks for confirmation first; closing an empty tab does not.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: extract the strip from the JSON/YAML page (it keeps its own confirm-on-close logic), build the Document page on `data.utilityDocumentTabs`/`activeDocumentTabId` and the Task 4 actions, per-tab `onChange` mirroring today's `noteBodyPatchIsNoOp` guard.
- [ ] **Step 4: Run** the new tests plus any existing `UtilitiesStructuredPage` tests and `npx playwright test` for `routes.spec.ts` → PASS.

### Task 7: Move to Notes UI

**Files:**
- Modify: `src/features/notes/noteGroupForest.ts`, `noteGroupForest.test.ts`
- Create: `src/features/tools/MoveToNoteDialog.tsx`, `MoveToNoteDialog.test.tsx`, `useMoveTabToNote.ts`, `useMoveTabToNote.test.tsx`
- Modify: both Tools pages (a "Move to Notes" action next to the active tab)

**Interfaces:**
- Produces: `noteDestinations(groups: NoteGroup[]): { id: string | undefined; label: string }[]` (first entry `{ id: undefined, label: 'No list (top level)' }`, then non-archived lists with their ancestor path as `A / B`, sorted by label); `MoveToNoteDialog` props `{ open: boolean; groups: NoteGroup[]; tabTitle: string; onConfirm(groupId: string | undefined): void; onCancel(): void }`; `useMoveTabToNote(kind: 'document' | 'structured')` returns `{ request(tabId: string): void; dialog: ReactNode }`.

- [ ] **Step 1: Write failing tests**: `noteDestinations` excludes archived lists and lists inside archived ones, includes sub-lists with full path, root first. Dialog lists those options, confirm returns the chosen id or `undefined` for top level, cancel does nothing. Hook (mock the provider actions, router `useNavigate`, toast): success navigates to `/notes?id=<noteId>` and shows a success toast; a `null` result shows the warning `Could not move` / `Saving is temporarily blocked.` and does not navigate; a second `confirm` while one is in flight is ignored (Review Focus 3).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, reusing the project's existing modal/dialog primitive and `useToast`; the `?id=` deep link already expands the note's list on the Notes page.
- [ ] **Step 4: Run** the four files, tsc → PASS. Manually: move a Document tab and a JSON tab (see Task 10).

### Task 8: Save to file (⇧⌘S)

**Files:**
- Modify: `electron/noteFileIo.cjs`, `electron/noteFileIo.test.ts`, `electron/main.cjs` (new handler beside `note:saveAs`), `electron/preload.cjs`, `src/vite-env.d.ts`
- Create: `src/lib/toolFileExport.ts`, `toolFileExport.test.ts`, `src/features/tools/useToolFileSave.ts`, `useToolFileSave.test.tsx`
- Modify: both Tools pages (call the hook)

**Interfaces:**
- Produces (main side, in `noteFileIo.cjs`): `validateToolSavePayload(payload: unknown)` returning `{ ok: true, suggestedName, defaultExt, variants: Record<string, string>, filters: { name: string; extensions: string[] }[] } | { ok: false, error }` (allowed variant keys `md`, `txt`, `html`, `json`, `yaml`, `yml`, `*`; each value a string ≤ `NOTE_FILE_MAX_BYTES`; name sanitised like the notes channel); `pickSaveVariant(variants: Record<string, string>, chosenPath: string, defaultExt: string): { content: string; ext: string }` (extension compared case-insensitively; order `variants[ext]`, `variants['*']`, `variants[defaultExt]`).
- Produces (renderer): `documentTabFile(tab): { suggestedName: string; defaultExt: 'md'; variants: { md: string; txt: string; html: string }; filters }` built with `exportNoteContent` + `exportFileName`; `structuredTabFile(tab): { suggestedName: string; defaultExt: 'json' | 'yaml'; variants: { '*': string }; filters }`; `window.cadence.saveToolFile?(payload)` returning the same shape as `saveNoteFile`; `useToolFileSave({ active: boolean; getFile: () => ToolFilePayload | null; flush: () => Promise<void>; notify })` which listens for `isSaveNoteShortcut` while `active`.

- [ ] **Step 1: Write failing tests**:
  - `pickSaveVariant`: `.md`→md, `.TXT`→txt, `.html`→html, `.docx` and no extension → default variant, `'*'` returns the same text for any extension, and the chosen path is never altered by the function.
  - `validateToolSavePayload`: rejects a missing/empty variants object, a non-string value, a disallowed key, an oversized value; strips path separators from the name; accepts a valid payload.
  - `documentTabFile`/`structuredTabFile`: names and content (the md variant starts with `# <title>`; structured content is verbatim; default ext follows the tab language).
  - `useToolFileSave`: ⇧⌘S calls `flush` before `getFile` and then `saveToolFile` once; plain ⌘S does nothing; inactive hook registers nothing; a second press while busy is ignored; a missing bridge notifies `Saving files needs the desktop app`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the helpers, the handler (policy gate `dataExport`, signed-in check, `validateToolSavePayload`, save dialog with the payload's filters, `checkSaveTargetFree`, `pickSaveVariant` on the dialog path, `writeJsonText`), the preload bridge, the type in `vite-env.d.ts`, and wire both pages. In JSON/YAML diff mode the file is the tab's edit buffer.
- [ ] **Step 4: Run** the files, `node --check electron/main.cjs`, tsc → PASS.

### Task 9: Yellow gradient list icon

**Files:**
- Modify: `src/components/icons.tsx`, `src/features/notes/NotesGroupTree.tsx` (the row icon and the destination-list icon), `src/features/notes/NotesSidebar.tsx` (the list entry icon), `src/styles/notes.css` and the file holding the theme tokens (dark variant)
- Create: `src/components/icons.folderGradient.test.tsx`

**Interfaces:**
- Produces: `IcFolderGradient(p: IconProps)` rendering a filled folder with a `linearGradient` whose id comes from `useId()`; theme tokens `--list-folder-top`, `--list-folder-bottom`, `--list-folder-edge` (lighter yellow top, deeper amber bottom, slightly darker edge; tuned for dark).

- [ ] **Step 1: Write failing tests**: rendering two icons gives two distinct gradient ids, each icon's fill references its own id, `aria-hidden` is set, size prop respected; the tree row and sidebar entry render `IcFolderGradient` (query by a `data-list-icon` attribute) while `HomeQuickAccess`, `CommandPalette` and `AppSidebar` still use `IcFolder`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; remove the `color: var(--accent)` dependency for `.notes-page__group-folder` since the icon now carries its own colours.
- [ ] **Step 4: Run** the test, tsc → PASS; look at both themes in the running app (Task 10).

### Task 10: Whole-change verification

- [ ] **Step 1:** `npx tsc --noEmit`; `npx vitest run --coverage` (thresholds hold); `npm run build:web`; `npx playwright test`; `node --check electron/main.cjs`.
- [ ] **Step 2:** Run `bash scripts/data-safety-scan.sh` and give the `data-safety-reviewer` agent the working-tree diff with the Review Focus list; fix everything it proves.
- [ ] **Step 3: Manual check in the desktop app** (`npm run dev`): upgrade path (open a workspace that has a legacy Document: it becomes tab "Document", content intact); add two tabs, type, ⌘S; paste an image in a tab, move it to a list and to the root, confirm the image still shows after restart; ⇧⌘S in a Document tab with `.md`, `.txt`, `.html`, `.docx` and no extension; ⇧⌘S in JSON and YAML tabs; yellow icons in light and dark.
