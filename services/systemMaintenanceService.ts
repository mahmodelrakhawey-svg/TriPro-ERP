import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

export const ALLOWED_RECYCLE_TABLES = [
  'products',
  'customers',
  'suppliers',
  'assets',
  'warehouses',
  'employees',
  'restaurant_tables',
] as const;

export type ShowToastFn = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

/**
 * استعادة سجل محذوف منطقياً مع إعادة ترحيل قيود الأصول المستعادة عند الحاجة
 */
export async function restoreRecycleItem(params: {
  supabaseClient: Pick<SupabaseClient, 'from' | 'rpc'>;
  table: string;
  id: string;
  orgId?: string | null;
  refreshData?: () => Promise<void>;
}): Promise<{ success: boolean; message?: string }> {
  const { supabaseClient, table, id, orgId, refreshData } = params;
  if (!(ALLOWED_RECYCLE_TABLES as readonly string[]).includes(table)) {
    return { success: false, message: 'الجدول غير مصرح به لعمليات الاسترجاع' };
  }

  let query = supabaseClient.from(table).update({ deleted_at: null }).eq('id', id);
  if (orgId) query = query.eq('organization_id', orgId);
  const { error } = await query;

  if (!error && table === 'assets') {
    try {
      const prefix = id.split('-')[0].toUpperCase();
      const shortId = id.slice(0, 6);
      await supabaseClient
        .from('journal_entries')
        .update({ status: 'posted', is_posted: true })
        .eq('organization_id', orgId)
        .or(`related_document_id.eq.${id},reference.ilike.ASSET-${prefix}%,reference.ilike.DEP-${shortId}%`);

      if (orgId) {
        await supabaseClient.rpc('recalculate_all_system_balances', { p_org_id: orgId });
      }
    } catch (e) {
      logger.warn('restoreRecycleItem asset repost fallback:', e);
    }
  }

  if (refreshData) await refreshData();
  return { success: !error, message: error?.message };
}

/**
 * حذف سجل نهائياً من سلة المحذوفات مع تنظيف قيود وسجلات الأصول المرتبطة بأمان
 */
export async function permanentDeleteRecycleItem(params: {
  supabaseClient: Pick<SupabaseClient, 'from' | 'rpc'>;
  table: string;
  id: string;
  orgId?: string | null;
  refreshData?: () => Promise<void>;
}): Promise<{ success: boolean; message?: string }> {
  const { supabaseClient, table, id, orgId, refreshData } = params;
  if (!(ALLOWED_RECYCLE_TABLES as readonly string[]).includes(table)) {
    return { success: false, message: 'الجدول غير مصرح به لعمليات الحذف النهائي' };
  }

  if (table === 'assets') {
    try {
      const prefix = id.split('-')[0].toUpperCase();
      const shortId = id.slice(0, 6);

      const { data: entries } = await supabaseClient
        .from('journal_entries')
        .select('id')
        .eq('organization_id', orgId)
        .or(`related_document_id.eq.${id},reference.ilike.ASSET-${prefix}%,reference.ilike.DEP-${shortId}%`);

      if (entries && entries.length > 0) {
        const entryIds = entries.map((e: { id: string }) => e.id);
        await supabaseClient.from('journal_entries').update({ status: 'draft', is_posted: false }).in('id', entryIds);
        await supabaseClient.from('journal_lines').delete().in('journal_entry_id', entryIds);
        await supabaseClient.from('journal_entries').delete().in('id', entryIds);
      }

      await supabaseClient.from('asset_audits').delete().eq('asset_id', id);
      await supabaseClient.from('asset_transfers').delete().eq('asset_id', id);

      if (orgId) {
        await supabaseClient.rpc('recalculate_all_system_balances', { p_org_id: orgId });
      }
    } catch (e) {
      logger.warn('Error purging asset journal entries during permanent delete:', e);
    }
  }

  let delQuery = supabaseClient.from(table).delete().eq('id', id);
  if (orgId) delQuery = delQuery.eq('organization_id', orgId);
  const { error } = await delQuery;
  if (refreshData) await refreshData();
  return { success: !error, message: error?.message };
}

export async function clearAllOrgTransactions(params: {
  supabaseClient: Pick<SupabaseClient, 'rpc'>;
  refreshAccountsAndLedger?: () => Promise<void>;
}): Promise<void> {
  await params.supabaseClient.rpc('clear_all_transactions');
  if (params.refreshAccountsAndLedger) await params.refreshAccountsAndLedger();
}

export async function emptyOrgRecycleBin(params: {
  supabaseClient: Pick<SupabaseClient, 'rpc'>;
  table: string;
  refreshData?: () => Promise<void>;
}): Promise<void> {
  await params.supabaseClient.rpc('empty_recycle_bin', { p_table_name: params.table });
  if (params.refreshData) await params.refreshData();
}

export async function purgeOrgDeletedRecords(params: {
  supabaseClient: Pick<SupabaseClient, 'rpc'>;
  showToast?: ShowToastFn;
  refreshData?: () => Promise<void>;
}): Promise<void> {
  const { error } = await params.supabaseClient.rpc('purge_deleted_records');
  if (error) {
    params.showToast?.('فشل تنظيف السجلات: ' + error.message, 'error');
    return;
  }
  params.showToast?.('تم تنظيف السجلات المحذوفة بنجاح ✅', 'success');
  if (params.refreshData) params.refreshData();
}

export async function refreshOrgSaasSchema(params: {
  supabaseClient: Pick<SupabaseClient, 'rpc'>;
  showToast?: ShowToastFn;
}): Promise<void> {
  await params.supabaseClient.rpc('refresh_saas_schema');
  params.showToast?.('جاري تحديث هيكل النظام...', 'info');
  if (typeof window !== 'undefined') {
    setTimeout(() => window.location.reload(), 1500);
  }
}

export async function exportOrganizationDataset(params: {
  effectiveOrgId: string;
  organizationName?: string | null;
  settings: unknown;
  accounts: Array<{ code?: string; name?: string; type?: string; balance?: number }>;
  customers: Array<{ id: string; name: string; phone?: string; balance?: number }>;
  suppliers: Array<{ id: string; name: string; phone?: string; balance?: number }>;
  products: Array<{ id: string; name: string; sku?: string; price?: number; stock?: number }>;
  logActivity?: (action: string, details: string) => void;
  showToast?: ShowToastFn;
}): Promise<void> {
  const {
    effectiveOrgId,
    organizationName,
    settings,
    accounts,
    customers,
    suppliers,
    products,
    logActivity,
    showToast,
  } = params;

  try {
    const exportPayload = {
      exported_at: new Date().toISOString(),
      organization_id: effectiveOrgId,
      organization_name: organizationName || 'TriPro Organization',
      settings,
      accounts: accounts.map(a => ({ code: a.code, name: a.name, type: a.type, balance: a.balance })),
      customers: customers.map(c => ({ id: c.id, name: c.name, phone: c.phone, balance: c.balance })),
      suppliers: suppliers.map(s => ({ id: s.id, name: s.name, phone: s.phone, balance: s.balance })),
      products: products.map(p => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, stock: p.stock })),
    };

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const jsonStr = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tripro_backup_${effectiveOrgId || 'org'}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    logActivity?.('تصدير بيانات', 'تم تصدير نسخة احتياطية من بيانات المنظمة بصيغة JSON');
    showToast?.('تم تصدير نسخة احتياطية من البيانات بنجاح ✅', 'success');
  } catch (err: unknown) {
    logger.error('Failed to export data:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    showToast?.('فشل تصدير البيانات: ' + errMsg, 'error');
  }
}
