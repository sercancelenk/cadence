import { useEffect, useRef, useState } from 'react';
import { IcCheck } from './icons';
import { usePersistStatus } from '../AppDataContext';

export const SAVED_FLASH_MS = 5000;

/** Green check that appears for 5 s each time a save lands; silent on mount. */
export function SavedFlash({ savedAt }: { savedAt: number | null }) {
  const [visible, setVisible] = useState(false);
  const seen = useRef(savedAt);

  useEffect(() => {
    if (savedAt === seen.current) return;
    seen.current = savedAt;
    if (savedAt === null) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), SAVED_FLASH_MS);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (!visible) return null;
  return (
    <span className="saved-flash" role="status" aria-label="Saved" title="Saved">
      <IcCheck size={16} strokeWidth={2.5} />
    </span>
  );
}

/** Subscribes to the persist status itself so the page around it does not re-render on saves. */
export function SavedFlashConnected() {
  const { lastSavedAt } = usePersistStatus();
  return <SavedFlash savedAt={lastSavedAt} />;
}
