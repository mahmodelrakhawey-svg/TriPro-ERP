/**
 * ==============================================================================
 * Tips Pooling & Staff Distribution Service
 * TriPro ERP — services/tipsPoolService.ts
 * ==============================================================================
 */

import { secureStorage } from '../utils/securityMiddleware';
import { AccountingEngine } from './accountingEngine';

export interface StaffTipShare {
  employee_id: string;
  employee_name: string;
  role: 'WAITER' | 'RUNNER' | 'CHEF' | 'BARISTA' | 'HOST';
  category: 'FLOOR' | 'KITCHEN';
  hours_worked: number;
  points_weight: number;
  tip_amount_earned: number;
}

export interface TipsDistributionRecord {
  id: string;
  organization_id?: string | null;
  period_start: string;
  period_end: string;
  total_tips_collected: number;
  floor_share_pct: number; // e.g. 60%
  kitchen_share_pct: number; // e.g. 40%
  total_floor_amount: number;
  total_kitchen_amount: number;
  staff_shares: StaffTipShare[];
  status: 'DRAFT' | 'DISTRIBUTED' | 'PAID';
  created_at: string;
}

const LOCAL_TIPS_KEY = 'tripro_tips_distribution_v1';

class TipsPoolService {
  public getRecords(organizationId?: string): TipsDistributionRecord[] {
    const records = secureStorage.getItem<TipsDistributionRecord[]>(LOCAL_TIPS_KEY);
    if (records && Array.isArray(records)) return records;
    return [];
  }

  public calculateDistribution(params: {
    totalTips: number;
    floorSharePct: number;
    kitchenSharePct: number;
    staffList: Array<{
      id: string;
      name: string;
      role: 'WAITER' | 'RUNNER' | 'CHEF' | 'BARISTA' | 'HOST';
      category: 'FLOOR' | 'KITCHEN';
      hoursWorked: number;
      pointsWeight?: number;
    }>;
  }): StaffTipShare[] {
    const totalFloor = (params.totalTips * params.floorSharePct) / 100;
    const totalKitchen = (params.totalTips * params.kitchenSharePct) / 100;

    const floorStaff = params.staffList.filter(s => s.category === 'FLOOR');
    const kitchenStaff = params.staffList.filter(s => s.category === 'KITCHEN');

    const totalFloorScore = floorStaff.reduce((sum, s) => sum + (s.hoursWorked * (s.pointsWeight || 1)), 0);
    const totalKitchenScore = kitchenStaff.reduce((sum, s) => sum + (s.hoursWorked * (s.pointsWeight || 1)), 0);

    const result: StaffTipShare[] = [];

    floorStaff.forEach(s => {
      const score = s.hoursWorked * (s.pointsWeight || 1);
      const share = totalFloorScore > 0 ? (score / totalFloorScore) * totalFloor : 0;
      result.push({
        employee_id: s.id,
        employee_name: s.name,
        role: s.role,
        category: 'FLOOR',
        hours_worked: s.hoursWorked,
        points_weight: s.pointsWeight || 1,
        tip_amount_earned: Number(share.toFixed(2))
      });
    });

    kitchenStaff.forEach(s => {
      const score = s.hoursWorked * (s.pointsWeight || 1);
      const share = totalKitchenScore > 0 ? (score / totalKitchenScore) * totalKitchen : 0;
      result.push({
        employee_id: s.id,
        employee_name: s.name,
        role: s.role,
        category: 'KITCHEN',
        hours_worked: s.hoursWorked,
        points_weight: s.pointsWeight || 1,
        tip_amount_earned: Number(share.toFixed(2))
      });
    });

    return result;
  }

  public saveDistribution(record: Omit<TipsDistributionRecord, 'id' | 'created_at'>): TipsDistributionRecord {
    const newRecord: TipsDistributionRecord = {
      ...record,
      id: `tips_dist_${Date.now()}`,
      created_at: new Date().toISOString()
    };

    const records = this.getRecords();
    secureStorage.setItem(LOCAL_TIPS_KEY, [newRecord, ...records]);
    return newRecord;
  }
}

export const tipsPoolService = new TipsPoolService();
