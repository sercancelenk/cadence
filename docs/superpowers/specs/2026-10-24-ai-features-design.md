# AI features: foundation and roadmap

Status: Phases 0a, 0b, 1, 2 and 3 implemented (foundation, connections and routing, people gate, policy flags, result panel, entry points; streaming, images and embeddings; Visualize, Challenge, Break down, Feedback → SBI; Eisenhower, document structure, mock data, ERD, sketch and screenshot to diagram; weekly digest, 1:1 prep, ask your workspace). Not built, on purpose: persisted embedding indexes, an evaluation script, Break down on a person's task, ⌘K entries for actions that need an open note or task. Approved by the product owner on 2026-10-24.
Scope: how Cadence uses AI beyond the two existing features, and the
foundation that must exist first. Connection setup (providers, gateways,
formats) is already built and documented in [AI-INTEGRATION.md](../../AI-INTEGRATION.md).

## 1. Intent

Cadence is a local-first workspace for leaders and engineers: tasks, notes,
people and 1:1s, planning, small developer tools. Today AI appears in two
places (Ask AI on a task, Extract tasks from notes). The goal is to make AI a
quiet, professional capability across the places where people actually think
and write: turn rough text into diagrams and structure, challenge ideas,
break work down, prepare conversations, summarize a period of work.

The promise that must survive every feature: **your data stays yours.** AI is
opt-in, nothing is sent without the user seeing what, nothing is written
without the user approving it, and nothing is ever lost.

## 2. Goals, non-goals, anti-goals

Goals
- A small shared foundation so every AI feature looks, behaves and is tested the same way.
- Prompts that are internal, professional, versioned and tested; the user never sees or edits them.
- A result experience that matches the existing UI and is calm, not decorative.
- Per-feature control of which connection (and so which model, and whether data leaves the device) is used.
- Features ordered by value and risk, safest first.

Non-goals
- A general chat assistant or an always-on sidebar.
- Cadence-hosted AI, accounts, telemetry, or any server of ours.
- Autonomous agents that change data on their own.
- Replacing deterministic tools with a model where an algorithm exists (type generation from JSON).

Anti-goals (would make this a failure even if it technically works)
- Any AI output changing or deleting user data without an explicit Apply.
- Sensitive people data (1:1s, feedback) leaving the device without the user and, where set, the organization allowing it.
- Prompt text, internal instructions or "machine" messages appearing as if the user wrote them.
- Glowing AI buttons everywhere.

## 3. Current state (verified in the code)

- Engine: one request engine for Anthropic, OpenAI, Gemini and a custom gateway (`src/lib/ai.ts`). Text in, text out; no streaming, no image input, no JSON/structured-output mode.
- Settings hold a single connection (`AppData.aiSettings`): one provider, one key, one model.
- Two features, each with its own dialog: `AIAssistantDialog` (Ask AI) and `AITaskExtractorDialog`. Logic is duplicated between them.
- Prompts are string constants in `src/lib/ai.ts` (`DEFAULT_SYSTEM`, `EXTRACT_SYSTEM`).
- Ask AI shows its auto-built prompt ("Task: … How should I approach this?") as a "You" message in the conversation. The extractor shows a free-text "Custom guidance for the AI" field. `README` says the system prompt is tunable in Settings; no such field exists. A stored `systemPrompt`, if present, replaces the built-in system prompt for Ask AI.
- Extractor: copies its system prompt into the user message as well; knows neither today's date nor the user's lists, so relative dates and routing are left to the user.
- Existing building blocks the roadmap relies on: slash menu (`src/lib/richTextSlashItems.ts`, `richTextSlashCommand.ts`), selection bubble toolbar (`src/components/ui/RichTextBubbleToolbar.tsx`), Mermaid rendering with `securityLevel: 'strict'` (`src/lib/richTextMermaid.ts`), ERD document model with a validating parser (`parseErdDocument` in `src/lib/erd/erdModel.ts`), Excalidraw for Sketch, note version history (`src/lib/noteRevision/`, `useNoteRevisionCapture`), activity aggregation (`src/lib/todoActivityReport.ts`), 1:1 agenda text with an en/tr language setting (`src/lib/people/oneOnOneAgenda.ts`), Eisenhower quadrant derived from the manual `planImportant` / `planUrgent` fields, ⌘K search (`src/lib/commandPaletteSearch.ts`).
- Locked notes: `notePlainText` returns an empty string for a locked note unless it has been decrypted in the current session, so a locked, unopened note sends nothing.
- Tasks have no parent/child link; the only cross-reference is `sourceNoteId`.
- Org policy: `features.ai` and `features.aiAllowedHosts`, enforced in the main process for every AI request on desktop.

