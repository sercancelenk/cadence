# Cadence — Health Check & Product Roadmap

**Document version:** 1.9  
**Date:** 2026-06-04  
**App version reviewed:** `0.2.0`  
**Scope:** Static architecture review, data/security audit, test & CI assessment, mobile/PWA UX gap analysis, production-hardening verification  
**Status:** Living document — update after each major release or quarterly review

---

## Executive summary

Cadence is a **local-first leadership workspace** (Electron desktop + installable PWA) with todos, notes, teams/1:1s, agenda, analytics, optional LAN/cloud sync, and BYO-key AI. For an MVP at `0.2.x`, the project is **stronger than typical indie apps** in data durability, sync safety, and operator documentation.

The main gaps are not in the core desktop data path — they are in **sustainability** (very large source files), **LAN sync host UI refresh** (low priority for single-user companion use), and **mobile UX polish** (desktop-only affordances still visible on PWA).

**LAN sync intent (clarified 1.9):** One user, desktop host + phone/PWA client on the same Wi‑Fi — not multi-user collaboration. Conflicts are edge cases when both devices edit before sync; see [docs/LAN-SYNC.md](./LAN-SYNC.md).

### Overall health score

| Dimension | Score | One-line verdict |
|---|---:|---|
| Data reliability | **9.5 / 10** | Atomic writes, fsync refusal, quit flush, generation envelope, rolling snapshots — production-grade |
| Security (desktop) | **8.5 / 10** | contextIsolation + CSP + IPC whitelist + **sandbox enabled**; policy guard on sensitive IPC |
| Architecture clarity | **8.0 / 10** | Layered core + providers; todos + notes feature modules; selector migration started |
| Test & CI | **7.5 / 10** | 866 unit tests; Playwright smoke; electron persistence tests added |
| Documentation | **9.5 / 10** | README + operator docs + LAN companion guide |
| Mobile / PWA UX | **6.0 / 10** | Works; not yet a curated lite experience |
| Maintainability | **8.0 / 10** | Todos + Notes slimmed; Settings + main.cjs still oversized |
| **Composite** | **8.5 / 10** | **Ship-ready for personal desktop + phone companion via LAN** |

**Bottom line:** Safe to use Cadence as a daily driver on **Electron desktop** (verified: edit → quit → relaunch persist; export → delete → import restore). PWA data is separate, unencrypted, and browser-scoped — pair from the desktop host per [LAN-SYNC.md](./LAN-SYNC.md). LAN sync is **supported** for one-user / two-device workflow; simultaneous multi-device editing is discouraged.

---

## Methodology & limits

### What was reviewed

- Renderer (`src/`), Electron main/preload, CI workflows, test suite, README/docs
- Prior CI evidence: **866 unit tests across 75 files**, all passing (Vitest + jsdom + Playwright smoke)
- TypeScript: `strict: true`, `noUnusedLocals`, `noUnusedParameters`

### What was **not** verified in this review

Be skeptical of claims outside these boundaries:

| Gap | Impact |
|---|---|
| Live GitHub Actions run not inspected in this session | CI may have regressed since last green run |
| No interactive full-app QA pass | Visual/regression bugs possible |
| No `npm audit` / dependency CVE scan | Supply-chain risk unknown |
| `electron/main.cjs` (~4,600 lines) not line-audited end-to-end | IPC edge cases may exist |
| No load/stress test with large datasets (10k+ notes) | Performance ceiling unknown |
| No formal threat model / pen test | Security score is code-review grade, not audit grade |

---

## Architecture assessment

### Strengths

**1. Unidirectional data flow**

```
src/core/model/   → schema, migrations, normalizeData (single front door)
src/core/actions/ → pure state mutations (no I/O)
src/providers/    → React contexts (auth, account, theme, app data, notes unlock)
views/components  → UI only
src/lib/          → cross-cutting infra (sync, crypto, rich-text, features)
```

Legacy import paths (`src/model.ts`, `src/actions.ts`, `src/AppDataContext.tsx`, …) remain as **thin re-export shims** so existing imports keep working during migration.

`normalizeData()` is the canonical loader for disk, import, and sync pull. Version chain v1 → v2 → v3 is explicit. Optional fields (`sourceNoteId`, multi-line title rescue) are backward-compatible.

**2. Feature-flag architecture**

`src/lib/features.tsx` provides runtime gating (personal / work-standard / work-strict presets), disk `policy.json` override, and compile-time `CADENCE_DISTRIBUTION=enterprise`. Precedence rules are tested. Sensitive surfaces (sync, AI, export) gate from one source of truth.

**3. Sync abstraction**

