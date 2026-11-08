import { useState, useEffect, useCallback, useRef } from 'react';
import { queryClient } from './services/queryClient';
import { secureStorage } from './utils/securityMiddleware';

interface CacheItem<T> {
  value: T;
  timestamp: number;
}

/**
 * Custom hook for caching data using TanStack Query Client with fallback to secureStorage.
 * Useful for static data like countries, currencies, or settings.
 * 
 * @param key Unique key for cache
 * @param fetcher Async function to fetch data
 * @param expirationMinutes Cache duration in minutes (default: 60)
 */
export function useCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  expirationMinutes: number = 60
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Use ref to avoid infinite loops if fetcher is not memoized
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const fetchData = useCallback(async (forceUpdate = false) => {
    setLoading(true);
    setError(null);

    try {
      if (forceUpdate) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }

      const freshData = await queryClient.fetchQuery({
        queryKey: [key],
        queryFn: () => fetcherRef.current(),
        staleTime: expirationMinutes * 60 * 1000,
      });

      setData(freshData);
      secureStorage.setItem(key, {
        value: freshData,
        timestamp: Date.now()
      });
    } catch (err: unknown) {
      // Fallback to secureStorage if offline or query fails
      const cached = secureStorage.getItem<CacheItem<T>>(key);
      if (cached && (Date.now() - cached.timestamp < expirationMinutes * 60 * 1000)) {
        setData(cached.value);
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setLoading(false);
    }
  }, [key, expirationMinutes]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = () => fetchData(true);

  const clearCache = () => {
    queryClient.invalidateQueries({ queryKey: [key] });
    secureStorage.removeItem(key);
    setData(null);
  };

  return { data, loading, error, refetch, clearCache };
}
