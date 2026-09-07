/**
 * ==============================================================================
 * Kitchen Station & KDS Routing Service
 * TriPro ERP — services/kitchenStationService.ts
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { secureStorage } from '../utils/securityMiddleware';

export interface KitchenStation {
  id: string;
  organization_id?: string | null;
  name: string;
  code: string;
  color: string;
  icon: string;
  display_order: number;
  is_active: boolean;
}

export interface KitchenTicketItemDetail {
  id: string;
  order_id: string;
  order_item_id?: string;
  product_id?: string;
  product_name: string;
  station_id?: string;
  station_name?: string;
  station_color?: string;
  quantity: number;
  status: 'NEW' | 'PREPARING' | 'READY' | 'SERVED';
  notes?: string | null;
  selectedModifiers?: { name: string; unit_price: number }[];
  prep_time_minutes?: number;
  started_at?: string | null;
  ready_at?: string | null;
  served_at?: string | null;
}

export interface ExpoTicketDetail {
  order_id: string;
  order_number: string;
  table_name: string | null;
  order_type: string;
  created_at: string;
  items: KitchenTicketItemDetail[];
  total_items_count: number;
  ready_items_count: number;
  is_all_ready: boolean;
  completion_pct: number;
}

export const DEFAULT_KITCHEN_STATIONS: KitchenStation[] = [
  { id: 'st_grill', name: 'محطة الشواية واللحوم (Grill)', code: 'grill', color: '#dc2626', icon: 'Flame', display_order: 1, is_active: true },
  { id: 'st_fryer', name: 'محطة المقليات والبرجر (Fryer)', code: 'fryer', color: '#ea580c', icon: 'Utensils', display_order: 2, is_active: true },
  { id: 'st_oven', name: 'محطة الفرن والبيتزا (Oven / Pizza)', code: 'oven', color: '#d97706', icon: 'Layers', display_order: 3, is_active: true },
  { id: 'st_cold', name: 'محطة البارد والسلطات (Cold & Salad)', code: 'cold', color: '#16a34a', icon: 'Leaf', display_order: 4, is_active: true },
  { id: 'st_drinks', name: 'محطة المشروبات والبار (Bar & Drinks)', code: 'drinks', color: '#0284c7', icon: 'Coffee', display_order: 5, is_active: true },
  { id: 'st_dessert', name: 'محطة الحلويات (Desserts)', code: 'dessert', color: '#9333ea', icon: 'Sparkles', display_order: 6, is_active: true }
];

const LOCAL_STATIONS_KEY = 'tripro_kitchen_stations_v1';
const LOCAL_TICKET_STATUSES_KEY = 'tripro_ticket_item_statuses_v1';

class KitchenStationService {
  public async getStations(organizationId?: string): Promise<KitchenStation[]> {
    try {
      let query = supabase.from('kitchen_stations').select('*').eq('is_active', true).order('display_order');
      if (organizationId) query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        return this.getLocalStations();
      }
      return data as KitchenStation[];
    } catch {
      return this.getLocalStations();
    }
  }

  private getLocalStations(): KitchenStation[] {
    const local = secureStorage.getItem<KitchenStation[]>(LOCAL_STATIONS_KEY);
    if (local && Array.isArray(local) && local.length > 0) return local;
    return DEFAULT_KITCHEN_STATIONS;
  }

  public async saveStation(station: Partial<KitchenStation>, organizationId?: string): Promise<KitchenStation> {
    let stationId = station.id || `st_${Date.now()}`;

    const payload = {
      id: stationId,
      organization_id: organizationId || null,
      name: (station.name || '').trim(),
      code: (station.code || 'custom').trim(),
      color: station.color || '#e11d48',
      icon: station.icon || 'Flame',
      display_order: station.display_order || 0,
      is_active: station.is_active !== undefined ? station.is_active : true,
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase.from('kitchen_stations').upsert(payload).select().single();
      if (!error && data) {
        stationId = data.id;
      } else if (error) {
        console.warn('Database station save notice:', error);
      }
    } catch (e) {
      console.warn('Database station save notice:', e);
    }

    const saved: KitchenStation = { ...station, ...payload, id: stationId } as KitchenStation;
    const current = this.getLocalStations();
    const filtered = current.filter(s => s.id !== stationId);
    secureStorage.setItem(LOCAL_STATIONS_KEY, [...filtered, saved]);
    return saved;
  }

  public async updateTicketItemStatus(
    itemId: string,
    status: 'NEW' | 'PREPARING' | 'READY' | 'SERVED'
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      const updates: any = { status };
      if (status === 'PREPARING') updates.started_at = now;
      if (status === 'READY') updates.ready_at = now;
      if (status === 'SERVED') updates.served_at = now;

      await supabase.from('kitchen_ticket_items').update(updates).eq('id', itemId);
    } catch (e) {
      console.warn('DB ticket status update notice:', e);
    }

    // Save locally
    const statuses = secureStorage.getItem<Record<string, string>>(LOCAL_TICKET_STATUSES_KEY) || {};
    statuses[itemId] = status;
    secureStorage.setItem(LOCAL_TICKET_STATUSES_KEY, statuses);
  }

  public getSavedStatus(itemId: string): string | null {
    const statuses = secureStorage.getItem<Record<string, string>>(LOCAL_TICKET_STATUSES_KEY) || {};
    return statuses[itemId] || null;
  }
}

export const kitchenStationService = new KitchenStationService();
