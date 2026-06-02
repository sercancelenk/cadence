# Cadence — Health Check & Product Roadmap

**Document version:** 1.2  
**Date:** 2026-05-31  
**App version reviewed:** `0.2.0`  
**Scope:** Static architecture review, data/security audit, test & CI assessment, mobile/PWA UX gap analysis  
**Status:** Living document — update after each major release or quarterly review

---

## Executive summary

Cadence is a **local-first leadership workspace** (Electron desktop + installable PWA) with todos, notes, teams/1:1s, agenda, analytics, optional LAN/cloud sync, and BYO-key AI. For an MVP at `0.2.x`, the project is **stronger than typical indie apps** in data durability, sync safety, and operator documentation.

The main gaps are not in the core data path — they are in **sustainability** (very large source files), **test pyramid depth** (no E2E, minimal UI tests), and **mobile UX polish** (desktop-only affordances still visible on PWA).

### Overall health score

| Dimension | Score | One-line verdict |
|---|---:|---|
| Data reliability | **9.0 / 10** | Atomic writes, rolling snapshots, refuse-to-overwrite — production-grade |
| Security (desktop) | **8.0 / 10** | contextIsolation + CSP + IPC whitelist; sandbox disabled |
| Architecture clarity | **7.5 / 10** | Layered core + providers; todos feature module started |
| Test & CI | **6.5 / 10** | Critical libs well tested; UI/E2E missing |
| Documentation | **9.0 / 10** | README + operator docs unusually thorough |
| Mobile / PWA UX | **6.0 / 10** | Works; not yet a curated lite experience |
| Maintainability | **7.5 / 10** | TodosPage slimmed; Settings/Notes still oversized |
| **Composite** | **8.0 / 10** | **Ship-ready for personal use; not yet "flawless"** |

**Bottom line:** Safe to migrate notes and todos into Cadence **if** you follow the backup habits documented in README (`Export JSON` before/after bulk import, watch save banners). The app will not silently lose acknowledged writes on desktop. PWA data is separate, unencrypted, and browser-scoped — treat it accordingly.

---

## Methodology & limits

### What was reviewed

- Renderer (`src/`), Electron main/preload, CI workflows, test suite, README/docs
- Prior CI evidence: **133 unit tests across 9 files**, all passing (Vitest + jsdom)
- TypeScript: `strict: true`, `noUnusedLocals`, `noUnusedParameters`

### What was **not** verified in this review

Be skeptical of claims outside these boundaries:

| Gap | Impact |
|---|---|
| Live GitHub Actions run not inspected in this session | CI may have regressed since last green run |
| No interactive full-app QA pass | Visual/regression bugs possible |
| No `npm audit` / dependency CVE scan | Supply-chain risk unknown |
| `electron/main.cjs` (~3,650 lines) not line-audited end-to-end | IPC edge cases may exist |
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

Heavy chunks (Markdown editor, People views) split via `React.lazy`. Important for PWA first paint.

### Risks

**God files — maintainability debt**

| File | ~Lines | Concern |
|---|---:|---|
| `electron/main.cjs` | 3,657 | IPC, auth, crypto, sync HTTPS server, updater, menu — monolith |
| `src/app.css` | 7,804 | Global stylesheet; high merge/regression risk |
| `src/views/Settings.tsx` | 3,245 | Dozens of sections in one component tree |
| `src/views/TodosPage.tsx` | ~315 | Orchestrator only; UI in `features/todos/` |
| `src/views/NotesPage.tsx` | ~1,998 | Editor + backlinks + sort/filter in one file |

These sizes are manageable for one developer **today**. They become the primary source of fear-and-regression within 6–12 months of active feature work.

**Source layout (post-refactor, May 2026)**

| Path | Role |
|---|---|
| `src/providers/` | Auth, Account, Theme, AppData, NotesUnlock contexts + barrel `index.ts` |
| `src/core/model/` | Types, parsers, `normalizeData`, migrations |
| `src/core/actions/` | Pure `AppData` mutations (single module today; split by domain later) |
| `src/views/` | Route-level pages (Todos slimmed; Notes/Settings still oversized) |
| `src/features/todos/` | Todo row component, body helpers, preferences constants, UI utils |
| `src/lib/` | Sync, crypto, rich-text, features, utilities |
| `src/*.tsx` shims | Backward-compatible re-exports from old root paths |