## 4. Principles

1. **AI is a verb, not a place.** Reached from the selection, the slash menu, ⌘K and row menus. No permanent AI surface.
2. **Propose, then approve.** Every result is previewed; writing is a separate, explicit Apply that goes through the existing actions and is undoable.
3. **Additive writes.** AI creates new things (a block, a note, a checklist, new tasks) or proposes a diff. It never silently overwrites.
4. **Show what is sent, not how it is asked.** The user sees the data scope; the prompt is an internal asset.
5. **Right model for the data.** Different features can use different connections; people data can be pinned to a local model.
6. **Deterministic first.** Use a library when an algorithm exists; use the model for judgment and language.
7. **Honest about capability.** If the chosen model cannot do a feature (no JSON reliability, no vision), say so and offer the fix instead of failing strangely.

## 5. Architecture (Phase 0: the foundation)

### 5.1 AI task framework (F1)

Each feature is one definition; the framework runs it.

```ts
type AiTask<In, Out> = {
  id: string;                      // 'notes.visualize'
  promptVersion: number;           // bumped when the prompt changes
  scope: DataScope;                // what it reads, shown to the user before sending
  needs: Capability[];             // 'json' | 'vision' | 'long-output'
  dataClass: 'content' | 'people'; // 'people' is subject to stricter controls (5.7)
  collect(ctx): In;                // gather input from the app; pure
  build(input: In, options): Prompt;   // from the registry (5.2)
  parse(reply: string): Out | ParseError;  // validates against the output schema
  preview(out: Out): ResultView;   // text | diagram | diff | rows | erd
  apply(out: Out, actions): Effect;    // via existing actions; additive; undoable
};
```

Pipeline: collect → privacy preview (when required) → resolve connection →
run → parse and validate → one repair attempt with the validator's message →
result panel → apply. A reply that fails validation twice is discarded with a
plain message; nothing partial is applied.

The two existing features move onto the framework (X1) so there is one dialog
implementation, one error and diagnostic path, one set of tests.

### 5.2 Prompt registry and policy (F2)

Prompts are internal, typed, versioned code, in one folder, one file per task.
They are never shown to the user and never editable as a whole.

Each prompt module exports: `id`, `version`, `system`, `build(input, options)`,
the output schema, and the parser. Conventions:
- Role and objective first; rules; output format; refusals/fallback. Same structure as `EXTRACT_SYSTEM` today.
- **User content is data.** It is placed in a clearly delimited block with the instruction that nothing inside it is an instruction. The system text is sent once (not repeated in the user message).
- Output language follows the language of the user's text (for 1:1 features, the existing en/tr 1:1 setting). The built-in strings in the prompt itself stay English.
- Context supplied where it improves quality: today's date and time zone, list names, due date, priority, linked note title. Relative dates stay as written unless the task asks to resolve them.
- Structured output uses the provider's JSON/structured mode when the connection supports it; the parser still validates.
- Every prompt has fixtures: representative inputs and expected-shape outputs (including malformed model replies) so a prompt change is a reviewed diff with a test run.

User-facing control is **options, not text**: a fixed set per task, such as
language, length, tone, focus lens ("Plan / Risks / First 15 minutes" for Ask
AI). Options map to prompt parameters inside the registry.

**Additional instructions (decision in 5.2.1).**

#### 5.2.1 Additional instructions: restricted

Free text that the user can add to a prompt is the main way the professional
prompts can be derailed or abused (override of the output rules, impersonation,
use of the embedded prompts as an unrestricted chatbot on a shared or managed
device). The proposal:

