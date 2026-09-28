import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { errorMessage } from '@/lib/api';

/**
 * Loads data when the screen gains focus, with pull-to-refresh support.
 * `loading` is true only for the first load, so lists don't flash on refresh.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      run(data === null ? 'initial' : 'silent');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, ...deps]),
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