**Duplicated branding**

`electron/branding.cjs` and `src/lib/appBranding.ts` must stay in sync manually. Drift risk is real.

**Untested mutation layer**

`actions.ts` (~890 lines of pure functions) has **no dedicated unit tests**. Bugs here affect every write path.

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
| **400 ms debounce + pagehide/visibility flush** | Lost last keystrokes on abrupt close (≤400 ms worst case) |
| **Boot fingerprint banner** | Silent mass data shrink on next launch |
| **Global save-failure banner** | Silent autosave failure |
| **Export / Import JSON + pre-restore snapshot** | Manual portable backup; import is reversible |

### Migration safety (recent work)

- **`sourceNoteId`** — optional field; old JSON loads fine (`undefined`, not dropped)
- **Multi-line title rescue** — splits pasted blob in `title` into title + body on load; **0-byte loss** (rescued lines prepended to existing body); idempotent after first save
- **Sort modes (created/updated/completed)** — UI-only; does not mutate persisted `sortOrder`
- **Rich-text (Tiptap / ProseMirror)** — legacy markdown bodies load unchanged until first edit; `bodyFormat` optional; sidecar attachments are additive (inline `data:image` in old markdown unaffected by orphan GC)
- **Notes list stability** — editor mount no longer bumps `updatedAt` via no-op patch guard + onChange dedupe
- **Global search → todos** — palette deep-links with `?focus=`; filters relax so the row is visible

### Recent delivery log (since v1.0 health check)

*Completed work that improves ship-readiness or maintainability.*

| Area | Done |
|---|---|
| **Rich text** | `RichTextEditor` (Tiptap) in Notes, Todos, QuickAdd; ProseMirror JSON + `bodyPlainText`; markdown import on read |
| **Attachments** | Sidecar files, `cadence-attachment://`, orphan GC, backup folder copy, LAN manifest sync, export/import bundle |
| **Stability** | Notes reorder-on-click fix; CommandPalette todo focus; filter reveal on deep-link |
| **Architecture (Phase B0)** | `src/providers/`, `src/core/model/`, `src/core/actions/`; root re-export shims (zero runtime impact) |
| **Architecture (Phase B2, partial)** | `src/features/todos/` — row, section, toolbar, hooks; `TodosPage` ~315 lines |

*Not done yet — still on the roadmap below.*

| Area | Status |
|---|---|
| Todos toolbar / section / inline-add extract | **Done** (B2 todos) |
| Split `NotesPage` | Planned (B2 remainder) |
| Split `Settings.tsx` | Planned (B1) |
| Split `core/actions/` by domain | Planned (B7, after A5 tests) |
| `actions.ts` unit tests | Planned (A5) |
| Mobile lite nav + hide desktop-only Settings | Planned (A1–A3) |
| Smoke E2E | Planned (A4) |
| GDrive attachment blobs | Out of scope v1; JSON sync only |
| ESLint / Prettier, CSS split, `main.cjs` modularize | Planned (B3–B6) |

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

- **`sandbox: false`** — common in Electron apps needing Node APIs; not ideal per [Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security). Reason for disabling not documented in code — worth revisiting.
- **AI keys in workspace JSON** — encrypted at rest on desktop when account encryption active; still decrypted in renderer memory during use. Expected for BYO-key; enterprise strict preset disables AI entirely.

### PWA threat model

Assume: anyone with device unlock can read `localStorage`. Mitigation = OS-level disk encryption + optional notes passphrase (desktop-grade lock UX on PWA still incomplete).

---

## Test & quality

### Current coverage (good)

~133 tests across 9 files, focused on high-risk libs:

| Module | Tests | Why it matters |
|---|---:|---|
| `model.test.ts` | 16 | Migrations, shrink detection, title rescue, sourceNoteId |
| `features.test.ts` | 26 | Policy precedence, enterprise build |
| `gdrive.test.ts` | 19 | Sync push/pull, conflicts, retries |
| `gdriveAuth.test.ts` | 22 | OAuth token lifecycle |
| `lanSyncClient.test.ts` | 15 | Pairing URL/token handling |
| `snapshotCrypto.test.ts` | 13 | E2E snapshot encryption |
| `useSyncAutoSync.test.ts` | 10 | Auto-sync hook |
| `syncSnapshotGuard.test.ts` | 8 | Remote payload gate |
| `AccountContext.test.tsx` | 4 | Session edge cases |

