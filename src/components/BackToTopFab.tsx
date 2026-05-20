import { useEffect, useState } from 'react';
import { IcArrowUp } from './icons';

/**
 * Floating "back to top" affordance for the main scroll container.
 *
 * Sits in the bottom-right stack with QuickAddFab. Visible only after
 * the user has scrolled past `THRESHOLD` pixels so it never crowds the
 * idle UI. Clicking smooth-scrolls the `<main class="main--scroll">`
 * region back to the top — we scope to that container instead of the
 * window because the app shell pins the scrollable area inside main.
 *
 * Behaviour is global on purpose: any page that exceeds a couple of
 * screens gets the lift for free (Todos with lots of lists, Notes,
 * Agenda). Pages that never overflow simply never see the button.
 */
const THRESHOLD = 320;

export function BackToTopFab() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // The main scroll surface in this app is `<main class="main--scroll">`
    // (see Layout.tsx). We look it up once and reattach if the layout
    // remounts the element — defensive against future structural moves.
    const findMain = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('main.main--scroll');

    let target = findMain();
    let frame = 0;

    const update = () => {
      frame = 0;
      if (!target) return;
      setVisible(target.scrollTop > THRESHOLD);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    if (!target) {
      // Wait one tick for React to commit the layout before binding.
      const t = window.setTimeout(() => {
        target = findMain();
        if (target) {
          target.addEventListener('scroll', onScroll, { passive: true });
          update();
        }
      }, 0);
      return () => window.clearTimeout(t);
    }

    target.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      target?.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="back-to-top-fab"
      title="Back to top"
      aria-label="Scroll to top of page"
      onClick={() => {
        const target = document.querySelector<HTMLElement>('main.main--scroll');
        if (!target) return;
        // `behavior: 'smooth'` is supported in every Chromium/WebKit/
        // Gecko version we ship to. Falling back to instant scroll is
        // fine if a future runtime ignores it.
        target.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <IcArrowUp size={18} strokeWidth={2.25} />
    </button>
  );
}
