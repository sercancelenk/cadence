/**
 * Decision helpers for applying parent/external rich-text props into a live
 * TipTap editor without clobbering in-flight local edits (zero data loss).
 */

export type PendingExternalSnapshot = {
  externalKey: string;
  /** `localEditGen` at the moment this external value was queued. */
  queuedAtLocalGen: number;
};

export type PendingExternalDecision =
  | { action: 'wait' }
  | { action: 'ack' }
  | { action: 'apply' }
  | { action: 'drop-stale' };

/**
 * Decide what to do with a queued external document at a flush/blur boundary.
 *
 * - wait: editor still focused or debounce still pending
 * - ack: external already matches live/emitted — update keys only
 * - drop-stale: a local emit happened after queue — keep live, never setContent
 * - apply: no newer local emit; safe to setContent from the queued value
 */
export function decidePendingExternalFlush(args: {
  hasPending: boolean;
  hasFocus: boolean;
  hasPendingTimer: boolean;
  incomingSig: string;
  liveSig: string;
  lastEmittedSig: string | null;
  queuedAtLocalGen: number;
  localEditGen: number;
}): PendingExternalDecision {
  if (!args.hasPending) return { action: 'wait' };
  if (args.hasFocus || args.hasPendingTimer) return { action: 'wait' };

  if (
    args.incomingSig === args.lastEmittedSig ||
    args.incomingSig === args.liveSig
  ) {
    return { action: 'ack' };
  }

  // Local onChange was emitted after this external was queued — applying would
  // silently revert keystrokes that already landed in AppData.
  if (args.queuedAtLocalGen < args.localEditGen) {
    return { action: 'drop-stale' };
  }

  return { action: 'apply' };
}

/**
 * When parent props match the live/emitted doc (echo), do not discard a
 * diverging queued external (sync/restore) that is still waiting for blur.
 */
export function shouldClearPendingOnPropsEcho(args: {
  hasPending: boolean;
  pendingSig: string;
  incomingSig: string;
  liveSig: string;
  queuedAtLocalGen: number;
  localEditGen: number;
}): boolean {
  if (!args.hasPending) return false;
  if (
    args.pendingSig === args.incomingSig ||
    args.pendingSig === args.liveSig
  ) {
    return true;
  }
  if (args.queuedAtLocalGen < args.localEditGen) return true;
  return false;
}
