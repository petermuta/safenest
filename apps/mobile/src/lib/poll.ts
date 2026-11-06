import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Runs `fn` when the screen comes into view and then every `ms` while it stays
 * visible and the app is in the foreground — the app's live-update mechanism.
 */
export function useFocusPoll(fn: () => void | Promise<void>, ms: number, deps: unknown[]) {
  const saved = useRef(fn);
  saved.current = fn;

  useFocusEffect(
    useCallback(() => {
      saved.current();
      const t = setInterval(() => {
        if (AppState.currentState === 'active') saved.current();
      }, ms);
      const sub = AppState.addEventListener('change', (s) => { if (s === 'active') saved.current(); });
      return () => { clearInterval(t); sub.remove(); };
    }, deps), // eslint-disable-line react-hooks/exhaustive-deps
  );
}
