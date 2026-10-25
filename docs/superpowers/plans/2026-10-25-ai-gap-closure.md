# AI Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the places where the feature wish-list (five areas: Notes & Mermaid, Developer toolkit, Teams & 1:1, Tasks & Planning, ⌘K) is not yet met by what shipped in Phases 0a–3.

**Architecture:** Every item extends an existing task in `src/lib/ai/prompts/` and its dialog, using the `AiTask` / `runAiTask` / `useAiRun` framework and the `AI_ACTIONS` registry. No new engine, no new data fields, no new providers. Every result stays a preview that the user applies; nothing is written to existing notes or tasks without that step.

**Tech Stack:** TypeScript (strict, no `any`), React, Vitest + Testing Library, the existing `src/lib/ai/*` framework.

**Spec:** `docs/superpowers/specs/2026-10-24-ai-features-design.md` (this plan extends it; it adds no new data class and no new provider behaviour).

## What already exists (verified in code, so NOT in this plan)

| Wish | Where it already lives |
|---|---|
| Free text → Flowchart / Sequence / State (Mermaid) | `visualize` (`prompts/visualize.ts`, `AIVisualizeDialog`) |
| Natural language → ERD, iterative on the current diagram, shows what is new/extended | `erd-from-text` (`prompts/erd.ts` takes `current`, `AIErdDialog` uses `diffErdProposal`) |
| 1:1 prep from a person's open tasks, goals, recent items; open questions | `one-on-one-prep` (`prompts/prep.ts`, `personContext.ts`) |
| Raw feedback → SBI | `feedback-sbi` (`prompts/sbi.ts`) |
| Task → steps, added as a checklist in the task's details | `break-down` (`AIBreakDownDialog`, "Add checklist to details") |
| Eisenhower classification | `classify-eisenhower` (`AIEisenhowerDialog`) |
| Ask the workspace from ⌘K, with cited sources | `ask-workspace` (`AIWorkspaceDialog`, palette entry) |
| Weekly retrospective, status update for a manager | `weekly-digest` (`prompts/digest.ts`, modes `retro` / `upward`, Home tile + ⌘K) |

## Global Constraints

- Zero data loss: no task may delete, empty or overwrite notes/todos. Apply always creates something new or appends; Undo/Cancel leave the original as it was.
- Locked and archived notes never reach a prompt (the existing collectors already exclude them; reuse them, do not re-implement).
- `dataClass` is set per task and never defaulted. Person-related text uses `'people'`; the person's name is not sent.
- Strict TypeScript, no `any`. Code, identifiers and comments in English.
- Every prompt change bumps that task's `promptVersion` and keeps `<user_data>` wrapping (`dataBlock`, `DATA_RULE`).
- Tests first: each task writes the failing test, watches it fail, then implements.
- No commits unless the user asks. Docs touched at the end: `docs/AI-INTEGRATION.md`, `docs/USER-GUIDE.md`, `CHANGELOG.md`, `landing/index.html` (only if a card changes).

## Review Focus

- Document structuring on a very short or empty scratch text: must stay disabled / return a clear message, never invent a document.
- Structuring "Meeting summary + actions" when the text names no actions: the action section must be empty or omitted, not invented.
- Markdown table output with ragged rows or `|` inside a cell: must render a valid table (escape the pipe, pad rows).
- "Upward" summary opened from My Leader / Skip-level with no activity in the period: must say there is nothing to report, not fabricate achievements.
- Sidebar AI group when AI is switched off by the app profile, or on but not yet connected: nothing misleading, and "Set up AI" goes to Settings.
- Delegate suggestions when the team has no people, or the task's group is archived: no suggestion offered, no write attempted.

---

### Task 1: Structure the scratch document into a chosen format (RFC, meeting summary + actions, Markdown table)

Today `structure-document` only tidies text into titled sections. The wish is a one-click conversion to a specific document type.

**Files:**
- Modify: `src/lib/ai/prompts/structure.ts`, `src/components/AIStructureDialog.tsx`
- Test: `src/lib/ai/prompts/structure.test.ts` (extend or create next to it), `src/components/AIStructureDialog.test.tsx`
- Read first: the existing renderer that turns `StructureOut` into note fields (named in `AIStructureDialog.tsx`), so the new kinds reuse it.

