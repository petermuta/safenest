'use client';

import { useEffect, useRef } from 'react';

/**
 * Calls `fn` now and then every `ms` while the tab is visible — the dashboard's
 * stand-in for live updates. Pauses in background tabs to save data.
 */
export function usePoll(fn: () => void, ms: number, deps: unknown[]) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    saved.current();
    const tick = () => { if (document.visibilityState === 'visible') saved.current(); };
    const t = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
