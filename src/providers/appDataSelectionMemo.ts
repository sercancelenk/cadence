import type { AppData } from '../core/model';

/**
 * Builds the memoizing selection function used by `useAppDataSelector`,
 * mirroring React's `useSyncExternalStoreWithSelector` algorithm.
 *
 * The critical guarantee is referential stability for the SAME snapshot: when
 * called repeatedly with the same `AppData` reference it returns the exact same
 * derived value, even when `selector` constructs a fresh object each call.
 * `useSyncExternalStore` calls `getSnapshot` multiple times per commit and again
 * after committing; if any of those returned a new reference for an unchanged
 * snapshot, React would treat the store as perpetually changed and spin into an
 * infinite render loop ("Maximum update depth exceeded").
 *
 * Each instance owns its own memo, so the caller must create a NEW memo whenever
 * the `selector`/`isEqual` identity changes (the hook does this via `useMemo`),
 * which keeps closure-captured params (e.g. a route `teamId`) correct.
 */
export function createAppDataSelectionMemo<T>(
  selector: (data: AppData) => T,
  isEqual: (a: T, b: T) => boolean,
): (snap: AppData) => T {
  let hasMemo = false;
  let memoSnap: AppData;
  let memoValue: T;
  return (snap: AppData): T => {
    if (!hasMemo) {
      hasMemo = true;
      memoSnap = snap;
      memoValue = selector(snap);
      return memoValue;
    }
    // Same underlying snapshot → selector is pure → reuse the cached value so
    // the returned reference stays stable across getSnapshot calls.
    if (Object.is(memoSnap, snap)) return memoValue;
    const next = selector(snap);
    // Snapshot changed but the derived value is equivalent → keep the previous
    // reference to avoid an unnecessary re-render.
    if (isEqual(memoValue, next)) {
      memoSnap = snap;
      return memoValue;
    }
    memoSnap = snap;
    memoValue = next;
    return memoValue;
  };
}
