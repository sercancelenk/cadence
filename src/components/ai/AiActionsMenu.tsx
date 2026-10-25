import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { IcSparkles } from '../icons';

export type AiActionsMenuItem = { id: string; label: string; hint: string };

/** Keep the editor selection while the menu is used. */
function keepSelection(event: MouseEvent) {
  event.preventDefault();
}

/**
 * One quiet ✨ button that opens a short list of the AI actions valid right now. It
 * replaces what would otherwise be a row of AI buttons.
 */
export function AiActionsMenu({
  actions,
  onSelect,
  resetKey,
}: {
  actions: readonly AiActionsMenuItem[];
  onSelect: (id: string) => void;
  /** When this value changes (the selection moved), the menu closes. */
  resetKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [resetKey]);

  // The editor keeps focus (so the selection survives), so Escape and clicks elsewhere are
  // watched on the document while the menu is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;
  return (
    <span className="ai-menu" ref={rootRef}>
      <button
        type="button"
        className="rich-bubble-menu__btn"
        title="AI actions"
        aria-label="AI actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={keepSelection}
        onClick={() => setOpen((v) => !v)}
      >
        <IcSparkles size={16} />
      </button>
      {open ? (
        <div
          className="ai-menu__list"
          role="menu"
          aria-label="AI actions"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              className="ai-menu__item"
              onMouseDown={keepSelection}
              onClick={() => {
                setOpen(false);
                onSelect(a.id);
              }}
            >
              <span className="ai-menu__label">{a.label}</span>
              <span className="ai-menu__hint">{a.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