CI (`.github/workflows/ci.yml`) on every push/PR: `tsc` → `npm test` → `build:web` → `build:pwa`.

### Gaps (roadmap drivers)

| Gap | Severity | Notes |
|---|---|---|
| No E2E / smoke tests | **High** | Login → create todo → reload → assert persist untested automatically |
| No UI/component tests (except AccountContext) | Medium | Regressions in TodosPage/NotesPage undetected |
| `actions.ts` untested | Medium | Pure functions — cheap to test, high leverage; lives in `src/core/actions/` |
| `electron/main.cjs` untested | Medium | Expected; IPC contract tests would help |
| No coverage gate in CI | Low | `@vitest/coverage-v8` present but unused |
| No ESLint / Prettier | Low | Style/consistency relies on author discipline |
| No Dependabot / audit automation | Low | Supply-chain hygiene |

---

## Mobile / PWA UX gaps

The PWA **works** (drawer nav, safe-area, launch → `/todos`, offline shell). It is not yet a **curated lite product surface**.

### Desktop-only features still visible on mobile web

| Surface | Desktop | PWA today | Desired |
|---|---|---|---|
| Backups & Recovery | Full restore UI | Empty card: "desktop only" | **Hide entirely** |
| PIN protection | Works | Form visible, IPC missing | **Hide entirely** |
| Stay signed in | Electron Keychain | Hidden (OK) | — |
| Data location | Shows path | "No Electron path" | **Hide or replace with PWA storage note** |
| Save / integrity banners | "Open Backups" | Links to dead-end | **"Export JSON" CTA** |
| Sidebar nav | Full | Home, Teams, Analytics, etc. | **Lite nav**: Todos, Notes, Agenda, Profile, Settings |
| Top bar team switcher | Full | Crowded on ≤700px | **Simplify on mobile web** |

### Principle for mobile lite mode

> **If a feature cannot work on this runtime, do not show its link, button, or settings card.**  
> Routes may still exist for deep links / command palette power users, but primary navigation should not advertise them.

Proposed runtime detection (single module):

```ts
// src/lib/runtime.ts (proposed)
isElectronApp()   // !!window.cadence?.saveData
isMobileViewport() // matchMedia('(max-width: 700px)')
isMobileWeb()     // mobile viewport && !isElectronApp()
```

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
| **A1** | **Mobile lite navigation** | M | High | Sidebar: Todos, Notes, Agenda, Profile, Settings only on `isMobileWeb()`. Keep routes for palette/deep links. |
| **A2** | **Hide desktop-only Settings sections on PWA** | S | High | Remove cards for Backups, PIN, Data location (or single "Mobile storage" info card). |
| **A3** | **Context-aware error banners** | S | Medium | PWA: "Export backup" → `#backup`; desktop: "Open Backups" → `#backups`. |
| **A4** | **Smoke E2E test (1 scenario)** | M | High | Playwright: register/login → add todo → reload → assert title persists. Run in CI (web or Electron headless). |
| **A5** | **`actions.ts` unit tests** | M | Medium | Cover add/update/delete for todos, notes, groups; status transitions set `doneAt`. |
| **A6** | **CI coverage gate (lib/)** | S | Medium | `--coverage` on `src/lib/**`, `src/core/**`; fail below 70%. |

**Exit criteria for Phase A:** A new user on iPhone PWA sees no link that leads to "desktop only" text. CI blocks PRs that break the smoke path.

---

### Phase B — Maintainability (6–10 weeks, parallel-friendly)

*Goal: Change velocity stays high as features accumulate.*

