import { useState, useEffect, useCallback, useRef } from 'react';
import { secureStorage } from './utils/securityMiddleware';

interface CacheItem<T> {
  value: T;
  timestamp: number;
}

/**
 * Custom hook for caching data in localStorage to reduce server requests.
 * Useful for static data like countries, currencies, or settings.
 * 
 * @param key Unique key for localStorage
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
      if (!forceUpdate) {
        const cached = secureStorage.getItem<CacheItem<T>>(key);
        if (cached) {
          try {
            const age = (Date.now() - cached.timestamp) / (1000 * 60);
            
            if (age < expirationMinutes) {
              setData(cached.value);
              setLoading(false);
              return;
            }
          } catch (e) {
            if (process.env.NODE_ENV === 'development') console.warn('Failed to parse cached data for key:', key);
            secureStorage.removeItem(key);
          }
        }
      }

      const freshData = await fetcherRef.current();
      setData(freshData);
      secureStorage.setItem(key, {
        value: freshData,
        timestamp: Date.now()
      });
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') console.error(`Error fetching data for ${key}:`, err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [key, expirationMinutes]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = () => fetchData(true);

  const clearCache = () => {
    localStorage.removeItem(key);
    setData(null);
  };

  return { data, loading, error, refetch, clearCache };
}