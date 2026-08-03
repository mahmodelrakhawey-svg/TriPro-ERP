import Dexie, { Table } from 'dexie';
import { supabase } from '../supabaseClient';

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

  constructor() {
    super('TriProOfflineDB');
    this.version(4).stores({
      queuedOrders: '++id, status, createdAt',
      products: 'id, barcode, sku, name',
      himsPatients: 'id, national_id, full_name, phone',
      queuedPatients: '++id, status, createdAt',
      queuedVisits: '++id, status, createdAt',
      queuedClinicalNotes: '++id, status, createdAt',
    });
  }
}

export const db = new OfflineDB();

export const offlineService = {
  /**
   * Adds a new order to the offline queue.
   */
  async queueOrder(orderPayload: any): Promise<void> {
    try {
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
   * Syncs products from Supabase and stores them locally in IndexedDB.
   */
  async syncProductsLocally(orgId: string): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, barcode, sku, sales_price, cost, category_id, stock, image_url')
        .eq('organization_id', orgId);
      
      if (error) throw error;
      
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
          image_url: p.image_url || null
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
   * Processes all queues (POS and HIMS) when connectivity is restored.
   */
  async processQueue(): Promise<void> {
    if (!navigator.onLine) {
      return;
    }

    // 1. Sync POS Orders
    const pendingOrders = await db.queuedOrders.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingOrders.length > 0) {
      console.log(`Processing ${pendingOrders.length} queued POS orders...`);
      for (const order of pendingOrders) {
        if (!order.id) continue;
        await db.queuedOrders.update(order.id, { status: 'syncing', attempts: order.attempts + 1, lastAttempt: new Date() });
        try {
          const { error } = await supabase.rpc('create_restaurant_order', order.payload);
          if (error) throw error;
          await db.queuedOrders.delete(order.id);
          console.log(`Order ${order.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync order ${order.id}:`, error);
          await db.queuedOrders.update(order.id, { status: 'failed', error: error.message });
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
          const { error } = await supabase.from('hims_patients').insert(patient.payload);
          if (error) throw error;
          await db.queuedPatients.delete(patient.id);
          console.log(`Patient ${patient.id} synced successfully.`);
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
          const { error } = await supabase.from('hims_visits').insert(visit.payload);
          if (error) throw error;
          await db.queuedVisits.delete(visit.id);
          console.log(`Visit ${visit.id} synced successfully.`);
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
  }
};