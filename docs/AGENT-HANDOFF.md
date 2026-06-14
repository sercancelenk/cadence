# Agent handoff — production review (June 2026)

This document summarizes work done across multiple deep-dive production reviews so the next LLM agent (or human) can continue without re-discovering fixed bugs and open risks.

**Branch state at handoff:** `main`, 2 commits ahead of origin (`31150c4`, `2904040`), plus **uncommitted** changes listed below (~21 files, `e2e/helpers.ts` untracked).

**Verification before commit (re-run after merging):**

```bash
npm run typecheck && npm test && npm run build:web && npx playwright test e2e/smoke.spec.ts
# or: npm run check:release   # includes playwright install + full e2e
```

Last known good: **1094 unit tests**, **3/3 e2e smoke**, typecheck clean, all vendor chunks &lt;500 KB.

---

## Already committed (do not re-fix unless regressed)

### `31150c4` — Release production hardening: recovery, backups, and data-loss fixes

- Electron: LAN POST uses coerced snapshot; password change / recovery with workspace merge + snapshot rollback; shard fail + rollback; future-version overwrite refusal.
- Renderer: `persistBlockedRef` on unsupported data version; PWA `pagehide` localStorage flush; scratchpad/agenda debounce + unmount flush (initial pass).

### `2904040` — Fix follow-up data-loss paths in sync flush and account persist

- `syncFromDisk` / `importWorkspace` call `prepareForRemoteApply()` before disk replace.
- People scratchpad/agenda debounce cleanup no longer stomps remote data on `person.id`-only effect deps.
- `writeAccounts` / `writeSession` checked on register, recovery confirm, password flows.
- ZIP import: workspace before attachments order fix in `portable.ts`.

---

## Uncommitted work (this session) — include in next commit

### Build & release gate

| File | Change |
|------|--------|
| `vite.config.ts` | Split `vendor-misc` into `vendor-richtext`, `vendor-codemirror`, `vendor-yaml`, `vendor-qrcode`; `isReactCoreVendor()` avoids `@tiptap/react` → `vendor-react` cycle; esbuild `destructuring: true` for dev/build. |
| `package.json` | Added `check:release` script (typecheck + test + build:web + playwright + e2e). |
| `e2e/helpers.ts` | **NEW — must `git add`** — `completeOnboarding()`, `registerSmokeUser()`, `route()`, `waitForWorkspacePersist()`, `fillControlledTextarea()`. |
| `e2e/smoke.spec.ts` | 3 tests: todo persist, profile title persist, scratchpad persist (Welcome Tour aware). |

### Data loss & persist (P0/P1 fixes)

| Bug | Fix | Files |
|-----|-----|-------|
| `syncFromDisk` dropped dirty People edits (400 ms debounce cancelled before reload) | `flushPendingSave()` before `prepareForExternalWorkspaceReplace()`; `prepareForRemoteApply` awaits `runBeforeFlushHooks()` | `AppDataContext.tsx`, `syncApplyGuard.ts`, `pendingSaveFlush.ts` |
| `loadDataResult` / localStorage failures showed empty UI, allowed overwrite | All `loadInitial` failure paths return `loadError`; `persistBlocked` for `unsupported-version`, `bad-key`, `no-key`, `parse`, `io` | `AppDataContext.tsx` |
| `persistBlocked` stayed true after successful sync pull / `replaceAll` | Clear flag on `replaceAll` and successful `applyLoadedWorkspace` (no `loadError`) | `AppDataContext.tsx` |
| Write-conflict: stale tab could save again after generation bump | Set `persistBlockedRef = true` on `write-conflict` until reload/sync | `AppDataContext.tsx` |
| Password change / recovery re-encrypted disk without pending renderer edits | `flushPendingSaveGlobal()` before IPC | `AccountContext.tsx` |
| Locked-note async encrypt lost on quit / sync / note switch | `registerBeforeFlushHook` + `pendingLockedNoteRef` + cleanup on `selected.id` change | `useNotesEditor.ts`, `pendingSaveFlush.ts` |
| Remote snapshot with `version > DATA_VERSION` threw in LAN pull | `parseRemoteSnapshot` → `{ kind: 'unsupported-version' }`; callers refuse apply | `syncSnapshotGuard.ts`, `useSyncAutoSync.ts`, `Settings.tsx`, `portable.ts` |
| `version` missing on modern JSON → v1 migration destroyed todos/notes | Infer v2+ when `teams` / `todoGroups` / `todoItems` / `notes` arrays present | `core/model/index.ts` |
| v1 migration dropped scratchpad strings | Preserve `scratchpad` / `agenda` in `migrateV1ToV2` | `core/model/index.ts` |

### UI / screen bugs

