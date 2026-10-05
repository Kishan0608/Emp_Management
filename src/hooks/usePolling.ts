import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Calls `fn` every `ms` while the screen is focused. Pass `null` to pause.
 * Stops as soon as the screen loses focus, so nothing polls in the background.
 */
export function usePolling(fn: () => unknown, ms: number | null) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useFocusEffect(
    useCallback(() => {
      if (ms === null) return;
      const id = setInterval(() => fnRef.current(), ms);
      return () => clearInterval(id);
    }, [ms]),
  );
}
