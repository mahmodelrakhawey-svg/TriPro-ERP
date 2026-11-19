/**
 * ==============================================================================
 * TriPro ERP — Centralized Units of Measure (UOM) Service with Cache & Deduping
 * services/uomService.ts
 * ==============================================================================
 * خدمة مركزية لإدارة وحدات القياس (UOMs):
 * - تخزين مؤقت في الذاكرة (Memory Cache) لمدة 15 دقيقة لترشيد استهلاك سوباباز
 * - منع الجلب المكرر المتزامن (In-Flight Request Deduplication)
 * - تحديث فوري وإبطال الكاش عند الإضافة أو التعديل أو الحذف
 * ==============================================================================
 */

import { supabase } from './supabaseClient';
import { logger } from '../utils/logger';

export interface UomItem {
  id: string;
  name: string;
  category_id?: string;
  uom_type?: string;
  ratio?: number;
  organization_id?: string;
  [key: string]: any;
}

interface UomCacheEntry {
  data: UomItem[];
  timestamp: number;
}

const UOM_CACHE_TTL_MS = 15 * 60 * 1000; // 15 دقيقة
const uomCache = new Map<string, UomCacheEntry>();
const inFlightPromises = new Map<string, Promise<UomItem[]>>();

/**
 * جلب وحدات القياس مع الكاش ومنع التكرار المتزامن
 */
export async function fetchUoms(orgId?: string | null): Promise<UomItem[]> {
  const cacheKey = orgId || 'all';

  // 1. فحص الكاش النشط
  const cached = uomCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < UOM_CACHE_TTL_MS)) {
    return cached.data;
  }

  // 2. إذا كان هناك استعلام قيد التنفيذ لنفس المنظمة، مشاركة نفس الوعد لمنع الطلبات المزدوجة
  const inFlight = inFlightPromises.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  // 3. تنفيذ الاستعلام الفعلي
  const promise = (async () => {
    try {
      let q = supabase.from('uoms').select('*');
      if (orgId) {
        q = q.or(`organization_id.eq.${orgId},organization_id.is.null`);
      }
      const { data, error } = await q.order('name', { ascending: true });
      if (error) {
        logger.error('[uomService] Error fetching uoms:', error);
        return cached?.data || [];
      }
      const uomsList = (data || []) as UomItem[];
      uomCache.set(cacheKey, { data: uomsList, timestamp: Date.now() });
      return uomsList;
    } catch (err) {
      logger.error('[uomService] Unexpected error:', err);
      return cached?.data || [];
    } finally {
      inFlightPromises.delete(cacheKey);
    }
  })();

  inFlightPromises.set(cacheKey, promise);
  return promise;
}

/**
 * إبطال كاش وحدات القياس عند التعديل
 */
export function invalidateUomsCache(orgId?: string | null): void {
  if (orgId) {
    uomCache.delete(orgId);
    inFlightPromises.delete(orgId);
  } else {
    uomCache.clear();
    inFlightPromises.clear();
  }
}
