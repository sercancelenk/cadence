import { IcAlertTriangle, IcCheck } from './icons';
import type { PersistStatusSnapshot } from '../providers/appDataStore';

export type SaveIndicatorState = 'saved' | 'saving' | 'unsaved' | 'error';

type Props = Pick<PersistStatusSnapshot, 'lastSaveError' | 'saving' | 'hasPendingSave'>;

export function saveIndicatorState({ lastSaveError, saving, hasPendingSave }: Props): SaveIndicatorState {
  if (lastSaveError) return 'error';
  if (saving) return 'saving';
  if (hasPendingSave) return 'unsaved';
  return 'saved';
}

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
const SAVE_KEY = isMac ? '⌘S' : 'Ctrl+S';

const LABELS: Record<SaveIndicatorState, string> = {
  saved: 'All changes saved',
  saving: 'Saving…',
  unsaved: `Unsaved changes — press ${SAVE_KEY} to save now`,
  error: 'Saving failed',
};

/** Icon-only autosave status: green check when on disk, amber dot while waiting, red on failure. */
export function SaveStatusIndicator(props: Props) {
  const state = saveIndicatorState(props);
  const label = LABELS[state];
  return (
    <span
      role="status"
      className={`save-status save-status--${state}`}
      data-state={state}
      aria-label={label}
      title={label}
    >
      {state === 'error' ? (
        <IcAlertTriangle size={14} />
      ) : state === 'saved' ? (
        <IcCheck size={14} strokeWidth={2.5} />
      ) : (
        <span className="save-status__dot" aria-hidden />
      )}
    </span>
  );
}
