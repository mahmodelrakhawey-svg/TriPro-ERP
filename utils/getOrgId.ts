/**
 * getOrgId.ts
 * ============================================================
 * دالة مساعدة مركزية لاسترداد org_id بأمان وبدون الاعتماد
 * على اتصال شبكي مستمر (تعمل حتى عند ضعف/انقطاع الإنترنت).
 *
 * ترتيب الأولويات:
 *  1. currentUser من الـ Context (محلي 100% — لا شبكة)
 *  2. supabase.auth.getSession() — يقرأ من localStorage (لا شبكة)
 *  3. supabase.auth.getUser()   — آخر خيار، يحتاج شبكة (مع timeout)
 * ============================================================
 */

import { supabase } from '../supabaseClient';

/**
 * يسترجع org_id للمستخدم الحالي بطريقة آمنة ومتعددة الطبقات.
 * @param currentUser — كائن المستخدم من useAccounting() Context (اختياري)
 * @returns org_id string أو null إذا تعذر الاسترجاع
 */
export async function getOrgId(currentUser?: any): Promise<string | null> {
  // ── الطبقة الأولى: Context (محلي — صفر شبكة) ──────────────────
  const fromContext: string | undefined =
    currentUser?.organization_id ||
    currentUser?.user_metadata?.org_id ||
    currentUser?.org_id;

  if (fromContext) return fromContext;

  // ── الطبقة الثانية: getSession من localStorage (لا شبكة) ───────
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (!sessionError && sessionData?.session?.user) {
      const fromSession: string | undefined =
        sessionData.session.user.user_metadata?.org_id ||
        sessionData.session.user.id;
      if (fromSession) return fromSession;
    }
  } catch {
    // getSession فشل — نكمل للطبقة التالية
  }

  // ── الطبقة الثالثة: getUser من الشبكة (مع timeout 5 ثوانٍ) ────
  try {
    const userPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 5000)
    );

    const result = await Promise.race([userPromise, timeoutPromise]);

    if (result && typeof result === 'object' && 'data' in result) {
      const user = (result as any).data?.user;
      const fromNetwork: string | undefined = user?.user_metadata?.org_id;
      if (fromNetwork) return fromNetwork;
    }
  } catch {
    // الشبكة غير متاحة — إرجاع null
  }

  return null;
}

/**
 * يحدد نوع خطأ الشبكة ويرجع رسالة مناسبة للمستخدم.
 */
export function isNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('err_connection') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    err.name === 'AbortError' ||
    err.name === 'TypeError'
  );
}

export const NETWORK_ERROR_MSG =
  'انقطع الاتصال بالخادم. يرجى التحقق من الاتصال بالإنترنت وإعادة المحاولة.';

export const ORG_NOT_FOUND_MSG =
  'تعذر تحديد هوية المنظمة. يرجى تسجيل الخروج والدخول مجدداً.';
