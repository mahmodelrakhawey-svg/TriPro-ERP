import { logger } from '../utils/logger';
import { supabase } from './supabaseClient';
import { Database } from '../types';

// نستخرج نوع البيانات الخاص بعملية الإضافة (Insert) من تعريفات قاعدة البيانات
// هذا النوع يستثني تلقائياً الحقول التي يولدها النظام مثل id و created_at
type AccountInsert = Database['public']['Tables']['accounts']['Insert'];

/**
 * دالة لإضافة حساب جديد إلى قاعدة البيانات
 * @param accountData بيانات الحساب (يجب أن تستخدم snake_case مثل is_active, parent_account)
 */
export const createAccount = async (accountData: AccountInsert) => {
  // الحصول على المنظمة الحالية من بيانات الجلسة لضمان عزل البيانات
  const { data: { session } } = await supabase.auth.getSession();
  const orgId = session?.user?.user_metadata?.org_id;
  
  const { data, error } = await supabase
    .from('accounts')
    .insert({ ...accountData, organization_id: orgId })
    .select() // لإرجاع الصف الذي تم إنشاؤه
    .single();

  if (error) {
    logger.error('Error creating account:', error.message);
    throw error;
  }

  return data;
};

/**
 * دالة لجلب جميع الحسابات
 */
export const getAccounts = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const orgId = session?.user?.user_metadata?.org_id;

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('organization_id', orgId) // 🔒 فلترة تلقائية بناءً على المنظمة الحالية
    .order('code', { ascending: true });

  if (error) {
    logger.error('Error fetching accounts:', error);
    throw error;
  }

  return data;
};

/**
 * دالة آمنة لحذف حساب محاسبي مع التحقق من عدم وجود قيود مرتبطة
 * 🔒 منع حذف الحسابات التي عليها تاريخ محاسبي
 */
export const deleteAccount = async (id: string) => {
  // المحاولة الأولى: استخدام الدالة الآمنة في قاعدة البيانات
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('safe_delete_account', { p_account_id: id })
    .single();

  if (!rpcError && rpcResult) {
    const result = rpcResult as { success: boolean; error?: string; message?: string };
    if (!result.success) {
      throw new Error(result.error || 'فشل حذف الحساب');
    }
    return true;
  }

  // المحاولة الاحتياطية: التحقق يدوياً من journal_lines إذا لم تكن الدالة موجودة بعد
  const { count: linesCount, error: countError } = await supabase
    .from('journal_lines')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id);

  if (countError) {
    throw new Error('خطأ في التحقق من الحساب: ' + countError.message);
  }

  if (linesCount && linesCount > 0) {
    throw new Error(
      `لا يمكن حذف هذا الحساب لأنه يحتوي على ${linesCount} قيد محاسبي مرتبط. ` +
      'يمكنك إلغاء تفعيل الحساب بدلاً من حذفه.'
    );
  }

  // الحذف المباشر إذا لم تكن هناك قيود
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id);

  if (error) throw new Error('فشل حذف الحساب: ' + error.message);
  return true;
};

/**
 * ==============================================================================
 * Central Account Mapping & Chart-of-Accounts Health Engine
 * ==============================================================================
 */

export interface AccountMappingDefinition {
  key: string;
  label: string;
  defaultCode: string;
  defaultName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentCode: string;
}

