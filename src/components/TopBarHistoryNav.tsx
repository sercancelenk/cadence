import { useRef, useState } from 'react';
import { IcArrowLeft, IcArrowRight } from './icons';
import { Tooltip } from './ui/Tooltip';
import { useInAppHistoryNav } from '../hooks/useInAppHistoryNav';

type Props = {
  /** Flush debounced workspace edits before history hops (zero data loss). */
  onBeforeNavigate?: () => void | Promise<void>;
};

/**
 * Spotify-style back / forward in the TopBar.
 * Uses session history only — never reads or writes AppData.
 */
export function TopBarHistoryNav({ onBeforeNavigate }: Props) {
  const { canGoBack, canGoForward, goBack, goForward } = useInAppHistoryNav();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = async (dir: 'back' | 'forward') => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (onBeforeNavigate) await onBeforeNavigate();
      if (dir === 'back') goBack();
      else goForward();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="topbar__history" role="group" aria-label="History">
      <Tooltip label="Go back">
        <button
          type="button"
          className="icon-btn topbar__history-btn"
          aria-label="Go back"
          disabled={!canGoBack || busy}
          onClick={() => void run('back')}
        >
          <IcArrowLeft size={18} />
        </button>
      </Tooltip>
      <Tooltip label="Go forward">
        <button
          type="button"
          className="icon-btn topbar__history-btn"
          aria-label="Go forward"
          disabled={!canGoForward || busy}
          onClick={() => void run('forward')}
        >
          <IcArrowRight size={18} />
        </button>
      </Tooltip>
    </div>
  );
}
