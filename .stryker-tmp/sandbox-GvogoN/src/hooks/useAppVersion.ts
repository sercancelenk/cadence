// @ts-nocheck
import { useEffect, useState } from 'react';
import pkg from '../../package.json';

/**
 * Installed app version — Electron IPC when available, otherwise package.json
 * (PWA / dev server).
 */
export function useAppVersion(): string {
  const [version, setVersion] = useState(() => pkg.version);

  useEffect(() => {
    void (async () => {
      const v = await window.cadence?.getAppVersion?.();
      if (v) setVersion(v);
    })();
  }, []);

  return version;
}
