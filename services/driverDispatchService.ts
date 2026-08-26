/**
 * ==============================================================================
 * Driver Dispatch & Cash Settlements Service
 * TriPro ERP — services/driverDispatchService.ts
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { AccountingEngine } from './accountingEngine';
import { secureStorage } from '../utils/securityMiddleware';

export interface DriverDelivery {
  id: string;
  organization_id?: string | null;
  order_id: string;
  order_number: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  driver_id?: string | null;
  driver_name: string;
  driver_phone?: string;
  status: 'ASSIGNED' | 'DISPATCHED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED';
  cod_amount: number; // المبلغ المطلوب تحصيله نقداً
  is_settled: boolean;
  settlement_id?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  returned_at?: string | null;
  notes?: string;
  created_at: string;
}

export interface DriverSettlement {
  id: string;
  organization_id?: string | null;
  settlement_number: string;
  driver_id?: string | null;
  driver_name: string;
  settlement_date: string;
  total_orders_count: number;
  total_cod_expected: number;
  total_cash_received: number;
  difference_amount: number;
  journal_entry_id?: string | null;
  status: 'COMPLETED';
  notes?: string;
  created_by?: string;
  created_at: string;
}

const LOCAL_DELIVERIES_KEY = 'tripro_driver_deliveries_v1';
const LOCAL_SETTLEMENTS_KEY = 'tripro_driver_settlements_v1';

class DriverDispatchService {
  public async getDeliveries(organizationId?: string): Promise<DriverDelivery[]> {
    try {
      let query = supabase
        .from('driver_deliveries')
        .select(`
          *,
          order:orders(id, order_number, grand_total, customer_id, customers(name, phone, address))
        `)
        .order('created_at', { ascending: false });

      if (organizationId) query = query.eq('organization_id', organizationId);

      const { data, error } = await query;
      if (error || !data) {
        return this.getLocalDeliveries();
      }

      const formatted = data.map((d: any) => ({
        ...d,
        order_number: d.order?.order_number || 'طلب توصيل',
        customer_name: d.order?.customers?.name || 'عميل',
        customer_phone: d.order?.customers?.phone || '',
        customer_address: d.order?.customers?.address || ''
      }));

      return formatted;
    } catch {
      return this.getLocalDeliveries();
    }
  }

  private getLocalDeliveries(): DriverDelivery[] {
    const list = secureStorage.getItem<DriverDelivery[]>(LOCAL_DELIVERIES_KEY);
    return Array.isArray(list) ? list : [];
  }

  public async assignDriver(params: {
    orderId: string;
    orderNumber: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    driverId?: string;
    driverName: string;
    driverPhone?: string;
    codAmount: number;
    organizationId?: string;
  }): Promise<DriverDelivery> {
    const deliveryRecord: DriverDelivery = {
      id: `delv_${Date.now()}`,
      organization_id: params.organizationId || null,
      order_id: params.orderId,
      order_number: params.orderNumber,
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      customer_address: params.customerAddress,
      driver_id: params.driverId || null,
      driver_name: params.driverName,
      driver_phone: params.driverPhone,
      status: 'ASSIGNED',
      cod_amount: params.codAmount,
      is_settled: false,
      dispatched_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    try {
      await supabase.from('driver_deliveries').insert({
        organization_id: deliveryRecord.organization_id,
        order_id: deliveryRecord.order_id,
        driver_id: deliveryRecord.driver_id,
        driver_name: deliveryRecord.driver_name,
        driver_phone: deliveryRecord.driver_phone,
        status: 'ASSIGNED',
        cod_amount: deliveryRecord.cod_amount,
        is_settled: false,
        dispatched_at: deliveryRecord.dispatched_at
      });
    } catch (e) {
      console.warn('DB delivery insert notice:', e);
    }

    const current = this.getLocalDeliveries();
    secureStorage.setItem(LOCAL_DELIVERIES_KEY, [deliveryRecord, ...current]);
    return deliveryRecord;
  }

  public async updateDeliveryStatus(
    deliveryId: string,
    status: DriverDelivery['status']
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      const updates: any = { status };
      if (status === 'DELIVERED') updates.delivered_at = now;
      if (status === 'RETURNED') updates.returned_at = now;
      await supabase.from('driver_deliveries').update(updates).eq('id', deliveryId);
    } catch (e) {
      console.warn('DB delivery update notice:', e);
    }

    const current = this.getLocalDeliveries();
    const updated = current.map(d => (d.id === deliveryId ? { ...d, status } : d));
    secureStorage.setItem(LOCAL_DELIVERIES_KEY, updated);
  }

  public async getSettlements(organizationId?: string): Promise<DriverSettlement[]> {
    try {
      let query = supabase.from('driver_settlements').select('*').order('created_at', { ascending: false });
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error || !data) return this.getLocalSettlements();
      return data as DriverSettlement[];
    } catch {
      return this.getLocalSettlements();
    }
  }

  private getLocalSettlements(): DriverSettlement[] {
    const list = secureStorage.getItem<DriverSettlement[]>(LOCAL_SETTLEMENTS_KEY);
    return Array.isArray(list) ? list : [];
  }

  public async settleDriverShift(params: {
    driverName: string;
    driverId?: string;
    deliveryIds: string[];
    totalCodExpected: number;
    cashReceived: number;
    organizationId: string;
    cashAccountId?: string;
    clearingAccountId?: string;
    userId?: string;
  }): Promise<{ success: boolean; settlementNumber: string; journalEntryId?: string; error?: string }> {
    const settlementNumber = `DRV-SET-${Date.now().toString().slice(-6)}`;
    const diff = params.cashReceived - params.totalCodExpected;
    let journalEntryId: string | undefined;

    // 1. قيد استلام النقدية
    if (params.cashAccountId && params.clearingAccountId && params.cashReceived > 0) {
      try {
        const journalResult = await AccountingEngine.createJournalEntry({
          organizationId: params.organizationId,
          transactionDate: new Date().toISOString().split('T')[0],
          reference: `JE-${settlementNumber}`,
          description: `تسوية عهدة مبيعات ديلفري - كابتن ${params.driverName} (${params.deliveryIds.length} طلب)`,
          lines: [
            {
              accountId: params.cashAccountId,
              debit: params.cashReceived,
              credit: 0,
              description: `استلام نقدية عهدة ديلفري - ${params.driverName}`
            },
            {
              accountId: params.clearingAccountId,
              debit: 0,
              credit: params.cashReceived,
              description: `تسوية مبيعات توصيل معلقة - ${params.driverName}`
            }
          ],
          status: 'posted'
        });

        if (journalResult.success) {
          journalEntryId = journalResult.journalEntryId;
        }
      } catch (jErr) {
        console.warn('Settlement journal entry notice:', jErr);
      }
    }

    const settlementRecord: DriverSettlement = {
      id: `set_${Date.now()}`,
      organization_id: params.organizationId,
      settlement_number: settlementNumber,
      driver_id: params.driverId || null,
      driver_name: params.driverName,
      settlement_date: new Date().toISOString().split('T')[0],
      total_orders_count: params.deliveryIds.length,
      total_cod_expected: params.totalCodExpected,
      total_cash_received: params.cashReceived,
      difference_amount: diff,
      journal_entry_id: journalEntryId || null,
      status: 'COMPLETED',
      created_by: params.userId,
      created_at: new Date().toISOString()
    };

    try {
      await supabase.from('driver_settlements').insert({
        organization_id: settlementRecord.organization_id,
        settlement_number: settlementRecord.settlement_number,
        driver_id: settlementRecord.driver_id,
        driver_name: settlementRecord.driver_name,
        settlement_date: settlementRecord.settlement_date,
        total_orders_count: settlementRecord.total_orders_count,
        total_cod_expected: settlementRecord.total_cod_expected,
        total_cash_received: settlementRecord.total_cash_received,
        difference_amount: settlementRecord.difference_amount,
        journal_entry_id: settlementRecord.journal_entry_id,
        status: 'COMPLETED'
      });

      // Update deliveries to settled
      await supabase
        .from('driver_deliveries')
        .update({ is_settled: true, settlement_id: settlementRecord.id })
        .in('id', params.deliveryIds);
    } catch (e) {
      console.warn('DB settlement insert notice:', e);
    }

    // Update local storage
    const currentDeliveries = this.getLocalDeliveries();
    const updatedDeliveries = currentDeliveries.map(d =>
      params.deliveryIds.includes(d.id) ? { ...d, is_settled: true, settlement_id: settlementRecord.id } : d
    );
    secureStorage.setItem(LOCAL_DELIVERIES_KEY, updatedDeliveries);

    const currentSettlements = this.getLocalSettlements();
    secureStorage.setItem(LOCAL_SETTLEMENTS_KEY, [settlementRecord, ...currentSettlements]);

    return {
      success: true,
      settlementNumber,
      journalEntryId
    };
  }
}

export const driverDispatchService = new DriverDispatchService();
