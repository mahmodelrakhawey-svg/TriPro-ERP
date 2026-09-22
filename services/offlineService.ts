import Dexie, { Table } from 'dexie';
import { supabase } from '../supabaseClient';
import { secureStorage } from '../utils/securityMiddleware';

export const isValidUUID = (str: any): boolean => {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
};

export const isValidNonNilUUID = (str: any): boolean => {
  return isValidUUID(str) && str.trim() !== '00000000-0000-0000-0000-000000000000';
};

export interface QueuedOrder {
  id?: number; // Primary key for IndexedDB
  payload: any; // The data to be sent to Supabase RPC
  createdAt: Date;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

export interface CachedProduct {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  sales_price: number;
  cost: number;
  category_id: string | null;
  stock: number;
  image_url?: string | null;
  is_scale_item?: boolean;
  plu_number?: number | null;
  scale_prefix?: string | null;
  barcode2?: string | null;
  age_restricted?: boolean;
  tax_rate_override?: number | null;
  unit_barcodes?: Array<{ uom_id?: string; barcode: string; price?: number; uom_name?: string }>;
  offer_price?: number | null;
  offer_start_date?: string | null;
  offer_end_date?: string | null;
  min_sales_price?: number;
  max_stock_level?: number;
  wholesale_price?: number;
  half_wholesale_price?: number;
  warehouse_stock?: Record<string, number> | null;
}

export interface QueuedMedicalItem {
  id?: number;
  payload: any;
  createdAt: Date;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

class OfflineDB extends Dexie {
  queuedOrders!: Table<QueuedOrder>;
  products!: Table<CachedProduct, string>;
  himsPatients!: Table<any, string>; // Cache for offline patient search
  queuedPatients!: Table<QueuedMedicalItem>;
  queuedVisits!: Table<QueuedMedicalItem>;
  queuedClinicalNotes!: Table<QueuedMedicalItem>;
  queuedPrescriptions!: Table<QueuedMedicalItem>;
  queuedLabOrders!: Table<QueuedMedicalItem>;
  queuedRadiologyOrders!: Table<QueuedMedicalItem>;

