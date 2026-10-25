import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { IcAlertTriangle, IcCheck, IcX } from '../icons';

/**
 * Lightweight, framework-free toast system mounted once at the app root.
 *
 * Design choices:
 *   - No portal. The container is a fixed-position layer that participates
 *     in the normal React tree, so it inherits the active ThemeProvider
 *     CSS variables (light/dark switch works without any extra wiring).
 *   - Auto-dismiss with a per-toast duration, plus a manual close affordance
 *     for keyboard-driven users (the inline `×` is focusable and has an
 *     aria-label).
 *   - A bounded queue (`MAX_TOASTS`) keeps a stack of long-running ops from
 *     drowning the screen — older toasts get evicted in FIFO order if the
 *     queue overflows.
 *   - `aria-live="polite"` on the container so screen readers announce
 *     each toast without interrupting the user's current focus.
 *   - Use this for non-blocking confirmations / errors. For destructive
 *     confirmations that NEED a Yes/No answer, use `useConfirm()` from
 *     ConfirmProvider — it renders the shared Spotify-style modal.
 *     toasts are read-only by design.
 */

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

type ToastInput = {
  kind?: ToastKind;
  title: string;
  description?: string;
  /** Milliseconds before auto-dismiss. Pass `0` to make the toast sticky. Default 4500. */
  durationMs?: number;
  /** One optional button (for example Undo). Pressing it runs `onClick` and dismisses the toast. */
  action?: { label: string; onClick: () => void };
};

type Toast = ToastInput & {
  id: string;
  kind: ToastKind;
  createdAt: number;
};

type Ctx = {
  show: (toast: ToastInput) => string;
  showSuccess: (title: string, description?: string) => string;
  showError: (title: string, description?: string) => string;
  showInfo: (title: string, description?: string) => string;
  showWarning: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

const MAX_TOASTS = 4;
const DEFAULT_DURATION_MS = 4500;

let counter = 0;
function nextId() {
  counter += 1;
  return `toast-${Date.now().toString(36)}-${counter}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track active dismiss timers so we can cancel them on manual dismiss
  // (prevents leaked timers from setting state on an unmounted toast).
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const durationsRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    durationsRef.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId();
      const toast: Toast = {
        ...input,
        id,
        kind: input.kind ?? 'info',
        createdAt: Date.now(),
      };
      setToasts((prev) => {
        const next = [...prev, toast];
        // Evict the oldest when over capacity so a runaway loop can't
        // bury the screen under a tower of stale notifications.
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
      const ms = input.durationMs ?? DEFAULT_DURATION_MS;
      durationsRef.current.set(id, ms);
      if (ms > 0) {
        const timer = setTimeout(() => dismiss(id), ms);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  // A toast with a button (Undo) waits while the pointer or keyboard focus is on it, then counts
  // down again, so it can be reached by someone who is slower than the timer.
  const pause = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);
  const resume = useCallback(
    (id: string) => {
      const ms = durationsRef.current.get(id) ?? 0;
      if (ms <= 0 || timersRef.current.has(id)) return;
      timersRef.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  // Clean up any pending timers on provider unmount to avoid the
  // "Can't perform a React state update on an unmounted component" warning.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      show,
      showSuccess: (title, description) => show({ kind: 'success', title, description }),
      showError: (title, description) =>
        show({ kind: 'error', title, description, durationMs: 7000 }),
      showInfo: (title, description) => show({ kind: 'info', title, description }),
      showWarning: (title, description) =>
        show({ kind: 'warning', title, description, durationMs: 6000 }),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} pause={pause} resume={resume} />
    </ToastCtx.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast called outside <ToastProvider>');
  return ctx;
}

function ToastContainer({
  toasts,
  dismiss,
  pause,
  resume,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
}) {
  // Always mounted: a live region that appears together with its first message is often not announced.
  return (
    <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} onPause={() => pause(t.id)} onResume={() => resume(t.id)} />
      ))}
    </div>
  );
}

function IcInfo({ size = 18 }: { size?: number }) {
  // Inline info glyph — `icons.tsx` doesn't have one and the toast layer
  // is the only consumer, so we keep it local instead of polluting the
  // shared icon module.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12" y2="8" />
    </svg>
  );
}

function ToastItem({
  toast,
  onDismiss,
  onPause,
  onResume,
}: {
  toast: Toast;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const icon = (() => {
    switch (toast.kind) {
      case 'success':
        return <IcCheck size={18} />;
      case 'error':
      case 'warning':
        return <IcAlertTriangle size={18} />;
      default:
        return <IcInfo size={18} />;
    }
  })();
  return (
    <div
      className={`toast toast--${toast.kind}`}
      {...(toast.action
        ? { onMouseEnter: onPause, onMouseLeave: onResume, onFocus: onPause, onBlur: onResume }
        : {})}
    >
      <span className="toast__icon" aria-hidden>
        {icon}
      </span>
      <div className="toast__body">
        <div className="toast__title">{toast.title}</div>
        {toast.description ? <div className="toast__desc">{toast.description}</div> : null}
        {toast.action ? (
          <button
            type="button"
            className="toast__action"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="toast__close"
        aria-label="Dismiss notification"
        title="Dismiss notification"
        onClick={onDismiss}
      >
        <IcX size={14} />
      </button>
    </div>
  );
}
