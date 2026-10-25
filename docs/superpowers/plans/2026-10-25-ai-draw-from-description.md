# Draw From a Description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** One AI tool where the user describes a diagram in words and gets either a Mermaid note or a Sketch board, with follow-up changes ("add a cache"), like Design with AI does for the ER diagram.

**Architecture:** Reuse `visualizeTask` (Mermaid) and `boxesTask` (boxes and arrows → `layoutBoxes` → Excalidraw). Both gain an optional "current diagram + requested change" input for follow-ups. The tool is an app-wide launcher tool (`draw-from-description`) mounted in `AiLauncher`, opened from ⌘K, the left menu AI group, the Sketch page and the Utilities hub. Results are previewed and added as a NEW note or a NEW Sketch board; nothing existing is touched.

**Spec:** `docs/superpowers/specs/2026-10-24-ai-features-design.md` (extends it; no new data class or provider behaviour).

## Global Constraints

- Zero data loss: Add creates a new note / a new board (upsert without an id). It never edits an open sketch or an existing note.
- `dataClass: 'content'` (as Visualize and Boxes today). The description and the previous result are the only things sent.
- Strict TypeScript, no `any`; code in English. Tests first. No commits unless asked.
- A result still being drawn for an older request must never appear (generation guard), and Add can run once per result.

## Review Focus

- A description that is empty, under 10 characters, or over 4,000: not sent / clipped, with a message.
- A follow-up change when the first result was cut off or invalid: follow-ups only build on a valid, complete result.
- Switching format after a result: the old result is cleared, never shown under the other format.
- A Mermaid reply that does not render, or a sketch that fails the scene check: nothing can be added.
- AI off or no connection: the tool does not open and the entries are absent or lead to Settings.

### Task 1: Follow-up input for Visualize and Boxes

**Files:** `src/lib/ai/prompts/visualize.ts`, `boxes.ts` (+ tests).
- Produces: `VisualizeInput = { text: string; current?: string; change?: string }`, `BoxesInput` likewise; when both `current` and `change` are given the data block also holds `Current diagram:` / `Requested change:` and the system text says to return the whole updated diagram, changing only what was asked. Without them the prompt is unchanged apart from `promptVersion` +1.
- [ ] Tests first (build includes both labels, keeps one `</user_data>`, caps lengths; without follow-up equals today's prompt body), run RED, implement, run GREEN.

### Task 2: Shared sketch-scene builder

**Files:** `src/lib/ai/sketchScene.ts`, `src/components/AIStructureDialog.tsx` (+ tests).
- Produces: `graphToSceneJson(graph): Promise<{ ok: true; json: string } | { ok: false; error: string }>` — layout, dynamic import of `convertToExcalidrawElements`, `buildSceneJson`, `validateSketchSceneForSave`. The Structure dialog uses it instead of its own copy.
- [ ] Tests first (converter mocked; error on converter throw; error on empty graph; ok path), RED, implement, GREEN, Structure dialog tests stay green.

### Task 3: Launcher tool, entry points

**Files:** `src/lib/ai/launcher.ts`, `src/lib/ai/entryPoints.ts` (+ tests), `src/components/AiLauncher.tsx`, `CommandPalette` (automatic), `AppSidebar.tsx` AI group, `UtilitiesToolsSketchPage.tsx`, `UtilitiesToolsHubPage.tsx`.
- Produces: tool id `'draw-from-description'`; `AiToolPreset.format?: 'mermaid' | 'sketch'`; action `{ id: 'draw-from-description', label: 'Draw from a description', surfaces: ['palette','tool'], taskId: 'ai.visualize' }`.
- [ ] Tests first (launcher passes the preset; entryPoints lists it for palette and tool; sidebar shows it in the AI group; Sketch page button opens it with `format: 'sketch'`; hub card), RED, implement, GREEN.

### Task 4: The dialog

**Files:** `src/components/AIDrawDialog.tsx` (+ test), mounted by `AiLauncher` with `createNoteWithContent` and `upsertUtilitySketchDocument`.
- Behaviour: description box (10–4,000 characters), format Mermaid / Sketch (preset picks the first), optional Mermaid type; **Draw**; result preview (Mermaid source validated by `validateMermaid`; Sketch as a box/arrow summary); a "Change it" box for follow-ups that sends the previous valid result plus the change; **Add as a new note** / **Add as a new board**; Add once per result; cut-off results cannot be added; format change or new Draw clears the old result and ignores a still-running older request.
- [ ] Tests first for every behaviour above, RED, implement, GREEN.

### Task 5: Docs and verification

- [ ] `docs/AI-INTEGRATION.md` (features table, what is sent), `docs/USER-GUIDE.md`, `CHANGELOG.md`, `README.md` row, landing card wording.
- [ ] `npm run check` exit 0; `npm run build:web`; one independent review, fixes test-first.
