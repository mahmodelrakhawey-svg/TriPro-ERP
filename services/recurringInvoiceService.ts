/**
 * ==============================================================================
 * TriPro ERP — Recurring Invoices & Customer Subscriptions Engine
 * services/recurringInvoiceService.ts
 * ==============================================================================
 * معزز بطبقة تنظيف الحقول والتحقق التام من صيغ الـ UUIDs لقاعدة البيانات
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { RecurringInvoice, RecurringInvoiceItem, RecurringInvoiceLog, RecurringFrequency, RecurringStatus } from '../types';
import NotificationService from './notificationService';

const STORAGE_KEYS = {
  SUBSCRIPTIONS: 'tripro_recurring_invoices_v1',
  ITEMS: 'tripro_recurring_items_v1',
  LOGS: 'tripro_recurring_logs_v1',
};

export class RecurringInvoiceService {
  /**
   * التحقق من صحة صيغة الـ UUID وتصفيتها من السلاسل الفارغة
   */
  public static sanitizeUuid(val?: string | null): string | null {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (trimmed === '' || trimmed === '00000000-0000-0000-0000-000000000000') return null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
  }

  /**
   * توليد UUID v4 صالح قياسياً
   */
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

  /**
   * التحقق مما إذا كان الخطأ بسبب عدم وجود الجدول أو أخطاء العلاقات في Supabase
   */
  private static isTableOrSchemaError(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    const code = error.code || '';
    const status = error.status || (error as any).statusCode || 0;
    return (
      code === 'PGRST205' ||
      code === 'PGRST200' ||
      code === '42P01' ||
      code === '42703' ||
      code === '22P02' ||
      status === 404 ||
      status === 400 ||
      msg.includes('schema cache') ||
      msg.includes('relationship') ||
      msg.includes('relation') ||
      msg.includes('does not exist') ||
      msg.includes('could not find the table') ||
      msg.includes('column') ||
      msg.includes('invalid input syntax for type uuid')
    );
  }

  // ---------------------------------------------------------------------------
  // دوال التخزين المحلي الاحتياطي (Local Storage Fallbacks)
  // ---------------------------------------------------------------------------
  private static getLocalSubs(orgId: string): RecurringInvoice[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTIONS);
      if (!raw) return [];
      const all: RecurringInvoice[] = JSON.parse(raw);
      return all.filter(s => !orgId || s.organization_id === orgId);
    } catch {
      return [];
    }
  }

  private static saveLocalSubs(subs: RecurringInvoice[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SUBSCRIPTIONS, JSON.stringify(subs));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  private static getLocalItems(subId?: string): RecurringInvoiceItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ITEMS);
      if (!raw) return [];
      const all: (RecurringInvoiceItem & { recurring_invoice_id?: string })[] = JSON.parse(raw);
      if (subId) {
        return all.filter(it => it.recurring_invoice_id === subId);
      }
      return all;
    } catch {
      return [];
    }
  }

  private static saveLocalItems(items: RecurringInvoiceItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  private static getLocalLogs(subId?: string): RecurringInvoiceLog[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (!raw) return [];
      const all: RecurringInvoiceLog[] = JSON.parse(raw);
      if (subId) {
        return all.filter(l => l.recurring_invoice_id === subId);
      }
      return all;
    } catch {
      return [];
    }
  }

  private static saveLocalLogs(logs: RecurringInvoiceLog[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  /**
   * حساب تاريخ التشغيل القادم بناءً على التكرار
   */
  static calculateNextRunDate(fromDateStr: string, frequency: RecurringFrequency, customIntervalDays?: number | null): string {
    const baseDate = new Date(fromDateStr);
    const nextDate = new Date(baseDate.getTime());

    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'semi_annual':
        nextDate.setMonth(nextDate.getMonth() + 6);
        break;
      case 'annual':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      case 'custom':
        const days = customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30;
        nextDate.setDate(nextDate.getDate() + days);
        break;
      default:
        nextDate.setMonth(nextDate.getMonth() + 1);
    }

    return nextDate.toISOString().split('T')[0];
  }

  /**
   * جلب قائمة الاشتراكات والفواتير الدورية للمنشأة
   */
  static async getRecurringInvoices(orgId: string, filters?: { status?: string; customerId?: string }): Promise<RecurringInvoice[]> {
    try {
      const validOrgId = this.sanitizeUuid(orgId);
      let query = supabase
        .from('recurring_invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (validOrgId) {
        query = query.eq('organization_id', validOrgId);
      }
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.customerId) {
        const validCustId = this.sanitizeUuid(filters.customerId);
        if (validCustId) query = query.eq('customer_id', validCustId);
      }

      const { data: subs, error: subErr } = await query;
      if (subErr) {
        throw subErr;
      }

      if (!subs || subs.length === 0) {
        return this.getLocalSubs(orgId);
      }

      // جلب العملاء والبنود لربطهم محلياً
      const subIds = subs.map(s => s.id).filter(Boolean);
      const customerIds = Array.from(new Set(subs.map(s => s.customer_id).filter(Boolean)));

      let customersMap: Record<string, { id: string; name: string; phone?: string }> = {};
      if (customerIds.length > 0) {
        try {
          const { data: custs } = await supabase.from('customers').select('id, name, phone').in('id', customerIds);
          if (custs) {
            custs.forEach(c => { customersMap[c.id] = c; });
          }
        } catch {
          // ignore
        }
      }

      let itemsMap: Record<string, RecurringInvoiceItem[]> = {};
      if (subIds.length > 0) {
        try {
          const { data: allItems } = await supabase.from('recurring_invoice_items').select('*').in('recurring_invoice_id', subIds);
          if (allItems) {
            allItems.forEach(it => {
              if (!itemsMap[it.recurring_invoice_id]) itemsMap[it.recurring_invoice_id] = [];
              itemsMap[it.recurring_invoice_id].push(it);
            });
          }
        } catch {
          // ignore
        }
      }

      return subs.map(s => ({
        ...s,
        customers: customersMap[s.customer_id] || (s.customer_name ? { id: s.customer_id, name: s.customer_name, phone: s.customer_phone } : undefined),
        items: itemsMap[s.id] || [],
      }));
    } catch (err: any) {
      let local = this.getLocalSubs(orgId);
      if (filters?.status && filters.status !== 'all') {
        local = local.filter(s => s.status === filters.status);
      }
      if (filters?.customerId) {
        local = local.filter(s => s.customer_id === filters.customerId);
      }
      return local;
    }
  }

  /**
   * جلب تفاصيل اشتراك محدد مع بنوده وسجل عملياته
   */
  static async getRecurringInvoiceById(id: string): Promise<{ subscription: RecurringInvoice | null; logs: RecurringInvoiceLog[] }> {
    try {
      const validId = this.sanitizeUuid(id);
      if (!validId) throw new Error('Invalid UUID');

      const { data: subscription, error: subError } = await supabase
        .from('recurring_invoices')
        .select('*')
        .eq('id', validId)
        .single();

      if (subError || !subscription) {
        throw subError || new Error('Not found');
      }

      if (subscription.customer_id) {
        try {
          const { data: cust } = await supabase.from('customers').select('id, name, phone').eq('id', subscription.customer_id).maybeSingle();
          if (cust) subscription.customers = cust;
        } catch {}
      }

      try {
        const { data: items } = await supabase.from('recurring_invoice_items').select('*').eq('recurring_invoice_id', validId);
        subscription.items = items || [];
      } catch {}

      try {
        const { data: logs } = await supabase
          .from('recurring_invoice_logs')
          .select('*')
          .eq('recurring_invoice_id', validId)
          .order('run_date', { ascending: false });
        return { subscription, logs: logs || [] };
      } catch {
        return { subscription, logs: [] };
      }
    } catch (err) {
      const allSubs = this.getLocalSubs('');
      const found = allSubs.find(s => s.id === id) || null;
      const items = this.getLocalItems(id);
      const logs = this.getLocalLogs(id);
      if (found) found.items = items;
      return { subscription: found, logs };
    }
  }

  /**
   * إنشاء اشتراك دوري جديد
   */
  static async createRecurringInvoice(
    data: Partial<RecurringInvoice>,
    items: RecurringInvoiceItem[],
    userId: string,
    orgId: string
  ): Promise<{ success: boolean; data?: RecurringInvoice; error?: string }> {
    const subscriptionNumber = data.subscription_number || `SUB-${Date.now().toString().slice(-6)}`;
    const startDate = data.start_date || new Date().toISOString().split('T')[0];
    const nextRunDate = data.next_run_date || startDate;
    const generatedId = this.generateUuid();

    const validOrgId = this.sanitizeUuid(orgId) || this.generateUuid();
    const validCustomerId = this.sanitizeUuid(data.customer_id) || this.generateUuid();
    const validWarehouseId = this.sanitizeUuid(data.warehouse_id);
    const validSalespersonId = this.sanitizeUuid(data.salesperson_id);
    const validCostCenterId = this.sanitizeUuid(data.cost_center_id);
    const validUserId = this.sanitizeUuid(userId);

    // حساب الإجماليات
    let subtotal = 0;
    let totalTax = 0;

    items.forEach(item => {
      const itemSubtotal = item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100);
      const itemTax = itemSubtotal * ((item.tax_percent ?? 14) / 100);
      subtotal += itemSubtotal;
      totalTax += itemTax;
    });

    let discountAmount = 0;
    if (data.discount_type === 'percentage') {
      discountAmount = subtotal * ((data.discount_value || 0) / 100);
    } else {
      discountAmount = data.discount_value || 0;
    }

    const totalAmount = Math.max(0, subtotal - discountAmount + totalTax);

    // الحقول المعتمدة في جدول PostgreSQL حصراً
    const cleanDbPayload = {
      organization_id: validOrgId,
      subscription_number: subscriptionNumber,
      customer_id: validCustomerId,
      warehouse_id: validWarehouseId,
      salesperson_id: validSalespersonId,
      cost_center_id: validCostCenterId,
      title: data.title || 'اشتراك دوري للعميل',
      frequency: data.frequency || 'monthly',
      custom_interval_days: data.custom_interval_days || null,
      start_date: startDate,
      end_date: data.end_date || null,
      next_run_date: nextRunDate,
      last_run_date: null,
      total_cycles: data.total_cycles || null,
      completed_cycles: 0,
      auto_post: data.auto_post ?? true,
      send_whatsapp: data.send_whatsapp ?? true,
      send_email: data.send_email ?? false,
      status: (data.status as RecurringStatus) || 'active',
      subtotal,
      discount_type: data.discount_type || 'fixed',
      discount_value: data.discount_value || 0,
      tax_amount: totalTax,
      total_amount: totalAmount,
      currency: data.currency || 'EGP',
      notes: data.notes || '',
      created_by: validUserId,
    };

    const fullLocalRecord: RecurringInvoice = {
      id: generatedId,
      ...cleanDbPayload,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items,
      customers: data.customer_name ? { id: validCustomerId, name: data.customer_name, phone: data.customer_phone } : undefined,
    };

    try {
      const { data: createdSub, error: subError } = await supabase
        .from('recurring_invoices')
        .insert(cleanDbPayload)
        .select()
        .single();

      if (subError) {
        throw subError;
      }

      if (items.length > 0 && createdSub?.id) {
        const itemsToInsert = items.map(item => ({
          recurring_invoice_id: createdSub.id,
          product_id: this.sanitizeUuid(item.product_id),
          product_name: item.product_name,
          product_sku: item.product_sku || '',
          quantity: item.quantity,
          uom_id: this.sanitizeUuid(item.uom_id),
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          tax_percent: item.tax_percent ?? 14,
          total: (item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100)) * (1 + ((item.tax_percent ?? 14) / 100)),
        }));

        await supabase.from('recurring_invoice_items').insert(itemsToInsert);
      }

      const existingSubs = this.getLocalSubs('');
      fullLocalRecord.id = createdSub.id;
      this.saveLocalSubs([fullLocalRecord, ...existingSubs]);

      return { success: true, data: { ...createdSub, items, customers: fullLocalRecord.customers } };
    } catch (err: any) {
      const existingSubs = this.getLocalSubs('');
      this.saveLocalSubs([fullLocalRecord, ...existingSubs]);

      const localItems = this.getLocalItems();
      const itemsWithParent = items.map(it => ({ ...it, id: this.generateUuid(), recurring_invoice_id: generatedId }));
      this.saveLocalItems([...itemsWithParent, ...localItems]);

      return { success: true, data: fullLocalRecord };
    }
  }

  /**
   * تحديث اشتراك دوري
   */
  static async updateRecurringInvoice(
    id: string,
    data: Partial<RecurringInvoice>,
    items?: RecurringInvoiceItem[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let subtotal = data.subtotal;
      let totalTax = data.tax_amount;
      let totalAmount = data.total_amount;

      if (items && items.length > 0) {
        subtotal = 0;
        totalTax = 0;
        items.forEach(item => {
          const itemSubtotal = item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100);
          const itemTax = itemSubtotal * ((item.tax_percent ?? 14) / 100);
          subtotal! += itemSubtotal;
          totalTax! += itemTax;
        });

        let discountAmount = 0;
        if (data.discount_type === 'percentage') {
          discountAmount = subtotal! * ((data.discount_value || 0) / 100);
        } else {
          discountAmount = data.discount_value || 0;
        }

        totalAmount = Math.max(0, subtotal! - discountAmount + totalTax!);
      }

      const cleanUpdatePayload: any = {
        updated_at: new Date().toISOString(),
      };
      if (data.customer_id !== undefined) cleanUpdatePayload.customer_id = this.sanitizeUuid(data.customer_id);
      if (data.warehouse_id !== undefined) cleanUpdatePayload.warehouse_id = this.sanitizeUuid(data.warehouse_id);
      if (data.salesperson_id !== undefined) cleanUpdatePayload.salesperson_id = this.sanitizeUuid(data.salesperson_id);
      if (data.cost_center_id !== undefined) cleanUpdatePayload.cost_center_id = this.sanitizeUuid(data.cost_center_id);
      if (data.title !== undefined) cleanUpdatePayload.title = data.title;
      if (data.frequency !== undefined) cleanUpdatePayload.frequency = data.frequency;
      if (data.custom_interval_days !== undefined) cleanUpdatePayload.custom_interval_days = data.custom_interval_days;
      if (data.start_date !== undefined) cleanUpdatePayload.start_date = data.start_date;
      if (data.end_date !== undefined) cleanUpdatePayload.end_date = data.end_date;
      if (data.next_run_date !== undefined) cleanUpdatePayload.next_run_date = data.next_run_date;
      if (data.total_cycles !== undefined) cleanUpdatePayload.total_cycles = data.total_cycles;
      if (data.auto_post !== undefined) cleanUpdatePayload.auto_post = data.auto_post;
      if (data.send_whatsapp !== undefined) cleanUpdatePayload.send_whatsapp = data.send_whatsapp;
      if (data.send_email !== undefined) cleanUpdatePayload.send_email = data.send_email;
      if (data.status !== undefined) cleanUpdatePayload.status = data.status;
      if (data.notes !== undefined) cleanUpdatePayload.notes = data.notes;
      if (data.discount_type !== undefined) cleanUpdatePayload.discount_type = data.discount_type;
      if (data.discount_value !== undefined) cleanUpdatePayload.discount_value = data.discount_value;
      if (subtotal !== undefined) cleanUpdatePayload.subtotal = subtotal;
      if (totalTax !== undefined) cleanUpdatePayload.tax_amount = totalTax;
      if (totalAmount !== undefined) cleanUpdatePayload.total_amount = totalAmount;

      const validId = this.sanitizeUuid(id);
      if (validId) {
        await supabase
          .from('recurring_invoices')
          .update(cleanUpdatePayload)
          .eq('id', validId);
      }

      const localSubs = this.getLocalSubs('');
      const idx = localSubs.findIndex(s => s.id === id);
      if (idx !== -1) {
        localSubs[idx] = { ...localSubs[idx], ...cleanUpdatePayload, items: items || localSubs[idx].items };
        this.saveLocalSubs(localSubs);
      }

      if (items && validId) {
        await supabase.from('recurring_invoice_items').delete().eq('recurring_invoice_id', validId);

        const itemsToInsert = items.map(item => ({
          recurring_invoice_id: validId,
          product_id: this.sanitizeUuid(item.product_id),
          product_name: item.product_name,
          product_sku: item.product_sku || '',
          quantity: item.quantity,
          uom_id: this.sanitizeUuid(item.uom_id),
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          tax_percent: item.tax_percent ?? 14,
          total: (item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100)) * (1 + ((item.tax_percent ?? 14) / 100)),
        }));

        await supabase.from('recurring_invoice_items').insert(itemsToInsert);

        const currentLocalItems = this.getLocalItems().filter(it => it.recurring_invoice_id !== id);
        const newLocalItems = items.map(it => ({ ...it, recurring_invoice_id: id }));
        this.saveLocalItems([...currentLocalItems, ...newLocalItems]);
      }

      return { success: true };
    } catch (err: any) {
      return { success: true };
    }
  }

  /**
   * تغيير حالة الاشتراك (نشط / موقوف مؤقتاً / ملغي)
   */
  static async changeStatus(id: string, status: RecurringStatus): Promise<{ success: boolean; error?: string }> {
    try {
      const validId = this.sanitizeUuid(id);
      if (validId) {
        await supabase
          .from('recurring_invoices')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', validId);
      }

      const localSubs = this.getLocalSubs('');
      const idx = localSubs.findIndex(s => s.id === id);
      if (idx !== -1) {
        localSubs[idx].status = status;
        localSubs[idx].updated_at = new Date().toISOString();
        this.saveLocalSubs(localSubs);
      }

      return { success: true };
    } catch (err: any) {
      const localSubs = this.getLocalSubs('');
      const idx = localSubs.findIndex(s => s.id === id);
      if (idx !== -1) {
        localSubs[idx].status = status;
        this.saveLocalSubs(localSubs);
      }
      return { success: true };
    }
  }

  /**
   * حذف اشتراك دوري
   */
  static async deleteRecurringInvoice(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const validId = this.sanitizeUuid(id);
      if (validId) {
        await supabase
          .from('recurring_invoices')
          .delete()
          .eq('id', validId);
      }

      const localSubs = this.getLocalSubs('').filter(s => s.id !== id);
      this.saveLocalSubs(localSubs);

      const localItems = this.getLocalItems().filter(it => it.recurring_invoice_id !== id);
      this.saveLocalItems(localItems);

      return { success: true };
    } catch (err: any) {
      const localSubs = this.getLocalSubs('').filter(s => s.id !== id);
      this.saveLocalSubs(localSubs);
      return { success: true };
    }
  }

  /**
   * توليد وتصدير فاتورة فعلية من عقد الاشتراك (إما يدوياً أو آلياً)
   */
  static async executeSubscription(
    subscriptionId: string,
    userId?: string
  ): Promise<{ success: boolean; invoiceId?: string; invoiceNumber?: string; whatsappUrl?: string; error?: string }> {
    try {
      let sub: any = null;
      const validSubId = this.sanitizeUuid(subscriptionId);

      if (validSubId) {
        const { data, error } = await supabase
          .from('recurring_invoices')
          .select('*')
          .eq('id', validSubId)
          .maybeSingle();

        if (!error && data) {
          sub = data;
          if (sub.customer_id) {
            const { data: cust } = await supabase.from('customers').select('id, name, phone, email').eq('id', sub.customer_id).maybeSingle();
            if (cust) sub.customers = cust;
          }
          const { data: items } = await supabase.from('recurring_invoice_items').select('*').eq('recurring_invoice_id', validSubId);
          sub.items = items || [];
        }
      }

      if (!sub) {
        const local = this.getLocalSubs('').find(s => s.id === subscriptionId);
        if (local) {
          sub = local;
          sub.items = this.getLocalItems(subscriptionId);
        }
      }

      if (!sub) {
        throw new Error('لم يتم العثور على عقد الاشتراك');
      }

      const today = new Date().toISOString().split('T')[0];
      const invoiceNumber = `REC-INV-${Date.now().toString().slice(-6)}`;

      let discountAmount = 0;
      if (sub.discount_type === 'percentage') {
        discountAmount = (Number(sub.subtotal) || 0) * ((Number(sub.discount_value) || 0) / 100);
      } else {
        discountAmount = Number(sub.discount_value) || 0;
      }

      const validOrgId = this.sanitizeUuid(sub.organization_id);
      const validCustomerId = this.sanitizeUuid(sub.customer_id);

      // 1. إنشاء الفاتورة في جدول invoices
      const invoiceData: any = {
        invoice_number: invoiceNumber,
        customer_id: validCustomerId,
        warehouse_id: this.sanitizeUuid(sub.warehouse_id),
        salesperson_id: this.sanitizeUuid(sub.salesperson_id),
        cost_center_id: this.sanitizeUuid(sub.cost_center_id),
        invoice_date: today,
        subtotal: Number(sub.subtotal) || 0,
        discount_amount: Number(discountAmount) || 0,
        tax_amount: Number(sub.tax_amount) || 0,
        total_amount: Number(sub.total_amount) || 0,
        paid_amount: 0,
        status: sub.auto_post ? 'posted' : 'draft',
        currency: sub.currency || 'EGP',
        exchange_rate: 1,
        notes: `تم الإصدار آلياً بناءً على الاشتراك الدوري #${sub.subscription_number} (${sub.title})`,
        created_by: this.sanitizeUuid(userId) || this.sanitizeUuid(sub.created_by),
      };
      if (validOrgId) {
        invoiceData.organization_id = validOrgId;
      }

      let createdInvoiceId = '';
      try {
        const { data: createdInvoice, error: invError } = await supabase
          .from('invoices')
          .insert(invoiceData)
          .select()
          .single();

        if (!invError && createdInvoice) {
          createdInvoiceId = createdInvoice.id;

          // 2. إدخال بنود الفاتورة
          if (sub.items && sub.items.length > 0) {
            const invoiceItemsData = sub.items.map((it: any) => ({
              invoice_id: createdInvoice.id,
              product_id: this.sanitizeUuid(it.product_id),
              quantity: Number(it.quantity) || 1,
              uom_id: this.sanitizeUuid(it.uom_id),
              unit_price: Number(it.unit_price) || 0,
              total: Number(it.total) || 0,
            }));

            await supabase.from('invoice_items').insert(invoiceItemsData);
          }
        }
      } catch (e) {
        console.warn('Invoices insert fallback:', e);
      }

      // 3. حساب تاريخ التشغيل القادم وتحديث حالة الاشتراك
      const nextRunDate = this.calculateNextRunDate(today, sub.frequency as RecurringFrequency, sub.custom_interval_days);
      const newCompletedCycles = (sub.completed_cycles || 0) + 1;

      let newStatus: RecurringStatus = sub.status;
      if (sub.total_cycles && newCompletedCycles >= sub.total_cycles) {
        newStatus = 'completed';
      }
      if (sub.end_date && nextRunDate > sub.end_date) {
        newStatus = 'completed';
      }

      if (validSubId) {
        await supabase
          .from('recurring_invoices')
          .update({
            last_run_date: today,
            next_run_date: nextRunDate,
            completed_cycles: newCompletedCycles,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', validSubId);
      }

      // تحديث محلي
      const localSubs = this.getLocalSubs('');
      const idx = localSubs.findIndex(s => s.id === subscriptionId);
      if (idx !== -1) {
        localSubs[idx].last_run_date = today;
        localSubs[idx].next_run_date = nextRunDate;
        localSubs[idx].completed_cycles = newCompletedCycles;
        localSubs[idx].status = newStatus;
        localSubs[idx].updated_at = new Date().toISOString();
        this.saveLocalSubs(localSubs);
      }

      // 4. تسجيل في سجل العمليات logs
      const logRecord: RecurringInvoiceLog = {
        id: this.generateUuid(),
        organization_id: validOrgId || this.generateUuid(),
        recurring_invoice_id: subscriptionId,
        generated_invoice_id: createdInvoiceId || undefined,
        run_date: today,
        status: 'success',
        amount: Number(sub.total_amount) || 0,
        notified_whatsapp: Boolean(sub.send_whatsapp),
        notified_email: Boolean(sub.send_email),
        created_at: new Date().toISOString(),
      };

      if (validSubId && validOrgId) {
        try {
          await supabase.from('recurring_invoice_logs').insert({
            organization_id: validOrgId,
            recurring_invoice_id: validSubId,
            generated_invoice_id: this.sanitizeUuid(createdInvoiceId),
            run_date: today,
            status: 'success',
            amount: Number(sub.total_amount) || 0,
            notified_whatsapp: Boolean(sub.send_whatsapp),
            notified_email: Boolean(sub.send_email),
          });
        } catch {}
      }

      const localLogs = this.getLocalLogs();
      this.saveLocalLogs([logRecord, ...localLogs]);

      // 5. إنشاء إشعار داخلي
      const notifyUserId = this.sanitizeUuid(userId) || this.sanitizeUuid(sub.created_by);
      if (notifyUserId && validOrgId) {
        await NotificationService.createNotification(
          notifyUserId,
          validOrgId,
          `تم إصدار فاتورة دورية #${invoiceNumber}`,
          `تم بنجاح إصدار الفاتورة الدورية للعميل ${sub.customer_name || sub.customers?.name || ''} بمبلغ ${Number(sub.total_amount).toLocaleString()} ج.م`,
          'success',
          'medium',
          this.sanitizeUuid(createdInvoiceId) || undefined,
          `/invoices-list`
        );
      }

      // 6. رابط الواتساب
      let whatsappUrl: string | undefined = undefined;
      const phone = sub.customer_phone || sub.customers?.phone;
      if (phone) {
        const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const cleanPhone = this.cleanPhone(phone);
        const msg = this.buildWhatsAppMessage(sub, invoiceNumber, today, dueDate);
        whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
      }

      return {
        success: true,
        invoiceId: createdInvoiceId,
        invoiceNumber,
        whatsappUrl,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'فشل توليد الفاتورة الدورية' };
    }
  }

  /**
   * تشغيل فحص وإصدار جميع الاشتراكات المستحقة اليوم في الخلفية تلقائياً
   */
  static async processDueRecurringInvoices(orgId?: string): Promise<{ processed: number; successCount: number; failedCount: number }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const validOrgId = this.sanitizeUuid(orgId);

      let dueSubs: any[] = [];

      try {
        let query = supabase
          .from('recurring_invoices')
          .select('id, organization_id, title, subscription_number, next_run_date')
          .eq('status', 'active')
          .lte('next_run_date', today);

        if (validOrgId) {
          query = query.eq('organization_id', validOrgId);
        }

        const { data, error } = await query;
        if (error) {
          const local = this.getLocalSubs(orgId || '');
          dueSubs = local.filter(s => s.status === 'active' && s.next_run_date <= today);
        } else {
          dueSubs = data || [];
        }
      } catch (queryErr) {
        const local = this.getLocalSubs(orgId || '');
        dueSubs = local.filter(s => s.status === 'active' && s.next_run_date <= today);
      }

      if (!dueSubs || dueSubs.length === 0) {
        return { processed: 0, successCount: 0, failedCount: 0 };
      }

      let successCount = 0;
      let failedCount = 0;

      for (const sub of dueSubs) {
        const result = await this.executeSubscription(sub.id);
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
        }
      }

      return { processed: dueSubs.length, successCount, failedCount };
    } catch (err) {
      return { processed: 0, successCount: 0, failedCount: 0 };
    }
  }

  /**
   * توليد نص رسالة الواتساب المنسق للاشتراك والفاتورة الدورية
   */
  static buildWhatsAppMessage(sub: any, invoiceNumber: string, date: string, dueDate: string): string {
    const customerName = sub.customer_name || sub.customers?.name || 'العميل العزيز';
    const totalFormatted = Number(sub.total_amount).toLocaleString('ar-EG', { minimumFractionDigits: 2 });

    let msg = `🌟 *تنبيه دوري بإصدار فاتورة اشتراك*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `مرحباً بك أ/ *${customerName}* 👋\n\n`;
    msg += `نحيطكم علماً بأنه تم إصدار فاتورة الاشتراك الدوري الخاصة بكم:\n\n`;
    msg += `📋 *بيانات الفاتورة:*\n`;
    msg += `▫️ *الاشتراك:* ${sub.title}\n`;
    msg += `▫️ *رقم الفاتورة:* #${invoiceNumber}\n`;
    msg += `▫️ *تاريخ الإصدار:* ${date}\n`;
    msg += `▫️ *تاريخ الاستحقاق:* ${dueDate}\n`;
    msg += `▫️ *الدورة:* ${this.getFrequencyArabic(sub.frequency)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (sub.items && sub.items.length > 0) {
      msg += `📦 *تفاصيل الخدمات / المنتجات:*\n`;
      sub.items.forEach((it: any) => {
        msg += `• ${it.product_name} × ${it.quantity} = ${(it.quantity * it.unit_price).toFixed(2)} ج.م\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    }

    msg += `💰 *إجمالي المبلغ المستحق:* *${totalFormatted} ج.م*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💳 *طرق الدفع والتحويل المتاحة:*\n`;
    msg += `• التحويل البنكي لحساب الشركة\n`;
    msg += `• إنستاباي (InstaPay) / المحافظ الإلكترونية\n`;
    msg += `• الدفع المباشر عبر الفرع أو المندوب\n\n`;
    msg += `شاكرين حسن تعاونكم واشتراككم معنا! ✨\n`;
    msg += `_نظام TriPro ERP لإدارة الأعمال_`;

    return msg;
  }

  /**
   * ترجمة التكرار إلى العربية
   */
  static getFrequencyArabic(freq: string): string {
    const map: Record<string, string> = {
      daily: 'يومي',
      weekly: 'أسبوعي',
      monthly: 'شهري',
      quarterly: 'ربع سنوي (كل 3 أشهر)',
      semi_annual: 'نصف سنوي (كل 6 أشهر)',
      annual: 'سنوي',
      custom: 'فترة مخصصة',
    };
    return map[freq] || freq;
  }

  /**
   * تنظيف رقم الهاتف للواتساب
   */
  static cleanPhone(phone: string): string {
    let clean = (phone || '').replace(/[^0-9]/g, '');
    if (clean.startsWith('01')) {
      clean = '2' + clean;
    } else if (clean.startsWith('05')) {
      clean = '966' + clean.substring(1);
    }
    return clean;
  }
}

export default RecurringInvoiceService;
