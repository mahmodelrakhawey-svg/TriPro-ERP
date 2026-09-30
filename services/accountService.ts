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
    console.error('Error creating account:', error.message);
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
    console.error('Error fetching accounts:', error);
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