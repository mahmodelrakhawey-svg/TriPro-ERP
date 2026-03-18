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

class OfflineDB extends Dexie {
  queuedOrders!: Table<QueuedOrder>;

  constructor() {
    super('TriProOfflineDB');
    this.version(1).stores({
      queuedOrders: '++id, status, createdAt', // Primary key and indexes
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