Provider-agnostic `SyncBackend` interface; LAN and Google Drive coexist. Remote snapshots pass through `parseRemoteSnapshot()` before `replaceAll()` — prevents empty remote payloads from wiping local data.

**4. Lazy-loaded routes**

Heavy chunks (Markdown editor, People views, Utilities JSON/YAML) split via `React.lazy`. Important for PWA first paint. **Backlog:** `vendor-misc` (~1 MB) still catches CodeMirror + TipTap + misc deps — split in **B9**; fix circular `vendor-misc ↔ vendor-react` chunk graph.

### Risks

**God files — maintainability debt**

| File | ~Lines | Concern |
|---|---:|---|
| `electron/main.cjs` | 4,596 | IPC, auth, crypto, sync HTTPS server, updater, menu — monolith |
| `src/app.css` | 7,804 | Global stylesheet; high merge/regression risk |
| `src/views/Settings.tsx` | 3,245 | Dozens of sections in one component tree |
| `src/views/TodosPage.tsx` | ~317 | Orchestrator only; UI in `features/todos/` |
| `src/views/NotesPage.tsx` | ~207 | Orchestrator only; UI in `features/notes/` |

These sizes are manageable for one developer **today**. They become the primary source of fear-and-regression within 6–12 months of active feature work.

**Source layout (post-refactor, May 2026)**

| Path | Role |
|---|---|
| `src/providers/` | Auth, Account, Theme, AppData, NotesUnlock contexts + barrel `index.ts` |
| `src/core/model/` | Types, parsers, `normalizeData`, migrations |
| `src/core/actions/` | Pure `AppData` mutations (single module today; split by domain later) |
| `src/views/` | Route-level pages (Todos + Notes slimmed; Settings still oversized) |
| `src/features/todos/` | Todo row, section, toolbar, hooks, preferences |
| `src/features/notes/` | Notes sidebar, editor, lock dialogs, crypto hooks, sort/utils |
| `src/lib/` | Sync, crypto, rich-text, features, utilities |
| `src/*.tsx` shims | Backward-compatible re-exports from old root paths |

**Duplicated branding**

`electron/branding.cjs` and `src/lib/appBranding.ts` must stay in sync manually. Drift risk is real.

**Untested mutation layer**

~~`actions.ts` (~890 lines of pure functions) has **no dedicated unit tests**.~~ **Resolved in A5** — `actions.mutation.test.ts` + `actions.coverage.test.ts`. Keep coverage when adding new mutations.

---

## Data reliability (strongest area)

Reference implementations in:

- `electron/main.cjs` — `writeJsonText()`, `writeUserData()`, `snapshotCurrentDataFile()`
- `src/providers/AppDataContext.tsx` — debounced save, flush-on-exit, fingerprint shrink detection
- `src/core/model/index.ts` — `normalizeData()`, migrations, defensive parsers

### Desktop durability guarantees

| Mechanism | What it prevents |
|---|---|
| **Atomic write + fsync + rename** | Torn/half-written JSON on crash or power loss |
| **Pre-save snapshot (50 rolling)** | Logic bug or bad save destroying previous good state |
| **Refuse-to-overwrite undecipherable file** | Key mismatch → one keystroke → encrypted data gone |
| **Refuse write without encryption key** | Plaintext downgrade of encrypted account |
| **400 ms debounce + pagehide/visibility flush + quit-coordinated flush** | Lost last keystrokes on abrupt close (≤400 ms worst case without quit path) |
| **fsync failure → refuse commit** | False "saved" when disk durability not confirmed |
| **CDNC1 commit envelope + writeGeneration (IPC)** | Stale renderer / concurrent writer overwriting newer disk state |
| **persistQueue serial writes** | Out-of-order async IPC completion clobbering newer snapshot |
| **Boot fingerprint banner** | Silent mass data shrink on next launch |
| **Global save-failure banner** | Silent autosave failure |
| **Export / Import JSON + pre-restore snapshot** | Manual portable backup; import is reversible |

### Migration safety (recent work)

