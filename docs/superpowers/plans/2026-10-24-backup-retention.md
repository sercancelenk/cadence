# Backup Retention Settings Implementation Plan

**Goal:** Let the user choose how many daily-mirror folders and in-app snapshots are kept, and when a value is lowered, warn first and then trim the existing backups down to it (oldest first).

**Architecture:** Retention choices are machine-local prefs (never in the workspace AppData, no `DATA_VERSION` bump, expand-only). A pure policy module decides what to keep and what to delete; `main.cjs` applies it. One IPC call does "save + trim" so the confirm step and the deletion cannot drift apart.

**Tech Stack:** Electron main (`.cjs`), React Settings view, Vitest.

## Global Constraints (zero data loss)

- Defaults are unchanged (mirror 30, in-app routine 50). Upgrading deletes nothing. Raising a value deletes nothing.
- Deletion only follows an explicit confirm for the exact new value. Cancel leaves the old value and every file untouched.
- The newest *complete* daily folder and the newest snapshot set are never deleted, whatever the value.
- Only this account's folders/sets are ever deleted (existing `DAILY_FOLDER_RE` + user segment rule stays; legacy `app-daily-YYYY-MM-DD` folders are never touched).
- Unreadable, partial or unknown things are not counted as backups and are not deleted unless they already were (`*.partial`, `*.displaced`).
- Mirror folder offline (drive unplugged): the choice is saved, trimming is deferred to the next successful daily write, and the UI says so.

## Rulings

- **Mirror retention is "newest N complete folders", not "N calendar days".** A laptop that was off for a week must not end up with a single backup under "3". Equal to today's behaviour for a machine that runs daily.
- **In-app snapshots get two tiers.** Lifecycle sets (`pre-import`, `pre-restore`, `pre-pwchange`, `pre-recovery`, `pre-monthly-layout`, and any label this build does not recognise) keep their own quota of 50 (the old shared ring held at most 50 sets, so an upgrade can never delete an existing snapshot) and are never evicted by routine sets (`pre-save`, `launch`, `post-login`, `pre-write`). Routine sets keep the user's choice (10 / 20 / 30 / 50, default 50).
- Mirror choices: 3 / 7 / 14 / 30 (default 30).

## Tasks

### Task 1: Pure retention policy
- Create `electron/persistence/retentionPolicy.cjs` + `retentionPolicy.test.ts`.
- `snapshotSetLabel(setKey): string` — label from `data-<label>-<ISO ts>`.
- `isLifecycleLabel(label): boolean` — false only for `pre-save|launch|post-login|pre-write`.
- `planSnapshotPrune(sets: {key, mtime, label}[], {routineKeep, lifecycleKeep}) → {keep: string[], remove: string[]}` — newest-first per tier; never removes the single newest set overall.
- `planMirrorPrune(folders: {name, dateKey, complete}[], keepN) → {remove: string[]}` — only complete folders are ranked; newest complete always kept; `keepN` clamped to ≥ 1; incomplete non-partial folders are neither counted nor removed.
- Tests: tier isolation (50 routine sets cannot evict a `pre-import`), unknown label is protected, keepN=1 keeps newest, zero complete folders → nothing removed, clamp, tie on mtime is deterministic.

### Task 2: Prefs (expand-only)
- `dailyBackupMirror.cjs`: `normalizePrefs` gains `keepFolders: 3|7|14|30|null` (null = default 30). Old prefs files read identically. `pruneDailyMirrorFolders` switches to `planMirrorPrune`.
- New `electron/retentionPrefs.cjs`: `readSnapshotPrefs / writeSnapshotPrefs` for `{ routineKeep }` in `<prefix>-snapshot-retention-<user>.json` (same safe-name rule as the mirror prefs; invalid values fall back to 50).
- Tests: legacy prefs file without the field, invalid values, write failure leaves old file.

### Task 3: Apply path in main
- `main.cjs`: `pruneBackups(dir)` uses `planSnapshotPrune` (same deletion of `attachments-*` / `note-history-*` siblings as today).
- IPC `backupRetention:get` → `{ mirrorKeep, snapshotRoutineKeep, snapshotLifecycleKeep, mirrorDirAvailable }`.
- IPC `backupRetention:set({ mirrorKeep?, snapshotRoutineKeep?, confirmed })`:
  1. compute the plan for the new values;
  2. if it would delete anything and `confirmed !== true` → return `{ ok: false, needsConfirm: true, willDelete: { mirrorFolders, snapshotSets } }` and change nothing;
  3. otherwise write prefs, then trim; return the new state plus `deleted` counts.
- Preload bridge + `vite-env.d.ts` types.
- Tests (`retentionIpc.test.ts`, temp dirs): lowering without confirm deletes nothing and keeps the old pref; with confirm trims to N and the newest survives; raising deletes nothing; offline mirror dir saves the pref and reports deferred; other account's folders untouched.

### Task 4: Settings UI
- `Settings.tsx` (Backups & Recovery): two selects with the allowed values and a one-line hint of what each costs. On change call `set`; if `needsConfirm`, show the existing `confirm()` dialog with the counts ("12 daily folders and 18 snapshots will be deleted. The newest 7 stay."), then call again with `confirmed: true`. Cancel reverts the select.
- Update the existing "pruned after {n} days" copy to the chosen count.
- Tests: Settings component test for the confirm → apply and cancel → unchanged paths.

### Task 5: Docs and verification
- `CHANGELOG.md` (Added: retention settings; Changed: lifecycle snapshots no longer evicted by routine ones), `docs/USER-GUIDE.md`.
- Run: `npx vitest run`, `npm run typecheck`, `scripts/data-safety-scan.sh`, then `data-safety-reviewer` on the diff (this touches delete paths).

## Review Focus

- Lowering while the mirror drive is unplugged: pref saved, nothing deleted, message shown.
- Lowering to the minimum when only one complete folder exists: nothing deleted.
- A folder with a broken `data.json` is never ranked as a backup and never causes a good one to be deleted.
- Two accounts sharing one mirror folder: trimming one never touches the other.
- Cancel in the confirm dialog: select snaps back, no file changed.