- **Version 1 ships without any free-text field.** Options only.
- When a free-text "Focus note" is added later, it is constrained:
  - one line, at most 200 characters, plain text (markup, control characters and URLs removed);
  - placed in a delimited, lowest-priority block that is stated to affect emphasis only, never the output format, rules, safety or language of the reply;
  - never available as a *new* input on structured-output tasks (diagram, ERD, task rows, data generation), because their contract is the product. The one exception is the legacy `extractionGuidance` carve-out below: Extract tasks keeps honoring a stored value so behavior does not change silently, and its reply is validated against the schema like any other;
  - subject to an organization policy flag (`features.aiFocusNote`, default allowed outside `work-strict`);
  - the result is always validated against the task's schema, so a note cannot change the shape of what is applied.
- **Legacy data is never deleted, and behavior does not change silently.** A stored `extractionGuidance` or `systemPrompt` keeps its value. Version 1 has no new place to type free text, but these two existing values are still honored for the only two features that used them (Ask AI and Extract tasks), now **as a Focus note under the constraints above** (cleaned, 200 characters, delimited, never replacing the system prompt). Settings shows them once under "Previous instructions" with a one-time notice, a Copy button and a Remove button. Removing is the user's choice; nothing else touches them.

### 5.3 Connection profiles and per-feature routing (F3)

Today there is one connection. Phase 0 makes it a list.
- A **connection** is what `AISettings` holds now (provider or gateway, address, key, model, format, headers, path) plus a name and detected **capabilities** (`json`, `vision`, `streaming`).
- A **routing** map says which connection each feature class uses, with a default: `content` tasks, `people` tasks, and optional per-task overrides.
- Capability rules (decided): a user override is respected. After two consecutive validation failures of the same task on a connection, the panel says that this model struggled with the task and suggests a larger model or another connection; nothing is auto-disabled.
- Capabilities are discovered by *Test connection* (a small JSON-compliance probe; vision and streaming where the format supports them) and can be overridden by the user. A task whose `needs` the routed connection lacks is shown disabled with the reason and a link to the connection.
- **Storage and ownership (decided).** `aiSettings` stays the single source of truth for the *default* connection, with exactly today's fields. The extra connections and the routing map are new optional fields **inside the same `aiSettings` object** (`connections`, `routing`). Older builds keep unknown keys of that object (`parseAISettings` uses `withExtras`), so they preserve the extra connections untouched, and when an older build edits the key or model it is editing the default connection, which is what the user sees there. The new build never keeps a second copy of the default connection, so there is nothing to reconcile on re-upgrade. Nothing is rewritten or removed. The builder proves this with legacy fixtures (old-build round trip with extra connections present) before shipping.

### 5.4 Engine additions (F4)

- **Structured output** per wire format, using each provider's documented mechanism. The builder verifies the exact parameters against the provider documentation at build time, as was done for the existing formats.
- **Streaming** per wire format, for long outputs (Digest) and responsiveness. Abort and the 120-second limit keep working; the desktop path stays in the main process.
- **Image input** for the formats that support it (Sketch/screenshot features). Text-only connections hide those features.
- The existing limits (reply cap, timeouts, redirect refusal, header and path validation) stay.

### 5.5 Entry points (F5)

- Slash menu: an "AI" group (`/visualize`, `/breakdown`, `/challenge`), shown only when AI is configured and allowed.
- Selection bubble toolbar: one ✨ item opening a small menu of the actions valid for the selection (not a row of buttons).
- ⌘K: "AI: …" commands, same availability rules.
- Row menus: task and 1:1 item menus gain the relevant action (Break down, Classify).
- When AI is off, none of these appear.

### 5.6 Result experience (UI)

One shared result surface (the existing `ai-dialog` shell and tokens: `--panel`, `--border`, `--accent-soft`, existing `Button` variants, gradient icons, light and dark themes, reduced motion).

Anatomy, identical for every feature:
1. Header: task name, model chip, close.
2. Context chips: what was read ("This note · 1,240 characters", "3 people · last 8 weeks"). Click to expand "What was sent".
3. Result area, by type:
   - text: Markdown;
   - diagram: rendered preview beside a "Show source" toggle;
   - rewrite: inline diff with per-change accept;
   - task rows: the extractor's editable rows;
   - ERD: tables shown on the canvas as a proposed layer, accept or reject per table.
