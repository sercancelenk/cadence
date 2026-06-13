import { useState } from 'react';
import { Button } from './ui/Button';
import { RECOVERY_CODE_COUNT } from '../lib/accountRecovery';

type Props = {
  codes: string[];
  title?: string;
  /** Standalone screen — fires when the user clicks Continue. */
  onConfirmed?: () => void;
  /** Wizard embed — hide title/continue; parent drives Next via `onAcknowledgedChange`. */
  embedded?: boolean;
  onAcknowledgedChange?: (acknowledged: boolean) => void;
};

/** One-time display of recovery codes — user must confirm they saved them. */
export function RecoveryCodesPanel({
  codes,
  title = 'Save your recovery codes',
  onConfirmed,
  embedded = false,
  onAcknowledgedChange,
}: Props) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const copyAll = async () => {
    const text = codes.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  };

  return (
    <div className={`recovery-codes${embedded ? ' recovery-codes--embedded' : ''}`} role="region" aria-label="Recovery codes">
      {!embedded ? <h2 className="recovery-codes__title">{title}</h2> : null}
      <p className="muted small recovery-codes__lead">
        These {RECOVERY_CODE_COUNT} codes are the only way to reset your password on <strong>this device</strong>{' '}
        without a backup. We never store them — save them somewhere safe (password manager, printout).
      </p>
      <ol className="recovery-codes__list">
        {codes.map((code, i) => (
          <li key={code}>
            <span className="recovery-codes__idx">{i + 1}.</span>
            <code className="recovery-codes__code">{code}</code>
          </li>
        ))}
      </ol>
      <div className="recovery-codes__actions">
        <Button type="button" variant="secondary" onClick={() => void copyAll()}>
          {copied ? 'Copied' : 'Copy all'}
        </Button>
      </div>
      {copyError ? (
        <p className="text-error small" style={{ marginTop: 8 }}>
          Clipboard is blocked — select and copy the codes manually.
        </p>
      ) : null}
      <label className="recovery-codes__confirm row" style={{ gap: 8, marginTop: 12 }}>
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => {
            setSaved(e.target.checked);
            onAcknowledgedChange?.(e.target.checked);
          }}
        />
        <span className="small">I saved these codes in a safe place</span>
      </label>
      {!embedded && onConfirmed ? (
        <Button
          type="button"
          variant="primary"
          className="recovery-codes__continue"
          disabled={!saved}
          onClick={onConfirmed}
        >
          Continue
        </Button>
      ) : null}
    </div>
  );
}
