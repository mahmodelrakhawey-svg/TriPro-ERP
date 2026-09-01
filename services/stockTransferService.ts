/**
 * ==============================================================================
 * TriPro ERP — Two-Step In-Transit Inter-Warehouse Transfer Service
 * services/stockTransferService.ts
 * ==============================================================================
 * إدارة دورة التحويل المخزني ثنائية المراحل مع بضاعة بالطريق والشحن والاستلام والفحص.
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { InTransitTransfer, InTransitTransferItem, TransferType, InTransitStatus } from '../types';
import WmsLocationService from './wmsLocationService';
import NotificationService from './notificationService';

const STORAGE_KEYS = {
  TRANSFERS: 'tripro_in_transit_transfers_v1',
};

export class StockTransferService {
  public static sanitizeUuid(val?: string | null): string | null {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (trimmed === '' || trimmed === '00000000-0000-0000-0000-000000000000') return null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
  }

  public static generateUuid(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---------------------------------------------------------------------------
  // Local Fallback Storage Helpers
  // ---------------------------------------------------------------------------
  private static getLocalTransfers(orgId?: string): InTransitTransfer[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TRANSFERS);
      if (!raw) return [];
      let all: InTransitTransfer[] = JSON.parse(raw);
      if (orgId) all = all.filter(t => t.organization_id === orgId);
      return all;
    } catch {
      return [];
    }
  }

  private static saveLocalTransfers(transfers: InTransitTransfer[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSFERS, JSON.stringify(transfers));
    } catch (e) {
      console.warn('Local save error:', e);
    }
  }

  /**
   * جلب قائمة التحويلات المخزنية والشحنات بالطريق
   */
  static async getTransfers(orgId: string, filters?: { status?: string; transferType?: string }): Promise<InTransitTransfer[]> {
    const validOrgId = this.sanitizeUuid(orgId);

    try {
      let query = supabase
        .from('stock_transfers')
        .select(`
          *,
          items:stock_transfer_items(*)
        `)
        .order('created_at', { ascending: false });

      if (validOrgId) query = query.eq('organization_id', validOrgId);
      if (filters?.transferType && filters.transferType !== 'all') {
        query = query.eq('transfer_type', filters.transferType);
      }
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('in_transit_status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) {
        return this.getLocalTransfers(orgId);
      }
      return data;
    } catch {
      let local = this.getLocalTransfers(orgId);
      if (filters?.transferType && filters.transferType !== 'all') {
        local = local.filter(t => t.transfer_type === filters.transferType);
      }
      if (filters?.status && filters.status !== 'all') {
        local = local.filter(t => t.in_transit_status === filters.status);
      }
      return local;
    }
  }

  /**
   * إنشاء إذن تحويل جديد (مباشر أو شحنة بضاعة بالطريق)
   */
  static async createTransfer(
    data: Partial<InTransitTransfer>,
    items: InTransitTransferItem[],
    orgId: string,
    userId?: string
  ): Promise<{ success: boolean; data?: InTransitTransfer; error?: string }> {
    const validOrgId = this.sanitizeUuid(orgId) || this.generateUuid();
    const validFromWh = this.sanitizeUuid(data.from_warehouse_id) || this.generateUuid();
    const validToWh = this.sanitizeUuid(data.to_warehouse_id) || this.generateUuid();
    const transferNumber = data.transfer_number || `TRN-${Date.now().toString().slice(-6)}`;
    const transferDate = data.transfer_date || new Date().toISOString().split('T')[0];
    const generatedId = this.generateUuid();
    const transferType = (data.transfer_type as TransferType) || 'in_transit';

    // إذا كان تحويل بالطريق يبدأ بحالة 'in_transit' أو 'pending_dispatch'
    const inTransitStatus: InTransitStatus = transferType === 'in_transit' ? 'in_transit' : 'received_full';

    const cleanDbHeader = {
      organization_id: validOrgId,
      transfer_number: transferNumber,
      transfer_date: transferDate,
      from_warehouse_id: validFromWh,
      to_warehouse_id: validToWh,
      transfer_type: transferType,
      in_transit_status: inTransitStatus,
      status: 'posted',
      carrier_name: data.carrier_name || null,
      driver_name: data.driver_name || null,
      driver_phone: data.driver_phone || null,
      vehicle_number: data.vehicle_number || null,
      tracking_number: data.tracking_number || null,
      dispatched_at: new Date().toISOString(),
      estimated_arrival: data.estimated_arrival || null,
      notes: data.notes || '',
    };

    const localRecord: InTransitTransfer = {
      id: generatedId,
      ...cleanDbHeader,
      from_warehouse_name: data.from_warehouse_name,
      to_warehouse_name: data.to_warehouse_name,
      created_at: new Date().toISOString(),
      items: items.map(it => ({
        ...it,
        dispatched_qty: it.quantity,
        received_qty: transferType === 'direct' ? it.quantity : 0,
        variance_qty: 0,
      })),
    };

    try {
      const { data: createdHeader, error: headErr } = await supabase
        .from('stock_transfers')
        .insert(cleanDbHeader)
        .select()
        .single();

      if (headErr) throw headErr;

      const itemsToInsert = items.map(it => ({
        stock_transfer_id: createdHeader.id,
        product_id: this.sanitizeUuid(it.product_id) || this.generateUuid(),
        quantity: Number(it.quantity) || 1,
        dispatched_qty: Number(it.quantity) || 1,
        received_qty: transferType === 'direct' ? Number(it.quantity) || 1 : 0,
        variance_qty: 0,
        from_bin_id: this.sanitizeUuid(it.from_bin_id),
        to_bin_id: this.sanitizeUuid(it.to_bin_id),
      }));

      await supabase.from('stock_transfer_items').insert(itemsToInsert);

      // خصم من مواقع الرفوف للمستودع المصدر إن وجدت
      for (const it of items) {
        if (it.from_bin_id) {
          await WmsLocationService.deallocateStockFromBin(it.from_bin_id, it.product_id, it.quantity);
        }
      }

      // إذا كان تحويل مباشر نضيف للمستودع المستهدف فوراً
      if (transferType === 'direct') {
        for (const it of items) {
          if (it.to_bin_id) {
            await WmsLocationService.allocateStockToBin(
              validOrgId,
              validToWh,
              it.to_bin_id,
              it.product_id,
              it.product_name || 'صنف',
              it.quantity
            );
          }
        }
      }

      // حفظ محلي
      const existing = this.getLocalTransfers('');
      localRecord.id = createdHeader.id;
      this.saveLocalTransfers([localRecord, ...existing]);

      // إرسال إشعار
      const validUserId = this.sanitizeUuid(userId);
      if (validUserId) {
        await NotificationService.createNotification(
          validUserId,
          validOrgId,
          `شحنة تحويل جديدة #${transferNumber}`,
          `تم إنشاء شحنة تحويل بضاعة بالطريق من مستودع ${data.from_warehouse_name || ''} إلى ${data.to_warehouse_name || ''}`,
          'info',
          'medium',
          createdHeader.id,
          `/inventory/in-transit-transfers`
        );
      }

      return { success: true, data: localRecord };
    } catch {
      const existing = this.getLocalTransfers('');
      this.saveLocalTransfers([localRecord, ...existing]);
      return { success: true, data: localRecord };
    }
  }

  /**
   * تأكيد استلام وفحص شحنة بضاعة بالطريق في المستودع المستهدف (Receive & Quality Check)
   */
  static async receiveTransfer(
    transferId: string,
    receivedItems: { product_id: string; received_qty: number; to_bin_id?: string }[],
    receiptNotes?: string,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const validTransferId = this.sanitizeUuid(transferId);
    const now = new Date().toISOString();

    try {
      let transfer: InTransitTransfer | null = null;

      if (validTransferId) {
        const { data } = await supabase
          .from('stock_transfers')
          .select('*, items:stock_transfer_items(*)')
          .eq('id', validTransferId)
          .single();
        if (data) transfer = data;
      }

      if (!transfer) {
        transfer = this.getLocalTransfers('').find(t => t.id === transferId) || null;
      }

      if (!transfer) throw new Error('لم يتم العثور على إذن التحويل');

      let hasVariance = false;
      const updatedItems = (transfer.items || []).map(it => {
        const match = receivedItems.find(r => r.product_id === it.product_id);
        const recQty = match !== undefined ? Number(match.received_qty) : Number(it.dispatched_qty || it.quantity);
        const dispQty = Number(it.dispatched_qty || it.quantity);
        const variance = dispQty - recQty;

        if (variance !== 0) hasVariance = true;

        return {
          ...it,
          received_qty: recQty,
          variance_qty: variance,
          to_bin_id: match?.to_bin_id || it.to_bin_id,
        };
      });

      const finalStatus: InTransitStatus = hasVariance ? 'partially_received' : 'received_full';

      // تحديث رأس التحويل
      if (validTransferId) {
        await supabase
          .from('stock_transfers')
          .update({
            in_transit_status: finalStatus,
            received_at: now,
            received_by: this.sanitizeUuid(userId),
            receipt_notes: receiptNotes || null,
          })
          .eq('id', validTransferId);

        // تحديث بنود التحويل
        for (const it of updatedItems) {
          if (it.id) {
            await supabase
              .from('stock_transfer_items')
              .update({
                received_qty: it.received_qty,
                variance_qty: it.variance_qty,
                to_bin_id: this.sanitizeUuid(it.to_bin_id),
              })
              .eq('id', it.id);
          }
        }
      }

      // تسكين الكميات في الرفوف المحددة في المستودع المستلم
      for (const it of updatedItems) {
        if (it.to_bin_id && (Number(it.received_qty) || 0) > 0) {
          await WmsLocationService.allocateStockToBin(
            transfer.organization_id,
            transfer.to_warehouse_id,
            it.to_bin_id,
            it.product_id,
            it.product_name || 'صنف',
            it.received_qty || 0
          );
        }
      }

      // تحديث محلي
      const localTransfers = this.getLocalTransfers('');
      const idx = localTransfers.findIndex(t => t.id === transferId);
      if (idx !== -1) {
        localTransfers[idx] = {
          ...localTransfers[idx],
          in_transit_status: finalStatus,
          received_at: now,
          receipt_notes: receiptNotes,
          items: updatedItems,
        };
        this.saveLocalTransfers(localTransfers);
      }

      // إرسال إشعار
      const validUserId = this.sanitizeUuid(userId);
      if (validUserId && transfer.organization_id) {
        await NotificationService.createNotification(
          validUserId,
          transfer.organization_id,
          `تم استلام الشحنة #${transfer.transfer_number}`,
          `تم استلام شحنة التحويل في مستودع الوجهة بنجاح (${hasVariance ? 'يوجد فروقات وعجز' : 'مطابقة تامة'})`,
          hasVariance ? 'warning' : 'success',
          'medium',
          transfer.id,
          `/inventory/in-transit-transfers`
        );
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'فشل تأكيد استلام الشحنة' };
    }
  }

  /**
   * ترجمة حالة الشحنة بالطريق
   */
  static getInTransitStatusArabic(status: InTransitStatus): string {
    switch (status) {
      case 'pending_dispatch': return 'بانتظار الشحن';
      case 'in_transit': return 'بضاعة بالطريق 🚚';
      case 'partially_received': return 'مستلم جزئياً (يوجد عجز)';
      case 'received_full': return 'مستلم بالكامل ✅';
      case 'cancelled': return 'ملغي';
      default: return status;
    }
  }
}

export default StockTransferService;
