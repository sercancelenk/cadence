import { IcLock, IcUnlock } from '../../components/icons';
import type { PendingIntent } from './noteLockTypes';

export type NotesLockedViewProps = {
  busy: boolean;
  onRequestAction: (intent: PendingIntent) => void;
};

export function NotesLockedView({ busy, onRequestAction }: NotesLockedViewProps) {
  return (
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
            Enter your Notes passphrase to view this note. The body is encrypted at rest and will
            only be readable while you keep it unlocked.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => onRequestAction('view')}>
            <IcUnlock size={14} />
            <span style={{ marginLeft: 6 }}>Unlock to view</span>
          </button>
        </>
      )}
    </div>
  );
}