- **`sourceNoteId`** — optional field; old JSON loads fine (`undefined`, not dropped)
- **Multi-line title rescue** — splits pasted blob in `title` into title + body on load; **0-byte loss** (rescued lines prepended to existing body); idempotent after first save
- **Sort modes (created/updated/completed)** — UI-only; does not mutate persisted `sortOrder`
- **Rich-text (Tiptap / ProseMirror)** — legacy markdown bodies load unchanged until first edit; `bodyFormat` optional; sidecar attachments are additive (inline `data:image` in old markdown unaffected by orphan GC)
- **Notes list stability** — editor mount no longer bumps `updatedAt` via no-op patch guard + onChange dedupe
- **Notes preview/edit** — Preview/Edit tabs on note body; toolbar only in edit mode; double-click to edit
- **Editor UX (shared pane)** — `RichTextDocumentPane`: sticky Preview/Edit tabs, sticky toolbar, Esc → preview, autosave indicator (Saving… / Saved), ⌘B/⌘I/⌘Z hints
- **Utilities → Document** — sidebar section with standalone scratch document (`utilityDocument` in workspace JSON); not a note or todo
- **Utilities → JSON / YAML** — CodeMirror editor with folding, validation, pretty-print, side-by-side diff (Before/After buffers), JSON-only compact/stringify; autosaved as `utilityStructuredText`
- **Global search → todos** — palette deep-links with `?focus=`; filters relax so the row is visible

### Recent delivery log (since v1.0 health check)

*Completed work that improves ship-readiness or maintainability.*

| Area | Done |
|---|---|
| **Rich text** | `RichTextEditor` (Tiptap) in Notes, Todos, QuickAdd; ProseMirror JSON + `bodyPlainText`; markdown import on read |
| **Attachments** | Sidecar files, `cadence-attachment://`, orphan GC, backup folder copy, LAN manifest sync, export/import bundle |
| **Stability** | Notes reorder-on-click fix; CommandPalette todo focus; filter reveal on deep-link |
| **Architecture (Phase B0)** | `src/providers/`, `src/core/model/`, `src/core/actions/`; root re-export shims (zero runtime impact) |
| **Architecture (Phase B2, partial)** | `src/features/todos/` — row, section, toolbar, hooks; `TodosPage` ~317 lines |
| **Architecture (Phase B2, notes)** | `src/features/notes/` — sidebar, editor, lock dialogs, hooks; `NotesPage` ~207 lines |
| **Notes UX** | Preview/Edit mode on note body; toolbar hidden until Edit |
| **Editor UX** | Shared `RichTextDocumentPane`; Esc → preview; sticky tabs + toolbar; save status |
| **Utilities** | Sidebar **Utilities** section; **Document** scratch pad; **JSON / YAML** editor with Edit/Diff, folding, format/validate, JSON compact/stringify |
| **Production hardening (Phase F)** | fsync refusal; before-quit renderer flush; sandbox; CDNC1 envelope; IPC policy guard; crash reporting init; `usePersistStatus` / selector migration (Notes, Todos, shell); `STORAGE_PREFIX` fix; manual smoke: restart persist + backup restore **verified 2026-06-04** |
| **LAN sync docs** | [docs/LAN-SYNC.md](./LAN-SYNC.md) — single-user companion workflow |

*Not done yet — still on the roadmap below.*

| Area | Status |
|---|---|
| Slash commands / floating toolbar in editor | Planned (editor polish) |
| Todos toolbar / section / inline-add extract | **Done** (B2 todos) |
| Split `NotesPage` | **Done** (B2 notes) |
| Split `Settings.tsx` | Planned (B1) |
| Split `core/actions/` by domain | Planned (B7, after A5 tests) |
| `actions.ts` unit tests | **Done** (A5) |
| Mobile lite nav + hide desktop-only Settings | **Done** (A1–A3) |
| Smoke E2E | **Done** (A4) |
| GDrive attachment blobs | Out of scope v1; JSON sync only |
| ESLint / Prettier, CSS split, `main.cjs` modularize | Planned (B3–B6) |
| LAN host UI reload on remote push | Planned (G1) — low priority for companion use |
| Auto-sync 412 visible toast | Planned (G2) |
| Full `useAppData()` → selector migration | Planned (G3) — Settings, CommandPalette, etc. |

### PWA caveats (by design, documented)

- Data in browser `localStorage` — **not encrypted** by the app
- Separate from desktop encrypted file unless synced (LAN QR or Drive) or manually exported/imported
- No rolling on-disk snapshots — rely on Export JSON

---

## Security assessment

### Electron (good baseline)

- `contextIsolation: true`, `nodeIntegration: false`
- Preload exposes whitelisted IPC only (`electron/preload.cjs`)
- Production CSP: `script-src 'self'` (strict); dev relaxes for Vite HMR
- Password: scrypt hash; data key: AES-256-GCM derived at login
- LAN sync: HTTPS + token; self-signed cert (documented one-time phone warning)
- Cloud sync: E2E encrypted snapshots before upload; Drive sees ciphertext only

### Open questions

- **`sandbox: true`** — enabled in `createWindow` (2026-06 production hardening). Preload + contextIsolation remain the primary renderer isolation boundary.
- **AI keys in workspace JSON** — encrypted at rest on desktop when account encryption active; still decrypted in renderer memory during use. Expected for BYO-key; enterprise strict preset disables AI entirely.

