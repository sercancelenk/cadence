import { useEffect, useRef } from 'react';
import { useAppData } from '../AppDataContext';
import type { AppData } from '../model';
import {
  computeLocalEtag,
  loadPair,
  pullSnapshot,
  pushSnapshot,
  readPairFromUrl,
  recordSync,
  savePair,
  stripPairFromUrl,
} from './lanSyncClient';

/**
 * App-level hook that quietly keeps this device in sync with the
 * paired host. **Bidirectional**: it pushes local changes up and pulls
 * remote changes down — in that order, so a freshly-edited phone
 * never gets clobbered by a stale pull.
 *
 * Triggers (mirroring the desktop updater):
 *
 *   1. ~500 ms after the React tree mounts — fresh data within a
 *      second of opening the PWA.
 *   2. `window` focus — covers "tabbed away, came back".
 *   3. `document.visibilitychange` to "visible" — covers "unlocked
 *      the phone, app reappeared".
 *   4. `online` event — covers "Wi-Fi came back".
 *
 * Each invocation goes through `runSync`:
 *
 *   - rate-limited (≥ 30 s between attempts) unless `force`
 *   - in-flight lock to prevent concurrent runs
 *   - early-exit if `navigator.onLine === false`
 *
 * Algorithm:
 *
 *   - **First-pair pull**: when `pair.etag` is null we have nothing
 *     to compare against — pull the host's state and adopt its ETag.
 *     We never push a brand-new device's empty workspace over an
 *     established host.
 *
 *   - **Dirty?** Compute the ETag our local snapshot would produce
 *     (matches the host's formula byte-for-byte). If it differs from
 *     `pair.etag`, we have unpushed changes — push them with
 *     `If-Match: pair.etag`.
 *
 *     - 200 OK → host accepted our snapshot, save the new ETag, stop.
 *       (We don't pull right after — the host's ETag is now ours,
 *       there's nothing to download.)
 *     - 412 Conflict → host moved on since our last pull (probably
 *       desktop edited too). We **do not pull**, because that would
 *       overwrite the phone's unpushed changes. We leave the
 *       discrepancy in place and surface it on the next manual Push
 *       from Settings, which has a proper conflict dialog. Silent
 *       bail keeps auto-sync from hijacking the user's UI.
 *     - Other errors → silent bail (auth, network, mixed-content);
 *       Settings surfaces these for explicit actions.
 *
 *   - **Clean?** Pull with `If-None-Match: pair.etag`.
 *
 *     - 304 → no change, just bump `lastSyncedAt`.
 *     - 200 → adopt the host's snapshot via `replaceAll`, save the
 *       new ETag.
 *
 * Why silent on errors: this is background plumbing. Toasts every
 * time a phone wakes on the wrong Wi-Fi would be the noisiest part of
 * the app. Settings → Multi-device sync is where users see explicit
 * status.
 */
const MIN_GAP_MS = 30_000;
const STARTUP_DELAY_MS = 500;

export function useLanSyncAutoPull() {
  const { data, replaceAll } = useAppData();
  const lastAttemptAt = useRef(0);
  const inFlight = useRef(false);
  // We don't want the effect to re-mount its listeners on every edit
  // (that would tear down focus handlers between keystrokes), so we
  // bridge the latest `data` through a ref. The effect reads via the
  // ref; the dep list stays empty.
  const dataRef = useRef<AppData>(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let cancelled = false;

    // Handle the QR-scan landing path: if the URL contains
    // `?pair=<token>`, adopt it as the saved pair (origin = host URL)
    // and clean the URL so a reload doesn't re-trigger the flow.
    const incomingPair = readPairFromUrl();
    if (incomingPair) {
      savePair(incomingPair);
      stripPairFromUrl();
    }

    const runSync = async (force: boolean) => {
      if (cancelled || inFlight.current) return;
      const pair = loadPair();
      if (!pair) return;
      const now = Date.now();
      if (!force && now - lastAttemptAt.current < MIN_GAP_MS) return;
      // `navigator.onLine` is best-effort but lets us skip a useless
      // 12 s timeout when the OS already knows we're offline.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      inFlight.current = true;
      lastAttemptAt.current = now;
      try {
        // First-pair case: no etag means "we don't know what the host
        // has". Pull to establish a baseline before we ever push.
        if (!pair.etag) {
          const pullOutcome = await pullSnapshot(pair.url, pair.token);
          if (cancelled) return;
          if (pullOutcome.kind === 'ok') {
            replaceAll(pullOutcome.data as AppData);
            savePair({ ...pair, etag: pullOutcome.etag, lastSyncedAt: new Date().toISOString() });
          }
          return;
        }

        // Compute the ETag our current local snapshot would produce.
        // If it matches what the host last gave us, we're clean and
        // can just pull. If it differs, we have unpushed changes.
        let localEtag: string;
        try {
          localEtag = await computeLocalEtag(dataRef.current);
        } catch {
          // SubtleCrypto failure — fall back to pull-only (the
          // dataRef path covers older runtimes too).
          localEtag = '';
        }

        if (localEtag && localEtag !== pair.etag) {
          // Dirty — push first. We deliberately do NOT pull on
          // success because the host's etag is now ours; nothing to
          // download. On 412 conflict we also bail; the user resolves
          // explicitly via Settings.
          const pushOutcome = await pushSnapshot(
            pair.url,
            pair.token,
            dataRef.current,
            pair.etag,
          );
          if (cancelled) return;
          if (pushOutcome.kind === 'ok') {
            savePair({
              ...pair,
              etag: pushOutcome.etag,
              lastSyncedAt: new Date().toISOString(),
            });
          }
          // 'conflict' / 'unauthorised' / 'network-error' / 'timeout'
          // / 'too-large' / 'mixed-content' / 'http-error' — all
          // silent; Settings handles the explicit flow.
          return;
        }

        // Clean — try a conditional pull to catch host updates.
        const pullOutcome = await pullSnapshot(pair.url, pair.token, pair.etag);
        if (cancelled) return;
        if (pullOutcome.kind === 'ok') {
          replaceAll(pullOutcome.data as AppData);
          savePair({
            ...pair,
            etag: pullOutcome.etag,
            lastSyncedAt: new Date().toISOString(),
          });
        } else if (pullOutcome.kind === 'not-modified') {
          // Bump lastSyncedAt so the Settings badge reflects "I just
          // confirmed I'm current" — without this the badge would
          // always say "synced 5 min ago" even right after a check.
          recordSync(pair.etag);
        }
      } finally {
        if (!cancelled) inFlight.current = false;
      }
    };

    const startupTimer = window.setTimeout(() => {
      void runSync(true);
    }, STARTUP_DELAY_MS);

    const onFocus = () => {
      void runSync(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void runSync(false);
    };
    const onOnline = () => {
      void runSync(true);
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
    // `replaceAll` is the only function dep; `data` flows in via
    // `dataRef`, so the effect never re-mounts on edits.
  }, [replaceAll]);
}
