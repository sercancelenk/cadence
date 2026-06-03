/**
 * Provider-agnostic background sync. Drives whichever `SyncBackend` is
 * currently active.
 *
 * Replaces `useLanSyncAutoPull`. The algorithm is similar to the
 * LAN-only version that shipped before — same triggers, same rate-
 * limits, same "push first if dirty, pull otherwise" precedence — but
 * the dirty check now reads from a **content fingerprint** (a stable
 * hash of the local snapshot) rather than the remote etag, because
 * for cloud backends the two are unrelated.
 *
 * Why content fingerprint, not remote etag
 * ----------------------------------------
 *
 * LAN's host etag is `sha256(JSON({ok:true,data})).slice(0,16)`, which
 * is itself a content hash — so checking `localContentHash !== record.etag`
 * worked. Drive's `version` field is a Drive-managed counter (e.g.
 * `"5"`); comparing it against a 16-char hex hash would always
 * mismatch and pin the device into a push-every-30-seconds loop.
 *
 * The fix is to track BOTH:
 *   - `record.etag`              — the backend's remote concurrency token
 *   - `record.localFingerprint`  — the content hash at the moment of the
 *                                  last successful round-trip
 *
 * Dirty check: `currentFingerprint !== record.localFingerprint`.
 * Conditional request: still uses `record.etag` (If-None-Match / If-Match).
 *
 * Why "push if dirty, pull otherwise" and never the other way around:
 *
 *   - Auto-sync runs every minute or so. The local snapshot is the
 *     freshest thing we know about. Pulling first would risk
 *     overwriting recent edits with a stale remote that's about to
 *     be replaced anyway.
 *   - On a true conflict (412 / version-mismatch) we bail silently.
 *     The user resolves explicitly via Settings → "Pull/Push" —
 *     auto-sync never decides for them.
 *
 * QR-pair landing path
 *
 *   This hook also runs the `?pair=` adoption sequence on mount, so a
 *   phone landing from a QR scan gets paired before its first auto-
 *   sync fires. That logic is LAN-specific; we keep it here (rather
 *   than inside the LAN backend) because it's a one-shot URL-driven
 *   side-effect, not part of the steady-state push/pull loop.
 */
// @ts-nocheck


import { useCallback, useEffect, useRef } from 'react';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import type { AppData } from '../model';
import { syncLanAttachments } from './lanAttachmentSync';
import { parseRemoteSnapshot } from './syncSnapshotGuard';
import { prepareForRemoteApply } from './syncApplyGuard';
import {
  computeLocalEtag,
  readPairFromUrl,
  savePair,
  stripPairFromUrl,
} from './lanSyncClient';
import { getActiveBackend, subscribeActiveBackend } from './syncBackends';
import {
  describePullOutcomeForLog,
  describePushOutcomeForLog,
  publishSyncEvent,
} from './syncEvents';
import type { SyncBackend, SyncBackendId, SyncPullOutcome, SyncPushOutcome } from './syncBackends/types';

const MIN_GAP_MS = 30_000;
const STARTUP_DELAY_MS = 500;

/**
 * `computeLocalEtag` requires Web Crypto; in obscure runtimes (SSR
 * tests, very old Safari) it can throw. We catch that and return
 * empty-string, which the dirty check treats as "can't decide → just
 * pull conditionally next time". Never crash the auto-sync hook.
 */
async function safeFingerprint(data: unknown): Promise<string> {
  try {
    return await computeLocalEtag(data);
  } catch {
    return '';
  }
}

function publishOutcome(
  backendId: SyncBackendId | null,
  direction: 'push' | 'pull',
  outcome: SyncPullOutcome | SyncPushOutcome,
): void {
  const summary =
    direction === 'pull'
      ? describePullOutcomeForLog(outcome as SyncPullOutcome)
      : describePushOutcomeForLog(outcome as SyncPushOutcome);
  publishSyncEvent({
    kind: summary.kind,
    backendId,
    text: summary.text,
    code: summary.code,
  });
}

/**
 * Core auto-sync algorithm extracted as a pure-ish function so it can
 * be tested without rendering a React tree. The hook below is a thin
 * wrapper that wires it to refs + timers + event listeners.
 *
 * Returns the next action taken — useful as a return value for tests
 * (assertions read this rather than scanning published events).
 */