### PWA threat model

Assume: anyone with device unlock can read `localStorage`. Mitigation = OS-level disk encryption + optional notes passphrase (desktop-grade lock UX on PWA still incomplete).

---

## Test & quality

### Current coverage (good)

866 tests across 75 files, focused on high-risk libs:

| Module | Tests (approx.) | Why it matters |
|---|---:|---|
| `model.test.ts` + migrations | 16+ | Migrations, shrink detection, title rescue |
| `actions.mutation.test.ts` + coverage | 50+ | Pure mutations — every write path |
| `structuredText.test.ts` | 16 | JSON/YAML format, validation |
| `features.test.ts` | 26 | Policy precedence, enterprise build |
| `gdrive.test.ts` | 19 | Sync push/pull, conflicts, retries |
| `lanSyncClient.test.ts` | 15 | Pairing URL/token handling |
| `useSyncAutoSync.test.ts` | 10+ | Auto-sync algorithm |
| `commitEnvelope.test.ts` | 4 | CDNC1 envelope round-trip |
| `writeGeneration.test.ts` | — | Generation commit rules |
| `policyGuard.test.ts` | — | Sensitive IPC gating |
| `persistQueue.test.ts` | — | Serial persist ordering |
| Playwright smoke | 1 scenario | Register → todo → reload |

CI (`.github/workflows/ci.yml`) on every push/PR: `tsc` → `npm test` → `build:web` → `build:pwa`.

### Gaps (roadmap drivers)

| Gap | Severity | Notes |
|---|---|---|
| No broad E2E suite | Medium | Smoke path covered; notes/LAN/sync flows manual |
| No UI/component tests (except AccountContext) | Medium | Regressions in TodosPage/NotesPage undetected |
| `electron/main.cjs` integration tests | Medium | `commitEnvelope`, `writeGeneration`, `policyGuard` unit-tested; HTTP server not |
| No coverage gate in CI | Low | `@vitest/coverage-v8` present; A6 added coverage run |
| No ESLint / Prettier | Low | Style/consistency relies on author discipline |
| No Dependabot / audit automation | Low | Supply-chain hygiene (D2) |

---

## Mobile / PWA UX

The PWA **works** as a **companion** surface (drawer nav, safe-area, launch → `/todos`, offline shell, LAN sync pair/pull). Desktop remains the primary workspace; phone = capture, agenda, quick edits, sync from host.

### Product definition (agreed 2026-06)

| Role | Mobile (PWA) | Desktop (Electron) |
|---|---|---|
| Primary use | To-dos, Agenda, Notes capture, LAN pull | Full workspace: Teams, 1:1, Planning matrix, backups, restore |
| Data authority | Same account; often synced from desktop host | Authoritative encrypted file + rolling snapshots |
| Navigation | Lite sidebar via `isMobileWeb()` | Full sidebar |

**Core mobile features (ship / keep):** To-dos, Agenda, Notes, Quick add, Search, Export JSON, LAN sync, PWA reminders (where OS supports).

**Hide or defer on mobile:** snapshot restore, folder import, PIN, Teams/People editing, Utilities editors, Analytics/Activity (read-only deep links OK).

### Lite-mode status (`src/lib/runtime.ts`)

```ts
isElectronApp()    // !!window.cadence?.saveData
isMobileViewport() // matchMedia('(max-width: 700px)')
isMobileWeb()      // mobile viewport && !isElectronApp()
```

| Surface | Status | Notes |
|---|---|---|
| Backups & Recovery restore UI | **Done 1.8** | Electron-only block; PWA gets JSON export |
| PIN protection | **Done 1.8** | Hidden when not Electron |
| Save / integrity banners | **Done 1.8** | PWA → Export backup; desktop → Open Backups |
| Lite sidebar nav | **Done 0.3** | Agenda, Planning, To-dos, Notes, Profile, Settings |
| PWA storage card | **Done 1.8** | Workspace breakdown + Reload web assets |
| Top bar team switcher | **Phase M1** | Still visible on ≤700px; hide when not in team context |
| Planning touch UX | **Phase M1** | Matrix stacks on narrow screens; drag weak on touch — add tap-to-quadrant |
| Bottom tab bar | **Phase M2** | Optional; drawer OK for now |

---

## CI/CD & operations

### Strengths

- Reusable CI workflow; release is manual + CI-gated
- macOS signed + notarized release pipeline
- PWA deploy via GitHub Pages (`pages.yml`)
- `scripts/check-env.mjs` pre-release sanity checks
- `scripts/patch-publish.mjs` fixes GitHub publish target at release time

