import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

interface PaginationOptions {
  select?: string;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
}

export function usePagination<T>(
  tableName: string,
  options: PaginationOptions = {},
  queryModifier?: (query: any) => any
) {
  const { select = '*', pageSize = 20, orderBy = 'created_at', ascending = false } = options;
  
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from(tableName)
        .select(select, { count: 'exact' });

      // تطبيق أي فلاتر إضافية (مثل البحث)
      if (queryModifier) {
        query = queryModifier(query);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data: resultData, count, error: resultError } = await query
        .order(orderBy, { ascending })
        .range(from, to);

      if (resultError) throw resultError;

      setData(resultData as T[]);
      setTotalCount(count || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableName, select, page, pageSize, orderBy, ascending, queryModifier]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, page, setPage, totalCount, loading, error, refresh: fetchData, totalPages: Math.ceil(totalCount / pageSize) };
}