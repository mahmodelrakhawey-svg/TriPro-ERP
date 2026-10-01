/**
 * ==============================================================================
 * TriPro ERP — Organization Management & Safe Deletion Service
 * services/organizationService.ts
 * ==============================================================================
 * يتولى حذف المنشأة وتفكيك جميع قيودها المرجعية عبر الجداول المرتبطة
 * بأمان تام مع احترام سياسات الصلاحيات.
 * ==============================================================================
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface DeleteOrganizationOptions {
  supabase: SupabaseClient;
  orgId: string;
  currentUser: { role?: string } | null;
  skipConfirm?: boolean;
}

export interface DeleteOrganizationResult {
  success: boolean;
  message?: string;
}

/**
 * قائمة الجداول التابعة للمؤسسة لتنظيف البيانات المتبقية عند تعثر الحذف المتتالي
 */
const CASCADE_TABLES_TO_CLEAN = [
  'butchering_order_items', 'butchering_orders', 'butchering_template_items', 'butchering_templates',
  'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_batch_serials', 'mfg_production_variances',
  'mfg_order_progress', 'mfg_step_materials', 'mfg_step_attachments', 'mfg_routing_steps',
  'mfg_production_order_materials', 'mfg_production_order_steps',
  'mfg_scrap_records', 'mfg_qc_inspections', 'mfg_production_orders', 'mfg_routings', 'mfg_work_centers',
  'order_item_modifiers', 'order_items', 'kitchen_ticket_items', 'kitchen_orders', 'orders',
  'product_channel_prices', 'recipe_items', 'restaurant_recipes', 'combo_items',
  'invoice_items', 'purchase_invoice_items', 'sales_return_items', 'purchase_return_items',
  'stock_adjustment_items', 'journal_lines', 'payroll_variables', 'payroll_items',
  'delivery_order_items', 'inventory_count_items', 'waste_records', 'transfer_items',
  'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 'journal_entries',
  'payments', 'receipt_vouchers', 'payment_vouchers', 'cheques', 'payrolls', 'stock_adjustments',
  'stock_transfers', 'inventory_counts', 'delivery_orders',
  'work_orders', 'bill_of_materials', 'credit_notes', 'debit_notes', 'shifts', 'table_sessions',
  'cashier_shifts', 'pos_petty_cash_payouts', 'waiter_call_requests', 'tips_distribution_records',
  'restaurant_tables', 'modifiers', 'modifier_groups',
  'promotions', 'retail_promotions', 'stadium_bookings', 'stadium_subscriptions', 'construction_projects',
  'products', 'customers', 'suppliers', 'accounts', 'warehouses', 'cost_centers', 'assets',
  'employees', 'company_settings', 'invitations', 'budgets', 'notification_preferences', 'security_logs', 'audit_logs'
];

/**
 * تنفيذ الحذف الآمن للمنظمة وجميع السجلات المرتبطة بها
 */
export async function deleteOrganizationSafe({
  supabase,
  orgId,
  currentUser,
  skipConfirm = false,
}: DeleteOrganizationOptions): Promise<DeleteOrganizationResult> {
  if (currentUser?.role !== 'super_admin' && currentUser?.role !== 'admin') {
    return { success: false, message: 'ليس لديك صلاحية لحذف الشركات.' };
  }

  if (!skipConfirm && typeof window !== 'undefined') {
    const confirmed = window.confirm(
      '⚠️ تحذير: سيتم حذف هذه الشركة وجميع بياناتها (الحسابات، الفواتير، المخزون...) بشكل نهائي.\n\nلا يمكن التراجع عن هذا الإجراء.\n\nهل أنت متأكد تماماً؟'
    );
    if (!confirmed) {
      return { success: false, message: 'تم إلغاء عملية الحذف.' };
    }
  }

  try {
    // 1. استدعاء دالة الحذف الآمنة في قاعدة البيانات
    let deleteResult = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

    // 2. إذا حدث خطأ قيود مرجعية نقوم بتفكيك القيود برمجياً وإعادة المحاولة
    if (deleteResult.error) {
      console.warn('RPC delete failed, initiating programmatic cascade cleanup...', deleteResult.error);
      try {
        await supabase.from('profiles').update({ organization_id: null }).eq('organization_id', orgId);
        await supabase.from('role_permissions').delete().eq('organization_id', orgId);
        await supabase.from('roles').delete().eq('organization_id', orgId);

        // استخراج معرفات الأصناف التابعة للمنظمة لفك أي قيود معلقة عليها
        const { data: orgProducts } = await supabase.from('products').select('id').eq('organization_id', orgId);
        const prodIds = (orgProducts || []).map((p: any) => p.id).filter(Boolean);

        // تفكيك موديول التشفية والذبائح
        try {
          if (prodIds.length > 0) {
            await supabase.from('butchering_order_items').delete().in('output_product_id', prodIds);
            await supabase.from('butchering_template_items').delete().in('output_product_id', prodIds);
            await supabase.from('butchering_orders').delete().in('source_product_id', prodIds);
            await supabase.from('butchering_templates').delete().in('source_product_id', prodIds);
          }
          await supabase.from('butchering_orders').delete().eq('organization_id', orgId);
          await supabase.from('butchering_templates').delete().eq('organization_id', orgId);
        } catch (_) {}

        // تفكيك موديول التصنيع
        try {
          if (prodIds.length > 0) {
            await supabase.from('mfg_actual_material_usage').delete().in('raw_material_id', prodIds);
            await supabase.from('mfg_scrap_logs').delete().in('product_id', prodIds);
            await supabase.from('mfg_batch_serials').delete().in('product_id', prodIds);
            await supabase.from('mfg_step_materials').delete().in('raw_material_id', prodIds);
            await supabase.from('bill_of_materials').delete().in('product_id', prodIds);
            await supabase.from('bill_of_materials').delete().in('raw_material_id', prodIds);
            await supabase.from('mfg_production_orders').delete().in('product_id', prodIds);
            await supabase.from('mfg_routings').delete().in('product_id', prodIds);
          }
        } catch (_) {}

        // تفكيك قيود المطاعم ونقاط البيع
        try {
          if (prodIds.length > 0) {
            await supabase.from('kitchen_ticket_items').delete().in('product_id', prodIds);
            await supabase.from('product_channel_prices').delete().in('product_id', prodIds);
            await supabase.from('recipe_items').delete().in('product_id', prodIds);
            await supabase.from('recipe_items').delete().in('ingredient_id', prodIds);
            await supabase.from('combo_items').delete().in('product_id', prodIds);
            await supabase.from('combo_items').delete().in('included_product_id', prodIds);
          }
        } catch (_) {}

        // تفكيك بقية الجداول
        for (const tbl of CASCADE_TABLES_TO_CLEAN) {
          try {
            await (supabase.from(tbl as any) as any).delete().eq('organization_id', orgId);
          } catch (_) {}
        }

        // محاولة الحذف بعد التفكيك
        deleteResult = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

        if (deleteResult.error) {
          const directDelete = await supabase.from('organizations').delete().eq('id', orgId);
          if (directDelete.error) {
            throw new Error(deleteResult.error.message || directDelete.error.message);
          }
        }
      } catch (cleanupErr) {
        throw new Error(deleteResult.error?.message || cleanupErr.message);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, message: e.message || 'حدث خطأ غير متوقع أثناء حذف الشركة' };
  }
}