  constructor() {
    super('TriProOfflineDB');
    this.version(6).stores({
      queuedOrders: '++id, status, createdAt',
      products: 'id, barcode, sku, name, plu_number, is_scale_item, barcode2',
      himsPatients: 'id, national_id, full_name, phone',
      queuedPatients: '++id, status, createdAt',
      queuedVisits: '++id, status, createdAt',
      queuedClinicalNotes: '++id, status, createdAt',
      queuedPrescriptions: '++id, status, createdAt',
      queuedLabOrders: '++id, status, createdAt',
      queuedRadiologyOrders: '++id, status, createdAt',
    });
  }
}

export const db = new OfflineDB();

export const offlineService = {
  /**
   * Resolves the real, valid organization UUID for syncing offline records.
   */
  async resolveActiveOrganizationId(candidate?: string | null): Promise<string | null> {
    if (isValidNonNilUUID(candidate) && candidate !== 'org-default-offline') {
      this.setLastValidOrgId(candidate!);
      return candidate!;
    }

    // 1. Try secureStorage / localStorage cached valid org ID
    const cachedLastOrg = secureStorage.getItem<string>('tripro_last_valid_org_id');
    if (isValidNonNilUUID(cachedLastOrg)) return cachedLastOrg!;

    const localLastOrg = typeof window !== 'undefined' ? window.localStorage?.getItem('tripro_last_valid_org_id') : null;
    if (isValidNonNilUUID(localLastOrg)) return localLastOrg!;

    const cachedActiveOrg = secureStorage.getItem<string>('tripro_active_org_id');
    if (isValidNonNilUUID(cachedActiveOrg) && cachedActiveOrg !== 'org-default-offline') return cachedActiveOrg!;

    const cachedProfile = secureStorage.getItem<any>('tripro_cached_user_profile');
    if (isValidNonNilUUID(cachedProfile?.organization_id)) return cachedProfile.organization_id;

    // 2. If online, fetch from Supabase
    if (navigator.onLine) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          if (isValidNonNilUUID(authData.user.user_metadata?.org_id)) {
            const orgId = authData.user.user_metadata.org_id;
            this.setLastValidOrgId(orgId);
            return orgId;
          }
          const { data: prof } = await supabase.from('profiles').select('organization_id').eq('id', authData.user.id).maybeSingle();
          if (prof && isValidNonNilUUID(prof.organization_id)) {
            this.setLastValidOrgId(prof.organization_id);
            return prof.organization_id;
          }
        }
        // Fallback: fetch from organizations table
        const { data: firstOrg } = await supabase.from('organizations').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
        if (firstOrg?.id && isValidNonNilUUID(firstOrg.id)) {
          this.setLastValidOrgId(firstOrg.id);
          return firstOrg.id;
        }
      } catch (e) {
        console.warn('Failed to resolve online organization UUID:', e);
      }
    }
    return null;
  },

  setLastValidOrgId(orgId: string) {
    if (isValidNonNilUUID(orgId)) {
      try {
        secureStorage.setItem('tripro_last_valid_org_id', orgId);
        window.localStorage?.setItem('tripro_last_valid_org_id', JSON.stringify(orgId));
      } catch (e) {}
    }
  },

  /**
   * Sanitizes order payload to prevent UUID syntax errors (like 'org-default-offline')
   */
  async sanitizeOrderPayload(payload: any, resolvedOrgId: string | null): Promise<any> {
    const sanitized = { ...payload };

    // 1. Organization ID
    const currentOrg = sanitized.orgId || sanitized.organization_id || sanitized.p_org_id;
    if (!isValidNonNilUUID(currentOrg) || currentOrg === 'org-default-offline') {
      if (resolvedOrgId) {
        sanitized.orgId = resolvedOrgId;
        sanitized.organization_id = resolvedOrgId;
        if (sanitized.p_org_id !== undefined) sanitized.p_org_id = resolvedOrgId;
      }
    }

    // 2. User ID
    const currentUserId = sanitized.userId || sanitized.user_id || sanitized.p_user_id;
    if (!isValidNonNilUUID(currentUserId)) {
      let validUserId: string | null = null;
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user && isValidNonNilUUID(authData.user.id)) {
          validUserId = authData.user.id;
        }
      } catch (e) {}
      if (!validUserId) {
        const cachedUser = secureStorage.getItem<any>('tripro_cached_user_profile');
        if (isValidNonNilUUID(cachedUser?.id)) validUserId = cachedUser.id;
      }
      sanitized.userId = validUserId;
      sanitized.user_id = validUserId;
      if (sanitized.p_user_id !== undefined) sanitized.p_user_id = validUserId;
    }

    // 3. Warehouse ID
    const whId = sanitized.warehouseId || sanitized.warehouse_id || sanitized.p_warehouse_id;
    if (!isValidNonNilUUID(whId)) {
      let validWhId: string | null = null;
      const targetOrg = sanitized.orgId || resolvedOrgId;
      if (targetOrg && isValidNonNilUUID(targetOrg)) {
        try {
          const { data: wh } = await supabase.from('warehouses').select('id').eq('organization_id', targetOrg).limit(1).maybeSingle();
          if (wh?.id && isValidNonNilUUID(wh.id)) validWhId = wh.id;
        } catch (e) {}
      }
      sanitized.warehouseId = validWhId;
      sanitized.warehouse_id = validWhId;
      if (sanitized.p_warehouse_id !== undefined) sanitized.p_warehouse_id = validWhId;
    }

    // 4. Customer ID
    const custId = sanitized.customerId || sanitized.customer_id || sanitized.p_customer_id;
    if (!isValidNonNilUUID(custId)) {
      sanitized.customerId = null;
      sanitized.customer_id = null;
      if (sanitized.p_customer_id !== undefined) sanitized.p_customer_id = null;
    }

    // 5. Shift ID & Terminal ID
    const shiftId = sanitized.shift_id || sanitized.shiftId || sanitized.p_shift_id;
    if (!isValidNonNilUUID(shiftId)) {
      sanitized.shift_id = null;
      sanitized.shiftId = null;
      if (sanitized.p_shift_id !== undefined) sanitized.p_shift_id = null;
    }
    const termId = sanitized.terminal_id || sanitized.terminalId || sanitized.p_terminal_id;
    if (!isValidNonNilUUID(termId)) {
      sanitized.terminal_id = null;
      sanitized.terminalId = null;
      if (sanitized.p_terminal_id !== undefined) sanitized.p_terminal_id = null;
    }

    // 6. Items
    const rawItems = sanitized.items || sanitized.p_items || [];
    if (Array.isArray(rawItems)) {
      const sanitizedItems: any[] = [];
      const targetOrg = sanitized.orgId || resolvedOrgId;
      for (const item of rawItems) {
        let pId = item.product_id;
        if (!isValidNonNilUUID(pId)) {
          if (targetOrg && (item.barcode || item.name)) {
            try {
              const { data: foundProd } = await supabase
                .from('products')
                .select('id')
                .eq('organization_id', targetOrg)
                .or(`barcode.eq.${item.barcode || item.product_id},name.eq.${item.name || ''}`)
                .limit(1)
                .maybeSingle();
              if (foundProd?.id && isValidNonNilUUID(foundProd.id)) {
                pId = foundProd.id;
              }
            } catch (e) {}
          }
        }
        sanitizedItems.push({
          ...item,
          product_id: isValidNonNilUUID(pId) ? pId : null,
          uom_id: isValidNonNilUUID(item.uom_id) ? item.uom_id : null
        });
      }
      sanitized.items = sanitizedItems.filter(i => i.product_id !== null);
      if (sanitized.p_items) sanitized.p_items = sanitized.items;
    }

    return sanitized;
  },

  /**
   * Resilient fallback to sync a POS order using complete_pos_sale_atomic or direct table insertion
   * (bypasses any legacy schema dependency like public.terminals)
   */
  async syncViaCompletePosSaleAtomic(sanitizedPayload: any): Promise<{ success: boolean; order_number?: string; error?: string }> {
    try {
      const rawItems = sanitizedPayload.items || sanitizedPayload.p_items || [];
      const items = rawItems.map((i: any) => ({
        product_id: i.product_id,
        quantity: Number(i.quantity || 1),
        unit_price: Number(i.unit_price || i.price || 0),
        uom_id: i.uom_id || null
      })).filter((i: any) => i.product_id);

      if (items.length === 0) {
        return { success: false, error: 'لا توجد أصناف صالحة في الطلب' };
      }

      const totalPaid = Number(sanitizedPayload.paymentAmount || sanitizedPayload.total || sanitizedPayload.grand_total || 0);
      const targetOrg = sanitizedPayload.orgId || sanitizedPayload.organization_id;

      // 1. Try complete_pos_sale_atomic first
      try {
        const { data: atomicData, error: atomicErr } = await supabase.rpc('complete_pos_sale_atomic', {
          p_items: items,
          p_org_id: targetOrg,
          p_user_id: sanitizedPayload.userId || sanitizedPayload.user_id,
          p_warehouse_id: (sanitizedPayload.warehouseId && sanitizedPayload.warehouseId !== '00000000-0000-0000-0000-000000000000') ? sanitizedPayload.warehouseId : null,
          p_customer_id: sanitizedPayload.customerId || sanitizedPayload.customer_id || null,
          p_payment_method: sanitizedPayload.paymentMethod || sanitizedPayload.payment_method || 'CASH',
          p_payment_amount: totalPaid,
          p_shift_id: sanitizedPayload.shift_id || null,
          p_terminal_id: sanitizedPayload.terminal_id || null,
          p_total_discount: Number(sanitizedPayload.totalDiscount || sanitizedPayload.total_discount || 0),
          p_notes: sanitizedPayload.notes || 'مبيعات كاشير أوفلاين تمت مزامنتها تلقائياً',
          p_cash_account_id: sanitizedPayload.cash_account_id || null,
          p_tax: Number(sanitizedPayload.tax || sanitizedPayload.total_tax || 0)
        });

        if (!atomicErr && atomicData?.success) {
          return { success: true, order_number: atomicData.order_number };
        }
        if (atomicErr) {
          console.warn('complete_pos_sale_atomic error in offline fallback:', atomicErr.message);
        }
      } catch (atomicException: any) {
        console.warn('complete_pos_sale_atomic exception in offline fallback:', atomicException);
      }

      // 2. Direct Table Insertion Fallback (Absolute Safety Net)
      const orderNum = `ORD-${Date.now().toString().slice(-6)}`;
      const { data: ord, error: ordErr } = await supabase.from('orders').insert({
        order_number: orderNum,
        order_type: 'TAKEAWAY',
        status: 'PAID',
        subtotal: Number(sanitizedPayload.subtotal || totalPaid),
        total_tax: Number(sanitizedPayload.tax || sanitizedPayload.total_tax || 0),
        grand_total: totalPaid,
        total_discount: Number(sanitizedPayload.totalDiscount || sanitizedPayload.total_discount || 0),
        user_id: sanitizedPayload.userId || sanitizedPayload.user_id || null,
        organization_id: targetOrg,
        customer_id: sanitizedPayload.customerId || sanitizedPayload.customer_id || null,
        warehouse_id: (sanitizedPayload.warehouseId && sanitizedPayload.warehouseId !== '00000000-0000-0000-0000-000000000000') ? sanitizedPayload.warehouseId : null,
        notes: sanitizedPayload.notes || 'مبيعات كاشير أوفلاين تمت مزامنتها تلقائياً',
        is_offline: true
      }).select('id, order_number').single();

      if (ordErr || !ord) {
        throw ordErr || new Error('فشل إدراج رأس الطلب في قاعدة البيانات');
      }

      const orderItems = items.map((i: any) => ({
        order_id: ord.id,
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        organization_id: targetOrg
      }));
      await supabase.from('order_items').insert(orderItems);

      try {
        await supabase.from('payments').insert({
          order_id: ord.id,
          amount: totalPaid,
          payment_method: sanitizedPayload.paymentMethod || sanitizedPayload.payment_method || 'CASH',
          status: 'COMPLETED',
          organization_id: targetOrg
        });
      } catch (pErr) {
        console.warn('Payment insert warning:', pErr);
      }

      return { success: true, order_number: ord.order_number };
    } catch (err: any) {
      return { success: false, error: err?.message || 'فشلت المزامنة عبر كافة المسارات البديلة' };
    }
  },


  /**
   * Adds a new order to the offline queue.
   */
  async queueOrder(orderPayload: any): Promise<void> {
    try {
      // Auto-attach last valid org ID if current orgId is missing or mock offline string
      const lastValidOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || 
        (typeof window !== 'undefined' ? window.localStorage?.getItem('tripro_last_valid_org_id') : null);
      if (lastValidOrg && (!isValidNonNilUUID(orderPayload.orgId) || orderPayload.orgId === 'org-default-offline')) {
        orderPayload.orgId = lastValidOrg;
      }
      if (lastValidOrg && (!isValidNonNilUUID(orderPayload.organization_id) || orderPayload.organization_id === 'org-default-offline')) {
        orderPayload.organization_id = lastValidOrg;
      }

      await db.queuedOrders.add({
        payload: orderPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('Order queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue order:', error);
      throw new Error('Failed to save order locally.');
    }
  },

  /**
   * Re-attempts syncing of all failed items after sanitizing them.
   */
  async retryFailedOrders(): Promise<void> {
    const failedOrders = await db.queuedOrders.where('status').equals('failed').toArray();
    for (const order of failedOrders) {
      if (order.id) {
        await db.queuedOrders.update(order.id, { status: 'pending', error: undefined });
      }
    }
    await this.processQueue();
  },

  /**
   * Syncs products from Supabase and stores them locally in IndexedDB.
   */
  async syncProductsLocally(orgId: string): Promise<void> {
    if (!navigator.onLine) return;
    try {
      let data: any[] | null = null;
      
      // 1. Fetch with select('*') so it dynamically adapts to available columns without throwing error 42703
      const { data: allData, error: allErr } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', orgId);

      if (!allErr && allData) {
        data = allData;
      } else {
        // Fallback: fetch with safe core columns only
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('products')
          .select('id, name, barcode, sku, sales_price, cost, category_id, stock, image_url')
          .eq('organization_id', orgId);
        if (fallbackErr) throw fallbackErr;
        data = fallbackData;
      }
      
      if (data) {
        await db.products.clear();
        const productsToCache: CachedProduct[] = data.map(p => ({
          id: p.id,
          name: p.name,
          barcode: p.barcode || null,
          sku: p.sku || null,
          sales_price: Number(p.sales_price || 0),
          cost: Number(p.cost || 0),
          category_id: p.category_id || null,
          stock: Number(p.stock || 0),
          image_url: p.image_url || null,
          is_scale_item: p.is_scale_item || false,
          plu_number: p.plu_number ? Number(p.plu_number) : null,
          scale_prefix: p.scale_prefix || '22',
          barcode2: p.barcode2 || null,
          age_restricted: p.age_restricted || false,
          tax_rate_override: p.tax_rate_override ? Number(p.tax_rate_override) : null,
          unit_barcodes: Array.isArray(p.unit_barcodes) ? p.unit_barcodes : [],
          offer_price: p.offer_price !== null && p.offer_price !== undefined ? Number(p.offer_price) : null,
          offer_start_date: p.offer_start_date || null,
          offer_end_date: p.offer_end_date || null,
          min_sales_price: Number(p.min_sales_price || 0),
          max_stock_level: Number(p.max_stock_level || 0),
          wholesale_price: Number(p.wholesale_price || 0),
          half_wholesale_price: Number(p.half_wholesale_price || 0),
          warehouse_stock: p.warehouse_stock || null,
        }));
        await db.products.bulkAdd(productsToCache);
        console.log(`Synced ${productsToCache.length} products locally.`);
      }
    } catch (error) {
      console.error('Failed to sync products locally:', error);
    }
  },

  /**
   * Syncs patients from Supabase to IndexedDB for offline HIMS visits check-in.
   */
  async syncPatientsLocally(orgId: string): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const { data, error } = await supabase
        .from('hims_patients')
        .select('id, national_id, full_name, phone, dob, gender, blood_type')
        .eq('organization_id', orgId);

      if (error) throw error;

      if (data) {
        await db.himsPatients.clear();
        await db.himsPatients.bulkAdd(data);
        console.log(`Synced ${data.length} patients locally for HIMS.`);
      }
    } catch (error) {
      console.error('Failed to sync HIMS patients locally:', error);
    }
  },

  /**
   * Queues an offline HIMS patient registration.
   */
  async queuePatient(patientPayload: any): Promise<void> {
    try {
      await db.queuedPatients.add({
        payload: patientPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('Patient registration queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue patient:', error);
      throw new Error('Failed to save patient locally.');
    }
  },

  /**
   * Queues an offline HIMS clinical visit.
   */
  async queueVisit(visitPayload: any): Promise<void> {
    try {
      await db.queuedVisits.add({
        payload: visitPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('HIMS Visit queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS visit:', error);
      throw new Error('Failed to save visit locally.');
    }
  },

  /**
   * Queues an offline HIMS clinical note (SOAP note).
   */
  async queueClinicalNote(notePayload: any): Promise<void> {
    try {
      await db.queuedClinicalNotes.add({
        payload: notePayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('Clinical SOAP note queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS clinical note:', error);
      throw new Error('Failed to save clinical note locally.');
    }
  },

  /**
   * Queues an offline HIMS prescription.
   */
  async queuePrescription(prescriptionPayload: any): Promise<void> {
    try {
      await db.queuedPrescriptions.add({
        payload: prescriptionPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('HIMS Prescription queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS prescription:', error);
      throw new Error('Failed to save prescription locally.');
    }
  },

  /**
   * Queues offline HIMS lab orders.
   */
  async queueLabOrders(ordersPayload: any): Promise<void> {
    try {
      await db.queuedLabOrders.add({
        payload: ordersPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('HIMS Lab orders queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS lab orders:', error);
      throw new Error('Failed to save lab orders locally.');
    }
  },

  /**
   * Queues offline HIMS radiology orders.
   */
  async queueRadiologyOrders(ordersPayload: any): Promise<void> {
    try {
      await db.queuedRadiologyOrders.add({
        payload: ordersPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('HIMS Radiology orders queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS radiology orders:', error);
      throw new Error('Failed to save radiology orders locally.');
    }
  },

  /**
   * Processes all queues (POS and HIMS) when connectivity is restored.
   */
  async processQueue(): Promise<void> {
    if (!navigator.onLine) {
      return;
    }

    // 1. Sync POS Orders (Atomic Offline Batch Sync with Conflict Resolution)
    const pendingOrders = await db.queuedOrders.where('status').anyOf('pending', 'failed').limit(20).toArray();
    if (pendingOrders.length > 0) {
      console.log(`Processing ${pendingOrders.length} queued POS orders via conflict-resilient sync...`);

      // Resolve real organization UUID before sync
      const resolvedOrgId = await this.resolveActiveOrganizationId(
        pendingOrders[0]?.payload?.orgId || pendingOrders[0]?.payload?.organization_id
      );

      // Sanitize and heal each queued order payload
      const sanitizedOrdersList: Array<{ orderRecord: QueuedOrder; sanitizedPayload: any }> = [];
      for (const order of pendingOrders) {
        if (!order.id) continue;
        const sanitizedPayload = await this.sanitizeOrderPayload(order.payload, resolvedOrgId);
        // Persist sanitized payload back to IndexedDB so local store is immediately healed
        await db.queuedOrders.update(order.id, {
          payload: sanitizedPayload,
          status: 'syncing',
          lastAttempt: new Date()
        });
        sanitizedOrdersList.push({ orderRecord: order, sanitizedPayload });
      }

      // Prepare batch payload with offline_ref_id for each order
      const ordersPayload = sanitizedOrdersList.map(({ orderRecord, sanitizedPayload }) => ({
        ...sanitizedPayload,
        offline_ref_id: `OFFLINE-QUEUE-${orderRecord.id}`,
        id: orderRecord.id
      }));

      try {
        // Attempt high-speed batch sync RPC first
        const { data: batchResult, error: batchErr } = await supabase.rpc('sync_offline_pos_orders_batch', {
          p_orders: ordersPayload
        });

        if (!batchErr && batchResult?.results) {
          for (const res of batchResult.results) {
            const matchedItem = sanitizedOrdersList.find(({ orderRecord }) =>
              `OFFLINE-QUEUE-${orderRecord.id}` === res.offline_ref_id || String(orderRecord.id) === String(res.offline_ref_id)
            );
            if (matchedItem && matchedItem.orderRecord.id) {
              if (res.success) {
                await db.queuedOrders.delete(matchedItem.orderRecord.id);
                console.log(`Order ${matchedItem.orderRecord.id} synced successfully (DB: ${res.order_number}).`);
              } else {
                console.warn(`Order ${matchedItem.orderRecord.id} failed in batch (${res.error}), attempting resilient fallback sync...`);
                const fallbackRes = await this.syncViaCompletePosSaleAtomic(matchedItem.sanitizedPayload);
                if (fallbackRes.success) {
                  await db.queuedOrders.delete(matchedItem.orderRecord.id);
                  console.log(`Order ${matchedItem.orderRecord.id} synced successfully via resilient fallback (DB: ${fallbackRes.order_number}).`);
                } else {
                  console.error(`Order ${matchedItem.orderRecord.id} failed in batch and fallback:`, fallbackRes.error || res.error);
                  await db.queuedOrders.update(matchedItem.orderRecord.id, {
                    status: 'failed',
                    error: fallbackRes.error || res.error,
                    lastAttempt: new Date()
                  });
                }
              }
            }
          }
        } else {
          // Fallback to one-by-one atomic sync using resilient complete_pos_sale_atomic
          for (const { orderRecord, sanitizedPayload } of sanitizedOrdersList) {
            if (!orderRecord.id) continue;
            const fallbackRes = await this.syncViaCompletePosSaleAtomic(sanitizedPayload);
            if (fallbackRes.success) {
              await db.queuedOrders.delete(orderRecord.id);
              console.log(`Order ${orderRecord.id} synced individually via resilient fallback (DB: ${fallbackRes.order_number}).`);
            } else {
              console.error(`Failed to sync order ${orderRecord.id}:`, fallbackRes.error);
              await db.queuedOrders.update(orderRecord.id, { status: 'failed', error: fallbackRes.error || 'فشلت المزامنة' });
            }
          }
        }
      } catch (globalErr: any) {
        console.warn('Notice in POS offline sync batch, executing resilient fallback for pending orders:', globalErr);
        for (const { orderRecord, sanitizedPayload } of sanitizedOrdersList) {
          if (!orderRecord.id) continue;
          try {
            const fallbackRes = await this.syncViaCompletePosSaleAtomic(sanitizedPayload);
            if (fallbackRes.success) {
              await db.queuedOrders.delete(orderRecord.id);
              console.log(`Order ${orderRecord.id} recovered and synced successfully.`);
            }
          } catch (recoveryErr) {
            console.error(`Recovery failed for order ${orderRecord.id}:`, recoveryErr);
          }
        }
      }
    }

    // 2. Sync HIMS Patients
    const pendingPatients = await db.queuedPatients.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingPatients.length > 0) {
      console.log(`Processing ${pendingPatients.length} queued medical patients...`);
      for (const patient of pendingPatients) {
        if (!patient.id) continue;
        await db.queuedPatients.update(patient.id, { status: 'syncing', attempts: patient.attempts + 1, lastAttempt: new Date() });
        try {
          const { data, error } = await supabase
            .from('hims_patients')
            .insert(patient.payload)
            .select('id')
            .single();

          if (error) throw error;
          
          const realPatientId = data.id;
          const tempPatientId = `queued-${patient.id}`;

          // Update any queued visits that reference this temporary patient ID
          const visits = await db.queuedVisits.toArray();
          for (const visit of visits) {
            if (visit.payload.patient_id === tempPatientId) {
              visit.payload.patient_id = realPatientId;
              await db.queuedVisits.put(visit);
            }
          }

          await db.queuedPatients.delete(patient.id);
          console.log(`Patient ${patient.id} synced successfully. Mapped to ${realPatientId}`);
        } catch (error: any) {
          console.error(`Failed to sync patient ${patient.id}:`, error);
          await db.queuedPatients.update(patient.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 3. Sync HIMS Visits
    const pendingVisits = await db.queuedVisits.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingVisits.length > 0) {
      console.log(`Processing ${pendingVisits.length} queued medical visits...`);
      for (const visit of pendingVisits) {
        if (!visit.id) continue;
        await db.queuedVisits.update(visit.id, { status: 'syncing', attempts: visit.attempts + 1, lastAttempt: new Date() });
        try {
          // Check if doctor_id is a mock offline ID and resolve to a real UUID
          let realDoctorId = visit.payload.doctor_id;
          if (realDoctorId?.startsWith('offline-doc-')) {
            const { data: docData } = await supabase
              .from('hims_doctors')
              .select('id')
              .eq('organization_id', visit.payload.organization_id)
              .eq('is_active', true)
              .limit(1);
            
            if (docData && docData.length > 0) {
              realDoctorId = docData[0].id;
            } else {
              const { data: fallbackDocs } = await supabase
                .from('hims_doctors')
                .select('id')
                .limit(1);
              if (fallbackDocs && fallbackDocs.length > 0) {
                realDoctorId = fallbackDocs[0].id;
              }
            }
            visit.payload.doctor_id = realDoctorId;
          }

          const { data, error } = await supabase
            .from('hims_visits')
            .insert(visit.payload)
            .select('id')
            .single();

          if (error) throw error;

          const realVisitId = data.id;
          const tempVisitId = `queued-visit-${visit.id}`;

          // Update any queued clinical notes, prescriptions, and lab/rad orders referencing this temporary visit ID
          const notes = await db.queuedClinicalNotes.toArray();
          for (const note of notes) {
            if (note.payload.visit_id === tempVisitId) {
              note.payload.visit_id = realVisitId;
              await db.queuedClinicalNotes.put(note);
            }
          }

          const prescriptions = await db.queuedPrescriptions.toArray();
          for (const pres of prescriptions) {
            if (pres.payload.visit_id === tempVisitId) {
              pres.payload.visit_id = realVisitId;
              await db.queuedPrescriptions.put(pres);
            }
          }

          const labOrders = await db.queuedLabOrders.toArray();
          for (const order of labOrders) {
            let modified = false;
            if (Array.isArray(order.payload)) {
              for (const singleOrder of order.payload) {
                if (singleOrder.visit_id === tempVisitId) {
                  singleOrder.visit_id = realVisitId;
                  modified = true;
                }
              }
            } else if (order.payload && order.payload.visit_id === tempVisitId) {
              order.payload.visit_id = realVisitId;
              modified = true;
            }
            if (modified) {
              await db.queuedLabOrders.put(order);
            }
          }

          const radOrders = await db.queuedRadiologyOrders.toArray();
          for (const order of radOrders) {
            let modified = false;
            if (Array.isArray(order.payload)) {
              for (const singleOrder of order.payload) {
                if (singleOrder.visit_id === tempVisitId) {
                  singleOrder.visit_id = realVisitId;
                  modified = true;
                }
              }
            } else if (order.payload && order.payload.visit_id === tempVisitId) {
              order.payload.visit_id = realVisitId;
              modified = true;
            }
            if (modified) {
              await db.queuedRadiologyOrders.put(order);
            }
          }

          await db.queuedVisits.delete(visit.id);
          console.log(`Visit ${visit.id} synced successfully. Mapped to ${realVisitId}`);
        } catch (error: any) {
          console.error(`Failed to sync visit ${visit.id}:`, error);
          await db.queuedVisits.update(visit.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 4. Sync HIMS Clinical Notes
    const pendingNotes = await db.queuedClinicalNotes.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingNotes.length > 0) {
      console.log(`Processing ${pendingNotes.length} queued clinical notes...`);
      for (const note of pendingNotes) {
        if (!note.id) continue;
        await db.queuedClinicalNotes.update(note.id, { status: 'syncing', attempts: note.attempts + 1, lastAttempt: new Date() });
        try {
          // Resolve correct doctor_id from the online visit to avoid foreign key errors
          const { data: visitData } = await supabase
            .from('hims_visits')
            .select('doctor_id')
            .eq('id', note.payload.visit_id)
            .single();
          if (visitData) {
            note.payload.doctor_id = visitData.doctor_id;
          }

          const { error } = await supabase.from('hims_clinical_notes').insert(note.payload);
          if (error) throw error;
          await db.queuedClinicalNotes.delete(note.id);
          console.log(`Clinical note ${note.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync clinical note ${note.id}:`, error);
          await db.queuedClinicalNotes.update(note.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 5. Sync HIMS Prescriptions
    const pendingPrescriptions = await db.queuedPrescriptions.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingPrescriptions.length > 0) {
      console.log(`Processing ${pendingPrescriptions.length} queued medical prescriptions...`);
      for (const pres of pendingPrescriptions) {
        if (!pres.id) continue;
        await db.queuedPrescriptions.update(pres.id, { status: 'syncing', attempts: pres.attempts + 1, lastAttempt: new Date() });
        try {
          // Resolve correct doctor_id from the online visit to avoid foreign key errors
          const { data: visitData } = await supabase
            .from('hims_visits')
            .select('doctor_id')
            .eq('id', pres.payload.visit_id)
            .single();
          if (visitData) {
            pres.payload.doctor_id = visitData.doctor_id;
          }

          const { error } = await supabase.from('hims_prescriptions').insert(pres.payload);
          if (error) throw error;
          await db.queuedPrescriptions.delete(pres.id);
          console.log(`Prescription ${pres.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync prescription ${pres.id}:`, error);
          await db.queuedPrescriptions.update(pres.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 6. Sync HIMS Lab Orders
    const pendingLabOrders = await db.queuedLabOrders.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingLabOrders.length > 0) {
      console.log(`Processing ${pendingLabOrders.length} queued medical lab orders...`);
      for (const order of pendingLabOrders) {
        if (!order.id) continue;
        await db.queuedLabOrders.update(order.id, { status: 'syncing', attempts: order.attempts + 1, lastAttempt: new Date() });
        try {
          // Map offline mock test_ids to real online database UUIDs before inserting
          if (Array.isArray(order.payload)) {
            for (const singleOrder of order.payload) {
              let testId = singleOrder.test_id;
              if (testId?.startsWith('offline-lab-')) {
                let name = 'صورة دم كاملة (CBC)';
                let category = 'hematology';
                if (testId === 'offline-lab-2') { name = 'وظائف كلى (Creatinine/Urea)'; category = 'biochemistry'; }
                else if (testId === 'offline-lab-3') { name = 'وظائف كبد (ALT/AST)'; category = 'biochemistry'; }
                else if (testId === 'offline-lab-4') { name = 'تحليل سكر تراكمي (HbA1c)'; category = 'diabetology'; }

                const { data: onlineTest } = await supabase
                  .from('hims_lab_tests')
                  .select('id')
                  .eq('organization_id', singleOrder.organization_id)
                  .eq('test_name', name)
                  .limit(1);

                if (onlineTest && onlineTest.length > 0) {
                  singleOrder.test_id = onlineTest[0].id;
                } else {
                  const { data: newTest, error: insertErr } = await supabase
                    .from('hims_lab_tests')
                    .insert({
                      test_name: name,
                      category: category,
                      price: 150,
                      organization_id: singleOrder.organization_id,
                      normal_range: '3.5 - 5.0',
                      unit: 'g/dL'
                    })
                    .select('id')
                    .single();
                  if (!insertErr && newTest) {
                    singleOrder.test_id = newTest.id;
                  } else {
                    const { data: fallbackTests } = await supabase
                      .from('hims_lab_tests')
                      .select('id')
                      .limit(1);
                    if (fallbackTests && fallbackTests.length > 0) {
                      singleOrder.test_id = fallbackTests[0].id;
                    }
                  }
                }
              }
            }
          }

          const { error } = await supabase.from('hims_lab_orders').insert(order.payload);
          if (error) throw error;
          await db.queuedLabOrders.delete(order.id);
          console.log(`Lab order batch ${order.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync lab order batch ${order.id}:`, error);
          await db.queuedLabOrders.update(order.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 7. Sync HIMS Radiology Orders
    const pendingRadOrders = await db.queuedRadiologyOrders.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingRadOrders.length > 0) {
      console.log(`Processing ${pendingRadOrders.length} queued medical radiology orders...`);
      for (const order of pendingRadOrders) {
        if (!order.id) continue;
        await db.queuedRadiologyOrders.update(order.id, { status: 'syncing', attempts: order.attempts + 1, lastAttempt: new Date() });
        try {
          const { error } = await supabase.from('hims_radiology_orders').insert(order.payload);
          if (error) throw error;
          await db.queuedRadiologyOrders.delete(order.id);
          console.log(`Radiology order batch ${order.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync radiology order batch ${order.id}:`, error);
          await db.queuedRadiologyOrders.update(order.id, { status: 'failed', error: error.message });
        }
      }
    }
  },

  /**
   * Seeds offline fallback products into IndexedDB if empty.
   */
  async seedFallbackProducts(productsList: any[]): Promise<void> {
    try {
      const count = await db.products.count();
      if (count === 0 && productsList && productsList.length > 0) {
        const toCache: CachedProduct[] = productsList.map(p => ({
          id: p.id,
          name: p.name,
          barcode: p.barcode || null,
          sku: p.sku || null,
          sales_price: Number(p.sales_price || 0),
          cost: Number(p.cost || 0),
          category_id: p.category_id || null,
          stock: Number(p.stock || 100),
          image_url: p.image_url || null,
          is_scale_item: false,
          plu_number: null,
          scale_prefix: '22',
          barcode2: null,
          age_restricted: false,
          tax_rate_override: null,
          unit_barcodes: [],
          offer_price: null,
          offer_start_date: null,
          offer_end_date: null,
          min_sales_price: 0,
          max_stock_level: 1000,
          wholesale_price: Number(p.sales_price || 0),
          half_wholesale_price: Number(p.sales_price || 0),
          warehouse_stock: null,
        }));
        await db.products.bulkPut(toCache);
        console.log(`Seeded ${toCache.length} fallback products into IndexedDB for offline POS.`);
      }
    } catch (e) {
      console.warn('Failed to seed fallback products:', e);
    }
  }
};