import { useEffect, useState } from 'react';

/** Shared runtime detection for desktop vs mobile web (PWA). */

export const MOBILE_BREAKPOINT_PX = 700;

export function isElectronApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.cadence?.saveData;
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;
}

/** Phone/tablet browser or installed PWA — not the Electron desktop host. */
export function isMobileWeb(): boolean {
  return isMobileViewport() && !isElectronApp();
}

export type BackupPlatform = 'desktop' | 'web' | 'mobile';

/** Which backup affordances the Settings screen should surface. */
export function backupPlatform(): BackupPlatform {
  if (isElectronApp()) return 'desktop';
  if (isMobileWeb()) return 'mobile';
  return 'web';
}

export function backupPlatformLabel(platform: BackupPlatform): string {
  switch (platform) {
    case 'desktop':
      return 'Desktop app';
    case 'mobile':
      return 'Mobile browser';
    default:
      return 'Web browser';
  }
}

export function useMobileWeb(): boolean {
  const [mobileWeb, setMobileWeb] = useState(isMobileWeb);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const sync = () => setMobileWeb(isMobileWeb());
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return mobileWeb;
}