| ID | Item | Effort | Impact | Status | Notes |
|---|---|---|---|---|---|
| **B0** | **`src/providers/` + `src/core/` layout** | S | Medium | **Done** | Contexts + model/actions moved; root shims preserve old import paths |
| **B1** | **Split `Settings.tsx`** | L | Medium | Planned | `src/views/settings/*.tsx` — one file per section; thin orchestrator in `Settings.tsx`. |
| **B2** | **Split `TodosPage.tsx` / `NotesPage.tsx`** | L | Medium | **In progress** | Todos module complete (~315-line page); `TodoTaskRow`, toolbar, sections, hooks extracted. NotesPage next. |
| **B3** | **Modularize `main.cjs`** | L | High | Planned | `electron/data/`, `electron/sync/`, `electron/auth/` — keep IPC table in one registry file. |
| **B4** | **CSS architecture** | L | Medium | Planned | Split `app.css` by domain (`shell`, `todos`, `notes`, `settings`) or CSS modules for new code. |
| **B5** | **Unify branding** | S | Low | Planned | Generate renderer constants from `branding.cjs` at build time, or shared JSON. |
| **B6** | **ESLint + Prettier** | S | Medium | Planned | `@typescript-eslint`, React hooks rules; format on CI. |
| **B7** | **Split `core/actions/` by domain** | M | Medium | Planned | `todos.ts`, `notes.ts`, `teams.ts` + barrel; after A5 test coverage. |
| **B8** | **Remove root re-export shims** | S | Low | Planned | Once all imports point at `providers/` and `core/`; optional codemod. |

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

These are **product** bets, not health fixes. Schedule after Phase A unless user demand says otherwise.

---

### Phase D — Platform & ops (when audience grows)

| ID | Item | Trigger |
|---|---|---|
| **D1** | Windows + Linux signed release CI | First non-Mac user cohort |
| **D2** | Dependabot + monthly `npm audit` | Before public marketing push |
| **D3** | Performance budget (10k todos, 1k notes) | User reports slow load |
| **D4** | Electron sandbox investigation | Security review request |
| **D5** | Optional encrypted PWA (Web Crypto + passphrase) | Enterprise mobile ask |

---

## Suggested discussion agenda

Use this doc as the agenda. Recommended order:

1. **Do we agree on the 7.8 composite score and the Phase A priority?**  
   Mobile lite UX (A1–A3) vs smoke E2E (A4) — which ships first?

2. **PWA product definition**  
   Is mobile **companion** (sync from desktop) or **standalone** (full teams/people on phone)? That decides whether Teams/Analytics stay in lite nav.

3. **"Near-flawless" definition**  
   Pick 2–3 non-negotiables, e.g.:  
   - Zero dead-end links on PWA  
   - Smoke E2E green on every PR  
   - No file >2k lines by v0.3

4. **Timeline vs README Tier 2**  
   Phase C items compete for the same weeks as Phase B refactors. Prefer stability (B) before OKRs (C)?

5. **Release cadence**  
   Phase A complete → tag `0.3.0`? Or continuous `0.2.<run>` with changelog themes?

---

## Appendix — key file references

| Concern | Primary files |
|---|---|
| Data persist | `src/providers/AppDataContext.tsx`, `electron/main.cjs` (`writeUserData`, `writeJsonText`) |
| Schema / migration | `src/core/model/index.ts`, `src/core/model/model.test.ts` |
| Mutations | `src/core/actions/index.ts` (shim: `src/actions.ts`) |
| React providers | `src/providers/index.ts` (barrel), individual `*Context.tsx` |
| Feature flags | `src/lib/features.tsx` |
| Rich text | `src/components/ui/RichTextEditor.tsx`, `src/lib/richTextBody.ts` |
| Attachments | `electron/main.cjs` (GC, backup), `src/lib/richTextAttachmentStore.ts`, `src/lib/lanAttachmentSync.ts` |
| Sync safety | `src/lib/syncSnapshotGuard.ts`, `src/lib/useSyncAutoSync.ts` |
| Mobile shell | `src/components/Layout.tsx`, `src/app.css` (`@media max-width: 700px`) |
| Todos UI | `src/views/TodosPage.tsx`, `src/features/todos/` |
| Settings surface | `src/views/Settings.tsx` |
| CI | `.github/workflows/ci.yml`, `.github/workflows/release.yml` |
| Operator docs | `README.md`, `docs/DEPLOYMENT-AND-POLICY.md`, `docs/ENTERPRISE.md` |
| Import safety guide | `README.md` § "Importing a big batch of notes (or todos) safely" |

---

## Revision history

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.2 | 2026-05-31 | B2 todos complete — `features/todos/` module; TodosPage ~315 lines |
| 1.1 | 2026-05-31 | Architecture refactor session | B0 layout (`providers/`, `core/`); rich-text & attachment delivery log; updated scores & appendix |
| 1.0 | 2026-05-31 | Health check session | Initial analysis + phased roadmap |
