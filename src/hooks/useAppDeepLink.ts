import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Navigate when Electron delivers a cadence:// deep link (e.g. notification click). */
export function useAppDeepLink() {
  const navigate = useNavigate();

  useEffect(() => {
    const off = window.cadence?.onDeepLink?.(({ path }) => {
      if (path) navigate(path);
    });
    return () => {
      off?.();
    };
  }, [navigate]);
}
