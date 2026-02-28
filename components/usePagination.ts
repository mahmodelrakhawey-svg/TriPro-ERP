import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export interface PaginationOptions {
  select?: string;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
}

export interface PaginationResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  totalCount: number;
  refresh: () => void;
}

export function usePagination<T>(
  tableName: string,
  options: PaginationOptions = {},
  queryModifier?: (query: any) => any
): PaginationResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const {
    select = '*',
    pageSize = 10,
    orderBy = 'created_at',
    ascending = false
  } = options;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from(tableName)
        .select(select, { count: 'exact' });

      if (queryModifier) {
        query = queryModifier(query);
      }

      if (orderBy) {
        query = query.order(orderBy, { ascending });
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query.range(from, to);

      const { data: resultData, error: resultError, count } = await query;

      if (resultError) throw resultError;

      setData(resultData as T[]);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error(`Error fetching data from ${tableName}:`, err);
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  }, [tableName, select, pageSize, orderBy, ascending, page, queryModifier, refreshTrigger]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    data,
    loading,
    error,
    page,
    setPage,
    totalPages,
    totalCount,
    refresh
  };
}