export type SyncCycleAction =
  | 'no-op'
  | 'baseline-pulled'
  | 'baseline-seeded'
  | 'pulled'
  | 'pushed'
  | 'not-modified'
  | 'pull-error'
  | 'push-error'
  | 'corrupt-remote'
  | 'local-changed-during-pull';

async function maybeSyncLanAttachments(
  backend: SyncBackend,
  data: AppData,
  userId: string | undefined,
  action: SyncCycleAction,
): Promise<void> {
  if (backend.id !== 'lan' || !userId) return;
  if (
    action !== 'pushed' &&
    action !== 'pulled' &&
    action !== 'baseline-pulled' &&
    action !== 'baseline-seeded'
  ) {
    return;
  }
  try {
    await syncLanAttachments(data, userId);
  } catch (err) {
    console.warn('[cadence] LAN attachment sync failed', err);
  }
}

export async function runSyncCycle(args: {
  backend: SyncBackend;
  localData: AppData;
  getLocalData?: () => AppData;
  applyRemote: (data: AppData) => void;
  flushLocal?: () => Promise<void>;
  userId?: string;
}): Promise<SyncCycleAction> {
  const { backend, localData, applyRemote, userId } = args;
  const getLocal = args.getLocalData ?? (() => localData);
  const flushLocal = args.flushLocal ?? (async () => {});
  const record = backend.getRecord();
  const backendId = backend.id;

  async function applyRemoteIfLocalStable(remote: AppData): Promise<SyncCycleAction | null> {
    const fpBefore = await safeFingerprint(getLocal());
    await flushLocal();
    await prepareForRemoteApply();
    const fpAfter = await safeFingerprint(getLocal());
    if (fpBefore && fpAfter !== fpBefore) {
      publishSyncEvent({
        kind: 'info',
        backendId,
        code: 'local-edits',
        text: 'Skipped remote pull — you have unsaved local changes.',
      });
      return 'local-changed-during-pull';
    }
    applyRemote(remote);
    return null;
  }

  if (!record?.localFingerprint) {
    const pullOutcome = await backend.pull();
    if (pullOutcome.kind === 'ok') {
      const parsed = parseRemoteSnapshot(pullOutcome.data);
      if (parsed.kind !== 'ok') {
        publishSyncEvent({
          kind: 'error',
          backendId,
          code: 'corrupt',
          text: 'Remote snapshot has an unrecognised shape — refusing to overwrite local data.',
        });
        return 'corrupt-remote';
      }
      const blocked = await applyRemoteIfLocalStable(parsed.data);
      if (blocked) return blocked;
      const fp = await safeFingerprint(parsed.data);
      backend.setRecord({
        etag: pullOutcome.etag,
        localFingerprint: fp,
        lastSyncedAt: new Date().toISOString(),
      });
      publishSyncEvent({ kind: 'success', backendId, text: 'Synced baseline from remote.' });
      await maybeSyncLanAttachments(backend, parsed.data, userId, 'baseline-pulled');
      return 'baseline-pulled';
    }
    if (pullOutcome.kind === 'no-snapshot') {
      const pushOutcome = await backend.push(localData);
      if (pushOutcome.kind === 'ok') {
        const fp = await safeFingerprint(localData);
        backend.setRecord({
          etag: pushOutcome.etag,
          localFingerprint: fp,
          lastSyncedAt: new Date().toISOString(),
        });
        publishSyncEvent({ kind: 'success', backendId, text: 'Seeded remote with current workspace.' });
        await maybeSyncLanAttachments(backend, localData, userId, 'baseline-seeded');
        return 'baseline-seeded';
      }
      publishOutcome(backendId, 'push', pushOutcome);
      return 'push-error';
    }
    publishOutcome(backendId, 'pull', pullOutcome);
    return 'pull-error';
  }

  const currentFingerprint = await safeFingerprint(localData);

  if (currentFingerprint && currentFingerprint !== record.localFingerprint) {
    const pushOutcome = await backend.push(localData, record.etag);
    if (pushOutcome.kind === 'ok') {
      backend.setRecord({
        etag: pushOutcome.etag,
        localFingerprint: currentFingerprint,
        lastSyncedAt: new Date().toISOString(),
      });
      await maybeSyncLanAttachments(backend, localData, userId, 'pushed');
      return 'pushed';
    }
    publishOutcome(backendId, 'push', pushOutcome);
    return 'push-error';
  }

  const pullOutcome = await backend.pull(record.etag);
  if (pullOutcome.kind === 'ok') {
    const parsed = parseRemoteSnapshot(pullOutcome.data);
    if (parsed.kind !== 'ok') {
      publishSyncEvent({
        kind: 'error',
        backendId,
        code: 'corrupt',
        text: 'Remote snapshot has an unrecognised shape — refusing to overwrite local data.',
      });
      return 'corrupt-remote';
    }
    const blocked = await applyRemoteIfLocalStable(parsed.data);
    if (blocked) return blocked;
    const fp = await safeFingerprint(parsed.data);
    backend.setRecord({
      etag: pullOutcome.etag,
      localFingerprint: fp,
      lastSyncedAt: new Date().toISOString(),
    });
    await maybeSyncLanAttachments(backend, parsed.data, userId, 'pulled');
    return 'pulled';
  }
  if (pullOutcome.kind === 'not-modified') {
    backend.setRecord({
      etag: record.etag,
      localFingerprint: record.localFingerprint,
      lastSyncedAt: new Date().toISOString(),
    });
    return 'not-modified';
  }
  publishOutcome(backendId, 'pull', pullOutcome);
  return 'pull-error';
}

