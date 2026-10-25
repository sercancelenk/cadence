import { useEffect, useRef, type ReactNode } from 'react';
import { AppModal } from '../ui/AppModal';
import { Button } from '../ui/Button';
import { IcAlertTriangle, IcCopy, IcRefresh, IcSparkles } from '../icons';
import { AiContextChips, type AiContextChip } from './AiContextChips';

export type AiResultPanelProps = {
  open: boolean;
  title: string;
  /** The connection that served the request, shown quietly in the footer. */
  connectionLabel?: string;
  /** The model that answered, shown after the connection name. */
  modelLabel?: string;
  chips: AiContextChip[];
  status: 'running' | 'ready' | 'error' | 'blocked';
  message?: string;
  diagnostic?: string;
  /** The reply was cut off at the token limit. */
  truncated?: boolean;
  /** Text that has arrived so far while the reply is still being written. */
  streamText?: string;
  /** The result view for the task (text, diagram, rows, …). */
  children?: ReactNode;
  applyLabel?: string;
  onApply?: () => void;
  applyDisabled?: boolean;
  /** Wording for the button that closes a finished result (default: Discard when there is something to apply, else Close). */
  closeLabel?: string;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onClose: () => void;
  /** The one fix for a blocked run (for example "Open AI settings"). */
  blockedAction?: { label: string; onClick: () => void };
};

/**
 * The one place an AI result appears, the same for every feature: what was read, the
 * result, and a fixed action bar. The task's own view goes in `children`.
 */
export function AiResultPanel(props: AiResultPanelProps) {
  const { open, title, connectionLabel, modelLabel, chips, status, message, diagnostic, truncated, children } = props;
  const anchor = useRef<HTMLSpanElement | null>(null);
  const previous = useRef(status);
  // The button that was focused while the reply was written (Cancel) is replaced when it arrives;
  // focus then moves to a stable spot in the panel instead of dropping to the page.
  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (was === status) return;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) anchor.current?.focus();
  }, [status]);
  if (!open) return null;

  const footer = (
    <div className="ai-panel__footer">
      <span className="ai-panel__via muted small">{connectionLabel ? `via ${connectionLabel}${modelLabel ? ` · ${modelLabel}` : ''}` : ''}</span>
      <div className="ai-panel__actions">
        {status === 'running' ? (
          <Button type="button" variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
        ) : null}
        {status === 'ready' ? (
          <>
            <Button type="button" variant="ghost" onClick={props.onClose}>
              {props.closeLabel ?? (props.onApply ? 'Discard' : 'Close')}
            </Button>
            {props.onRegenerate ? (
              <Button type="button" variant="ghost" icon={<IcRefresh size={16} />} onClick={props.onRegenerate}>
                Regenerate
              </Button>
            ) : null}
            {props.onCopy ? (
              <Button type="button" variant="secondary" icon={<IcCopy size={16} />} onClick={props.onCopy}>
                Copy
              </Button>
            ) : null}
            {props.onApply ? (
              <Button type="button" variant="primary" disabled={props.applyDisabled} onClick={props.onApply}>
                {props.applyLabel ?? 'Apply'}
              </Button>
            ) : null}
          </>
        ) : null}
        {status === 'error' ? (
          <>
            <Button type="button" variant="ghost" onClick={props.onClose}>
              Close
            </Button>
            {props.onRegenerate ? (
              <Button type="button" variant="primary" icon={<IcRefresh size={16} />} onClick={props.onRegenerate}>
                Try again
              </Button>
            ) : null}
          </>
        ) : null}
        {status === 'blocked' ? (
          <>
            <Button type="button" variant="ghost" onClick={props.onClose}>
              Close
            </Button>
            {props.blockedAction ? (
              <Button type="button" variant="primary" onClick={props.blockedAction.onClick}>
                {props.blockedAction.label}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <AppModal
      onClose={props.onClose}
      title={title}
      icon={<IcSparkles size={18} />}
      size="lg"
      layout="flex"
      showCloseButton
      closeOnBackdrop={false}
      bodyClassName="ai-dialog__scroll"
      footer={footer}
    >
      <span ref={anchor} tabIndex={-1} className="ai-panel__sr" />
      {/* One stable live region: it says when work starts and when the result is there, never the streamed text. */}
      <span className="ai-panel__sr" role="status">
        {status === 'running' ? 'Working…' : status === 'ready' ? 'The result is ready.' : ''}
      </span>
      <AiContextChips chips={chips} />
      {status === 'running' ? (
        <div className="ai-panel__running">
          {props.streamText ? (
            <pre className="ai-panel__stream">{props.streamText}</pre>
          ) : (
            <div className="ai-skeleton" aria-hidden>
              <div className="ai-skeleton__line" />
              <div className="ai-skeleton__line ai-skeleton__line--short" />
              <div className="ai-skeleton__line" />
            </div>
          )}
        </div>
      ) : null}
      {status === 'ready' ? (
        <>
          <div className="ai-panel__result">{children}</div>
          {truncated ? (
            <p className="ai-turn__truncated muted small">
              <IcAlertTriangle size={12} />
              <span>
                The reply hit the token limit and was cut off.
                {props.onContinue ? (
                  <>
                    {' '}
                    <Button type="button" variant="ghost" onClick={props.onContinue}>
                      Continue
                    </Button>
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
        </>
      ) : null}
      {status === 'error' ? (
        <>
          <div className="ai-dialog__error" role="alert">
            {message}
          </div>
          {diagnostic ? (
            <details className="ai-panel__diagnostic">
              <summary>Diagnostic details</summary>
              <pre>{diagnostic}</pre>
            </details>
          ) : null}
        </>
      ) : null}
      {status === 'blocked' ? <p className="ai-panel__blocked">{message}</p> : null}
    </AppModal>
  );
}