**Interfaces:**
- Produces: `type StructureKind = 'outline' | 'rfc' | 'meeting' | 'table'`; `structureTask` reads `ctx.options.kind` (default `'outline'`, today's behaviour unchanged). `StructureOut` gains optional `table?: { columns: string[]; rows: string[][] }`, used only by kind `'table'`.
- Consumes: `AiOptions` from `src/lib/ai/types.ts` (as `digest` already does with `options.mode`).

- [ ] **Step 1: Write failing tests** in `structure.test.ts`: `build` with `kind: 'rfc'` puts the RFC section names (Context, Proposal, Alternatives, Risks, Open questions) in the system text; `kind: 'meeting'` asks for "Summary", "Decisions", "Action items" with owner when named; `parse` of a `table` reply keeps `columns`, pads short rows to `columns.length` and escapes `|`; an unknown `kind` falls back to `'outline'`; default call is byte-identical to today's prompt apart from the bumped `promptVersion`.
- [ ] **Step 2: Run** `npx vitest run src/lib/ai/prompts/structure.test.ts`. Expected: FAIL on the new cases only.
- [ ] **Step 3: Implement** `StructureKind` handling in `structure.ts`: one prompt fragment per kind, `promptVersion` 2, parse limits unchanged (12 sections, 20 items, 300 chars; table ≤ 8 columns, ≤ 40 rows).
- [ ] **Step 4: Dialog tests** in `AIStructureDialog.test.tsx`: a "Format" control with Outline / RFC / Meeting summary / Table; the chosen kind reaches `runAiTask` as `options.kind`; Add as a new tab for `table` produces a Markdown table in `bodyPlainText`; the original tab is untouched (existing test stays green).
- [ ] **Step 5: Implement** the control and the table rendering in the dialog, extending the existing render helper.
- [ ] **Step 6: Run** `npx vitest run src/lib/ai src/components/AIStructureDialog.test.tsx`. Expected: PASS.

### Task 1b: "Also draw as Mermaid" after Structure

**Files:** Modify `src/components/AIStructureDialog.tsx`. Test: `src/components/AIStructureDialog.test.tsx`.

**Interfaces:** Consumes `visualizeTask` (`prompts/visualize.ts`), `validateMermaid`, `mermaidNoteFields` (`src/lib/ai/sketchGraph.ts`) and `createNoteWithContent`, exactly as `AISketchDialog` does. Produces nothing new for other tasks.

- [ ] **Step 1: Write failing tests**: after a structure result, an "Also draw as Mermaid" button runs `visualizeTask` on the structured text (not on the raw scratch); an invalid diagram cannot be added; "Add as a new note" creates a code-block note and leaves the structure result and the original tab untouched; a failed save shows an error and keeps the dialog open.
- [ ] **Step 2: Run** the dialog test. Expected: FAIL.
- [ ] **Step 3: Implement** the button and the second result panel; reuse `useAiRun` with the visualize task (a second hook instance, so the first result stays visible).
- [ ] **Step 4: Run** `npx vitest run src/components/AIStructureDialog.test.tsx`. Expected: PASS.

### Task 1c: "Also draw as Sketch" after Structure

Scope decision (user did not choose otherwise): simple boxes-and-arrows only, no new dependency.

**Files:** Create `src/lib/ai/prompts/boxes.ts`, `src/lib/ai/sketchScene.ts`. Modify `src/components/AIStructureDialog.tsx`. Tests beside each.
Read first: `src/lib/utilityDiagrams.ts` (`validateSketchSceneForSave`, `MAX_SKETCH_SCENE_CHARS`) and how Utilities → Sketch saves a named board (`src/features/sketch/SketchCanvas.tsx`, `src/core/actions/index.ts`), so a new board is created through the same path.

**Interfaces:**
- Produces: `boxesTask: AiTask<{ text: string }, { nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] }>` (≤ 24 nodes, ≤ 48 edges, labels ≤ 60 chars, edges to unknown ids dropped); `buildSketchScene(graph): string` returning scene JSON built with `convertToExcalidrawElements` (top-to-bottom grid layout, arrows bound to boxes).
- Consumes: `validateSketchSceneForSave` for the final size/validity gate.

- [ ] **Step 1: Write failing tests**: `parse` drops edges that point at unknown ids and caps counts; `buildSketchScene` of a 3-node chain gives 3 rectangles + 2 bound arrows and passes `validateSketchSceneForSave`; empty graph → no scene; dialog: "Also draw as Sketch" saves a **new** named board and never touches an existing one; a save refused by validation shows the error and keeps the dialog open.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement** the task, the scene builder and the dialog action.
- [ ] **Step 4: Run** `npx vitest run src/lib/ai src/components/AIStructureDialog.test.tsx`. Expected: PASS.

### Task 2: Radical Candor option and a review-draft mode for feedback

Today `feedback-sbi` only rewrites to SBI. The wish adds Radical Candor framing and a performance-review draft from rough notes.

**Files:**
- Modify: `src/lib/ai/prompts/sbi.ts`, `src/components/AISbiDialog.tsx`
- Test: `src/lib/ai/prompts/sbi.test.ts`, `src/components/AISbiDialog.test.tsx`

**Interfaces:**
- Produces: `options.framework: 'sbi' | 'candor' | 'review'` (default `'sbi'`, current output shape unchanged). `'candor'` returns `{ care: string; challenge: string }` plus the existing `kind`; `'review'` returns `{ strengths: string[]; growth: string[]; summary: string }`. Parse accepts only the shape of the chosen framework.
- Consumes: existing `SbiOut` and kinds `praise | coaching | concern`.

- [ ] **Step 1: Write failing tests** for `build` (framework text present, still wrapped in `<user_data>`), for `parse` of each framework (rejects another framework's shape with a repairable error), and a test that the person's name is not added to the prompt.
- [ ] **Step 2: Run** the prompt test file. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** the three frameworks in `sbi.ts` (`promptVersion` 2).
- [ ] **Step 4: Dialog tests**: a "Framework" control; Copy and Apply emit text that matches the chosen framework; default behaviour identical to today.
- [ ] **Step 5: Implement** the control and the preview/Copy text for the two new shapes.
- [ ] **Step 6: Run** `npx vitest run src/lib/ai/prompts/sbi.test.ts src/components/AISbiDialog.test.tsx`. Expected: PASS.

### Task 3: Upward summary from the My Leader and Skip-level pages

`weekly-digest` already has an `upward` mode, but it can only be reached from Home and ⌘K.

**Files:**
- Modify: `src/lib/ai/launcher.ts`, `src/components/AiLauncher.tsx`, `src/components/AIDigestDialog.tsx`, `src/views/TeamDashboard.tsx` or `src/views/People.tsx` (whichever renders the My leader / Skip-level views; confirm by reading `teamLeader` / `teamSkipLevel` usage first)
- Test: `src/lib/ai/launcher.test.ts`, `src/components/AIDigestDialog.test.tsx`, a test beside the view that gets the button

**Interfaces:**
- Produces: `openAiTool('weekly-digest', { mode: 'upward' })` — an optional second argument carrying the preset; `subscribeAiTool` listeners receive it. Existing no-argument calls behave exactly as before.
- Consumes: `AIDigestDialog` prop `initialMode?: 'retro' | 'upward'`.

- [ ] **Step 1: Write failing tests**: the launcher passes the preset to the listener; `AIDigestDialog` opens with `initialMode='upward'` selected; an empty period still shows the "nothing to report" path from the existing empty-activity handling.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement** the preset in `launcher.ts` and `AiLauncher.tsx`, `initialMode` in the dialog.
- [ ] **Step 4: Add the entry**: a "Prepare an update for your leader" button on the My Leader and Skip-level views, shown only when `features.ai && hasUsableConnection` (same gate as the Home tile). Test that it renders only then and calls `openAiTool('weekly-digest', { mode: 'upward' })`.
- [ ] **Step 5: Run** `npx vitest run src/lib/ai src/components/AIDigestDialog.test.tsx src/views`. Expected: PASS.

### Task 4: Eisenhower advisor — suggest delegating to a team member's 1:1 agenda

Today the classifier only places tasks in quadrants. The wish adds a cross-module suggestion for tasks that look like "Delegate".

**Files:**
- Modify: `src/lib/ai/prompts/eisenhower.ts`, `src/components/AIEisenhowerDialog.tsx`, the Planning view that mounts the dialog (find via `AIEisenhowerDialog` usage)
- Test: `src/lib/ai/prompts/eisenhower.test.ts`, `src/components/AIEisenhowerDialog.test.tsx`

**Interfaces:**
- Produces: for tasks that land in "Delegate" (important=false, urgent=true), the dialog offers a person picker (people of the user's teams, active only) and an "Add to their 1:1 agenda" action that creates **one new agenda item** for that person through the existing `addItem` (returns `boolean`; on `false` the dialog shows an error and keeps the suggestion). The model is not asked to pick a person and is never sent people's names; the choice is the user's.
- Consumes: `addItem` from `AppDataContext`, the people/items model already used by `PersonPrepButton`.

- [ ] **Step 1: Write failing tests**: a Delegate row shows the picker; no teams/people → no picker and no write; archived people are not listed; choosing a person calls `addItem` exactly once with the task title only (no notes text); `addItem` returning `false` shows the error and keeps the row; the original task is not modified or moved.
- [ ] **Step 2: Run** the dialog test. Expected: FAIL.
- [ ] **Step 3: Implement** the picker and action in `AIEisenhowerDialog.tsx`; no prompt change unless a test shows one is needed (then bump `promptVersion`).
- [ ] **Step 4: Run** `npx vitest run src/components/AIEisenhowerDialog.test.tsx src/lib/ai`. Expected: PASS.

### Task 5: Friday retrospective nudge and an "opportunities" section

The retro exists but is only found if the user looks for it; it also lacks the forward-looking part of the wish.

**Files:**
- Modify: `src/lib/ai/prompts/digest.ts`, `src/features/home/HomeQuickAccess.tsx`
- Test: `src/lib/ai/prompts/digest.test.ts`, `src/features/home/HomeQuickAccess.test.tsx` (extend or create)

**Interfaces:**
- Produces: retro mode adds an optional section `"## Next week's opportunities"` (only things the data supports; may be omitted); `promptVersion` bumped. The Home "Weekly digest" tile shows a subtle "It's Friday" hint on Fridays and on weekends, using the user's local date. No automatic AI call and no notification: the hint only labels the tile.
- Consumes: the existing `localDate` helper in `prompts/shared.ts` for date handling (inject `now` in the component so the test can pin the day).

- [ ] **Step 1: Write failing tests**: retro prompt names the new section and keeps "no invention" wording; upward prompt unchanged; the tile shows the hint on a Friday and not on a Tuesday; the tile still opens the digest on click.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the prompt change and the hint.
- [ ] **Step 4: Run** `npx vitest run src/lib/ai/prompts/digest.test.ts src/features/home`. Expected: PASS.

### Task 5b: AI shortcuts in the left menu

Today the AI tools are found only through ⌘K, the selection toolbar, the "/" menu or inside other tools, so they are easy to miss.

**Files:** Modify `src/components/AppSidebar.tsx`, `src/styles/shell.css` (only if needed). Test: `src/components/AppSidebar.test.tsx`.

**Interfaces:**
- Produces: a sidebar group `id="ai"`, label "AI", placed between Workspace and Insights, open by default (not in `DEFAULT_COLLAPSED`). Items: **Ask workspace** → `openAiTool('ask-workspace')`, **Weekly digest** → `openAiTool('weekly-digest')`, **Diagram from a screenshot** → `openAiTool('screenshot-to-diagram')` (all three are launcher ids today). They are buttons styled as sidebar links, not routes.
- Visibility: shown only when `features.ai`. With a usable connection (`hasUsableConnection`) the three tools show; without one the group shows a single "Set up AI" link to `PATH_SETTINGS#ai`. Hidden on mobile web (the tools are desktop surfaces today — confirm against `AiLauncher` before relying on this).
- Tools that need a selection or a task (Visualize, Break down, SBI, Classify) are not shortcuts; they stay where the context is.

- [ ] **Step 1: Write failing tests**: group absent when `features.ai` is false; "Set up AI" link when enabled but not connected; three buttons when connected, each calling `openAiTool` with its id; group state persists like the others; icon-only sidebar still shows the items by tooltip; group order is Workspace, AI, Insights.
- [ ] **Step 2: Run** `npx vitest run src/components/AppSidebar.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the group using `SidebarGroup` and the `IcSparkles` icon.
- [ ] **Step 4: Run** the same file. Expected: PASS.

### Task 6: Docs, registry check and full verification

**Files:** `docs/AI-INTEGRATION.md`, `docs/USER-GUIDE.md`, `CHANGELOG.md`, `landing/index.html` (only if a card's wording changes), `src/lib/ai/entryPoints.ts` (labels/descriptions for changed actions).

- [ ] **Step 1:** Update the docs for Tasks 1–5 in the same style as the existing entries; keep the "what is sent" table accurate (Task 4 sends nothing new; Tasks 1–3 and 5 send no new data classes).
- [ ] **Step 2: Run** `npm run check`. Expected: exit 0, all tests green.
- [ ] **Step 3: Run** `npm run build:web`. Expected: built.
- [ ] **Step 4:** One independent review of the whole diff, with the data-safety reviewer on Task 4 (it writes an agenda item). Fix Critical/Important findings test-first; list Minor ones.

---

## Self-review

- **Coverage:** wish items 1 (structure formats → Task 1), 3 (Radical Candor/review draft → Task 2; leader/skip-level upward → Task 3), 4 (Eisenhower delegate → Task 4), 5 (Friday retro/opportunities → Task 5). Wish items already satisfied are listed with their code locations above, including the ERD iteration, task decomposition into the task's details, and ⌘K workspace Q&A.
- **Not planned:** a new "creative coaching question" prompt for 1:1 prep (`questions` already covers open questions; changing it is a prompt-quality decision, not a missing feature).
- **Types:** `StructureKind`, `options.framework`, and the `openAiTool` preset are each defined in one task and consumed only there or in a later named step.