### Operational traps

| Trap | Mitigation |
|---|---|
| `package.json` publish block contains `YOUR_GITHUB_USERNAME` placeholder | Always release via GitHub Actions, not raw `npm run build:release` locally |
| Dev vs prod data dirs (`Cadence (Dev)/`) | Documented; dev never touches production userData |
| PWA stale service worker | Settings → Reload web assets; bump `CACHE_VERSION` in `sw.js` on deploy |

---

## Roadmap — path to "near-flawless"

Prioritized by **risk reduction × user impact × effort**. Each item has an ID for discussion.

### Phase A — Trust & polish (4–6 weeks)

*Goal: No dead-end UI; no silent regressions on core flows.*

| ID | Item | Effort | Impact | Notes |
|---|---|---|---|---|
| **A1** | **Mobile lite navigation** | M | High | **Done 0.3** | Sidebar lite on `isMobileWeb()`: Agenda, Planning, Todos, Notes, Profile, Settings |
| **A2** | **Hide desktop-only Settings sections on PWA** | S | High | **Done 1.8** | Backups/PIN hidden; mobile storage card |
| **A3** | **Context-aware error banners** | S | Medium | **Done 1.8** | PWA → Export backup; desktop → Open Backups |
| **A4** | **Smoke E2E test (1 scenario)** | M | High | **Done 1.8** | Playwright: register → add todo → reload |
| **A5** | **`actions.ts` unit tests** | M | Medium | **Done 1.8** | `src/core/actions/actions.test.ts` |
| **A6** | **CI coverage gate (lib/)** | S | Medium | **Done 1.8** | `npm run test:coverage` in CI |

**Exit criteria for Phase A:** A new user on iPhone PWA sees no link that leads to "desktop only" text. CI blocks PRs that break the smoke path.

---

### Phase M — Mobile companion polish (post-0.3.0)

*Goal: Responsive, touch-friendly companion UX without pretending the phone is a desktop app. **Scheduled after v0.3.0 release** — do not block the desktop/docs ship.*

| ID | Item | Effort | Impact | Status | Notes |
|---|---|---|---|---|---|
| **M1** | **TopBar team switcher on mobile web** | S | Medium | Planned | Hide `team-switcher` when `isMobileWeb()` and user is not on a `/teams/:id` route |
| **M1** | **Planning touch UX** | M | Medium | Planned | Quadrant picker menu on cards (tap) alongside drag; focus strip stays scrollable |
| **M1** | **Sidebar order + labels** | S | Low | Planned | Agenda → To-dos → Notes → Planning → Account; optional badge hints |
| **M1** | **Settings sync copy on PWA** | S | Low | Planned | LAN QR block: explicit "pair from desktop host" when `isMobileWeb()` |
| **M2** | **Bottom tab bar (optional)** | M | Medium | Planned | To-dos \| Agenda \| Notes \| More (Planning, Profile, Settings); drawer remains fallback |
| **M2** | **Planning nav on small phones** | S | Low | Planned | Consider moving Planning under "More" only on `<600px` if matrix feels cramped |
| **M2** | **Short mobile welcome tour** | S | Low | Planned | Fewer steps; skip Teams/Analytics callouts |
| **M3** | **Teams read-only deep links** | M | Low | Deferred | Notification / palette → person agenda preview; no full People editor on phone |
| **M3** | **Analytics read-only on tablet** | S | Low | Deferred | Show Analytics in nav only when `min-width: 900px` PWA |

**Exit criteria for Phase M1:** iPhone PWA user can complete daily loop (agenda → todo → note) without horizontal scroll or dead-end; Planning classifiable without drag.

**Principle (unchanged):**

> If a feature cannot work on this runtime, do not show its link, button, or settings card in primary navigation. Routes may remain for deep links and command palette.

---

### Phase B — Maintainability (6–10 weeks, parallel-friendly)

*Goal: Change velocity stays high as features accumulate.*

