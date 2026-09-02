/**
 * ==============================================================================
 * TriPro ERP — Request for Quotations (RFQ) & Vendor Bidding Service
 * services/rfqService.ts
 * ==============================================================================
 * إدارة طلبات عروض الأسعار، مقارنة عطاءات الموردين، والترسية والتحويل لأوامر شراء PO
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { PurchaseRfq, PurchaseRfqItem, VendorQuotationBid, VendorQuotationBidItem, PurchaseRfqStatus } from '../types';
import NotificationService from './notificationService';

const STORAGE_KEYS = {
  RFQS: 'tripro_purchase_rfqs_v1',
  BIDS: 'tripro_vendor_bids_v1',
};

export class RfqService {
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
  // Local Storage Fallback Helpers
  // ---------------------------------------------------------------------------
  private static getLocalRfqs(orgId?: string): PurchaseRfq[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.RFQS);
      if (!raw) return [];
      let all: PurchaseRfq[] = JSON.parse(raw);
      if (orgId) all = all.filter(r => r.organization_id === orgId);
      return all;
    } catch {
      return [];
    }
  }

  private static saveLocalRfqs(rfqs: PurchaseRfq[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.RFQS, JSON.stringify(rfqs));
    } catch (e) {
      console.warn('Local storage save error:', e);
    }
  }

  private static getLocalBids(rfqId?: string): VendorQuotationBid[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.BIDS);
      if (!raw) return [];
      let all: VendorQuotationBid[] = JSON.parse(raw);
      if (rfqId) all = all.filter(b => b.rfq_id === rfqId);
      return all;
    } catch {
      return [];
    }
  }

  private static saveLocalBids(bids: VendorQuotationBid[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.BIDS, JSON.stringify(bids));
    } catch (e) {
      console.warn('Local storage save error:', e);
    }
  }

  /**
   * جلب قائمة طلبات عروض الأسعار
   */
  static async getRfqs(orgId: string, filters?: { status?: string }): Promise<PurchaseRfq[]> {
    const validOrgId = this.sanitizeUuid(orgId);

    try {
      let query = supabase
        .from('purchase_rfqs')
        .select(`
          *,
          items:purchase_rfq_items(*),
          bids:vendor_quotation_bids(*, items:vendor_quotation_bid_items(*))
        `)
        .order('created_at', { ascending: false });

      if (validOrgId) query = query.eq('organization_id', validOrgId);
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) {
        return this.getLocalRfqs(orgId);
      }

      return data;
    } catch {
      let local = this.getLocalRfqs(orgId);
      if (filters?.status && filters.status !== 'all') {
        local = local.filter(r => r.status === filters.status);
      }
      return local;
    }
  }

  /**
   * جلب تفاصيل طلب عرض أسعار محدد مع عطاءات الموردين
   */
  static async getRfqById(id: string): Promise<PurchaseRfq | null> {
    const validId = this.sanitizeUuid(id);

    try {
      if (validId) {
        const { data, error } = await supabase
          .from('purchase_rfqs')
          .select(`
            *,
            items:purchase_rfq_items(*),
            bids:vendor_quotation_bids(*, items:vendor_quotation_bid_items(*))
          `)
          .eq('id', validId)
          .single();

        if (!error && data) return data;
      }
    } catch {}

    const local = this.getLocalRfqs('').find(r => r.id === id);
    if (local) {
      local.bids = this.getLocalBids(id);
    }
    return local || null;
  }

  /**
   * إنشاء طلب عرض أسعار جديد (RFQ)
   */
  static async createRfq(
    data: Partial<PurchaseRfq>,
    items: PurchaseRfqItem[],
    orgId: string,
    userId?: string
  ): Promise<{ success: boolean; data?: PurchaseRfq; error?: string }> {
    const validOrgId = this.sanitizeUuid(orgId) || this.generateUuid();
    const rfqNumber = data.rfq_number || `RFQ-${Date.now().toString().slice(-6)}`;
    const issueDate = data.issue_date || new Date().toISOString().split('T')[0];
    const deadlineDate = data.deadline_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const generatedId = this.generateUuid();

    const cleanDbHeader = {
      organization_id: validOrgId,
      rfq_number: rfqNumber,
      title: data.title || 'مناقصة / طلب عروض أسعار توريد',
      issue_date: issueDate,
      deadline_date: deadlineDate,
      status: (data.status as PurchaseRfqStatus) || 'open',
      target_warehouse_id: this.sanitizeUuid(data.target_warehouse_id),
      notes: data.notes || '',
      created_by: this.sanitizeUuid(userId),
    };

    const localRecord: PurchaseRfq = {
      id: generatedId,
      ...cleanDbHeader,
      target_warehouse_name: data.target_warehouse_name,
      created_at: new Date().toISOString(),
      items: items.map(it => ({ ...it, id: this.generateUuid(), rfq_id: generatedId })),
      bids: [],
    };

    try {
      const { data: createdRfq, error: headErr } = await supabase
        .from('purchase_rfqs')
        .insert(cleanDbHeader)
        .select()
        .single();

      if (headErr) throw headErr;

      if (items.length > 0 && createdRfq?.id) {
        const itemsToInsert = items.map(it => ({
          rfq_id: createdRfq.id,
          product_id: this.sanitizeUuid(it.product_id),
          product_name: it.product_name,
          product_sku: it.product_sku || '',
          uom_id: this.sanitizeUuid(it.uom_id),
          quantity: Number(it.quantity) || 1,
          target_price: it.target_price ? Number(it.target_price) : null,
          specifications: it.specifications || '',
        }));

        await supabase.from('purchase_rfq_items').insert(itemsToInsert);
      }

      const existing = this.getLocalRfqs('');
      localRecord.id = createdRfq.id;
      this.saveLocalRfqs([localRecord, ...existing]);

      return { success: true, data: localRecord };
    } catch {
      const existing = this.getLocalRfqs('');
      this.saveLocalRfqs([localRecord, ...existing]);
      return { success: true, data: localRecord };
    }
  }

  /**
   * تسجيل / إضافة عرض سعر من مورد (Submit Vendor Bid)
   */
  static async submitBid(
    rfqId: string,
    bidData: Partial<VendorQuotationBid>,
    bidItems: VendorQuotationBidItem[],
    orgId: string
  ): Promise<{ success: boolean; data?: VendorQuotationBid; error?: string }> {
    const validOrgId = this.sanitizeUuid(orgId) || this.generateUuid();
    const validRfqId = this.sanitizeUuid(rfqId);
    const validSupplierId = this.sanitizeUuid(bidData.supplier_id) || this.generateUuid();
    const generatedBidId = this.generateUuid();

    // حساب الإجماليات
    let subtotal = 0;
    let taxAmount = 0;

    bidItems.forEach(it => {
      const lineSub = Number(it.offered_quantity) * Number(it.unit_price) * (1 - (Number(it.discount_percent) || 0) / 100);
      const lineTax = lineSub * ((Number(it.tax_percent) ?? 14) / 100);
      subtotal += lineSub;
      taxAmount += lineTax;
    });

    const discountAmount = Number(bidData.discount_amount) || 0;
    const shippingCost = Number(bidData.shipping_cost) || 0;
    const totalAmount = Math.max(0, subtotal - discountAmount + taxAmount + shippingCost);

    const cleanBidPayload = {
      organization_id: validOrgId,
      rfq_id: validRfqId || rfqId,
      supplier_id: validSupplierId,
      supplier_name: bidData.supplier_name || 'مورد',
      supplier_phone: bidData.supplier_phone || '',
      quotation_reference: bidData.quotation_reference || `QUO-${Date.now().toString().slice(-4)}`,
      bid_date: bidData.bid_date || new Date().toISOString().split('T')[0],
      valid_until: bidData.valid_until || null,
      subtotal,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      shipping_cost: shippingCost,
      total_amount: totalAmount,
      currency: bidData.currency || 'EGP',
      lead_time_days: Number(bidData.lead_time_days) || 3,
      payment_terms: bidData.payment_terms || 'آجل 30 يوم',
      warranty_terms: bidData.warranty_terms || null,
      is_awarded: false,
      score_points: Number(bidData.score_points) || 0,
      evaluation_notes: bidData.evaluation_notes || '',
    };

    const localBidRecord: VendorQuotationBid = {
      id: generatedBidId,
      ...cleanBidPayload,
      created_at: new Date().toISOString(),
      items: bidItems.map(it => ({ ...it, id: this.generateUuid(), bid_id: generatedBidId })),
    };

    try {
      if (validRfqId) {
        const { data: createdBid, error: bidErr } = await supabase
          .from('vendor_quotation_bids')
          .insert(cleanBidPayload)
          .select()
          .single();

        if (bidErr) throw bidErr;

        if (bidItems.length > 0 && createdBid?.id) {
          const itemsToInsert = bidItems.map(it => ({
            bid_id: createdBid.id,
            rfq_item_id: this.sanitizeUuid(it.rfq_item_id),
            product_id: this.sanitizeUuid(it.product_id),
            product_name: it.product_name,
            offered_quantity: Number(it.offered_quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            discount_percent: Number(it.discount_percent) || 0,
            tax_percent: Number(it.tax_percent) ?? 14,
            total_price: (Number(it.offered_quantity) * Number(it.unit_price) * (1 - (Number(it.discount_percent) || 0) / 100)) * (1 + ((Number(it.tax_percent) ?? 14) / 100)),
            brand_or_model: it.brand_or_model || null,
            notes: it.notes || '',
          }));

          await supabase.from('vendor_quotation_bid_items').insert(itemsToInsert);
        }

        localBidRecord.id = createdBid.id;
      }
    } catch {}

    const allLocalBids = this.getLocalBids('');
    this.saveLocalBids([localBidRecord, ...allLocalBids]);

    // تحديث في الـ RFQ المحلي
    const allLocalRfqs = this.getLocalRfqs('');
    const targetRfq = allLocalRfqs.find(r => r.id === rfqId);
    if (targetRfq) {
      if (!targetRfq.bids) targetRfq.bids = [];
      targetRfq.bids.push(localBidRecord);
      targetRfq.status = 'under_evaluation';
      this.saveLocalRfqs(allLocalRfqs);
    }

    return { success: true, data: localBidRecord };
  }

  /**
   * ترسية المناقصة على العرض الفائز وتحويله الفوري لأمر شراء PO (Award & Convert to PO)
   */
  static async awardBid(
    rfqId: string,
    bidId: string,
    orgId: string,
    userId?: string
  ): Promise<{ success: boolean; poNumber?: string; whatsappUrl?: string; error?: string }> {
    const validRfqId = this.sanitizeUuid(rfqId);
    const validBidId = this.sanitizeUuid(bidId);
    const validOrgId = this.sanitizeUuid(orgId) || this.generateUuid();
    const today = new Date().toISOString().split('T')[0];
    const poNumber = `PO-${Date.now().toString().slice(-6)}`;

    try {
      let rfq: PurchaseRfq | null = null;
      let winningBid: VendorQuotationBid | null = null;

      // جلب البيانات من السيرفر أو محلياً
      const fullRfq = await this.getRfqById(rfqId);
      if (fullRfq) {
        rfq = fullRfq;
        winningBid = fullRfq.bids?.find(b => b.id === bidId) || null;
      }

      if (!winningBid) throw new Error('لم يتم العثور على عرض السعر المحدد للترسية');

      // 1. تحديث حالة الـ RFQ والعطاء الفائز
      if (validRfqId && validBidId) {
        await supabase
          .from('vendor_quotation_bids')
          .update({ is_awarded: true, updated_at: new Date().toISOString() })
          .eq('id', validBidId);

        await supabase
          .from('purchase_rfqs')
          .update({
            status: 'awarded',
            awarded_bid_id: validBidId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', validRfqId);
      }

      // 2. إنشاء أمر الشراء الرسمي Purchase Order في جدول purchase_orders
      const deliveryDateStr = new Date(Date.now() + (winningBid.lead_time_days || 3) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const extraNotesParts: string[] = [];
      if (winningBid.discount_amount) extraNotesParts.push(`الخصم: ${winningBid.discount_amount}`);
      if (winningBid.shipping_cost) extraNotesParts.push(`تكلفة الشحن: ${winningBid.shipping_cost}`);
      if (winningBid.payment_terms) extraNotesParts.push(`شروط السداد: ${winningBid.payment_terms}`);
      const extraNotes = extraNotesParts.length > 0 ? ` (${extraNotesParts.join(' | ')})` : '';

      const poPayload: any = {
        organization_id: validOrgId,
        po_number: poNumber,
        order_number: poNumber,
        supplier_id: this.sanitizeUuid(winningBid.supplier_id),
        order_date: today,
        delivery_date: deliveryDateStr,
        expected_delivery_date: deliveryDateStr,
        subtotal: Number(winningBid.subtotal) || 0,
        tax_amount: Number(winningBid.tax_amount) || 0,
        total_amount: Number(winningBid.total_amount) || 0,
        status: 'approved',
        notes: `تم التوليد والترسية آلياً بناءً على طلب عروض الأسعار #${rfq?.rfq_number || ''} (${rfq?.title || ''})${extraNotes}`,
        created_by: this.sanitizeUuid(userId),
      };

      try {
        let insertRes = await supabase
          .from('purchase_orders')
          .insert(poPayload)
          .select()
          .single();

        while (insertRes.error && (insertRes.error.code === 'PGRST204' || insertRes.error.message?.includes('schema cache'))) {
          const colMatch = insertRes.error.message?.match(/Could not find the '([^']+)' column/);
          if (colMatch && colMatch[1] && poPayload[colMatch[1]] !== undefined) {
            delete poPayload[colMatch[1]];
            insertRes = await supabase.from('purchase_orders').insert(poPayload).select().single();
          } else {
            break;
          }
        }

        const createdPo = insertRes.data;

        if (createdPo && winningBid.items && winningBid.items.length > 0) {
          let poItemsData = winningBid.items.map(it => ({
            organization_id: validOrgId,
            purchase_order_id: createdPo.id,
            order_id: createdPo.id,
            product_id: this.sanitizeUuid(it.product_id),
            quantity: Number(it.offered_quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            total: Number(it.total_price) || (Number(it.offered_quantity) * Number(it.unit_price)) || 0,
          }));

          let itemsRes = await supabase.from('purchase_order_items').insert(poItemsData);
          while (itemsRes.error && (itemsRes.error.code === 'PGRST204' || itemsRes.error.message?.includes('schema cache'))) {
            const colMatch = itemsRes.error.message?.match(/Could not find the '([^']+)' column/);
            if (colMatch && colMatch[1]) {
              poItemsData = poItemsData.map(it => {
                const clone = { ...it };
                delete (clone as any)[colMatch[1]];
                return clone;
              });
              itemsRes = await supabase.from('purchase_order_items').insert(poItemsData);
            } else {
              break;
            }
          }

          if (validRfqId) {
            await supabase
              .from('purchase_rfqs')
              .update({ generated_po_id: createdPo.id })
              .eq('id', validRfqId);
          }
        }
      } catch (e) {
        console.warn('PO insert notice:', e);
      }

      // تحديث محلي
      const localRfqs = this.getLocalRfqs('');
      const rfqIdx = localRfqs.findIndex(r => r.id === rfqId);
      if (rfqIdx !== -1) {
        localRfqs[rfqIdx].status = 'awarded';
        localRfqs[rfqIdx].awarded_bid_id = bidId;
        if (localRfqs[rfqIdx].bids) {
          localRfqs[rfqIdx].bids = localRfqs[rfqIdx].bids!.map(b => ({
            ...b,
            is_awarded: b.id === bidId,
          }));
        }
        this.saveLocalRfqs(localRfqs);
      }

      // 3. إشعار النظام الداخلي
      const validUserId = this.sanitizeUuid(userId);
      if (validUserId) {
        await NotificationService.createNotification(
          validUserId,
          validOrgId,
          `تمت ترسية المناقصة #${rfq?.rfq_number}`,
          `تمت ترسية طلب عروض الأسعار بنجاح على المورد "${winningBid.supplier_name}" بمبلغ ${Number(winningBid.total_amount).toLocaleString()} ج.م وتوليد أمر الشراء #${poNumber}`,
          'success',
          'high',
          validRfqId || undefined,
          `/purchase-order-list`
        );
      }

      // 4. رابط واتساب إشعار المورد الفائز
      let whatsappUrl: string | undefined = undefined;
      if (winningBid.supplier_phone) {
        const cleanPhone = this.cleanPhone(winningBid.supplier_phone);
        const msg = this.buildAwardWhatsAppMessage(rfq, winningBid, poNumber);
        whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
      }

      return { success: true, poNumber, whatsappUrl };
    } catch (err: any) {
      return { success: false, error: err.message || 'فشلت عملية الترسية' };
    }
  }

  /**
   * إنشاء رسالة دعوة تقديم عروض أسعار للموردين عبر الواتساب
   */
  static buildRfqWhatsAppInvitation(rfq: PurchaseRfq, supplierName?: string): string {
    let msg = `📋 *دعوة لتقديم عرض أسعار (RFQ)*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `السادة كرام / *${supplierName || 'المورد العزيز'}* المحترمون 👋\n\n`;
    msg += `نأمل منكم التكرم بتقديم أفضل عروض أسعاركم للمناقصة التالية:\n\n`;
    msg += `▫️ *رقم المناقصة:* #${rfq.rfq_number}\n`;
    msg += `▫️ *الموضوع:* ${rfq.title}\n`;
    msg += `▫️ *تاريخ الإغلاق والحد الأقصى:* ⏰ *${rfq.deadline_date}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (rfq.items && rfq.items.length > 0) {
      msg += `📦 *بيانات الأصناف والكميات المطلوبة:*\n`;
      rfq.items.forEach((it, idx) => {
        msg += `${idx + 1}. *${it.product_name}* — الكمية: *${it.quantity}* ${it.specifications ? `(${it.specifications})` : ''}\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    }

    msg += `📌 *الشروط المطلوبة في العرض:*\n`;
    msg += `• توضيح سعر الوحدة شامل وضريبة القيمة المضافة.\n`;
    msg += `• تحديد مدة التوريد بالأيام وشروط السداد.\n`;
    msg += `• فترة سريان عرض الأسعار.\n\n`;
    msg += `شاكرين حسن تعاونكم الدائم معنا! ✨\n`;
    msg += `_قسم المشتريات والمناقصات — TriPro ERP_`;

    return msg;
  }

  /**
   * إنشاء رسالة إشعار الترسية وتأكيد أمر الشراء للمورد الفائز
   */
  static buildAwardWhatsAppMessage(rfq: any, bid: VendorQuotationBid, poNumber: string): string {
    const totalFormatted = Number(bid.total_amount).toLocaleString('ar-EG', { minimumFractionDigits: 2 });
    let msg = `🎉 *إشعار ترسية وأمر شراء رسمي (Purchase Order)*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `السادة / *${bid.supplier_name || 'المورد العزيز'}* المحترمون 🤝\n\n`;
    msg += `يسعدنا إفادتكم بأنه تمت الموافقة وترسية المناقصة التالية على شركتكم الموقرة:\n\n`;
    msg += `▫️ *رقم أمر الشراء:* #${poNumber}\n`;
    msg += `▫️ *بناءً على طلب العروض:* #${rfq?.rfq_number || ''}\n`;
    msg += `▫️ *إجمالي القيمة المعتمدة:* *${totalFormatted} ج.م*\n`;
    msg += `▫️ *مدة التوريد المتفق عليها:* ${bid.lead_time_days} أيام\n`;
    msg += `▫️ *شروط السداد:* ${bid.payment_terms}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `يرجى البدء في تجهيز الشحنة والتنسيق مع إدارة المستودعات للاستلام.\n\n`;
    msg += `مع أطيب التحيات والتقدير! ✨\n`;
    msg += `_إدارة المشتريات وسلاسل الإمداد — TriPro ERP_`;

    return msg;
  }

  private static cleanPhone(phone: string): string {
    let clean = (phone || '').replace(/[^0-9]/g, '');
    if (clean.startsWith('01')) {
      clean = '2' + clean;
    } else if (clean.startsWith('05')) {
      clean = '966' + clean.substring(1);
    }
    return clean;
  }
}

export default RfqService;
