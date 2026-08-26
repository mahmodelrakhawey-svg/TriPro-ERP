/**
 * ==============================================================================
 * Happy Hour & Time-Based Dynamic Pricing Service
 * TriPro ERP — services/happyHourService.ts
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { secureStorage } from '../utils/securityMiddleware';

export interface HappyHourSchedule {
  id: string;
  organization_id?: string | null;
  name: string;
  discount_pct: number; // e.g. 20 for 20% off
  days_of_week: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  start_time: string; // "16:00"
  end_time: string; // "19:00"
  applies_to_all_products: boolean;
  target_category_ids?: string[];
  target_product_ids?: string[];
  is_active: boolean;
}

export const DEFAULT_HAPPY_HOURS: HappyHourSchedule[] = [
  {
    id: 'hh_daily_afternoon',
    name: 'ساعات الترويقة المسائية (Daily Afternoon Happy Hour)',
    discount_pct: 20,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    start_time: '16:00',
    end_time: '19:00',
    applies_to_all_products: false,
    target_category_ids: [],
    target_product_ids: [],
    is_active: true
  }
];

const LOCAL_HAPPY_HOURS_KEY = 'tripro_happy_hours_v1';

class HappyHourService {
  public async getSchedules(organizationId?: string): Promise<HappyHourSchedule[]> {
    try {
      let query = supabase.from('happy_hour_schedules').select('*').eq('is_active', true);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error || !data || data.length === 0) return this.getLocalSchedules();
      return data as HappyHourSchedule[];
    } catch {
      return this.getLocalSchedules();
    }
  }

  private getLocalSchedules(): HappyHourSchedule[] {
    const list = secureStorage.getItem<HappyHourSchedule[]>(LOCAL_HAPPY_HOURS_KEY);
    if (list && Array.isArray(list) && list.length > 0) return list;
    return DEFAULT_HAPPY_HOURS;
  }

  public async saveSchedule(schedule: Partial<HappyHourSchedule>, organizationId?: string): Promise<HappyHourSchedule> {
    const payload = {
      organization_id: organizationId || null,
      name: (schedule.name || 'عرض سعيد').trim(),
      discount_pct: Number(schedule.discount_pct || 10),
      days_of_week: schedule.days_of_week || [0, 1, 2, 3, 4, 5, 6],
      start_time: schedule.start_time || '16:00',
      end_time: schedule.end_time || '19:00',
      applies_to_all_products: Boolean(schedule.applies_to_all_products),
      target_category_ids: schedule.target_category_ids || [],
      target_product_ids: schedule.target_product_ids || [],
      is_active: schedule.is_active !== undefined ? schedule.is_active : true,
      updated_at: new Date().toISOString()
    };

    let scheduleId = schedule.id || `hh_${Date.now()}`;

    try {
      if (schedule.id && !schedule.id.startsWith('hh_')) {
        await supabase.from('happy_hour_schedules').update(payload).eq('id', scheduleId);
      } else {
        const { data } = await supabase.from('happy_hour_schedules').insert(payload).select().single();
        if (data) scheduleId = data.id;
      }
    } catch (e) {
      console.warn('DB happy hour save notice:', e);
    }

    const saved: HappyHourSchedule = { ...schedule, ...payload, id: scheduleId } as HappyHourSchedule;
    const current = this.getLocalSchedules();
    const filtered = current.filter(s => s.id !== scheduleId);
    secureStorage.setItem(LOCAL_HAPPY_HOURS_KEY, [...filtered, saved]);
    return saved;
  }

  /**
   * التحقق مما إذا كان هناك عرض ساعات سعيدة نشط حالياً وتطبيق الخصم
   */
  public evaluateProductPrice(
    productId: string,
    originalPrice: number,
    categoryId?: string,
    schedules?: HappyHourSchedule[]
  ): { finalPrice: number; discountPct: number; isHappyHour: boolean; ruleName?: string } {
    const activeSchedules = schedules || this.getLocalSchedules();
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sun
    const currentTimeStr = now.toTimeString().slice(0, 5); // "HH:MM"

    for (const rule of activeSchedules) {
      if (!rule.is_active) continue;
      if (!rule.days_of_week.includes(currentDay)) continue;

      const start = rule.start_time.slice(0, 5);
      const end = rule.end_time.slice(0, 5);

      const isTimeMatch = start <= end
        ? currentTimeStr >= start && currentTimeStr <= end
        : currentTimeStr >= start || currentTimeStr <= end; // Spans past midnight

      if (!isTimeMatch) continue;

      // Check product match
      let isTargetMatch = false;
      if (rule.applies_to_all_products) {
        isTargetMatch = true;
      } else if (rule.target_product_ids && rule.target_product_ids.includes(productId)) {
        isTargetMatch = true;
      } else if (categoryId && rule.target_category_ids && rule.target_category_ids.includes(categoryId)) {
        isTargetMatch = true;
      }

      if (isTargetMatch) {
        const discountAmount = (originalPrice * rule.discount_pct) / 100;
        const finalPrice = Math.max(0, originalPrice - discountAmount);
        return {
          finalPrice: Number(finalPrice.toFixed(2)),
          discountPct: rule.discount_pct,
          isHappyHour: true,
          ruleName: rule.name
        };
      }
    }

    return {
      finalPrice: originalPrice,
      discountPct: 0,
      isHappyHour: false
    };
  }
}

export const happyHourService = new HappyHourService();