| ID | Item | Effort | Impact | Status | Notes |
|---|---|---|---|---|---|
| **B0** | **`src/providers/` + `src/core/` layout** | S | Medium | **Done** | Contexts + model/actions moved; root shims preserve old import paths |
| **B1** | **Split `Settings.tsx`** | L | Medium | Planned | `src/views/settings/*.tsx` — one file per section; thin orchestrator in `Settings.tsx`. |
| **B2** | **Split `TodosPage.tsx` / `NotesPage.tsx`** | L | Medium | **Done** | `features/todos/` + `features/notes/`; pages ~317 / ~207 lines |
| **B3** | **Modularize `main.cjs`** | L | High | Planned | `electron/data/`, `electron/sync/`, `electron/auth/` — keep IPC table in one registry file. |
| **B4** | **CSS architecture** | L | Medium | Planned | Split `app.css` by domain (`shell`, `todos`, `notes`, `settings`) or CSS modules for new code. |
| **B5** | **Unify branding** | S | Low | Planned | Generate renderer constants from `branding.cjs` at build time, or shared JSON. |
| **B6** | **ESLint + Prettier** | S | Medium | Planned | `@typescript-eslint`, React hooks rules; format on CI. |
| **B7** | **Split `core/actions/` by domain** | M | Medium | Planned | `todos.ts`, `notes.ts`, `teams.ts` + barrel; after A5 test coverage. |
| **B8** | **Remove root re-export shims** | S | Low | Planned | Once all imports point at `providers/` and `core/`; optional codemod. |
| **B9** | **Vite vendor chunk split** | M | Medium | Planned | Break up `vendor-misc` (~1 MB / 373 KB gzip): `vendor-codemirror`, `vendor-tiptap`; resolve circular chunk with `vendor-react`. Do **not** merely raise `chunkSizeWarningLimit`. Utilities editor already lazy — this improves first paint (PWA) and parse time. |

**Exit criteria for Phase B:** No source file >1,500 lines without explicit exception. New features don't require editing `app.css` past line 6000.

### Phase C — Product depth (ongoing, aligns with README Tier 2–3)

*Goal: Differentiation beyond "yet another todo app".*

| ID | Item | Source | Effort |
|---|---|---|---|
| **C1** | Cycle / Quarter OKR scope | README 2.1 | L |
| **C2** | 1:1 / review templates | README 2.2 | M |
| **C3** | Person attributes (tenure, TZ, manager) | README 2.3 | M |
| **C4** | iCal export | README 2.4 | M |
| **C5** | Field-level sync merge (LWW per item) | README 2.5 | XL |
| **C6** | Manual note ↔ todo linking | README post-MVP 4.7 | M |
| **C7** | Cross-link integrity on delete | README 4.9 | S |
| **C8** | **Utilities: JSON / YAML editor** — **Done** (Edit/Diff, folding, format/validate, JSON compact/stringify) | Product | M |

These are **product** bets, not health fixes. Schedule after Phase A unless user demand says otherwise.

*Editor polish (not Phase C bets): slash commands, floating toolbar — deferred from current sprint.*

---

### Phase D — Platform & ops (when audience grows)

| ID | Item | Trigger |
|---|---|---|
| **D1** | Windows + Linux signed release CI | First non-Mac user cohort |
| **D2** | Dependabot + monthly `npm audit` | Before public marketing push |
| **D3** | Performance budget (10k todos, 1k notes) | User reports slow load |
| **D4** | Electron sandbox investigation | **Done (F5)** — sandbox enabled; revisit if native feature breaks |
| **D5** | Optional encrypted PWA (Web Crypto + passphrase) | Enterprise mobile ask |

---

### Phase E — Reminders ship & QA (2026-05-31 session)

*Goal: Native + PWA reminders are reliable in production; gaps are documented, not forgotten.*

**Shipped in code (this release)**

| Area | Status |
|---|---|
| macOS OS schedule + click agent | Done |
| Windows ScheduledToast helper | Done |
| Linux tray + launch-at-login | Done |
| PWA SW `showTrigger` + fallback watcher | Done |
| Deep links `cadence://todo/:id`, `cadence://item/:id` | Done |
| `parseRemoteSnapshot` on GDrive pull | Was done |
| `parseRemoteSnapshot` on Settings JSON import + LAN pull | **Fixed 1.7** |
| Reminder fire → merge (not `replaceAll`) | **Fixed 1.7** |
| Delete todo/item → cancel OS/SW slots | **Fixed 1.7** |
| Deep-link `?focus=` waits for data load | **Fixed 1.7** |
| RichText debounced save flush on unmount | **Fixed 1.7** |
| PWA SW reschedule when title/body changes | **Fixed 1.7** |

**Manual QA checklist (run before tagging reminder release)**

- [ ] macOS: schedule todo reminder → quit app → notification fires → click opens todo
- [ ] macOS: schedule team-item reminder → click opens person workspace item
- [ ] macOS: clear reminder → OS notification cancelled (no ghost fire)
- [ ] Windows: same three cases with helper present
- [ ] Linux: in-process fire with app running; tray icon visible; launch-at-login toggle
- [ ] PWA (Chrome): schedule → close tab → notification fires → click navigates
- [ ] PWA: edit reminder title after schedule → notification shows new title
- [ ] Edit todo title while reminder fires → title not reverted by sync event
- [x] Import `{}` JSON → rejected, workspace unchanged *(backup restore QA 2026-06-04)*
- [ ] LAN pair pull with malformed body → rejected

