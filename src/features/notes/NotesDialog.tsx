import type { ReactNode } from 'react';

export type NotesDialogProps = {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
};

/**
 * Local dialog wrapper that uses the SAME centred-modal markup as
 * `AIAssistantDialog` (the `.ai-backdrop` overlay + the `.ai-dialog` panel
 * defined in `app.css`).
 */
export function NotesDialog({ title, icon, onClose, footer, children }: NotesDialogProps) {
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
