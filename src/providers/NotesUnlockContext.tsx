import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Holds the workspace **master CryptoKey** for the current session — never
 * the raw passphrase. The key is non-extractable (created with
 * `extractable: false` in `notesCrypto.ts`), so a memory dump can't recover
 * the underlying bytes; only `subtle.encrypt`/`subtle.decrypt` work with it.
 *
 * Lifetime: created on `remember()` after a successful passphrase check;
 * destroyed on `clear()` (called by the "Lock now" affordance) and
 * automatically dropped when this provider unmounts (logout, PIN re-lock,
 * app restart).
 */

type NotesUnlockApi = {
  /** The session master key, or null when locked. */
  masterKey: CryptoKey | null;
  /** True iff `masterKey` is set. */
  isUnlocked: boolean;
  /** Remember the master key for the rest of this session. */
  remember: (key: CryptoKey) => void;
  /** Forget the key immediately (e.g. "Lock now", logout). */
  clear: () => void;
  /** Snapshot read for one-off async work that mustn't depend on render-loop state. */
  read: () => CryptoKey | null;
};

const Ctx = createContext<NotesUnlockApi | null>(null);

export function NotesUnlockProvider({ children }: { children: ReactNode }) {
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const ref = useRef<CryptoKey | null>(null);
  ref.current = masterKey;

  const remember = useCallback((key: CryptoKey) => setMasterKey(key), []);
  const clear = useCallback(() => setMasterKey(null), []);
  const read = useCallback(() => ref.current, []);

  const api = useMemo<NotesUnlockApi>(
    () => ({ masterKey, isUnlocked: masterKey !== null, remember, clear, read }),
    [masterKey, remember, clear, read],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useNotesUnlock(): NotesUnlockApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotesUnlock must be used inside NotesUnlockProvider');
  return v;
}
