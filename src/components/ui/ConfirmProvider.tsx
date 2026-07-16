import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { AppModal, AppModalActions } from './AppModal';

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type PromptOptions = {
  title: string;
  description?: ReactNode;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  /** Shown when the user confirms with only whitespace. */
  requiredMessage?: string;
};

type ConfirmRequest = ConfirmOptions & {
  kind: 'confirm';
  resolve: (accepted: boolean) => void;
};

type PromptRequest = PromptOptions & {
  kind: 'prompt';
  resolve: (value: string | null) => void;
};

type DialogRequest = ConfirmRequest | PromptRequest;

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /**
   * Electron does not implement `window.prompt` (it returns null immediately).
   * Use this modal instead whenever a name / short string is required.
   */
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const queueRef = useRef<DialogRequest[]>([]);
  const requestRef = useRef<DialogRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  requestRef.current = request;

  // If the provider unmounts (e.g. logout/route teardown) while a dialog
  // promise is still pending, resolve every outstanding request as declined
  // so awaiting callers don't hang forever on a dead dialog.
  useEffect(() => {
    return () => {
      const current = requestRef.current;
      if (current?.kind === 'confirm') current.resolve(false);
      else if (current?.kind === 'prompt') current.resolve(null);
      requestRef.current = null;
      for (const queued of queueRef.current) {
        if (queued.kind === 'confirm') queued.resolve(false);
        else queued.resolve(null);
      }
      queueRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (request?.kind !== 'prompt') return;
    setPromptValue(request.initialValue ?? '');
    setPromptError(null);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [request]);

  const flushQueue = useCallback(() => {
    setRequest((current) => {
      if (current) return current;
      return queueRef.current.shift() ?? null;
    });
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        queueRef.current.push({ ...options, kind: 'confirm', resolve });
        flushQueue();
      }),
    [flushQueue],
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        queueRef.current.push({ ...options, kind: 'prompt', resolve });
        flushQueue();
      }),
    [flushQueue],
  );

  const closeConfirm = useCallback(
    (accepted: boolean) => {
      setRequest((current) => {
        if (current?.kind === 'confirm') current.resolve(accepted);
        return null;
      });
      requestAnimationFrame(() => flushQueue());
    },
    [flushQueue],
  );

  const closePrompt = useCallback(
    (value: string | null) => {
      setRequest((current) => {
        if (current?.kind === 'prompt') current.resolve(value);
        return null;
      });
      setPromptError(null);
      requestAnimationFrame(() => flushQueue());
    },
    [flushQueue],
  );

  const dismissConfirm = useCallback(() => closeConfirm(false), [closeConfirm]);
  const acceptConfirm = useCallback(() => closeConfirm(true), [closeConfirm]);
  const dismissPrompt = useCallback(() => closePrompt(null), [closePrompt]);

  const submitPrompt = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      if (request?.kind !== 'prompt') return;
      const trimmed = promptValue.trim();
      if (!trimmed) {
        setPromptError(request.requiredMessage ?? 'A value is required.');
        inputRef.current?.focus();
        return;
      }
      closePrompt(trimmed);
    },
    [closePrompt, promptValue, request],
  );

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request?.kind === 'confirm' ? (
        <AppModal
          title={request.title}
          description={request.description}
          onClose={dismissConfirm}
          closeOnBackdrop={false}
          size="sm"
          footer={
            <AppModalActions
              onCancel={dismissConfirm}
              onConfirm={acceptConfirm}
              cancelLabel={request.cancelLabel ?? 'Cancel'}
              confirmLabel={request.confirmLabel ?? 'Confirm'}
              confirmVariant={request.danger ? 'danger' : 'primary'}
            />
          }
        />
      ) : null}
      {request?.kind === 'prompt' ? (
        <AppModal
          title={request.title}
          description={request.description}
          onClose={dismissPrompt}
          closeOnBackdrop={false}
          size="sm"
          footer={
            <AppModalActions
              onCancel={dismissPrompt}
              onConfirm={() => submitPrompt()}
              cancelLabel={request.cancelLabel ?? 'Cancel'}
              confirmLabel={request.confirmLabel ?? 'Save'}
              confirmDisabled={!promptValue.trim()}
            />
          }
        >
          <form
            className="app-modal__prompt-form"
            onSubmit={submitPrompt}
            // Keep keystrokes from reaching Sketch/ERD canvases under the modal.
            onKeyDown={(e) => e.stopPropagation()}
          >
            <label className="field">
              <span className="sr-only">Name</span>
              <input
                ref={inputRef}
                className="input"
                type="text"
                value={promptValue}
                placeholder={request.placeholder}
                onChange={(e) => {
                  setPromptValue(e.target.value);
                  if (promptError) setPromptError(null);
                }}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {promptError ? <p className="app-modal__prompt-error">{promptError}</p> : null}
          </form>
        </AppModal>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
