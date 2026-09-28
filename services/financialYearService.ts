/**
 * ==============================================================================
 * TriPro ERP — Financial Year Close & Reopen Service
 * services/financialYearService.ts
 * ==============================================================================
 * يتولى التحقق من صحة شجرة الحسابات (حساب الأرباح المبقاة وحسابات النتيجة)
 * واستدعاء محرك إقفال أو إعادة فتح السنة المالية في قاعدة البيانات.
 * ==============================================================================
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface CloseYearOptions {
  supabase: SupabaseClient;
  year: number;
  closingDate: string;
  targetOrgId: string;
}

export interface ReopenYearOptions {
  supabase: SupabaseClient;
  year: number;
  targetOrgId: string;
}

export interface YearOperationResult {
  success: boolean;
  message: string;
}

/**
 * إقفال السنة المالية:
 * 1. فحص وتصحيح حساب الأرباح المبقاة (32) ليكون حساباً فرعياً قابلاً للترحيل.
 * 2. تصحيح أي حسابات إيرادات أو مصروفات (4/5) معلّمة بالخطأ كـ is_group ولها قيود مرحلة.
 * 3. استدعاء الدالة المخزنة `close_financial_year` في قاعدة البيانات.
 */
export async function closeFinancialYearEngine({
  supabase,
  year,
  closingDate,
  targetOrgId,
}: CloseYearOptions): Promise<YearOperationResult> {
  if (!targetOrgId) {
    return { success: false, message: 'تعذر تحديد معرف المؤسسة.' };
  }

  try {
    // 1. فحص وتصحيح حساب الأرباح المبقاة (32)
    const { data: retAccounts } = await supabase
      .from('accounts')
      .select('id, code, is_group')
      .eq('organization_id', targetOrgId)
      .eq('code', '32');

    if (retAccounts && retAccounts.length > 0) {
      if (retAccounts[0].is_group) {
        await supabase
          .from('accounts')
          .update({ is_group: false })
          .eq('id', retAccounts[0].id);
      }
    } else {
      const { data: parent3 } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', targetOrgId)
        .eq('code', '3')
        .maybeSingle();

      await supabase.from('accounts').insert({
        organization_id: targetOrgId,
        code: '32',
        name: 'الأرباح المبقاة / المرحلة',
        type: 'EQUITY',
        is_group: false,
        is_active: true,
        parent_id: parent3?.id || null,
      });
    }

    // 2. تصحيح أي حسابات إيرادات أو مصروفات (4/5) معلّمة بالخطأ كـ is_group ولها قيود مرحلة
    const { data: groupIncomeAccounts } = await supabase
      .from('accounts')
      .select('id, code, is_group')
      .eq('organization_id', targetOrgId)
      .eq('is_group', true)
      .or('code.like.4%,code.like.5%');

    if (groupIncomeAccounts && groupIncomeAccounts.length > 0) {
      for (const gAcc of groupIncomeAccounts) {
        const { data: hasLines } = await supabase
          .from('journal_lines')
          .select('id')
          .eq('account_id', gAcc.id)
          .limit(1);

        if (hasLines && hasLines.length > 0) {
          await supabase
            .from('accounts')
            .update({ is_group: false })
            .eq('id', gAcc.id);
        }
      }
    }

    // 3. استدعاء محرك الإقفال السنوي
    const { data, error } = await supabase.rpc('close_financial_year', {
      p_year: year,
      p_closing_date: closingDate,
      p_org_id: targetOrgId,
    });

    if (error) {
      return { success: false, message: 'فشل إقفال السنة: ' + error.message };
    }

    const msg = typeof data === 'string' ? data : `تم إقفال السنة المالية ${year} بنجاح ✅`;
    return { success: true, message: msg };
  } catch (err: any) {
    return { success: false, message: 'فشل إقفال السنة: ' + (err.message || 'خطأ غير متوقع') };
  }
}

/**
 * إعادة فتح سنة مالية مقفلة
 */
export async function reopenFinancialYearEngine({
  supabase,
  year,
  targetOrgId,
}: ReopenYearOptions): Promise<YearOperationResult> {
  try {
    const { data, error } = await supabase.rpc('reopen_financial_year', {
      p_year: year,
      p_org_id: targetOrgId || null,
    });

    if (error) {
      return { success: false, message: 'فشل إعادة فتح السنة: ' + error.message };
    }

    const msg = typeof data === 'string' ? data : `تم فتح السنة المالية ${year} بنجاح 🔓`;
    return { success: true, message: msg };
  } catch (err: any) {
    return { success: false, message: 'فشل إعادة فتح السنة: ' + (err.message || 'خطأ غير متوقع') };
  }
}
