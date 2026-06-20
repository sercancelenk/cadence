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
import { AppModal, AppModalActions } from './AppModal';

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmRequest = ConfirmOptions & {
  resolve: (accepted: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const queueRef = useRef<ConfirmRequest[]>([]);
  const requestRef = useRef<ConfirmRequest | null>(null);
  requestRef.current = request;

  // If the provider unmounts (e.g. logout/route teardown) while a confirm()
  // promise is still pending, resolve every outstanding request as "declined"
  // so awaiting callers don't hang forever on a dead dialog.
  useEffect(() => {
    return () => {
      requestRef.current?.resolve(false);
      requestRef.current = null;
      for (const queued of queueRef.current) queued.resolve(false);
      queueRef.current = [];
    };
  }, []);

  const flushQueue = useCallback(() => {
    setRequest((current) => {
      if (current) return current;
      return queueRef.current.shift() ?? null;
    });
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        queueRef.current.push({ ...options, resolve });
        flushQueue();
      }),
    [flushQueue],
  );

  const close = useCallback(
    (accepted: boolean) => {
      setRequest((current) => {
        if (current) current.resolve(accepted);
        return null;
      });
      requestAnimationFrame(() => flushQueue());
    },
    [flushQueue],
  );

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request ? (
        <AppModal
          title={request.title}
          description={request.description}
          onClose={() => close(false)}
          closeOnBackdrop={false}
          size="sm"
          footer={
            <AppModalActions
              onCancel={() => close(false)}
              onConfirm={() => close(true)}
              cancelLabel={request.cancelLabel ?? 'Cancel'}
              confirmLabel={request.confirmLabel ?? 'Confirm'}
              confirmVariant={request.danger ? 'danger' : 'primary'}
            />
          }
        />
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
