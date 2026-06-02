import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppData } from '../AppDataContext';
import { useAccount } from '../AccountContext';
import {
  noteBodyPatchIsNoOp,
  plainTextFromBodyFields,
  richTextPayloadToBodyFields,
  type RichTextBodyFields,
} from '../lib/richTextBody';
import type { RichTextPayload } from '../lib/richText';
const RichTextEditor = lazy(() =>
  import('../components/ui/RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
);

function prefetchRichTextEditor() {
  void import('../components/ui/RichTextEditor');
}
import {
  IcArrowLeft,
  IcCheck,
  IcEyeOff,
  IcGrip,
  IcKey,
  IcListTodo,
  IcLock,
  IcLockOff,
  IcPlus,
  IcSparkles,
  IcStar,
  IcTrash,
  IcUnlock,
} from '../components/icons';
import { isAIConfigured } from '../lib/ai';
import { useFeatures } from '../lib/features';
import { isTodoOpen } from '../model';
// AITaskExtractorDialog drags in react-markdown + ai libs — lazy-load it
// so the notes payload stays light for users who never extract tasks.
const AITaskExtractorDialog = lazy(() =>
  import('../components/AITaskExtractorDialog').then((m) => ({ default: m.AITaskExtractorDialog })),
);
import { useNotesUnlock } from '../lib/NotesUnlockContext';
import {
  createNotesLock,
  decryptBodyWithMaster,
  encryptBodyWithMaster,
  unlockMaster,
  unwrapPassphraseFromRecovery,
  wrapPassphraseForRecovery,
} from '../lib/notesCrypto';
import type { Note, NotesLock, TodoGroup, TodoItem } from '../model';

const PLACEHOLDER_TITLE = 'New note';

/**
 * Sort modes available in the sidebar dropdown. `manual` is special — it's
 * the only mode that lets the user drag rows up/down to reorder them
 * (using each note's persisted `sortOrder`).
 *
 * Pinned notes always sort to the top, regardless of mode.
 */
type NoteSortMode = 'updated' | 'opened' | 'created' | 'title' | 'manual';

const SORT_OPTIONS: { value: NoteSortMode; label: string }[] = [
  { value: 'updated', label: 'Last updated' },
  { value: 'opened', label: 'Last opened' },
  { value: 'created', label: 'Created' },
  { value: 'title', label: 'Title (A→Z)' },
  { value: 'manual', label: 'Manual' },
];

/** Sidebar resize bounds. Kept liberal — the goal is to prevent the
 *  sidebar from collapsing to a useless slit or hogging the editor pane,
 *  not to police taste. */
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_DEFAULT_WIDTH = 320;

/**
 * What the user is trying to do when we prompt for the passphrase.
 *
 *   - 'view'              – temporarily decrypt for reading; note stays locked
 *   - 'lock'              – encrypt the current note body and mark it locked
 *   - 'unlock-selected'   – PERMANENTLY remove the lock from the selected note
 *                           (decrypts to plaintext on disk)
 *   - 'disable-locking'   – remove the workspace-wide passphrase, decrypting
 *                           every locked note back to plaintext on disk
 */
type PendingIntent = 'lock' | 'unlock-selected' | 'disable-locking' | 'view';

const FORCE_RESET_PHRASE = 'DELETE LOCKED NOTES';

/**
 * macOS-Notes-style two-pane view. Left rail lists every note (title +
 * preview); right pane is a Markdown editor for the selected note.
 *
 * Lock model: a workspace passphrase derives a non-extractable AES-256-GCM
 * `CryptoKey` (PBKDF2-SHA-256, 200k iters) once per session. Locked notes
 * encrypt with that cached key + a fresh IV per save — sub-millisecond, so
 * re-encryption per keystroke is fine.
 *
 * **Strict per-note unlock UX (the user's expectation):**
 *
 *   Locking a note must HIDE its content AND require the passphrase to be
 *   re-entered before that content can be seen again. Concretely:
 *
 *     - Clicking **Lock** encrypts the body, clears the in-memory plaintext
 *       (`decrypted`), AND drops the session master key (`unlock.clear()`).
 *     - Clicking **Hide** on a viewed locked note clears the plaintext AND
 *       drops the session key for the same reason.
 *     - Clicking **Unlock to view** ALWAYS prompts for the passphrase,
 *       even if the session master key is still cached from an earlier
 *       unlock. We `unlock.clear()` right before opening the prompt in
 *       `requestAction('view')` to enforce this. Otherwise navigating
 *       away from a viewed locked note (which only clears `decrypted`,
 *       not the session key) and clicking "Unlock to view" again would
 *       silently re-decrypt the body — exactly the "I locked it but it's
 *       still readable" surprise we want to avoid.
 *
 *   We deliberately never auto-decrypt on selection, so even if some other
 *   path leaves a session key in memory, locked notes still render the
 *   "🔒 Locked" screen until the user explicitly unlocks them.
 *
 * Implementation notes worth keeping in your head when editing this file:
 *
 *   - The plaintext body of the selected note lives in the `decrypted`
 *     state object (keyed by note id). The editor always reads from there;
 *     the on-disk `selected.body` is only consulted for unlocked notes
 *     and as the initial seed when we first decrypt.
 *
 *   - We never depend on the master key being readable via the
 *     `NotesUnlockProvider` ref immediately after `remember()` — React
 *     hasn't re-rendered yet, so `ref.current` is still stale. Instead, the
 *     setup / unlock submit handlers pass the freshly-derived `CryptoKey`
 *     directly into `performAction(intent, masterKey)`, which is the
 *     single source of truth for what "lock", "unlock", "disable locking"
 *     and "view" mean. This is what fixes the historical bug where
 *     setting a passphrase and immediately locking a note would derive a
 *     SECOND key, encrypt the body with the first key but persist the
 *     second verifier, and then refuse to unlock with the correct
 *     passphrase.
 */
export function NotesPage() {
  const { data, addNote, patchNote, replaceNote, removeNote, setNotesLock, update } = useAppData();
  const { user } = useAccount();
  const unlock = useNotesUnlock();
  const account = useAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { features } = useFeatures();
  const aiEnabled = features.ai && isAIConfigured(data.aiSettings);
  /**
   * Snapshot of the note we launched the AI extractor against.
   *
   * We INTENTIONALLY freeze `{ noteId, notes }` at click-time instead of
   * threading the live `selected.id` / `editorBody` into the dialog
   * every render. Without this snapshot, clicking another note in the
   * sidebar while the extractor is open would change the dialog's
   * `initialNotes` prop, and the dialog's own reset effect would then
   * wipe the textarea + already-extracted rows mid-flow.
   *
   * `null` means "extractor is closed". Set on ✨ click, cleared on
   * dialog close.
   */
  const [extractorContext, setExtractorContext] = useState<{ noteId: string; notes: string } | null>(
    null,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Visible width of the left sidebar in px. Reset per session — we don't
   *  persist this anywhere; the user can tune it on each visit if they like. */
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  /** Active sort mode for the notes list. Per-session state (not persisted)
   *  — defaults to "Last updated" which is also the historical behaviour. */
  const [sortMode, setSortMode] = useState<NoteSortMode>('updated');
  /** Note id currently being dragged for manual reorder, or null. */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** Target note id the dragged row is currently hovering over (used to
   *  paint a drop indicator); null when no drop target is active. */
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  /** Tracks the live drag delta for the sidebar resize handle. The pointer
   *  events flow through a ref so we don't re-render the page on every
   *  mouse-move — the inline grid-template-columns is updated from the
   *  `sidebarWidth` state once per drop. */
  const resizeStateRef = useRef<{ startX: number; startW: number } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmDisableLock, setConfirmDisableLock] = useState(false);

  const [setupPw1, setSetupPw1] = useState('');
  const [setupPw2, setSetupPw2] = useState('');
  /** Optional recovery wrap during setup: encrypt the Notes passphrase with
   *  the account password so the user can recover from a forgotten passphrase. */
  const [setupEnableRecovery, setSetupEnableRecovery] = useState(true);
  const [setupAccountPw, setSetupAccountPw] = useState('');
  const [unlockPw, setUnlockPw] = useState('');
  const [setupErr, setSetupErr] = useState<string | null>(null);
  const [unlockErr, setUnlockErr] = useState<string | null>(null);
  const [disableErr, setDisableErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Force-reset escape hatch: shown inside the unlock dialog when the user
   *  has tried-and-failed at least once. They have to type the literal
   *  FORCE_RESET_PHRASE to confirm — there's no recovery for the locked
   *  notes after this, but it prevents an unrecoverable workspace. */
  const [forceResetOpen, setForceResetOpen] = useState(false);
  const [forceResetInput, setForceResetInput] = useState('');
  /** Account-password recovery flow ("Forgot passphrase?"): user enters
   *  their account password, we unwrap the Notes passphrase and unlock. */
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverPw, setRecoverPw] = useState('');
  const [recoverErr, setRecoverErr] = useState<string | null>(null);
  /** Add-recovery-to-existing-lock flow: user enters current Notes
   *  passphrase AND account password to attach a recovery envelope to a
   *  workspace lock that doesn't have one yet. */
  const [addRecoveryOpen, setAddRecoveryOpen] = useState(false);
  const [addRecoveryNotesPw, setAddRecoveryNotesPw] = useState('');
  const [addRecoveryAccountPw, setAddRecoveryAccountPw] = useState('');
  const [addRecoveryErr, setAddRecoveryErr] = useState<string | null>(null);

  /** Plaintext for the currently-displayed note (keyed by id to survive our
   *  own re-encryption re-renders). */
  const [decrypted, setDecrypted] = useState<
    ({ noteId: string } & RichTextBodyFields) | null
  >(null);
  /** Monotonic counter that lets a slow encrypt completion drop out if a
   *  newer keystroke already started a more recent encrypt. */
  const encryptGen = useRef(0);

  useEffect(() => {
    prefetchRichTextEditor();
  }, []);

  // ----- DERIVED ---------------------------------------------------------

  /**
   * Sorted list driving the sidebar. Pinned notes always float to the top
   * regardless of `sortMode` — within each pinned tier the active mode
   * decides the order.
   *
   *   - `updated` / `created` / `opened`: descending ISO string compare
   *     (newest first). `opened` falls back to `updatedAt` when a note
   *     was never opened (legacy data, freshly imported, etc.) so brand-
   *     new notes don't sink to the bottom of the list.
   *   - `title`: case-insensitive locale compare, ascending.
   *   - `manual`: ascending `sortOrder`; notes without a `sortOrder` are
   *     treated as +∞ so they end up after manually-ordered ones (in their
   *     `updatedAt`-descending order as a tiebreaker).
   */
  const notes = useMemo<Note[]>(() => {
    const cmpUpdated = (a: Note, b: Note) => (b.updatedAt || '').localeCompare(a.updatedAt || '');
    const cmpCreated = (a: Note, b: Note) => (b.createdAt || '').localeCompare(a.createdAt || '');
    const cmpOpened = (a: Note, b: Note) =>
      (b.lastOpenedAt || b.updatedAt || '').localeCompare(a.lastOpenedAt || a.updatedAt || '');
    const cmpTitle = (a: Note, b: Note) =>
      (a.title || PLACEHOLDER_TITLE).localeCompare(b.title || PLACEHOLDER_TITLE, undefined, {
        sensitivity: 'base',
      });
    const cmpManual = (a: Note, b: Note) => {
      const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.POSITIVE_INFINITY;
      const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return cmpUpdated(a, b);
    };
    const cmp =
      sortMode === 'created'
        ? cmpCreated
        : sortMode === 'opened'
          ? cmpOpened
          : sortMode === 'title'
            ? cmpTitle
            : sortMode === 'manual'
              ? cmpManual
              : cmpUpdated;
    return [...data.notes].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return cmp(a, b);
    });
  }, [data.notes, sortMode]);

  /**
   * Honour an incoming `?id=<noteId>` deep link (used by the global search
   * + ⌘K command palette when the user clicks a Note hit). We only consume
   * the query string once on arrival — after consuming it we strip it from
   * the URL so a later reload doesn't keep re-selecting the same note and
   * fighting the user's manual navigation inside the page.
   */
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    if (data.notes.some((n) => n.id === id)) {
      setSelectedId(id);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // On narrow viewports (phones) we intentionally do NOT auto-select a
  // note — the user lands on the list and drills into a detail screen by
  // tapping a row, which the .notes-page--mobile-{list,detail} CSS classes
  // below render as a single full-screen view at a time. Auto-selecting
  // would dump them straight into the *first* note's editor, which is
  // exactly the "I have 50 notes, jumping back is torture" complaint.
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(max-width: 800px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 800px)');
    const onChange = (e: MediaQueryListEvent) => setIsNarrowViewport(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (selectedId && notes.some((n) => n.id === selectedId)) return;
    // Keep the previous auto-select behaviour on desktop (so an empty
    // editor pane is never shown next to a populated list) but skip it on
    // phones, where we want the user to deliberately tap into a note.
    if (isNarrowViewport) {
      if (selectedId && !notes.some((n) => n.id === selectedId)) setSelectedId(null);
      return;
    }
    setSelectedId(notes[0]?.id ?? null);
  }, [notes, selectedId, isNarrowViewport]);

  /**
   * Deep-link selection. When the user lands on `/notes?focus=<id>`
   * (e.g. by clicking the source-note chip on a todo row) we:
   *   1. Select that note id, expanding it in the editor pane.
   *   2. Strip the `focus` param so refreshes / back navigations don't
   *      re-trigger the effect.
   *
   * If the target id doesn't match any note (e.g. the note was deleted
   * between the navigation event and the load) we silently fall back to
   * the default selection effect above.
   */
  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId) return;
    if (data.notes.some((n) => n.id === focusId)) {
      setSelectedId(focusId);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [searchParams, data.notes, setSearchParams]);

  /**
   * Stamp `lastOpenedAt` only while "Last opened" sort is active — otherwise
   * we'd churn the store on every selection without affecting list order.
   */
  useEffect(() => {
    if (!selectedId || sortMode !== 'opened') return;
    const n = data.notes.find((x) => x.id === selectedId);
    if (!n) return;
    const now = new Date().toISOString();
    if (n.lastOpenedAt && now.slice(0, 16) === n.lastOpenedAt.slice(0, 16)) return;
    patchNote(selectedId, { lastOpenedAt: now });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, sortMode]);

  const selected = useMemo(
    () => (selectedId ? notes.find((n) => n.id === selectedId) ?? null : null),
    [notes, selectedId],
  );

  /** Plaintext cache for the selected note only — never read `decrypted` without this guard. */
  const decryptedForSelected = useMemo(() => {
    if (!selected || !decrypted || decrypted.noteId !== selected.id) return null;
    return decrypted;
  }, [selected, decrypted]);

  /** True when the editor has plaintext for the selected note. */
  const editorReady =
    !!selected && (!selected.locked || !!decryptedForSelected);

  const editorBodyFormat =
    selected?.bodyFormat ?? decryptedForSelected?.bodyFormat ?? 'auto';

  const editorBody = !selected
    ? ''
    : selected.locked
      ? decryptedForSelected?.body ?? ''
      : selected.body ?? '';

  const notePlainText = (n: Note, decryptedBody?: RichTextBodyFields | null) => {
    if (n.locked) {
      if (decryptedBody?.noteId === n.id) {
        return plainTextFromBodyFields(decryptedBody);
      }
      return '';
    }
    return plainTextFromBodyFields(n);
  };

  // ----- CLEAR CACHED PLAINTEXT WHEN SELECTION CHANGES ------------------
  //
  // STRICT LOCK BEHAVIOUR: we deliberately do NOT auto-decrypt a locked
  // note here even if `unlock.read()` would return a usable master key.
  // The user has to click "Unlock to view" on every locked note they want
  // to read — locking a note must reliably hide its contents. The cached
  // plaintext for a previously-selected note is dropped here so it does
  // not leak when the user navigates to another locked note.
  useEffect(() => {
    if (!selected) {
      setDecrypted(null);
      return;
    }
    if (decrypted && decrypted.noteId !== selected.id) {
      setDecrypted(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // ----- CORE: perform a pending action with an EXPLICIT key -------------

  /**
   * Executes one of the four intents with the supplied master key. Callers
   * MUST pass the key directly (don't rely on the `NotesUnlockProvider`
   * ref) when they've just derived it in the same call stack — React state
   * is still in-flight at that point.
   */
  const performAction = useCallback(
    async (intent: PendingIntent, key: CryptoKey, targetNote: Note | null) => {
      switch (intent) {
        case 'view': {
          // Decrypts the selected locked note into the in-memory `decrypted`
          // cache so the editor can render it. The note's on-disk `locked`
          // flag stays true — the plaintext lives only in this renderer's
          // memory for the current selection.
          if (targetNote?.locked && targetNote.cipher) {
            setBusy(true);
            try {
              const body = await decryptBodyWithMaster(key, targetNote.cipher);
              if (body === null) {
                setUnlockErr('That passphrase does not unlock this note.');
                setUnlockOpen(true);
                setPendingIntent('view');
                return;
              }
              setDecrypted({
                noteId: targetNote.id,
                body,
                bodyFormat: targetNote.bodyFormat,
                bodyPlainText: targetNote.bodyPlainText,
              });
            } finally {
              setBusy(false);
            }
          }
          return;
        }
        case 'lock': {
          if (!targetNote) return;
          setBusy(true);
          try {
            const bodyToLock = targetNote.locked
              ? decrypted?.noteId === targetNote.id
                ? decrypted.body
                : targetNote.body
              : targetNote.body;
            const cipher = await encryptBodyWithMaster(key, bodyToLock);
            replaceNote({
              ...targetNote,
              body: '',
              locked: true,
              cipher,
              bodyFormat: targetNote.bodyFormat ?? decrypted?.bodyFormat,
              bodyPlainText: undefined,
            });
            // CRITICAL for the strict-lock UX: drop the cached plaintext
            // immediately so the editor re-renders the "🔒 Locked" screen
            // instead of continuing to show the body the user just locked.
            setDecrypted(null);
            // …and drop the session master key too, so the next "Unlock to
            // view" reliably prompts for the passphrase. Without this, the
            // user clicks Lock and then Unlock and the note opens silently
            // because the workspace key is still cached in memory — which
            // is exactly the "lock didn't really lock" bug.
            unlock.clear();
          } finally {
            setBusy(false);
          }
          return;
        }
        case 'unlock-selected': {
          if (!targetNote || !targetNote.cipher) return;
          setBusy(true);
          try {
            const body = await decryptBodyWithMaster(key, targetNote.cipher);
            if (body === null) {
              setUnlockErr('That passphrase does not unlock this note.');
              setUnlockOpen(true);
              setPendingIntent('unlock-selected');
              return;
            }
            replaceNote({
              ...targetNote,
              body,
              locked: false,
              cipher: undefined,
              bodyFormat: targetNote.bodyFormat,
              bodyPlainText: targetNote.bodyPlainText,
            });
            setDecrypted({
              noteId: targetNote.id,
              body,
              bodyFormat: targetNote.bodyFormat,
              bodyPlainText: targetNote.bodyPlainText,
            });
          } finally {
            setBusy(false);
          }
          return;
        }
        case 'disable-locking': {
          setBusy(true);
          setDisableErr(null);
          try {
            const lockedNotes = data.notes.filter((n) => n.locked && n.cipher);
            const decryptedPairs: { id: string; body: string }[] = [];
            for (const n of lockedNotes) {
              const body = await decryptBodyWithMaster(key, n.cipher!);
              if (body === null) {
                setDisableErr(
                  `Could not decrypt "${n.title || PLACEHOLDER_TITLE}" with the current passphrase. ` +
                    `If this is a leftover from an earlier broken attempt, delete that note (the Delete button works even when locked) ` +
                    `and try "Remove lock" again.`,
                );
                return;
              }
              decryptedPairs.push({ id: n.id, body });
            }
            update((d) => {
              const lookup = new Map(decryptedPairs.map((p) => [p.id, p.body]));
              const now = new Date().toISOString();
              const nextNotes = d.notes.map((n) =>
                lookup.has(n.id)
                  ? { ...n, body: lookup.get(n.id)!, locked: false, cipher: undefined, updatedAt: now }
                  : n,
              );
              const { notesLock: _drop, ...rest } = d;
              return { ...(rest as typeof d), notes: nextNotes };
            });
            setNotesLock(undefined);
            unlock.clear();
            setConfirmDisableLock(false);
          } finally {
            setBusy(false);
          }
        }
      }
    },
    [data.notes, decrypted, replaceNote, setNotesLock, unlock, update],
  );

  // ----- SIDEBAR RESIZE --------------------------------------------------
  //
  // Drag-to-resize is implemented with Pointer Events so the same code path
  // works for mouse, touch and pen. We capture the pointer on the handle
  // element so the move/up events keep firing even if the cursor leaves
  // the handle's bounding box during a fast drag.
  //
  // The handler does its arithmetic against a snapshot captured on
  // pointerdown (`resizeStateRef`) so the math stays correct no matter how
  // many re-renders fire while the user is dragging.

  const beginSidebarResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only respond to primary-button drags. Right-click / middle-click
      // shouldn't kick off a resize.
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      resizeStateRef.current = { startX: e.clientX, startW: sidebarWidth };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarWidth],
  );

  const onSidebarResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = resizeStateRef.current;
    if (!s) return;
    const next = clamp(s.startW + (e.clientX - s.startX), SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
    setSidebarWidth(next);
  }, []);

  const endSidebarResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStateRef.current) return;
    resizeStateRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer already released (e.g. focus lost) — safe to ignore.
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // ----- MANUAL DRAG-REORDER ---------------------------------------------
  //
  // Active only when `sortMode === 'manual'`. Uses native HTML5 drag-and-
  // drop (lightweight, no extra deps, accessible enough for our needs).
  // On drop we rewrite `sortOrder` on every note in the dragged note's
  // pinned tier — keeping pinned notes locked at the top and only
  // re-indexing the half of the list that the user actually re-ordered.

  const onRowDragStart = useCallback(
    (e: React.DragEvent<HTMLLIElement>, noteId: string) => {
      if (sortMode !== 'manual') return;
      e.dataTransfer.effectAllowed = 'move';
      // Some browsers require setData to actually fire dragover/drop.
      try {
        e.dataTransfer.setData('text/plain', noteId);
      } catch {
        // Restricted contexts (e.g. headless tests) can throw — safe to ignore.
      }
      setDraggingId(noteId);
    },
    [sortMode],
  );

  const onRowDragOver = useCallback(
    (e: React.DragEvent<HTMLLIElement>, noteId: string) => {
      if (sortMode !== 'manual' || !draggingId || draggingId === noteId) return;
      // Both rows must be in the same pinned tier — we don't allow a pinned
      // note to drag below an unpinned one (or vice versa), the pin row
      // boundary stays as a hard separator in every sort mode.
      const dragged = notes.find((n) => n.id === draggingId);
      const target = notes.find((n) => n.id === noteId);
      if (!dragged || !target || !!dragged.pinned !== !!target.pinned) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTargetId !== noteId) setDropTargetId(noteId);
    },
    [sortMode, draggingId, notes, dropTargetId],
  );

  const onRowDrop = useCallback(
    (e: React.DragEvent<HTMLLIElement>, noteId: string) => {
      if (sortMode !== 'manual' || !draggingId || draggingId === noteId) return;
      e.preventDefault();
      const dragged = notes.find((n) => n.id === draggingId);
      const target = notes.find((n) => n.id === noteId);
      if (!dragged || !target || !!dragged.pinned !== !!target.pinned) {
        setDraggingId(null);
        setDropTargetId(null);
        return;
      }
      // Take the subset of notes in the same pinned tier (in current sort
      // order), remove the dragged one, then re-insert it at the target's
      // position. We rewrite `sortOrder` for every note in that tier so
      // future reorders have a stable baseline to work from.
      const tier = notes.filter((n) => !!n.pinned === !!dragged.pinned);
      const without = tier.filter((n) => n.id !== draggingId);
      const insertAt = without.findIndex((n) => n.id === noteId);
      const reordered = [
        ...without.slice(0, insertAt),
        dragged,
        ...without.slice(insertAt),
      ];
      update((d) => ({
        ...d,
        notes: d.notes.map((n) => {
          const idx = reordered.findIndex((r) => r.id === n.id);
          return idx === -1 ? n : { ...n, sortOrder: idx };
        }),
      }));
      setDraggingId(null);
      setDropTargetId(null);
    },
    [sortMode, draggingId, notes, update],
  );

  const onRowDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  // ----- BUTTON HANDLERS ------------------------------------------------

  /** Open the right passphrase dialog for the given intent, or call
   *  performAction immediately when we already have the key.
   *
   *  Special-case for `'view'`: every attempt to look at a locked note
   *  MUST prompt for the Notes passphrase — even if the session master
   *  key is still cached from an earlier unlock. The user's expectation
   *  is that locking a note hides it for good, and that they re-prove
   *  the passphrase each time they want to see it again. Without this,
   *  navigating away from a viewed locked note and back to it would
   *  silently re-decrypt the body, which defeats the whole point of
   *  locking it. We also `unlock.clear()` so any incidental read of the
   *  cached key elsewhere also sees null after this point. */
  const requestAction = useCallback(
    (intent: PendingIntent) => {
      if (intent === 'view') {
        unlock.clear();
      }
      const key = intent === 'view' ? null : unlock.read();
      if (key) {
        void performAction(intent, key, selected);
        return;
      }
      if (!data.notesLock) {
        setSetupErr(null);
        setSetupPw1('');
        setSetupPw2('');
        setPendingIntent(intent);
        setSetupOpen(true);
        return;
      }
      setUnlockErr(null);
      setUnlockPw('');
      setPendingIntent(intent);
      setUnlockOpen(true);
    },
    [unlock, performAction, selected, data.notesLock],
  );

  const onCreate = () => {
    const id = addNote();
    setSelectedId(id);
    setDecrypted(null);
  };

  const onChangeTitle = (next: string) => {
    if (!selected) return;
    patchNote(selected.id, { title: next });
  };

  const onChangeBody = (payload: RichTextPayload) => {
    if (!selected) return;
    const fields = payload.plainText.trim()
      ? richTextPayloadToBodyFields(payload)
      : { body: '', bodyFormat: undefined, bodyPlainText: undefined };
    if (noteBodyPatchIsNoOp(selected, fields)) return;
    if (!selected.locked) {
      setDecrypted({ noteId: selected.id, ...fields });
      patchNote(selected.id, fields);
      return;
    }
    setDecrypted({ noteId: selected.id, ...fields });
    const key = unlock.read();
    if (!key) return;
    if (!payload.plainText.trim()) return;
    const myGen = ++encryptGen.current;
    void (async () => {
      const cipher = await encryptBodyWithMaster(key, fields.body);
      if (myGen !== encryptGen.current) return;
      replaceNote({
        ...selected,
        body: '',
        locked: true,
        cipher,
        bodyFormat: fields.bodyFormat,
        bodyPlainText: undefined,
      });
    })();
  };

  const onTogglePinned = () => {
    if (!selected) return;
    patchNote(selected.id, { pinned: !selected.pinned });
  };

  const confirmDelete = () => {
    if (!confirmRemoveId) return;
    removeNote(confirmRemoveId);
    setConfirmRemoveId(null);
  };

  /**
   * Re-hide a locked note that the user has temporarily unlocked for
   * viewing. We drop both the cached plaintext AND the session master key
   * so that the next "Unlock to view" reliably prompts for the passphrase.
   * The on-disk note is unchanged — it was already encrypted; only the
   * in-memory secrets are wiped.
   */
  const hideSelected = () => {
    if (!selected || !selected.locked) return;
    setDecrypted(null);
    unlock.clear();
  };

  // No auto-open-unlock-dialog here. The "🔒 Locked" screen in the editor
  // pane gives the user an explicit "Unlock to view" button — that is the
  // single, predictable entry point for decrypting any individual note,
  // so the prompt only ever shows up in direct response to a user click.

  // ----- DIALOG SUBMIT HANDLERS -----------------------------------------

  const submitSetup = async () => {
    setSetupErr(null);
    const a = setupPw1;
    const b = setupPw2;
    if (a.length < 6) {
      setSetupErr('Choose a passphrase of at least 6 characters.');
      return;
    }
    if (a !== b) {
      setSetupErr('Passphrases do not match.');
      return;
    }
    const wantsRecovery = setupEnableRecovery;
    const accountPw = setupAccountPw;
    if (wantsRecovery && !accountPw) {
      setSetupErr('Enter your account password (or untick "Enable recovery").');
      return;
    }
    setBusy(true);
    try {
      // Verify the account password BEFORE we wrap with it — otherwise a
      // typo here would silently produce an unwrappable recovery envelope
      // that the user would only discover when they actually need it.
      let recovery: NotesLock['recovery'] | undefined;
      if (wantsRecovery) {
        const v = await account.verifyPassword(accountPw);
        if (!v.ok) {
          setSetupErr(v.error ?? 'Could not verify account password.');
          return;
        }
        recovery = await wrapPassphraseForRecovery(a, accountPw);
      }
      const { lock, masterKey } = await createNotesLock(a);
      const fullLock: NotesLock = recovery ? { ...lock, recovery } : lock;
      setNotesLock(fullLock);
      unlock.remember(masterKey);
      setSetupOpen(false);
      setSetupPw1('');
      setSetupPw2('');
      setSetupAccountPw('');
      const intent = pendingIntent;
      setPendingIntent(null);
      // CRITICAL: pass the freshly-derived key directly. Reading it back via
      // `unlock.read()` right now would return null because React hasn't
      // re-rendered the provider yet.
      if (intent) await performAction(intent, masterKey, selected);
    } catch (e) {
      setSetupErr(e instanceof Error ? e.message : 'Could not set passphrase.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * "Forgot passphrase?" recovery path. The user enters their account
   * password; we use it to unwrap the Notes passphrase stored in
   * `notesLock.recovery`, then derive the master key from that passphrase
   * normally. Same trust boundary as the original passphrase — no notes are
   * decrypted by the account password directly.
   */
  const submitRecover = async () => {
    setRecoverErr(null);
    if (!data.notesLock?.recovery) {
      setRecoverErr('There is no recovery envelope on this workspace.');
      return;
    }
    const accountPw = recoverPw;
    if (!accountPw) return;
    setBusy(true);
    try {
      const passphrase = await unwrapPassphraseFromRecovery(data.notesLock.recovery, accountPw);
      if (!passphrase) {
        setRecoverErr('That account password is not correct (or the recovery envelope is corrupt).');
        return;
      }
      const key = await unlockMaster(passphrase, data.notesLock);
      if (!key) {
        // Shouldn't happen unless somebody tampered with the file — the
        // recovery envelope decrypted but the resulting passphrase doesn't
        // match the master key verifier.
        setRecoverErr('Recovery envelope decrypted but the passphrase did not unlock the notes.');
        return;
      }
      unlock.remember(key);
      setRecoverOpen(false);
      setRecoverPw('');
      setUnlockOpen(false);
      setUnlockPw('');
      const intent = pendingIntent;
      setPendingIntent(null);
      if (intent === 'disable-locking') {
        setConfirmDisableLock(true);
        return;
      }
      if (intent) await performAction(intent, key, selected);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Attach a recovery envelope to a workspace lock that doesn't have one
   * yet. We need both the current Notes passphrase (to confirm the user
   * really knows it — otherwise anyone with brief physical access could
   * register an attacker-controlled recovery) and the account password
   * (so the wrap actually works).
   */
  const submitAddRecovery = async () => {
    setAddRecoveryErr(null);
    if (!data.notesLock) {
      setAddRecoveryErr('There is no Notes passphrase to recover.');
      return;
    }
    const notesPw = addRecoveryNotesPw;
    const accountPw = addRecoveryAccountPw;
    if (!notesPw || !accountPw) return;
    setBusy(true);
    try {
      const key = await unlockMaster(notesPw, data.notesLock);
      if (!key) {
        setAddRecoveryErr('That is not the current Notes passphrase.');
        return;
      }
      const v = await account.verifyPassword(accountPw);
      if (!v.ok) {
        setAddRecoveryErr(v.error ?? 'Incorrect account password.');
        return;
      }
      const recovery = await wrapPassphraseForRecovery(notesPw, accountPw);
      setNotesLock({ ...data.notesLock, recovery });
      // Remember the verified master key while we're at it — they just
      // proved they know the passphrase, no reason to ask again this session.
      unlock.remember(key);
      setAddRecoveryOpen(false);
      setAddRecoveryNotesPw('');
      setAddRecoveryAccountPw('');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Nuclear option: drop the workspace lock AND delete every note that's
   * still locked, without ever decrypting them. Used when the user has
   * permanently lost their passphrase. We gate it behind typing a literal
   * confirmation phrase so it can't be triggered by an accidental click.
   */
  const forceReset = useCallback(() => {
    update((d) => {
      const nextNotes = d.notes.filter((n) => !n.locked);
      const { notesLock: _drop, ...rest } = d;
      return { ...(rest as typeof d), notes: nextNotes };
    });
    setNotesLock(undefined);
    unlock.clear();
    setForceResetOpen(false);
    setForceResetInput('');
    setUnlockOpen(false);
    setConfirmDisableLock(false);
    setPendingIntent(null);
    setUnlockErr(null);
    setUnlockPw('');
  }, [update, setNotesLock, unlock]);

  const submitUnlock = async () => {
    setUnlockErr(null);
    const pw = unlockPw;
    if (!pw) return;
    if (!data.notesLock) return;
    setBusy(true);
    try {
      const key = await unlockMaster(pw, data.notesLock);
      if (!key) {
        setUnlockErr('That passphrase is not correct.');
        return;
      }
      unlock.remember(key);
      setUnlockOpen(false);
      setUnlockPw('');
      const intent = pendingIntent;
      setPendingIntent(null);
      // For destructive intents (remove the workspace lock entirely) we
      // show the confirm dialog AFTER unlocking — the user has now proven
      // they know the passphrase, and we can run the irreversible
      // operation only when they explicitly approve it.
      if (intent === 'disable-locking') {
        setConfirmDisableLock(true);
        return;
      }
      // Same reason as in submitSetup: hand the freshly-derived key through.
      if (intent) await performAction(intent, key, selected);
    } finally {
      setBusy(false);
    }
  };

  // ----- RENDER ----------------------------------------------------------

  const hasLock = !!data.notesLock;
  const hasRecovery = !!data.notesLock?.recovery;

  return (
    <div
      className={`notes-page${selected ? ' notes-page--mobile-detail' : ' notes-page--mobile-list'}`}
      style={{ gridTemplateColumns: `minmax(0, ${sidebarWidth}px) 6px minmax(0, 1fr)` }}
    >
      <aside className="notes-page__sidebar">
        <header className="notes-page__sidebar-header">
          <h2>Notes</h2>
          <div className="notes-page__sidebar-actions">
            <select
              className="select select--compact notes-page__sort"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as NoteSortMode)}
              aria-label="Sort notes by"
              title="Sort notes by"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {hasLock && !hasRecovery ? (
              <IconButton
                onClick={() => {
                  setAddRecoveryErr(null);
                  setAddRecoveryNotesPw('');
                  setAddRecoveryAccountPw('');
                  setAddRecoveryOpen(true);
                }}
                label="Add recovery"
                tooltip="Allow recovery using your account password"
              >
                <IcKey size={16} />
              </IconButton>
            ) : null}
            {hasLock ? (
              <IconButton
                onClick={() => {
                  // Removing the workspace passphrase is irreversible and
                  // destructive (it decrypts every locked note back to
                  // plaintext on disk). We deliberately ALWAYS prompt for
                  // the Notes passphrase here, even when the master key is
                  // already cached in this session — re-authenticating the
                  // user right before such a high-impact change is the
                  // expected UX and prevents accidental "click-while-the-
                  // -session-is-still-warm" mistakes.
                  setDisableErr(null);
                  unlock.clear();
                  setUnlockErr(null);
                  setUnlockPw('');
                  setPendingIntent('disable-locking');
                  setUnlockOpen(true);
                }}
                label="Remove notes passphrase"
                tooltip="Remove the Notes passphrase from this workspace"
                variant="danger"
              >
                <IcLockOff size={16} />
              </IconButton>
            ) : null}
            <IconButton
              onClick={onCreate}
              label="New note"
              tooltip="New note"
              variant="primary"
            >
              <IcPlus size={16} />
            </IconButton>
          </div>
        </header>
        {notes.length === 0 ? (
          <div className="notes-page__empty">
            <p>No notes yet.</p>
            <button type="button" className="btn btn--primary" onClick={onCreate}>
              Create your first note
            </button>
          </div>
        ) : (
          <ul className="notes-page__list">
            {notes.map((n) => {
              // `decrypted` only ever holds plaintext for the currently
              // selected note (see selection-change effect above), so this
              // open-lock view only ever applies to the one row the user is
              // actively looking at. The note itself stays encrypted on
              // disk — we just stop pretending the body is unknown in the
              // list when we already have it in memory.
              const isViewingLocked =
                n.locked && decrypted?.noteId === n.id;
              const previewText = n.locked
                ? isViewingLocked
                  ? notePlainText(n, decrypted)
                  : 'Locked note'
                : notePlainText(n);
              const preview = previewText.replace(/\s+/g, ' ').slice(0, 80);
              const title = (n.title || PLACEHOLDER_TITLE).trim() || PLACEHOLDER_TITLE;
              const isManual = sortMode === 'manual';
              const isDragging = draggingId === n.id;
              const isDropTarget = dropTargetId === n.id;
              const liClass = [
                'notes-page__list-row',
                isDragging ? 'notes-page__list-row--dragging' : '',
                isDropTarget ? 'notes-page__list-row--drop-target' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <li
                  key={n.id}
                  className={liClass}
                  // Draggable only in manual mode. In other modes the row
                  // behaves as a plain navigation button so the user doesn't
                  // accidentally trigger drag interactions during scrolling.
                  draggable={isManual}
                  onDragStart={(e) => onRowDragStart(e, n.id)}
                  onDragOver={(e) => onRowDragOver(e, n.id)}
                  onDrop={(e) => onRowDrop(e, n.id)}
                  onDragEnd={onRowDragEnd}
                >
                  <button
                    type="button"
                    className={`notes-page__list-item${selectedId === n.id ? ' notes-page__list-item--active' : ''}`}
                    onClick={() => setSelectedId(n.id)}
                  >
                    {isManual ? (
                      <span className="notes-page__drag-handle" aria-hidden title="Drag to reorder">
                        <IcGrip size={12} />
                      </span>
                    ) : null}
                    <div className="notes-page__list-title">
                      {n.pinned ? <span className="notes-page__pin" aria-hidden>★</span> : null}
                      <span>{title}</span>
                      {n.locked ? (
                        isViewingLocked ? (
                          <IcUnlock
                            size={12}
                            className="notes-page__list-lock notes-page__list-lock--open"
                            aria-label="Unlocked for viewing"
                          />
                        ) : (
                          <IcLock
                            size={12}
                            className="notes-page__list-lock"
                            aria-label="Locked"
                          />
                        )
                      ) : null}
                    </div>
                    <div className="notes-page__list-preview">{preview || '—'}</div>
                    <time className="notes-page__list-time" dateTime={n.updatedAt}>
                      {new Date(n.updatedAt).toLocaleString()}
                    </time>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div
        className="notes-page__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize notes sidebar"
        onPointerDown={beginSidebarResize}
        onPointerMove={onSidebarResizeMove}
        onPointerUp={endSidebarResize}
        onPointerCancel={endSidebarResize}
      />

      <section className="notes-page__main">
        {!selected ? (
          <div className="notes-page__placeholder">Select a note on the left, or create a new one.</div>
        ) : (
          <>
            <header className="notes-page__main-header">
              {/* Drill-down "Back" affordance — hidden on desktop via
                  CSS (the list and editor live side-by-side there) and
                  shown as the first element on phones. Clears selection
                  which collapses .notes-page--mobile-detail back into
                  the list view. */}
              <button
                type="button"
                className="notes-page__back"
                onClick={() => setSelectedId(null)}
                aria-label="Back to notes list"
                title="Back to notes list"
              >
                <IcArrowLeft size={18} />
                <span>Notes</span>
              </button>
              <input
                className="notes-page__title-input"
                value={selected.title}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder={PLACEHOLDER_TITLE}
                disabled={selected.locked && !editorReady}
              />
              <div className="notes-page__main-actions">
                {aiEnabled ? (
                  // Launch the task extractor pre-loaded with THIS
                  // note's body. Disabled while the note is still
                  // locked (no content to extract from) — the user
                  // unlocks first, then extracts. Tasks created
                  // through the dialog auto-link back to this note
                  // via `sourceNoteId`. We snapshot the body at
                  // click-time so subsequent sidebar navigation
                  // doesn't reset the dialog state.
                  <IconButton
                    onClick={() =>
                      setExtractorContext({
                        noteId: selected.id,
                        notes: notePlainText(selected, decryptedForSelected),
                      })
                    }
                    disabled={selected.locked && !editorReady}
                    label="Extract tasks from this note"
                    tooltip="Extract tasks from this note"
                  >
                    <IcSparkles size={16} />
                  </IconButton>
                ) : null}

                <IconButton
                  onClick={onTogglePinned}
                  label={selected.pinned ? 'Unpin' : 'Pin to top'}
                  tooltip={selected.pinned ? 'Unpin' : 'Pin to top'}
                  pressed={!!selected.pinned}
                >
                  <IcStar size={16} />
                </IconButton>

                {/* Lock state toolbar button. Three states:
                    - Unlocked → "Lock note": encrypts and hides the body
                    - Locked + viewing (decrypted in memory) → "Hide": clears
                      the in-memory plaintext so the locked screen returns
                    - Locked + hidden → "Unlock to view": prompts passphrase
                      if needed, then decrypts into memory for reading */}
                {!selected.locked ? (
                  <IconButton
                    onClick={() => requestAction('lock')}
                    disabled={busy}
                    label="Lock note"
                    tooltip="Lock note"
                  >
                    <IcLock size={16} />
                  </IconButton>
                ) : editorReady ? (
                  <IconButton
                    onClick={hideSelected}
                    disabled={busy}
                    label="Hide note"
                    tooltip="Hide content (re-lock view)"
                  >
                    <IcEyeOff size={16} />
                  </IconButton>
                ) : (
                  <IconButton
                    onClick={() => requestAction('view')}
                    disabled={busy}
                    label="Unlock to view"
                    tooltip="Unlock to view"
                  >
                    <IcUnlock size={16} />
                  </IconButton>
                )}

                {/* "Remove lock permanently" — only meaningful for locked
                    notes, and only after the user has unlocked it for
                    viewing (so we don't ask for the passphrase twice). */}
                {selected.locked && editorReady ? (
                  <IconButton
                    onClick={() => requestAction('unlock-selected')}
                    disabled={busy}
                    label="Remove lock"
                    tooltip="Remove lock from this note (decrypt permanently)"
                  >
                    <IcKey size={16} />
                  </IconButton>
                ) : null}

                <IconButton
                  onClick={() => setConfirmRemoveId(selected.id)}
                  label="Delete note"
                  tooltip="Delete note"
                  variant="danger"
                >
                  <IcTrash size={16} />
                </IconButton>
              </div>
            </header>

            {selected.locked && !editorReady ? (
              <div className="notes-page__locked">
                <div className="notes-page__locked-badge" aria-hidden>
                  <IcLock size={28} />
                </div>
                <h3>This note is locked</h3>
                {busy ? (
                  <p>Decrypting…</p>
                ) : (
                  <>
                    <p>
                      Enter your Notes passphrase to view this note. The body is encrypted at rest and
                      will only be readable while you keep it unlocked.
                    </p>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => requestAction('view')}
                    >
                      <IcUnlock size={14} />
                      <span style={{ marginLeft: 6 }}>Unlock to view</span>
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="notes-page__editor">
                <Suspense
                  fallback={
                    <div className="notes-page__editor-loading muted small">Loading editor…</div>
                  }
                >
                  <RichTextEditor
                    key={selected.id}
                    value={editorBody}
                    valueFormat={editorBodyFormat}
                    onChange={onChangeBody}
                    placeholder="Write your note…"
                    minHeight={360}
                    editable={editorReady}
                    attachmentScope={{ documentKind: 'note', documentId: selected.id }}
                    attachmentUserId={user?.id ?? 'anonymous'}
                  />
                </Suspense>

                <NoteBacklinks
                  noteId={selected.id}
                  todoItems={data.todoItems}
                  todoGroups={data.todoGroups}
                  onOpenTask={(taskId) => {
                    // Navigate to the Todos route and pass the target
                    // task id through the URL so TodosPage can scroll
                    // and flash it on arrival. We deliberately push a
                    // new history entry (not replace) so the user can
                    // hit Back to return to the note.
                    navigate(`/todos?focus=${encodeURIComponent(taskId)}`);
                  }}
                />
              </div>
            )}
          </>
        )}
      </section>

      {extractorContext ? (
        // Lazy-loaded so the AI bundle stays out of the Notes initial
        // payload. The {noteId, notes} pair was snapshotted at the
        // moment the user clicked ✨ — so even if they switch to
        // another note while the dialog is open, we keep extracting
        // from the original note's body and continue linking tasks
        // back to its id.
        <Suspense fallback={null}>
          <AITaskExtractorDialog
            open
            onClose={() => setExtractorContext(null)}
            sourceNoteId={extractorContext.noteId}
            initialNotes={extractorContext.notes}
          />
        </Suspense>
      ) : null}

      {setupOpen ? (
        <NotesDialog
          title="Set a Notes passphrase"
          icon={<IcLock size={18} />}
          onClose={() => {
            setSetupOpen(false);
            setPendingIntent(null);
            setSetupPw1('');
            setSetupPw2('');
            setSetupAccountPw('');
            setSetupErr(null);
          }}
          footer={
            <button type="button" className="btn btn--primary" onClick={submitSetup} disabled={busy}>
              {busy ? 'Saving…' : 'Save passphrase'}
            </button>
          }
        >
          <p>
            This passphrase is required to lock and unlock notes. It's <strong>different from your account
            password</strong> and is <strong>never stored on disk</strong> — only a verifier blob is saved, used to
            check whether the passphrase you type later is correct.
          </p>
          <label className="field">
            <span>Passphrase</span>
            <input
              type="password"
              className="input"
              value={setupPw1}
              onChange={(e) => setSetupPw1(e.target.value)}
              autoFocus
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>Confirm passphrase</span>
            <input
              type="password"
              className="input"
              value={setupPw2}
              onChange={(e) => setSetupPw2(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !setupEnableRecovery) void submitSetup();
              }}
            />
          </label>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={setupEnableRecovery}
              onChange={(e) => setSetupEnableRecovery(e.target.checked)}
            />
            <span>Enable recovery using my account password (recommended)</span>
          </label>
          {setupEnableRecovery ? (
            <>
              <p style={{ fontSize: 12, opacity: 0.8 }}>
                We'll wrap this passphrase with a key derived from your account password and store the encrypted
                blob alongside the verifier. If you forget the Notes passphrase, you can recover by entering your
                account password. The strongest of the two passwords is what protects your notes at rest.
              </p>
              <label className="field">
                <span>Account password</span>
                <input
                  type="password"
                  className="input"
                  value={setupAccountPw}
                  onChange={(e) => setSetupAccountPw(e.target.value)}
                  autoComplete="current-password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitSetup();
                  }}
                />
              </label>
            </>
          ) : (
            <p className="text-warn">
              Without recovery: if you forget this passphrase, locked notes <strong>cannot be recovered</strong>.
            </p>
          )}
          {setupErr ? <p className="text-error">{setupErr}</p> : null}
        </NotesDialog>
      ) : null}

      {unlockOpen ? (
        <NotesDialog
          title={unlockDialogTitle(pendingIntent)}
          icon={<IcLock size={18} />}
          onClose={() => {
            setUnlockOpen(false);
            setPendingIntent(null);
            setUnlockPw('');
            setUnlockErr(null);
          }}
          footer={
            <button type="button" className="btn btn--primary" onClick={submitUnlock} disabled={busy}>
              {busy ? 'Checking…' : unlockDialogButton(pendingIntent)}
            </button>
          }
        >
          <p>{unlockDialogBody(pendingIntent)}</p>
          <label className="field">
            <span>Passphrase</span>
            <input
              type="password"
              className="input"
              value={unlockPw}
              onChange={(e) => setUnlockPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitUnlock();
              }}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          {unlockErr ? <p className="text-error">{unlockErr}</p> : null}
          {/* "Forgot?" routes to whichever recovery path is available:
              if a recovery envelope was set up, the account-password
              recovery dialog; otherwise the destructive force-reset. */}
          <p style={{ marginTop: 12, fontSize: 12 }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                if (data.notesLock?.recovery) {
                  setRecoverErr(null);
                  setRecoverPw('');
                  setRecoverOpen(true);
                } else {
                  setForceResetOpen(true);
                }
              }}
            >
              Forgot passphrase?
            </button>
          </p>
        </NotesDialog>
      ) : null}

      {recoverOpen ? (
        <NotesDialog
          title="Recover with your account password"
          icon={<IcLock size={18} />}
          onClose={() => {
            setRecoverOpen(false);
            setRecoverPw('');
            setRecoverErr(null);
          }}
          footer={
            <button
              type="button"
              className="btn btn--primary"
              onClick={submitRecover}
              disabled={busy || !recoverPw}
            >
              {busy ? 'Recovering…' : 'Recover & unlock'}
            </button>
          }
        >
          <p>
            Enter your <strong>account password</strong> (the one you log in with). We'll use it to decrypt the
            Notes passphrase that was stored at setup time, then unlock the workspace.
          </p>
          <label className="field">
            <span>Account password</span>
            <input
              type="password"
              className="input"
              value={recoverPw}
              onChange={(e) => setRecoverPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRecover();
              }}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          {recoverErr ? <p className="text-error">{recoverErr}</p> : null}
          <p style={{ marginTop: 12, fontSize: 12 }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setRecoverOpen(false);
                setRecoverPw('');
                setRecoverErr(null);
                setForceResetOpen(true);
              }}
            >
              Account password also lost? Delete locked notes &amp; reset
            </button>
          </p>
        </NotesDialog>
      ) : null}

      {addRecoveryOpen ? (
        <NotesDialog
          title="Add account-password recovery"
          icon={<IcLock size={18} />}
          onClose={() => {
            setAddRecoveryOpen(false);
            setAddRecoveryNotesPw('');
            setAddRecoveryAccountPw('');
            setAddRecoveryErr(null);
          }}
          footer={
            <button
              type="button"
              className="btn btn--primary"
              onClick={submitAddRecovery}
              disabled={busy || !addRecoveryNotesPw || !addRecoveryAccountPw}
            >
              {busy ? 'Saving…' : 'Enable recovery'}
            </button>
          }
        >
          <p>
            Add a recovery path so a forgotten Notes passphrase can be recovered using your account password.
            We need both the current Notes passphrase (to confirm it's you) and your account password (so the
            wrap actually works).
          </p>
          <label className="field">
            <span>Current Notes passphrase</span>
            <input
              type="password"
              className="input"
              value={addRecoveryNotesPw}
              onChange={(e) => setAddRecoveryNotesPw(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <span>Account password</span>
            <input
              type="password"
              className="input"
              value={addRecoveryAccountPw}
              onChange={(e) => setAddRecoveryAccountPw(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitAddRecovery();
              }}
            />
          </label>
          {addRecoveryErr ? <p className="text-error">{addRecoveryErr}</p> : null}
        </NotesDialog>
      ) : null}

      {forceResetOpen ? (
        <NotesDialog
          title="Forgot the Notes passphrase?"
          icon={<IcLock size={18} />}
          onClose={() => {
            setForceResetOpen(false);
            setForceResetInput('');
          }}
          footer={
            <button
              type="button"
              className="btn btn--danger"
              onClick={forceReset}
              disabled={forceResetInput !== FORCE_RESET_PHRASE}
            >
              Delete locked notes &amp; reset
            </button>
          }
        >
          <p>
            There is no recovery path for the Notes passphrase — that's the whole point of at-rest encryption.
            If you proceed, we will:
          </p>
          <ul>
            <li>Permanently delete every note that's currently locked (ciphertext gone, unrecoverable).</li>
            <li>Remove the workspace passphrase so you can start fresh.</li>
            <li>Leave every plaintext note untouched.</li>
          </ul>
          <p className="text-warn">
            This cannot be undone. Type <code>{FORCE_RESET_PHRASE}</code> below to confirm.
          </p>
          <label className="field">
            <span>Confirmation</span>
            <input
              type="text"
              className="input"
              value={forceResetInput}
              onChange={(e) => setForceResetInput(e.target.value)}
              placeholder={FORCE_RESET_PHRASE}
              autoFocus
            />
          </label>
        </NotesDialog>
      ) : null}

      {confirmRemoveId ? (
        <NotesDialog
          title="Delete note?"
          onClose={() => setConfirmRemoveId(null)}
          footer={
            <button type="button" className="btn btn--danger" onClick={confirmDelete}>
              Delete
            </button>
          }
        >
          <p>
            {(() => {
              const n = notes.find((x) => x.id === confirmRemoveId);
              if (!n) return 'This note will be removed permanently.';
              if (n.locked) {
                return 'This note is locked. Deleting it removes the ciphertext — once it is gone you can\'t recover it even if you remember the passphrase.';
              }
              return 'This note will be removed permanently. There is no undo.';
            })()}
          </p>
        </NotesDialog>
      ) : null}

      {confirmDisableLock ? (
        <NotesDialog
          title="Remove the Notes passphrase?"
          icon={<IcLock size={18} />}
          onClose={() => {
            setConfirmDisableLock(false);
            setDisableErr(null);
          }}
          footer={
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                // By construction the confirm dialog is only ever shown
                // AFTER the workspace has been unlocked, so the master key
                // is always available here — call performAction directly
                // and skip the requestAction dispatch logic.
                const key = unlock.read();
                if (!key) {
                  // Edge case: lock cleared in another window between
                  // unlock and confirm. Fall back to the prompt.
                  setUnlockErr(null);
                  setUnlockPw('');
                  setPendingIntent('disable-locking');
                  setConfirmDisableLock(false);
                  setUnlockOpen(true);
                  return;
                }
                void performAction('disable-locking', key, null);
              }}
              disabled={busy}
            >
              {busy ? 'Decrypting…' : 'Remove passphrase'}
            </button>
          }
        >
          <p>
            This will decrypt every locked note back to plain text on disk and remove the workspace passphrase.
            After that, anyone who can open this file can read your notes.
          </p>
          <p className="text-warn">
            We will refuse to proceed if even one locked note fails to decrypt — your data will be left unchanged.
          </p>
          {disableErr ? (
            <>
              <p className="text-error">{disableErr}</p>
              {/* If decryption fails here, the user is stuck — their
                  notesLock no longer matches the per-note ciphertext.
                  Offer the same nuclear escape hatch as the unlock dialog
                  so the workspace can be recovered. */}
              <p style={{ marginTop: 12, fontSize: 12 }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setForceResetOpen(true)}
                >
                  Can't recover? Delete locked notes &amp; reset
                </button>
              </p>
            </>
          ) : null}
        </NotesDialog>
      ) : null}
    </div>
  );
}

/**
 * Intent-aware copy for the passphrase prompt. When the workspace already
 * has a passphrase set, the user needs to enter it ONCE per session before
 * any encryption / decryption can happen — including locking a brand-new
 * note. The button they tap to get here ("Lock", "Unlock", "Remove lock",
 * or simply selecting a locked note) tells us what they're trying to do,
 * and the dialog should mirror that so they aren't shown "to view locked
 * notes" copy while they're really just trying to lock the current note.
 */
/** Inclusive clamp — kept inline (not in lib/) because we currently only
 *  need it for the sidebar resize math; promoting it can wait until a
 *  second caller shows up. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function unlockDialogTitle(intent: PendingIntent | null): string {
  switch (intent) {
    case 'lock':
      return 'Enter Notes passphrase to lock';
    case 'unlock-selected':
      return 'Enter Notes passphrase to unlock';
    case 'disable-locking':
      return 'Enter Notes passphrase to remove lock';
    case 'view':
    default:
      return 'Unlock notes';
  }
}

function unlockDialogBody(intent: PendingIntent | null): string {
  switch (intent) {
    case 'lock':
      return 'This workspace already has a Notes passphrase. Enter it once to encrypt this note (and any other locked notes) for the rest of this session.';
    case 'unlock-selected':
      return 'Enter your Notes passphrase to decrypt this note for the rest of this session.';
    case 'disable-locking':
      return 'Enter your Notes passphrase. We need to decrypt every locked note before removing the workspace passphrase.';
    case 'view':
    default:
      return 'Enter your Notes passphrase to view locked notes in this session.';
  }
}

function unlockDialogButton(intent: PendingIntent | null): string {
  switch (intent) {
    case 'lock':
      return 'Unlock & lock';
    case 'unlock-selected':
      return 'Unlock';
    case 'disable-locking':
      return 'Unlock & continue';
    case 'view':
    default:
      return 'Unlock';
  }
}

/**
 * Compact, icon-only action button used across the Notes header bars.
 *
 * Why a tiny local component instead of the project-wide `Button`: that one
 * always inflates to the `.btn--small` 34px square via min-height/min-width
 * (good for general toolbars). Notes wants tighter pill chips that line up
 * neatly inside the slim 12px-padded sidebar header. We also bake in the
 * `aria-label` + native `title` (tooltip-on-hover) pair so every callsite
 * gets accessibility for free and we never end up with an unlabelled icon.
 */
function IconButton({
  children,
  onClick,
  disabled,
  label,
  tooltip,
  variant = 'ghost',
  pressed,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Used as `aria-label` for screen readers. */
  label: string;
  /** Native browser tooltip text. Defaults to `label`. */
  tooltip?: string;
  variant?: 'ghost' | 'primary' | 'danger';
  /** When true, paints the button with the accent fill (e.g. pinned state). */
  pressed?: boolean;
}) {
  const cls = [
    'notes-icon-btn',
    `notes-icon-btn--${variant}`,
    pressed ? 'notes-icon-btn--pressed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={tooltip ?? label}
    >
      {children}
    </button>
  );
}

/**
 * Local dialog wrapper that uses the SAME centred-modal markup as
 * `AIAssistantDialog` (the `.ai-backdrop` overlay + the `.ai-dialog` panel
 * defined in `app.css`). Previously the Notes screen rolled its own
 * `.ai-dialog__panel` class which doesn't exist, so the popups rendered
 * full-bleed with no backdrop.
 */
function NotesDialog({
  title,
  icon,
  onClose,
  footer,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="ai-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ai-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="ai-dialog__header">
          {icon ? <span className="ai-dialog__icon">{icon}</span> : null}
          <div className="ai-dialog__titlewrap">
            <h2 className="ai-dialog__title">{title}</h2>
          </div>
          <button type="button" className="ai-dialog__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="ai-dialog__scroll">{children}</div>
        <div className="notes-dialog__footer">{footer}</div>
      </div>
    </div>
  );
}

/**
 * Compact "Tasks extracted from this note" panel rendered beneath the
 * note's markdown editor.
 *
 * Renders nothing when the note has no inbound task links — this keeps
 * the editor surface clean for notes that aren't acting as a task
 * source. Once the user runs the AI extractor with this note as
 * `sourceNoteId`, each created task surfaces here as a clickable row.
 *
 * Each row shows:
 *   - a status indicator (open / done / cancelled),
 *   - the task's title,
 *   - the list it lives in (so the user can mentally locate it),
 *   - a hover-only "open" hint.
 *
 * Clicking a row navigates to `/todos?focus=<id>` — TodosPage reads
 * that query string and scrolls/highlights the matching row.
 */
function NoteBacklinks({
  noteId,
  todoItems,
  todoGroups,
  onOpenTask,
}: {
  noteId: string;
  todoItems: TodoItem[];
  todoGroups: TodoGroup[];
  onOpenTask: (taskId: string) => void;
}) {
  const linked = useMemo(
    () =>
      todoItems
        .filter((t) => t.sourceNoteId === noteId)
        // Open tasks first, then most-recently-updated. This puts
        // the actionable work at the top of the panel and pushes
        // finished/cancelled rows to the bottom.
        .sort((a, b) => {
          const ao = isTodoOpen(a.status) ? 0 : 1;
          const bo = isTodoOpen(b.status) ? 0 : 1;
          if (ao !== bo) return ao - bo;
          return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
        }),
    [todoItems, noteId],
  );
  if (linked.length === 0) return null;

  const groupName = (gid: string) => todoGroups.find((g) => g.id === gid)?.name ?? 'Unknown list';

  return (
    <section className="note-backlinks" aria-label="Tasks extracted from this note">
      <header className="note-backlinks__head">
        <IcListTodo size={14} />
        <h3 className="note-backlinks__title">
          {linked.length === 1
            ? '1 task from this note'
            : `${linked.length} tasks from this note`}
        </h3>
      </header>
      <ul className="note-backlinks__list">
        {linked.map((t) => {
          const open = isTodoOpen(t.status);
          const cancelled = t.status === 'cancelled';
          return (
            <li key={t.id}>
              <button
                type="button"
                className={`note-backlinks__row${open ? '' : ' note-backlinks__row--closed'}${
                  cancelled ? ' note-backlinks__row--cancelled' : ''
                }`}
                onClick={() => onOpenTask(t.id)}
                // Tooltip shows the full title + list name — the
                // rendered row truncates with ellipsis on narrow
                // editor panes so hover discoverability matters.
                title={`${t.title} — ${groupName(t.groupId)}`}
              >
                <span
                  className={`note-backlinks__status note-backlinks__status--${t.status}`}
                  aria-label={`Status: ${t.status}`}
                >
                  {t.status === 'done' ? <IcCheck size={11} strokeWidth={2.5} /> : null}
                </span>
                <span className="note-backlinks__title-text">{t.title}</span>
                <span className="note-backlinks__group muted small">{groupName(t.groupId)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
