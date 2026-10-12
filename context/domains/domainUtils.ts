/**
 * ==============================================================================
 * TriPro ERP — Shared Domain Utilities
 * context/domains/domainUtils.ts
 * ==============================================================================
 * دوال مساعدة مشتركة لكافة سياقات النطاقات (Domain Contexts)
 * تشمل جلب السجلات الكبيرة بالصفحات وضمان التوافق مع Supabase.
 * ==============================================================================
 */

import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';

export type DynamicQuery = any;
export type DynamicParam = any;

/**
 * دالة مساعدة عامة لجلب كافة سجلات الجداول الكبيرة التي تتجاوز حد 1000 سجل في Supabase/PostgREST
 */
export async function fetchAllTableRecords<T = any>(
  tableName: string,
  filterFn: (query: DynamicQuery) => DynamicQuery,
  pageSize = 1000
): Promise<{ data: T[]; error: DynamicParam }> {
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(tableName).select('*');
    query = filterFn(query);
    let res: { data: T[] | null; error: any };
    if (typeof query.range === 'function') {
      res = await query.range(from, from + pageSize - 1);
    } else {
      res = await query;
      hasMore = false;
    }
    const { data, error } = res;

    if (error) {
      logger.error(`Error fetching ${tableName} chunk:`, error);
      return { data: allData, error };
    }

    if (data && data.length > 0) {
      allData = allData.concat(data as T[]);
      if (data.length < pageSize || typeof query.range !== 'function') {
        hasMore = false;
      } else {
        from += pageSize;
      }
    } else {
      hasMore = false;
    }
  }

  return { data: allData, error: null };
}