4. Action bar: primary **Apply** (or Insert), then Copy, Regenerate, Discard.
5. Footer: small, muted connection name.

States: loading skeleton or streaming text; error with the existing diagnostic details; truncated reply with Continue (exists); not configured → one call to connect a provider (links to Settings → AI); capability missing → reason and link.
Accessibility: `aria-live` for streaming, managed focus, keyboard-complete, visible focus, no motion beyond a subtle fade.

Ask AI keeps its conversation, but the opening message is a **context chip**, not a fake "You" message. The user's own follow-ups are normal messages.

### 5.7 Privacy and policy (F6)

- **Data scope per task** is declared (`scope`) and shown in the context chips; a one-time "Don't show again" is per task, never global.
- Locked notes: excluded unless decrypted in this session. A note that is unlocked in this session is sendable; the chip says so.
- **`people` data class** (1:1 notes, feedback, goals and tasks of a person): never sent unless the routed connection is allowed for people data (the user marks a connection "allowed for people data", the default for local addresses) and the chip shows the number of people and the time range. The organization can switch the class off (`features.aiPeople`, enforced in the main process like `ai`).
- Existing `features.ai` and `features.aiAllowedHosts` apply to all tasks.
- **Policy flags** `features.aiPeople` and `features.aiFocusNote` are booleans in `policy.json`. Absent means they follow `features.ai` (allowed when AI is allowed). They follow the existing two-sided pattern: validated in the main process (`loadPolicy`, `isFeatureAllowed`, preset defaults) and in the renderer (`parsePolicy`, `src/lib/features.tsx`), with the renderer learning them through the existing policy payload. The main process enforces `aiPeople` for every request whose task is in the `people` class.
- Settings → AI is reorganized into Connections, Feature routing, Privacy. No prompt fields.

### 5.8 Zero data loss in Apply

- Insert/append and create-new are the default effects. Overwriting content only through a diff the user accepts.
- A note change first captures a revision (existing note version history), so it is restorable.
- Tasks created by AI carry `sourceNoteId` where they come from a note (existing behavior). Without a parent/child link for tasks, "Break down" writes a markdown checklist into the task's details by default; creating separate tasks is an option the user picks in the preview. No schema change is required for the default.
- Eisenhower suggestions set only the two manual axes (`planImportant`, `planUrgent`), only after the user accepts, with the previous values restorable by undo.
- **Undo.** Apply records the previous values of exactly the fields it touched, and the panel offers Undo for the rest of the session. Notes are additionally restorable through version history (captured per Apply, before the change). A locked note is never an Apply target unless it is unlocked in the session; a locked, unopened note offers no AI actions at all.
- A failed or discarded result changes nothing.

### 5.9 Testing

- Prompt fixtures per task (5.2), including malformed and adversarial replies; parsers and validators table-tested.
- Framework tests: privacy preview, capability gating, repair attempt, discard-on-failure, apply is additive and undoable.
- Component tests for the result panel states and the Settings sections, in the style of the existing Settings AI tests.
- A small optional evaluation script that runs the fixtures against a local model so prompt changes can be compared; not part of the default test run.
- Data-safety review on every feature that writes.

## 6. Roadmap

Order within a phase is the build order. "Scope" is what the feature reads.