| Bug | Fix | Files |
|-----|-----|-------|
| Scratchpad saved to disk but empty after reload | `scratchpadDirty` blocked hydrate on first load; split `useEffect` on `person.id` vs field updates | `People.tsx` |
| Profile name/title wiped on store update while editing | `profileDirty` guard on name/title sync (same as scratchpad) | `People.tsx` |
| Planning: drag to **Unsorted** did nothing | `updateTodoItem`: `'planImportant' in patch` / `'planUrgent' in patch` so explicit `undefined` clears axes | `core/actions/index.ts` |
| Planning: drag feedback invisible | Card drag styles, quadrant drop-target highlight, `setDragImage` on whole card, drop uses `dataTransfer` id | `PlanningMatrix.tsx`, `PlanningMatrixBoard.tsx`, `planning.css` |
| PersonMeetingMode agenda hydrate | Align with scratchpad pattern (`person.id` reset + `agendaDirty` guard) | `People.tsx` |

---

## Key invariants (do not break)

1. **`undefined` in planning patches** means “clear axis” — must use `'field' in patch`, not `!== undefined` (`planImportant`, `planUrgent`, `planFocusToday`).
2. **`persistBlockedRef`** blocks `update()`, `scheduleSave`, `runPersist` — must clear after authoritative snapshot (`replaceAll`, successful reload without `loadError`).
3. **`prepareForRemoteApply` order:** flush hooks first (`runBeforeFlushHooks`), then `SYNC_BEFORE_APPLY` event, then 2× `rAF`. Callers that reload disk should **`flushPendingSave()` before** `prepareForExternalWorkspaceReplace()`.
4. **People local state:** `person.id` change → full hydrate; field updates from store → respect `profileDirty` / `scratchpadDirty` / `agendaDirty`.
5. **Locked notes:** plaintext in `latestBodyFieldsRef` until async encrypt completes — always flush via hook before global persist/sync.

---

## Tests added / updated

- `src/core/actions/actions.test.ts` — planning axes clear via `undefined`
- `src/core/model/model.test.ts` — version-less modern-shaped export
- `src/lib/syncSnapshotGuard.test.ts` — future `version` returns `unsupported-version`
- `e2e/smoke.spec.ts` — onboarding + persist smoke (3 cases)

---

## Remaining P2 (not blocking production)

| Item | Notes |
|------|-------|
| `MAX_DATA_VERSION` vs `DATA_VERSION` | Duplicated in `electron/persistence/writeGeneration.cjs` and `src/core/model/index.ts` — drift risk |
| ZIP import partial failure | Workspace committed before attachments; failed attachment import leaves broken refs |
| LAN POST without `If-Match` | Last-write-wins for legacy clients |
| `check:release` | Does not run `build:pwa` / Pages layout |
| `planInHub` patch semantics | Still uses `!== undefined`; callers use `false` explicitly |

---

## Files touched (uncommitted diff)

```
e2e/helpers.ts                    (NEW — track in git)
e2e/smoke.spec.ts
package.json
vite.config.ts
src/core/actions/index.ts
src/core/actions/actions.test.ts
src/core/model/index.ts
src/core/model/model.test.ts
src/features/notes/useNotesEditor.ts
src/features/planning/PlanningMatrix.tsx
src/features/planning/PlanningMatrixBoard.tsx
src/lib/pendingSaveFlush.ts
src/lib/syncApplyGuard.ts
src/lib/syncSnapshotGuard.ts
src/lib/syncSnapshotGuard.test.ts
src/lib/useSyncAutoSync.ts
src/lib/backupBundle/portable.ts
src/providers/AppDataContext.tsx
src/providers/AccountContext.tsx
src/views/People.tsx
src/views/Settings.tsx
src/styles/planning.css
```

---

## Suggested commit steps

```bash
git add e2e/helpers.ts e2e/smoke.spec.ts package.json vite.config.ts \
  src/core/actions/ src/core/model/ src/features/notes/useNotesEditor.ts \
  src/features/planning/ src/lib/ src/providers/ src/views/People.tsx \
  src/views/Settings.tsx src/styles/planning.css docs/AGENT-HANDOFF.md
```

---

## For the next agent

- **Do not** claim production-ready without running `check:release` or equivalent after any persist/sync/People/Notes/Planning change.
- **Suspect first** debounced save vs `prepareForExternalWorkspaceReplace` cancel if “edits lost after sync/reload”.
- **Suspect first** `'field' in patch` semantics if optional fields won’t clear (planning unsorted, hub add).
- **Suspect first** dirty guards on People/Profile if form resets during LAN push.
- Prior chat transcript: agent session `5046ecfa-fe4d-4a5f-b9d2-4977b9e095f2` (Cursor).