export type UseSyncAutoSyncOptions = {
  /**
   * Hook is rendered unconditionally for hook-order stability, but the
   * background polling timer + listeners are skipped entirely when this
   * flag is false. Enterprise policy uses this to keep sync code paths
   * dormant on locked-down devices. QR-pair adoption is also gated —
   * a phone that lands on a `?pair=` URL still won't save the pair if
   * policy forbids LAN.
   */
  enabled?: boolean;
};

export function useSyncAutoSync(opts: UseSyncAutoSyncOptions = {}) {
  const enabled = opts.enabled !== false;
  const { user } = useAccount();
  const { replaceAll, data, flushPendingSave } = useAppData();

  // Mirror the latest `data` and `backend` into refs so the effect
  // doesn't tear down its listeners every time either changes. The
  // effect runs ONCE on mount and listens for backend swaps via
  // `subscribeActiveBackend`.
  const dataRef = useRef<AppData>(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const backendRef = useRef<SyncBackend | null>(null);
  if (backendRef.current === null) backendRef.current = getActiveBackend();

  const userIdRef = useRef(user?.id);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  const lastAttemptAt = useRef(0);
  const inFlight = useRef(false);

  const flushLocal = useCallback(async () => {
    await flushPendingSave();
  }, [flushPendingSave]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // QR-pair adoption (LAN only). Runs at most once per mount.
    const incomingPair = readPairFromUrl();
    if (incomingPair) {
      savePair(incomingPair);
      stripPairFromUrl();
      // Refresh the backend ref so the very first sync after a fresh
      // pair uses the just-saved credentials.
      backendRef.current = getActiveBackend();
    }

    const runSync = async (force: boolean) => {
      if (cancelled || inFlight.current) return;
      const backend = backendRef.current;
      if (!backend) return;
      const now = Date.now();
      if (!force && now - lastAttemptAt.current < MIN_GAP_MS) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      inFlight.current = true;
      lastAttemptAt.current = now;
      try {
        await runSyncCycle({
          backend,
          localData: dataRef.current,
          getLocalData: () => dataRef.current,
          flushLocal,
          applyRemote: (next) => {
            if (!cancelled) replaceAll(next);
          },
          userId: userIdRef.current,
        });
      } finally {
        if (!cancelled) inFlight.current = false;
      }
    };

    const startupTimer = window.setTimeout(() => {
      void runSync(true);
    }, STARTUP_DELAY_MS);

    const onFocus = () => void runSync(false);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void runSync(false);
    };
    const onOnline = () => void runSync(true);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    // React to the user flipping the active backend in Settings (e.g.
    // signed into Drive). We swap the backend ref and force an
    // immediate sync so the new backend pulls a baseline.
    const unsubscribe = subscribeActiveBackend(() => {
      backendRef.current = getActiveBackend();
      // Reset the rate-limit so the user sees an immediate response
      // after toggling provider.
      lastAttemptAt.current = 0;
      void runSync(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      unsubscribe();
    };
  }, [replaceAll, enabled, flushLocal]);
}
