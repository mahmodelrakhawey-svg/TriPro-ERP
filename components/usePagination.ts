import { logger } from '../utils/logger';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';

export interface PaginationOptions {
  select?: string;
  pageSize?: number;
  orderBy?: string;
  ascending?: boolean;
  organizationId?: string | null;
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
  queryModifier?: (query: Record<string, any>) => Record<string, any> | unknown
): PaginationResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ØªØ®Ø²ÙŠÙ† Ø§Ù„Ù€ queryModifier ÙÙŠ Ù…Ø±Ø¬Ø¹ Ù„Ù…Ù†Ø¹ Ø§Ù„Ø­Ù„Ù‚Ø§Øª Ø§Ù„Ù„Ø§Ù†Ù‡Ø§Ø¦ÙŠØ© Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„ÙˆØ¸ÙŠÙØ© ØºÙŠØ± Ù…Ø³ØªÙ‚Ø±Ø©
  const queryModifierRef = useRef(queryModifier);

  const {
    select = '*',
    pageSize = 10,
    orderBy = 'created_at',
    ascending = false,
    organizationId
  } = options;

  // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…Ø±Ø¬Ø¹ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± Ø§Ù„Ø¯Ø§Ù„Ø© ÙˆØ¥Ø¹Ø§Ø¯Ø© Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø¹ Ø¶Ø¨Ø· Ø§Ù„ØµÙØ­Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø£ÙˆÙ„Ù‰
  useEffect(() => {
    queryModifierRef.current = queryModifier;
    setPage(1);
    setRefreshTrigger(prev => prev + 1);
  }, [queryModifier, organizationId]);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // ðŸ›¡ï¸ Ø­Ù…Ø§ÙŠØ© ÙÙˆØ±ÙŠØ©: Ø¥Ø°Ø§ Ù„Ù… ØªÙˆØ¬Ø¯ Ø¬Ù„Ø³Ø© Ù†Ø´Ø·Ø©ØŒ ØªÙˆÙ‚Ù ØªÙ…Ø§Ù…Ø§Ù‹ ÙˆÙ„Ø§ ØªØ±Ø³Ù„ Ø·Ù„Ø¨Ø§Øª Ù„Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
      if (!session || !session.user) {
        setLoading(false);
        return;
      }

      let userOrgId = organizationId || session.user.user_metadata?.org_id;
      let userRole = session.user.user_metadata?.role;

      // Ø¥Ø°Ø§ Ù„Ù… ÙŠÙƒÙ† Ù…ØªÙˆÙØ±Ø§Ù‹ ÙÙŠ Ø§Ù„Ù…ÙŠØªØ§Ø¯Ø§ØªØ§ØŒ ÙŠØªÙ… Ø¬Ù„Ø¨Ù‡ ÙƒØ¥Ø¬Ø±Ø§Ø¡ Ø§Ø­ØªÙŠØ§Ø·ÙŠ Ù…Ù† Ø¬Ø¯ÙˆÙ„ profiles
      if (!userOrgId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('organization_id, role')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileData) {
          userOrgId = profileData.organization_id;
          if (!userRole) userRole = profileData.role;
        }
      }

      let query = supabase
        .from(tableName)
        .select(select, { count: 'exact' });

      // Ø¥Ø°Ø§ Ù„Ù… ÙŠÙƒÙ† Ø³ÙˆØ¨Ø± Ø£Ø¯Ù…Ù†ØŒ ÙŠØ¬Ø¨ Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† ÙˆØ¬ÙˆØ¯ Ù…Ø¹Ø±Ù Ø´Ø±ÙƒØ©
      if (!userOrgId && userRole !== 'super_admin') {
        throw new Error('ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù…Ù†Ø¸Ù…Ø© Ø§Ù„ØªØ§Ø¨Ø¹ Ù„Ù‡Ø§. ÙŠØ±Ø¬Ù‰ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.');
      }

      // ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„ØªØµÙÙŠØ© ÙÙ‚Ø· Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ù…Ø¹Ø±Ù Ù…ÙˆØ¬ÙˆØ¯Ø§Ù‹ ÙˆØµØ­ÙŠØ­Ø§Ù‹ (ÙˆÙ„ÙŠØ³ Ù†ØµØ§Ù‹ ÙØ§Ø±ØºØ§Ù‹)
      if (userOrgId && userOrgId !== "") {
        query = query.eq('organization_id', userOrgId);
      }

      if (queryModifierRef.current) {
        query = queryModifierRef.current(query) as typeof query;
      }

      if (orderBy) {
        query = query.order(orderBy, { ascending });
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
      if (signal) {
        query = query.abortSignal(signal);
      }

      const { data: resultData, error: resultError, count } = await query;

      if (resultError) throw resultError;

      setData((resultData as T[]) || []);
      setTotalCount(count || 0);
    } catch (err) {
      // ØªØ¬Ø§Ù‡Ù„ Ø§Ù„Ø£Ø®Ø·Ø§Ø¡ Ø§Ù„Ù†Ø§ØªØ¬Ø© Ø¹Ù† Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø·Ù„Ø¨ ÙŠØ¯ÙˆÙŠØ§Ù‹

      if (err.name === 'AbortError' || err.message?.includes('AbortError')) return;
      
      if (import.meta.env.DEV) logger.error(`Error fetching data from ${tableName}:`, err);
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  }, [tableName, select, pageSize, orderBy, ascending, page, refreshTrigger]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    
    // ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø¹Ù†Ø¯ ÙÙƒ Ø§Ù„Ù…ÙƒÙˆÙ† Ø£Ùˆ ØªØºÙŠÙŠØ± Ø§Ù„ØªØ¨Ø¹ÙŠØ§Øª
    return () => controller.abort();
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
