import { useState } from 'react';
import { Button } from '../ui/Button';

const STORAGE_KEY = 'cadence.ai.legacyNotice.v1';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Older versions let people type their own instructions. They are kept and still applied, but as
 * a short, constrained focus note, which is a change from how they used to work. This says so
 * once per device, where it happens (not in a collapsed Settings card).
 */
export function AiLegacyNotice({ active }: { active: boolean }) {
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (!active || dismissed) return null;
  return (
    <div className="ai-legacy-notice" role="note">
      <p className="small" style={{ margin: 0 }}>
        Your earlier instructions are still applied as a short focus note (plain text, up to 200 characters). You can
        see, copy or remove them in Settings → AI Assistant → Previous instructions.
      </p>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(STORAGE_KEY, '1');
          } catch {
            // Storage unavailable: dismissed for this view only.
          }
        }}
      >
        Got it
      </Button>
    </div>
  );
}
