import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/api';

/**
 * Loads data when the screen gains focus, with pull-to-refresh support.
 * Shows the skeleton on first load and whenever `deps` change (e.g. a new filter);
 * later refocuses refresh silently so lists don't flash.
 *
 * Silent refreshes wait for the screen transition to finish and are skipped if
 * the data is only a few seconds old, so navigating never re-renders mid-animation.
 */
const SETTLE_MS = 350;
const FRESH_MS = 2_000;

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  const loadedKey = useRef<string | null>(null);
  const loadedAt = useRef(0);
  const key = JSON.stringify(deps);

  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'initial') setLoading(true);
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
      loadedAt.current = Date.now();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const first = loadedKey.current !== key;
      loadedKey.current = key;
      if (first) {
        run('initial');
        return;
      }
      if (Date.now() - loadedAt.current < FRESH_MS) return;
      const t = setTimeout(() => run('silent'), SETTLE_MS);
      return () => clearTimeout(t);
    }, [run, key]),
  );

  return {
    data,
    setData,
    loading,
    refreshing,
    error,
    reload: () => run('silent'),
    refresh: () => run('refresh'),
  };
}