### Phase 0: foundation
**0a (before any Phase 1 feature):** F1 task framework and result panel · F2 prompt registry, fixtures · F3 connection profiles, routing, capabilities (text and JSON only) · F4a structured output (JSON) · F5 entry points · F6 privacy and policy controls · X1 move Ask AI and Extract tasks onto the framework (adds today's date and list routing to the extractor, context chip in Ask AI, lenses).
**0b (lands before the first feature that needs it, not before Phase 1):** F4b streaming (needed by H1) · F4c image input (needed by D5), and the matching `streaming` / `vision` capability probes.

### Phase 1: high value, low risk
| Id | Feature | Entry | Scope | Result | Apply |
|---|---|---|---|---|---|
| N1 | Visualize (text → Mermaid flowchart / sequence / state) | slash, bubble | selection | diagram + source | insert a Mermaid block; the source is checked with the Mermaid parser, one repair attempt |
| N2 | Challenge my idea | slash, bubble | the note | text | append as a separate block |
| T1 | Break down | task row, ⌘K | task title and details | checklist | write to details (default) or create tasks |
| P1 | Feedback → SBI | bubble in a person's note | selection | rewrite | diff, accept |

### Phase 2
| Id | Feature | Scope | Notes |
|---|---|---|---|
| D1 | ERD from natural language, iterative | the request + current ERD document | output validated by `parseErdDocument`; proposed layer on the canvas |
| D2 | Mock data from a JSON payload | the payload | inserted as a new tab/document |
| D4 | Excalidraw → Mermaid | the Sketch scene's elements (structured data, no vision) | |
| H1 | Digest: weekly retrospective and upward summary, one pipeline | aggregated activity for a window + optional selected notes | aggregated data, not raw notes, for the upward summary; streaming |
| N3 | Structure a scratchpad (Utilities → Document) | the document | |
| T2 | Eisenhower classifier | titles and details of unsorted tasks | proposes `planImportant` / `planUrgent` only |

### Phase 3
P2 smart 1:1 prep (`people`) · D5 screenshot → Mermaid / HTML (vision) · S1 Ask Workspace v1: keyword retrieval with the ⌘K search, top-k, answers cite and link the source notes; retrieval is filtered by data class (people-class records are included only when the routed connection is allowed for people data) and locked notes are excluded · S2 embeddings (later; needs its own design for the index and its encryption).

### Not AI
D3 JSON → TypeScript / Go / Zod / JSON Schema with deterministic libraries.

### Done
Local models through the custom gateway (Ollama verified).

## 7. Decisions

Made by the product owner
- Prompts are professional, embedded, and not shown to the user.
- Free-text additional instructions are risky and must be restricted (5.2.1, approved).
- `people` data: blocked by default; allowed per connection by an explicit one-click switch in Settings; "local" means loopback addresses only (`localhost`, `127.x`, `::1`), so a local Ollama is allowed by default and a LAN or company gateway is not; no per-use consent dialog; the organization can switch the class off with `features.aiPeople`.

My calls (change if you disagree)
- Version 1 has no free-text field at all; Focus note comes later under the constraints in 5.2.1.
- Legacy `extractionGuidance` / `systemPrompt` are preserved and shown read-only, not deleted.
- `people` data is blocked unless the routed connection is allowed for it.
- Code generation from JSON is deterministic, not AI.
- Excalidraw scene to Mermaid does not use vision.
- Ask Workspace v1 uses keyword retrieval, not embeddings.
- "Break down" writes a checklist into details by default.
- Extra connections and routing live inside `aiSettings`; `aiSettings` is always the default connection (5.3).
- Phase 0 is split into 0a and 0b; streaming and images do not block Phase 1.
- Legacy `systemPrompt` / `extractionGuidance` keep working as a constrained Focus note for the two features that used them, with a one-time notice.
- Apply has its own session-scoped Undo; notes also use version history.
- Policy flags follow the existing two-sided pattern and default to following `features.ai`.

## 8. Open questions

- Is a Focus note wanted at all after version 1? (Deferred: version 1 ships without it; decide when a real need appears.)

## 9. Where the work lands (pointers for the builder)

`src/lib/ai.ts` (engine; split prompts out), a new `src/lib/ai/` folder for the framework, registry and prompts, `src/components/` for the result panel (reuse `AppModal`, `ai-dialog` styles in `src/styles/dialogs.css`), `src/views/Settings.tsx` and `src/components/settings/` for the reorganized AI card, `src/lib/richTextSlashItems.ts` and `src/components/ui/RichTextBubbleToolbar.tsx` for entry points, `src/lib/commandPaletteSearch.ts` for ⌘K, `electron/main.cjs` and `electron/ipc/` for the `aiPeople` policy flag, `src/core/model/index.ts` for the expand-only connection list.
