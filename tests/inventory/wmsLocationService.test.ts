import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WmsLocationService } from '../../services/wmsLocationService';

// Mock Supabase to cleanly simulate offline/empty database response
vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          order: () => Promise.resolve({ data: [], error: null })
        }),
        in: () => Promise.resolve({ data: [], error: null }),
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null })
          })
        })
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'Fallback to local' } })
        })
      }),
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null })
      }),
      delete: () => ({
        eq: () => Promise.resolve({ data: null, error: null })
      })
    })
  }
}));

describe('🏭 WmsLocationService (إدارة مستودعات WMS والمناطق والرفوف ونسب الإشغال)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('sanitizeUuid & generateUuid', () => {
    it('يجب تنقية UUID والتحقق من صحته بدقة واستبعاد المعرفات الصفرية والتالفة', () => {
      expect(WmsLocationService.sanitizeUuid(null)).toBeNull();
      expect(WmsLocationService.sanitizeUuid('')).toBeNull();
      expect(WmsLocationService.sanitizeUuid('   ')).toBeNull();
      expect(WmsLocationService.sanitizeUuid('00000000-0000-0000-0000-000000000000')).toBeNull();
      expect(WmsLocationService.sanitizeUuid('invalid-uuid-string')).toBeNull();

      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(WmsLocationService.sanitizeUuid(validUuid)).toBe(validUuid);
      expect(WmsLocationService.sanitizeUuid(`  ${validUuid}  `)).toBe(validUuid);
    });

    it('يجب توليد UUID مطابق للمعيار العالمي RFC4122 بطول 36 حرفاً', () => {
      const generated = WmsLocationService.generateUuid();
      expect(generated).toHaveLength(36);
      expect(WmsLocationService.sanitizeUuid(generated)).toBe(generated);
    });
  });

  describe('Local Fallback & Bin Occupancy (الصمود المحلي واحتساب الإشغال)', () => {
    it('يجب أن يعمل بنجاح محلياً عبر SecureStorage عند تعذر الاتصال بالسيرفر', async () => {
      const orgId = '550e8400-e29b-41d4-a716-446655440000';
      const whId = '660e8400-e29b-41d4-a716-446655440001';

      // إنشاء موقع تخزيني جديد محلياً
      const createRes = await WmsLocationService.createBin(
        {
          bin_code: 'Z-A-01',
          zone_name: 'منطقة المبردات',
          aisle: 'A',
          rack: '01',
          shelf: '1',
          max_capacity_qty: 200,
          warehouse_id: whId
        },
        orgId
      );

      expect(createRes.success).toBe(true);
      expect(createRes.data?.bin_code).toBe('Z-A-01');

      // استرجاع المواقع التخزينية
      const bins = await WmsLocationService.getBinsByWarehouse(orgId, whId);
      expect(bins).toHaveLength(1);
      expect(bins[0].bin_code).toBe('Z-A-01');
      expect(bins[0].occupancy_pct).toBe(0);
    });

    it('يجب احتساب نسبة الإشغال بدقة (occupancy_pct) عند تسكين وصرف الأصناف', async () => {
      const orgId = '550e8400-e29b-41d4-a716-446655440000';
      const whId = '660e8400-e29b-41d4-a716-446655440001';
      const prodId = '880e8400-e29b-41d4-a716-446655440002';

      const createRes = await WmsLocationService.createBin(
        {
          bin_code: 'Z-B-02',
          zone_name: 'الجاف',
          max_capacity_qty: 100,
          warehouse_id: whId
        },
        orgId
      );

      const binId = createRes.data!.id;

      // تسكين 40 كرتونة في الرف (Putaway Allocation)
      await WmsLocationService.allocateStockToBin(
        orgId,
        whId,
        binId,
        prodId,
        'دقيق فاخر 25 كجم',
        40
      );

      const binsAfterAlloc = await WmsLocationService.getBinsByWarehouse(orgId, whId);
      const targetBin = binsAfterAlloc.find(b => b.id === binId);

      expect(targetBin?.current_qty).toBe(40);
      expect(targetBin?.occupancy_pct).toBe(40); // 40 / 100 = 40%

      // صرف 10 كراتين (Deallocation)
      await WmsLocationService.deallocateStockFromBin(binId, prodId, 10);

      const binsAfterRelease = await WmsLocationService.getBinsByWarehouse(orgId, whId);
      const binReleased = binsAfterRelease.find(b => b.id === binId);
      expect(binReleased?.current_qty).toBe(30);
      expect(binReleased?.occupancy_pct).toBe(30);
    });

    it('يجب تعديل وحذف المواقع التخزينية وتطهير سجلاتها المحلية بنجاح', async () => {
      const orgId = '550e8400-e29b-41d4-a716-446655440000';
      const whId = '660e8400-e29b-41d4-a716-446655440001';

      const createRes = await WmsLocationService.createBin(
        { bin_code: 'BIN-TEMP', max_capacity_qty: 50, warehouse_id: whId },
        orgId
      );
      const tempId = createRes.data!.id;

      // تعديل
      await WmsLocationService.updateBin(tempId, { bin_code: 'BIN-RENAMED' });
      let bins = await WmsLocationService.getBinsByWarehouse(orgId, whId);
      expect(bins.find(b => b.id === tempId)?.bin_code).toBe('BIN-RENAMED');

      // حذف
      await WmsLocationService.deleteBin(tempId);
      bins = await WmsLocationService.getBinsByWarehouse(orgId, whId);
      expect(bins.find(b => b.id === tempId)).toBeUndefined();
    });
  });
});
