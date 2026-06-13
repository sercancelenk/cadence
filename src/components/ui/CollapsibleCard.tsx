import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { STORAGE_PREFIX } from '../../lib/appBranding';
import { IcChevronDown } from '../icons';

const STORAGE_KEY_PREFIX = `${STORAGE_PREFIX}:settings:section:`;

function readPersisted(id: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY_PREFIX + id);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    // ignore (private mode, etc.)
  }
  return fallback;
}

function writePersisted(id: string, open: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + id, open ? '1' : '0');
  } catch {
    // ignore
  }
}

/**
 * Wraps a Settings section in a collapsible card with persistent open/closed
 * state per `id`. Click anywhere on the header to toggle. Inner `card` blocks
 * (e.g. the host / pair sub-cards inside Multi-device sync) keep behaving as
 * regular cards so the collapse only applies to the top-level section.
 *
 * Persisted under `localStorage["cadence:settings:section:<id>"]` as `"1"`
 * (open) or `"0"` (closed). Default is open unless the caller passes
 * `defaultOpen={false}`.
 */
export function CollapsibleCard({
  id,
  title,
  defaultOpen = true,
  children,
  /** Optional content shown next to the title (status badge, etc.) */
  badge,
}: {
  id: string;
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  badge?: ReactNode;
}) {
  const [open, setOpen] = useState(() => readPersisted(id, defaultOpen));

  useEffect(() => {
    writePersisted(id, open);
  }, [id, open]);

  useEffect(() => {
    const focusFromHash = () => {
      if (typeof window === 'undefined') return;
      const target = window.location.hash.replace(/^#/, '');
      if (target !== id) return;
      setOpen(true);
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    focusFromHash();
    window.addEventListener('hashchange', focusFromHash);
    return () => window.removeEventListener('hashchange', focusFromHash);
  }, [id]);

  const bodyId = `${id}-body`;

  return (
    <section
      id={id}
      className={`card card--collapsible${open ? ' card--open' : ' card--closed'}`}
    >
      <button
        type="button"
        className="card__toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="card__title">{title}</h2>
        {badge ? <span className="card__badge">{badge}</span> : null}
        <span className={`card__chev${open ? ' card__chev--open' : ''}`} aria-hidden>
          <IcChevronDown size={18} strokeWidth={2.25} />
        </span>
      </button>
      {open ? (
        <div id={bodyId} className="card__body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