export const CORE_ACCOUNT_MAPPING_DEFS: AccountMappingDefinition[] = [
  { key: 'ACCOUNTS_RECEIVABLE', label: 'حساب مراقبة العملاء (المدينون)', defaultCode: '1241', defaultName: 'العملاء / المدينون', accountType: 'asset', parentCode: '124' },
  { key: 'ACCOUNTS_PAYABLE', label: 'حساب مراقبة الموردين (الدائنون)', defaultCode: '2211', defaultName: 'الموردون / الدائنون', accountType: 'liability', parentCode: '221' },
  { key: 'INVENTORY', label: 'حساب مخزون البضائع', defaultCode: '1030', defaultName: 'مخزون البضائع والمستودعات', accountType: 'asset', parentCode: '103' },
  { key: 'SALARIES_EXPENSE', label: 'حساب مصروف الرواتب والأجور', defaultCode: '531', defaultName: 'مصروف الرواتب والأجور', accountType: 'expense', parentCode: '53' },
  { key: 'EMPLOYEE_BONUSES', label: 'حساب مكافآت وحوافز الموظفين', defaultCode: '5312', defaultName: 'حوافز ومكافآت العاملين', accountType: 'expense', parentCode: '531' },
  { key: 'EMPLOYEE_DEDUCTIONS', label: 'حساب استقطاعات وجزاءات الموظفين', defaultCode: '422', defaultName: 'إيرادات جزاءات واستقطاعات العاملين', accountType: 'revenue', parentCode: '42' },
  { key: 'EMPLOYEE_ADVANCES', label: 'حساب سلف العاملين', defaultCode: '1223', defaultName: 'سلف العاملين', accountType: 'asset', parentCode: '122' },
  { key: 'ACCRUED_SALARIES', label: 'حساب رواتب وأجور مستحقة', defaultCode: '2251', defaultName: 'رواتب وأجور مستحقة', accountType: 'liability', parentCode: '225' },
  { key: 'PAYROLL_TAX', label: 'حساب ضريبة كسب العمل المستحقة', defaultCode: '2233', defaultName: 'ضريبة كسب العمل المستحقة', accountType: 'liability', parentCode: '223' },
  { key: 'VAT_OUTPUT', label: 'حساب ضريبة القيمة المضافة - مخرجات', defaultCode: '2231', defaultName: 'ضريبة القيمة المضافة المحصلة (مخرجات)', accountType: 'liability', parentCode: '223' },
  { key: 'VAT_INPUT', label: 'حساب ضريبة القيمة المضافة - مدخلات', defaultCode: '1243', defaultName: 'ضريبة القيمة المضافة المدفوعة (مدخلات)', accountType: 'asset', parentCode: '124' },
  { key: 'RETAINED_EARNINGS', label: 'حساب الأرباح المبقاة / المرحلة', defaultCode: '32', defaultName: 'الأرباح المبقاة / المرحلة', accountType: 'equity', parentCode: '3' },
  { key: 'CASH_SHORTAGE', label: 'حساب عجز الصندوق والخزينة', defaultCode: '5315', defaultName: 'عجز الصندوق والخزينة', accountType: 'expense', parentCode: '53' },
  { key: 'CASH_SURPLUS', label: 'حساب فائض الصندوق والخزينة', defaultCode: '4215', defaultName: 'فائض الصندوق والخزينة', accountType: 'revenue', parentCode: '42' },
];

export interface MappingHealthItem {
  key: string;
  label: string;
  defaultCode: string;
  isMapped: boolean;
  accountId?: string;
  accountName?: string;
  accountCode?: string;
  isValid: boolean;
  status: 'valid' | 'missing' | 'invalid_id';
}

export interface AccountMappingsHealthReport {
  score: number; // نسبة مئوية من 0 إلى 100
  total: number;
  validCount: number;
  missingCount: number;
  items: MappingHealthItem[];
  isFullyConfigured: boolean;
}

/**
 * فحص اكتمال خريطة الحسابات الأساسية لمنظمة معينة
 */
export const checkAccountMappingsHealth = async (orgId?: string): Promise<AccountMappingsHealthReport> => {
  let targetOrgId = orgId;
  if (!targetOrgId) {
    const { data: { session } } = await supabase.auth.getSession();
    targetOrgId = session?.user?.user_metadata?.org_id;
  }

  if (!targetOrgId) {
    return {
      score: 0,
      total: CORE_ACCOUNT_MAPPING_DEFS.length,
      validCount: 0,
      missingCount: CORE_ACCOUNT_MAPPING_DEFS.length,
      items: CORE_ACCOUNT_MAPPING_DEFS.map(d => ({
        key: d.key,
        label: d.label,
        defaultCode: d.defaultCode,
        isMapped: false,
        isValid: false,
        status: 'missing'
      })),
      isFullyConfigured: false
    };
  }

  // 1. جلب إعدادات المنظمة الحالية
  const { data: settings } = await supabase
    .from('company_settings')
    .select('account_mappings')
    .eq('organization_id', targetOrgId)
    .maybeSingle();

  const currentMappings: Record<string, string> = settings?.account_mappings || {};

  // 2. جلب جميع حسابات المنظمة للتحقق من وجود الحسابات المعينة وصحتها
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type, is_group')
    .eq('organization_id', targetOrgId);

  const accountsMap = new Map<string, { id: string; code: string; name: string }>();
  (accounts || []).forEach(a => {
    accountsMap.set(a.id, { id: a.id, code: a.code, name: a.name });
  });

  // 3. مطابقة كل مفتاح
  const items: MappingHealthItem[] = [];
  let validCount = 0;

  for (const def of CORE_ACCOUNT_MAPPING_DEFS) {
    const mappedId = currentMappings[def.key];
    if (mappedId && accountsMap.has(mappedId)) {
      const acc = accountsMap.get(mappedId)!;
      items.push({
        key: def.key,
        label: def.label,
        defaultCode: def.defaultCode,
        isMapped: true,
        accountId: acc.id,
        accountName: acc.name,
        accountCode: acc.code,
        isValid: true,
        status: 'valid'
      });
      validCount++;
    } else if (mappedId && !accountsMap.has(mappedId)) {
      items.push({
        key: def.key,
        label: def.label,
        defaultCode: def.defaultCode,
        isMapped: true,
        accountId: mappedId,
        isValid: false,
        status: 'invalid_id'
      });
    } else {
      items.push({
        key: def.key,
        label: def.label,
        defaultCode: def.defaultCode,
        isMapped: false,
        isValid: false,
        status: 'missing'
      });
    }
  }

  const total = CORE_ACCOUNT_MAPPING_DEFS.length;
  const score = Math.round((validCount / total) * 100);

  return {
    score,
    total,
    validCount,
    missingCount: total - validCount,
    items,
    isFullyConfigured: validCount === total
  };
};

