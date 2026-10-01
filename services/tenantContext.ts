/**
 * ==============================================================================
 * Tenant Context & Active Organization Resolver
 * TriPro ERP — services/tenantContext.ts
 * ==============================================================================
 * إدارة موحدة ومحصنة لتحديد سياق المنظمة (Multi-Tenancy) عبر كافة أجزاء النظام.
 * يضمن عزل بيانات كل مؤسسة ومنع التداخل أو فقدان سياق الشركة النشطة.
 * ==============================================================================
 */

import { logger } from '../utils/logger';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { secureStorage } from '../utils/securityMiddleware';

/**
 * التحقق من صحة المعرف بصيغة UUID
 */
export function isValidUUID(id?: string | null): id is string {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

// ذاكرة محلية مؤقتة لتسريع الاسترجاع الفوري المتزامن (In-Memory Fast Cache)
let cachedOrgId: string | null = null;

/**
 * تحديد معرف المنظمة المتزامن (Synchronous Fast Lookup)
 */
export function getActiveOrgIdSync(explicitOrgId?: string | null): string | null {
  if (isValidUUID(explicitOrgId)) return explicitOrgId.trim();
  if (isValidUUID(cachedOrgId)) return cachedOrgId;

  const storageActive = secureStorage.getItem<string>('tripro_active_org_id');
  if (isValidUUID(storageActive)) {
    cachedOrgId = storageActive.trim();
    return cachedOrgId;
  }

  const storageLastValid = secureStorage.getItem<string>('tripro_last_valid_org_id');
  if (isValidUUID(storageLastValid)) {
    cachedOrgId = storageLastValid.trim();
    return cachedOrgId;
  }

  return null;
}

/**
 * تحديد وحسم معرف المنظمة بشكل غير متزامن مع الرجوع للجلسة وقاعدة البيانات (Authoritative Async Resolver)
 */
export async function resolveActiveOrgId(explicitOrgId?: string | null): Promise<string | null> {
  // 1. أولوية عليا: المعرف الصريح الممرر
  if (isValidUUID(explicitOrgId)) {
    cachedOrgId = explicitOrgId.trim();
    return cachedOrgId;
  }

  // 2. فحص التخزين الآمن المؤقت
  const storageActive = secureStorage.getItem<string>('tripro_active_org_id');
  if (isValidUUID(storageActive)) {
    cachedOrgId = storageActive.trim();
    return cachedOrgId;
  }

  // 3. فحص جلسة المستخدم في Supabase Auth
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (user) {
      const metaOrg = user.user_metadata?.org_id || (user as any)?.organization_id;
      if (isValidUUID(metaOrg)) {
        cachedOrgId = metaOrg.trim();
        secureStorage.setItem('tripro_active_org_id', cachedOrgId);
        secureStorage.setItem('tripro_last_valid_org_id', cachedOrgId);
        return cachedOrgId;
      }

      // 4. استعلام ملف المستخدم من جدول profiles إذا لم يوجد في الميتاداتا
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profile && isValidUUID(profile.organization_id)) {
        cachedOrgId = profile.organization_id.trim();
        secureStorage.setItem('tripro_active_org_id', cachedOrgId);
        secureStorage.setItem('tripro_last_valid_org_id', cachedOrgId);
        return cachedOrgId;
      }
    }
  } catch (err) {
    logger.warn('[tenantContext] Error resolving active org from auth:', err);
  }

  // 5. ملاذ أخير: آخر معرف صحيح مخزن
  const storageLastValid = secureStorage.getItem<string>('tripro_last_valid_org_id');
  if (isValidUUID(storageLastValid)) {
    cachedOrgId = storageLastValid.trim();
    return cachedOrgId;
  }

  return null;
}

/**
 * تعيين المنظمة النشطة وتحديث الذاكرة وإطلاق حدث التغيير
 */
export function setActiveOrgId(orgId: string | null): void {
  if (isValidUUID(orgId)) {
    const cleanId = orgId.trim();
    cachedOrgId = cleanId;
    secureStorage.setItem('tripro_active_org_id', cleanId);
    secureStorage.setItem('tripro_last_valid_org_id', cleanId);
  } else {
    cachedOrgId = null;
    secureStorage.removeItem('tripro_active_org_id');
    secureStorage.removeItem('tripro_last_valid_org_id');
  }

  // إشعار التطبيق بتغيير المنظمة لتحديث الواجهات المتفاعلة
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tripro:organization_changed', { detail: { orgId: cachedOrgId } }));
  }
}

/**
 * React Hook موحد لاستخدام واستخراج معرف المنظمة داخل المكونات
 */
export function useActiveOrgId(explicitOrgId?: string | null) {
  const [orgId, setOrgIdState] = useState<string | null>(() => getActiveOrgIdSync(explicitOrgId));
  const [isLoading, setIsLoading] = useState<boolean>(!getActiveOrgIdSync(explicitOrgId));

  const refreshOrgId = useCallback(async () => {
    setIsLoading(true);
    const resolved = await resolveActiveOrgId(explicitOrgId);
    setOrgIdState(resolved);
    setIsLoading(false);
    return resolved;
  }, [explicitOrgId]);

  useEffect(() => {
    refreshOrgId();

    const handleOrgChange = (e: CustomEvent | Record<string, any>) => {
      setOrgIdState(e.detail?.orgId || null);
    };

    window.addEventListener('tripro:organization_changed', handleOrgChange);
    return () => {
      window.removeEventListener('tripro:organization_changed', handleOrgChange);
    };
  }, [refreshOrgId]);

  return { orgId, isLoading, refreshOrgId };
}

export default {
  isValidUUID,
  getActiveOrgIdSync,
  resolveActiveOrgId,
  setActiveOrgId,
  useActiveOrgId
};