**Production data QA (2026-06-04 — verified by operator)**

- [x] Edit note → quit app → relaunch → edit persisted
- [x] Full backup export → delete note → import backup → note restored

**Deferred (roadmap — not blockers for personal use)**

| ID | Item | Notes |
|---|---|---|
| **E1** | Auto-sync pull merge strategy | **Done 1.8** — fingerprint re-check + editor flush before apply; skips pull when local edits in flight |
| **E2** | Reminder E2E tests | Playwright: set remindAt → mock time / wait → assert notification or `notifiedReminderIds` |
| **E3** | Linux Tier C systemd user unit | Optional headless schedule without tray; document in electron-guide |
| **E4** | Double-notification race audit | Electron in-process + OS adapter on same slot; monitor in QA |
| **E5** | Settings ≥50 pending OS reminders UX | Warning exists; consider bulk cancel |

**Removed doc:** `docs/reminder-scheduling-plan.md` — content merged into `electron-guide.md` §9 and this Phase E table.

---

### Phase F — Production hardening (2026-06-04)

*Goal: Close structural data-loss and desktop security gaps identified in architecture review before `0.2.x` personal release.*

| ID | Item | Status | Notes |
|---|---|---|---|
| **F1** | fsync failure refuses commit (no false success) | **Done** | `writeJsonText` returns `{ ok: false, reason: 'durability' }` |
| **F2** | Quit-coordinated flush (`app:request-flush` → `flushPendingSaveSync`) | **Done** | 2.5 s timeout fallback |
| **F3** | `persistQueue` drain before sync flush | **Done** | Renderer `flushPendingSave` |
| **F4** | CDNC1 commit envelope + writeGeneration on IPC save | **Done** | `electron/persistence/commitEnvelope.cjs` |
| **F5** | Electron `sandbox: true` | **Done** | `createWindow` |
| **F6** | IPC policy guard (export/import/update/sync.rotate) | **Done** | `electron/ipc/policyGuard.cjs` |
| **F7** | Local crash reporting init | **Done** | `electron/crashReporting.cjs` |
| **F8** | React selector migration (hot paths) | **Partial** | Notes, Todos, Sidebar, TopBar, Layout, `usePersistStatus` |
| **F9** | `STORAGE_PREFIX` import fix (PWA accounts) | **Done** | `AccountContext.tsx` |
| **F10** | Manual smoke: edit → quit → relaunch | **Verified** | User QA 2026-06-04 (dev mode) |
| **F11** | Manual smoke: export → delete → import restore | **Verified** | User QA 2026-06-04 |

**Exit criteria:** Desktop single-user daily use with backup/restore confidence — **met**.

---

### Phase G — LAN sync polish (optional)

*Goal: Improve multi-device UX when the same user edits on phone + desktop. **Not required** for the companion workflow documented in [LAN-SYNC.md](./LAN-SYNC.md) (sequential edit, desktop primary).*

| ID | Item | Effort | Priority | Notes |
|---|---|---|---|---|
| **G1** | Host renderer reload after LAN POST | M | Low | Phone push updates disk but host UI may lag until reload |
| **G2** | Auto-sync 412 → toast/banner | S | Low | Currently silent; manual Settings resolves |
| **G3** | Return `writeGeneration` in LAN GET/POST | S | Low | Unify HTTP ETag + IPC generation tracking |
| **G4** | Require `If-Match` on all LAN POSTs | S | Low | Remove legacy last-write-wins |
| **G5** | LAN sync integration test (push/pull/conflict) | M | Medium | HTTP handler + client round-trip |

**Deferred (not needed for single-user companion):** field-level merge (C5), CRDT/OT.

---

## Suggested discussion agenda

Use this doc as the agenda. Recommended order:

1. **Do we agree on the 7.8 composite score and the Phase A priority?**  
   Mobile lite UX (A1–A3) vs smoke E2E (A4) — which ships first?

2. **PWA product definition** — **Decided (2026-06): companion.** Teams/Analytics stay out of lite nav; Phase **M** tracks touch polish. See [USER-GUIDE.md](./USER-GUIDE.md).

3. **"Near-flawless" definition**  
   Pick 2–3 non-negotiables, e.g.:  
   - Zero dead-end links on PWA  
   - Smoke E2E green on every PR  
   - No file >2k lines by v0.3

4. **Timeline vs README Tier 2**  
   Phase C items compete for the same weeks as Phase B refactors. Prefer stability (B) before OKRs (C)?

