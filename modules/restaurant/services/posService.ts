import { supabase } from '../../../supabaseClient';
import { handleError } from '../../../utils/errorHandler';
import { toast } from 'react-hot-toast';
import type { ShiftReconciliationData } from '../../../types';

/**
 * خدمة نقاط البيع والمحاسبة (POS & Accounting Service)
 * متوافقة مع المحرك الموحد TriPro ERP V50.0
 */
export const posService = {
  /**
   * بدء وردية جديدة
   * @param openingBalance الرصيد الافتتاحي
   * @param treasuryId معرف الحساب النقدي (1231)
   * @param userId معرف المستخدم
   * @param orgId معرف المنظمة
   */
  async startShift(openingBalance: number, treasuryId: string, userId: string, orgId: string) {
    try {
      const { data, error } = await supabase.rpc('start_pos_shift', {
        p_opening_balance: openingBalance,
        p_resume_existing: true, // استئناف الوردية إذا كانت موجودة
        p_treasury_account_id: treasuryId,
        p_user_id: userId,
        p_org_id: orgId,
        p_terminal_id: null // 🛡️ نمرر null صراحة لمنع تداخل توقيع الدالة (Overload Ambiguity) في PostgreSQL
      });

      if (error) throw error;
      toast.success('تم فتح الوردية بنجاح ✅');
      return data;
    } catch (err) {
      handleError(err, { context: { functionName: 'startShift' } });
      throw err;
    }
  },

  /**
   * إنشاء طلب مطعم/نقطة بيع
   * @param orderData بيانات الطلب (session_id, items, warehouse_id, etc.)
   */
  async createOrder(orderData: {
    sessionId: string | null;
    userId: string;
    orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
    items: any[];
    warehouseId: string;
    orgId: string;
    notes?: string;
    customerId?: string;
    deliveryInfo?: any;
  }) {
    try {
      const { data, error } = await supabase.rpc('create_restaurant_order', {
        p_session_id: orderData.sessionId,
        p_user_id: orderData.userId,
        p_order_type: orderData.orderType,
        p_notes: orderData.notes || '',
        p_items: orderData.items,
        p_customer_id: orderData.customerId || null,
        p_warehouse_id: orderData.warehouseId,
        p_delivery_info: orderData.deliveryInfo || null,
        p_org_id: orderData.orgId
      });

      if (error) throw error;
      return data; // يعيد معرف الطلب
    } catch (err) {
      handleError(err, { context: { functionName: 'createOrder' } });
      throw err;
    }
  },

  /**
   * إتمام الدفع وخصم المخزون
   */
  async completeOrder(orderId: string, amount: number, cashAccountId: string, warehouseId: string, orgId: string) {
    try {
      const { error } = await supabase.rpc('complete_restaurant_order', {
        p_order_id: orderId,
        p_payment_method: 'CASH',
        p_amount: amount,
        p_cash_account_id: cashAccountId,
        p_org_id: orgId,
        p_warehouse_id: warehouseId
      });

      if (error) throw error;
      toast.success('تم إتمام الدفع وتحديث المخزون 💳');
    } catch (err) {
      handleError(err, { context: { functionName: 'completeOrder' } });
      throw err;
    }
  },

  /**
   * تسجيل حركة نقدية بالدرج (مصروف نثري، تزويد فكة، توريد خزينة، استلام عربون)
   */
  async recordDrawerTransaction(params: {
    shiftId: string;
    type: 'PAID_OUT_EXPENSE' | 'SAFE_DROP' | 'PAID_IN' | 'ADVANCE_DEPOSIT_IN';
    amount: number;
    reason?: string | null;
    accountId?: string | null;
    custodianName?: string | null;
    orgId?: string | null;
  }) {
    try {
      const { data, error } = await supabase.rpc('record_pos_drawer_transaction', {
        p_shift_id: params.shiftId,
        p_transaction_type: params.type,
        p_amount: params.amount,
        p_reason: params.reason || null,
        p_account_id: params.accountId || null,
        p_custodian_name: params.custodianName || null,
        p_org_id: params.orgId || null
      });

      if (error) throw error;
      toast.success('تم تسجيل حركة الدرج النقدية بنجاح 💵');
      return data;
    } catch (err) {
      handleError(err, { context: { functionName: 'recordDrawerTransaction' } });
      throw err;
    }
  },

  /**
   * إغلاق الوردية وتوليد القيود
   */
  async closeShift(shiftId: string, actualCash: number, orgId: string, notes?: string, reconciliation?: ShiftReconciliationData | null) {
    try {
      const { error } = await supabase.rpc('close_shift', {
        p_shift_id: shiftId,
        p_actual_cash: actualCash,
        p_notes: notes || 'إغلاق وردية من الواجهة الأمامية',
        p_org_id: orgId,
        p_reconciliation: reconciliation || null
      });

      if (error) throw error;
      toast.success('تم إغلاق الوردية وترحيل القيود بنجاح 🏁');
    } catch (err) {
      handleError(err, { context: { functionName: 'closeShift' } });
      throw err;
    }
  }
};