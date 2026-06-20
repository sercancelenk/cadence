/**
 * One-shot localStorage / sessionStorage migration from the pre-rename
 * `leeadman-*` keys to the current `cadence-*` keys.
 *
 * Runs once at app boot (idempotent — guarded by a "done" marker key) so
 * existing PWA installs and dev sessions don't lose theme, todo-section
 * collapse state, or dev account / session records after the rename.
 *
 * We never DELETE the legacy keys. Two reasons:
 *   1. Safety net — if the new key gets corrupted somehow, the legacy one
 *      is still on disk for the user to inspect.
 *   2. If the user briefly opens a pre-rename build (e.g. a stale tab in
 *      another browser) after migrating, the legacy key being there means
 *      they don't get a confusing "you're signed out" state.
 *
 * Keep the marker key under the NEW prefix so a future rename can detect
 * and re-run with a different marker name.
 */
import { STORAGE_PREFIX, STORAGE_PREFIX_LEGACY } from './appBranding';

const MIGRATION_MARKER = `${STORAGE_PREFIX}:legacy-storage-migrated:v1`;

type MigrateOutcome = 'copied' | 'skip' | 'fail';

function migrateOne(
  storage: Storage,
  legacyKey: string,
  newKey: string,
): MigrateOutcome {
  try {
    if (storage.getItem(newKey) !== null) return 'skip';
    const v = storage.getItem(legacyKey);
    if (v === null) return 'skip';
    storage.setItem(newKey, v);
    return 'copied';
  } catch (err) {
    // A real copy failed (quota, ITP). Report it so the caller does NOT mark
    // migration complete and we retry this key on the next launch.
    // eslint-disable-next-line no-console
    console.warn(`[cadence] failed to migrate legacy storage key "${legacyKey}":`, err);
    return 'fail';
  }
}

function migrateAllUnder(storage: Storage): { copied: number; failed: number } {
  let copied = 0;
  let failed = 0;
  const toMigrate: { legacyKey: string; newKey: string }[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k) continue;
      if (k.startsWith(`${STORAGE_PREFIX_LEGACY}-`) || k.startsWith(`${STORAGE_PREFIX_LEGACY}:`) || k.startsWith(`${STORAGE_PREFIX_LEGACY}.`)) {
        // Preserve the separator the legacy key used (-, : or .) so callers
        // that read by literal string match still find their value.
        const newKey = `${STORAGE_PREFIX}${k.slice(STORAGE_PREFIX_LEGACY.length)}`;
        toMigrate.push({ legacyKey: k, newKey });
      }
    }
  } catch (err) {
    // iteration failed (Safari ITP, quota error, etc.) — treat as a failure so
    // we don't prematurely mark the migration complete.
    // eslint-disable-next-line no-console
    console.warn('[cadence] failed to enumerate legacy storage keys:', err);
    return { copied: 0, failed: 1 };
  }
  for (const { legacyKey, newKey } of toMigrate) {
    const outcome = migrateOne(storage, legacyKey, newKey);
    if (outcome === 'copied') copied += 1;
    else if (outcome === 'fail') failed += 1;
  }
  return { copied, failed };
}

export function migrateLegacyStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(MIGRATION_MARKER) === '1') return;
  } catch {
    return;
  }
  try {
    const local = migrateAllUnder(window.localStorage);
    const session = migrateAllUnder(window.sessionStorage);
    if (local.copied || session.copied) {
      // eslint-disable-next-line no-console
      console.info(
        `[cadence] migrated ${local.copied} localStorage and ${session.copied} sessionStorage keys from the legacy "${STORAGE_PREFIX_LEGACY}" prefix.`,
      );
    }
    // Only mark migration complete when nothing failed; otherwise re-run next
    // launch (idempotent — already-copied keys are skipped).
    if (local.failed === 0 && session.failed === 0) {
      window.localStorage.setItem(MIGRATION_MARKER, '1');
    }
  } catch {
    /* Can't write the marker. Most likely Safari private mode. We'll just
       re-run the migration on the next launch — that's safe because
       `migrateOne` is a no-op when the new key already exists. */
  }
}
