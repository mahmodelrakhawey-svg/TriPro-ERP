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

class OfflineDB extends Dexie {
  queuedOrders!: Table<QueuedOrder>;
  products!: Table<CachedProduct, string>;

  constructor() {
    super('TriProOfflineDB');
    this.version(3).stores({
      queuedOrders: '++id, status, createdAt',
      products: 'id, barcode, sku, name',
    });
  }
}

export const db = new OfflineDB();

export const offlineService = {
  /**
   * Adds a new order to the offline queue.
   * This is called when the user submits an order in the POS.
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
   * Processes the queue, sending pending orders to Supabase.
   * This should be called periodically or when connectivity is restored.
   */
  async processQueue(): Promise<void> {
    if (!navigator.onLine) {
      return;
    }

    const pendingOrders = await db.queuedOrders.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingOrders.length === 0) return;

    console.log(`Processing ${pendingOrders.length} queued orders...`);

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
};