/**
 * التوليد والربط الآلي الذكي للحسابات المفقودة في الدليل المحاسبي
 */
export const autoResolveMissingMappings = async (orgId?: string): Promise<{
  resolvedCount: number;
  updatedMappings: Record<string, string>;
  message: string;
}> => {
  let targetOrgId = orgId;
  if (!targetOrgId) {
    const { data: { session } } = await supabase.auth.getSession();
    targetOrgId = session?.user?.user_metadata?.org_id;
  }

  if (!targetOrgId) {
    throw new Error('تعذر تحديد المنظمة لتحديث الربط المحاسبي.');
  }

  // 1. فحص الحالة الراهنة
  const health = await checkAccountMappingsHealth(targetOrgId);

  // 2. جلب الحسابات الحالية وإعدادات المنظمة
  const [accRes, setRes] = await Promise.all([
    supabase.from('accounts').select('id, code, name, type, is_group').eq('organization_id', targetOrgId),
    supabase.from('company_settings').select('id, account_mappings').eq('organization_id', targetOrgId).maybeSingle()
  ]);

  const existingAccounts = accRes.data || [];
  const currentMappings: Record<string, string> = setRes.data?.account_mappings || {};
  let resolvedCount = 0;

  for (const item of health.items) {
    if (item.status === 'valid') continue;

    const def = CORE_ACCOUNT_MAPPING_DEFS.find(d => d.key === item.key);
    if (!def) continue;

    // محاولة إيجاد حساب مطابق بالكود المباشر
    let matchedAccount = existingAccounts.find(a => a.code === def.defaultCode);

    // محاولة إيجاد حساب مطابق بالاسم إذا لم يتطابق الكود
    if (!matchedAccount) {
      matchedAccount = existingAccounts.find(a => 
        a.name && (a.name.includes(def.defaultName) || def.defaultName.includes(a.name))
      );
    }

    if (matchedAccount) {
      currentMappings[def.key] = matchedAccount.id;
      resolvedCount++;
    } else {
      // إذا كان الحساب غير موجود إطلاقاً، نقوم بإنشائه تحت حسابه الرئيسي
      let parentAccount = existingAccounts.find(a => a.code === def.parentCode);
      if (!parentAccount) {
        const rootCode = def.parentCode.charAt(0);
        parentAccount = existingAccounts.find(a => a.code === rootCode);
      }

      const { data: createdAcc, error: createErr } = await supabase
        .from('accounts')
        .insert({
          organization_id: targetOrgId,
          code: def.defaultCode,
          name: def.defaultName,
          type: def.accountType.toUpperCase(),
          is_group: false,
          is_active: true,
          parent_id: parentAccount?.id || null
        })
        .select()
        .single();

      if (!createErr && createdAcc) {
        existingAccounts.push(createdAcc);
        currentMappings[def.key] = createdAcc.id;
        resolvedCount++;
      }
    }
  }

  // 3. تحديث company_settings بالخريطة المحصنة
  if (setRes.data?.id) {
    await supabase
      .from('company_settings')
      .update({ account_mappings: currentMappings })
      .eq('id', setRes.data.id);
  } else {
    await supabase
      .from('company_settings')
      .insert({
        organization_id: targetOrgId,
        account_mappings: currentMappings
      });
  }

  return {
    resolvedCount,
    updatedMappings: currentMappings,
    message: `تم فحص وتحديث الربط المحاسبي بنجاح. تم ربط/إنشاء ${resolvedCount} حساباً.`
  };
};