5. **Release cadence**  
   **v0.3.0** ships desktop feature set + docs; **Phase M** follows as mobile-only PRs. Release workflow bumps `0.3.<run_number>`.

---

## Appendix — key file references

| Concern | Primary files |
|---|---|
| Data persist | `src/providers/AppDataContext.tsx`, `electron/main.cjs` (`writeUserData`, `writeJsonText`) |
| Schema / migration | `src/core/model/index.ts`, `src/core/model/model.test.ts` |
| Mutations | `src/core/actions/index.ts` (shim: `src/actions.ts`) |
| React providers | `src/providers/index.ts` (barrel), individual `*Context.tsx` |
| Feature flags | `src/lib/features.tsx` |
| Rich text | `src/components/ui/RichTextEditor.tsx`, `src/components/ui/RichTextDocumentPane.tsx`, `src/lib/richTextBody.ts` |
| Attachments | `electron/main.cjs` (GC, backup), `src/lib/richTextAttachmentStore.ts`, `src/lib/lanAttachmentSync.ts` |
| Sync safety | `src/lib/syncSnapshotGuard.ts`, `src/lib/useSyncAutoSync.ts`, [docs/LAN-SYNC.md](./LAN-SYNC.md) |
| Production persist | `electron/persistence/commitEnvelope.cjs`, `electron/persistence/writeGeneration.cjs`, `src/lib/persistQueue.ts` |
| Reminders | `electron/reminder/`, `src/lib/reminderDelivery/`, `public/sw.js` |
| Mobile shell | `src/lib/runtime.ts`, `src/components/Layout.tsx`, `src/components/AppSidebar.tsx`, `src/app.css` (`@media max-width: 700px`) |
| Todos UI | `src/views/TodosPage.tsx`, `src/features/todos/` |
| Notes UI | `src/views/NotesPage.tsx`, `src/features/notes/` |
| Utilities | `src/views/UtilitiesDocumentPage.tsx`, `src/views/UtilitiesStructuredPage.tsx`, `PATH_UTILITIES_*` in `src/lib/routes.ts`, `src/lib/structuredText.ts` |
| Settings surface | `src/views/Settings.tsx` |
| CI | `.github/workflows/ci.yml`, `.github/workflows/release.yml` |
| Operator docs | `README.md`, `docs/DEPLOYMENT-AND-POLICY.md`, `docs/ENTERPRISE.md`, `docs/LAN-SYNC.md` |
| Import safety guide | `README.md` § "Importing a big batch of notes (or todos) safely" |

---

## Revision history

| Version | Date | Author | Changes |
|---|---|---|---|
| 2.0 | 2026-06-10 | v0.3.0 release prep | Phase **M** mobile companion polish (post-0.3.0); PWA product definition locked; mobile UX table updated; A1 includes Planning; release cadence → 0.3.x |
| 1.9 | 2026-06-04 | Production release prep | Phase F production hardening (verified smoke QA); Phase G LAN polish backlog; [LAN-SYNC.md](./LAN-SYNC.md); scores 8.5 composite; sandbox done; 866 tests |
| 1.8 | 2026-05-31 | Production hardening | E1 auto-sync guard; Phase A1–A6 (mobile UX, E2E, actions tests, coverage CI); person-delete reminder cancel |
| 1.7 | 2026-05-31 | Reminder QA + import safety | Phase E; P0/P1 bug fixes (import/LAN guard, reminder merge, focus deep links, delete cancel, SW reschedule); removed `reminder-scheduling-plan.md` |
| 1.6 | 2026-05-31 | DX + backlog | `npm run typecheck` / `check`; backlog **B9** vendor chunk split; TS fix note in release path |
| 1.5 | 2026-05-31 | Utilities JSON/YAML | C8 shipped: CodeMirror editor, folding, Edit/Diff, format/validate, JSON compact/stringify; shared sync hooks; landing + README updated |
| 1.4 | 2026-05-31 | Editor UX + Utilities | `RichTextDocumentPane`; Esc/sticky/save status; Utilities sidebar + Document; C8 JSON/YAML editor on roadmap |
| 1.3 | 2026-05-31 | B2 notes complete — `features/notes/` module; NotesPage ~207 lines; preview/edit mode |
| 1.2 | 2026-05-31 | B2 todos complete — `features/todos/` module; TodosPage ~315 lines |
| 1.1 | 2026-05-31 | Architecture refactor session | B0 layout (`providers/`, `core/`); rich-text & attachment delivery log; updated scores & appendix |
| 1.0 | 2026-05-31 | Health check session | Initial analysis + phased roadmap |
