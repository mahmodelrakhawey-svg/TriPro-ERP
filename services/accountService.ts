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
  // الحصول على المستخدم الحالي لربط الحساب به
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('accounts')
    // ندمج user_id إذا كان المستخدم مسجلاً، وإلا نعتمد على القيمة الافتراضية في القاعدة
    .insert({ ...accountData, user_id: user?.id })
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
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('code', { ascending: true });

  if (error) {
    console.error('Error fetching accounts:', error);
    throw error;
  }

  return data;
};

/**
 * دالة لحذف حساب
 */
export const deleteAccount = async (id: string) => {
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
};