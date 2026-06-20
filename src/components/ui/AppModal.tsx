import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { IcX } from '../icons';

export type AppModalSize = 'sm' | 'md' | 'lg' | 'xl';

export type AppModalProps = {
  onClose: () => void;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: AppModalSize;
  layout?: 'default' | 'flex';
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  ariaLabel?: string;
  className?: string;
  panelClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  bodyRef?: Ref<HTMLDivElement>;
};

export type AppModalActionsProps = {
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  busy?: boolean;
};

export function AppModalActions({
  onCancel,
  onConfirm,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  confirmDisabled = false,
  cancelDisabled = false,
  busy = false,
}: AppModalActionsProps) {
  return (
    <div className="app-modal__actions">
      <button
        type="button"
        className="app-modal__btn-cancel"
        onClick={onCancel}
        disabled={cancelDisabled || busy}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        className={[
          'app-modal__btn-confirm',
          confirmVariant === 'danger' ? 'app-modal__btn-confirm--danger' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={onConfirm}
        disabled={confirmDisabled || busy}
      >
        {busy ? 'Working…' : confirmLabel}
      </button>
    </div>
  );
}

export function AppModal({
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = 'md',
  layout = 'default',
  closeOnBackdrop = true,
  showCloseButton = false,
  ariaLabel,
  className = '',
  panelClassName = '',
  bodyClassName = '',
  footerClassName = '',
  bodyRef,
}: AppModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousActive = document.activeElement;
    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (previousActive instanceof HTMLElement) {
        previousActive.focus();
      }
    };
  }, [onClose]);

  const onBackdropClick = () => {
    if (closeOnBackdrop) onClose();
  };

  const onPanelClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const panelClass = [
    'app-modal',
    `app-modal--${size}`,
    layout === 'flex' ? 'app-modal--flex' : '',
    panelClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className={['app-modal-backdrop', className].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={onBackdropClick}
    >
      <div ref={panelRef} className={panelClass} tabIndex={-1} onClick={onPanelClick}>
        <header className="app-modal__header">
          {icon ? <span className="app-modal__icon">{icon}</span> : null}
          <div className="app-modal__headcopy">
            <h2 id={titleId} className="app-modal__title">
              {title}
            </h2>
            {description ? (
              <div id={descId} className="app-modal__desc">
                {description}
              </div>
            ) : null}
          </div>
          {showCloseButton ? (
            <button
              type="button"
              className="app-modal__close"
              onClick={onClose}
              aria-label="Close"
              title="Close"
            >
              <IcX size={18} />
            </button>
          ) : null}
        </header>
        {children ? (
          <div
            ref={bodyRef}
            className={['app-modal__body', bodyClassName].filter(Boolean).join(' ')}
          >
            {children}
          </div>
        ) : null}
        {footer ? (
          <footer className={['app-modal__footer', footerClassName].filter(Boolean).join(' ')}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
