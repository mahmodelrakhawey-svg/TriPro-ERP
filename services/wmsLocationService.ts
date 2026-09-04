/**
 * ==============================================================================
 * TriPro ERP — Warehouse Management System (WMS) Location & Bin Service
 * services/wmsLocationService.ts
 * ==============================================================================
 * إدارة المناطق، الممرات، الرفوف، الخانات (Zones, Aisles, Racks, Shelves, Bins)،
 * وتسكين وسحب الأصناف مع احتساب نسب الإشغال والباركود.
 * مزود بطبقة صمود وسقوط محلي تلقائي (Local Fallback Resilience).
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { WarehouseBin, BinStockAllocation, BinType } from '../types';
import { secureStorage } from '../utils/securityMiddleware';

const STORAGE_KEYS = {
  BINS: 'tripro_wms_bins_v1',
  ALLOCATIONS: 'tripro_wms_allocations_v1',
};

export class WmsLocationService {
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
  // Local Fallback Storage Helpers
  // ---------------------------------------------------------------------------
  private static getLocalBins(orgId?: string, warehouseId?: string): WarehouseBin[] {
    try {
      let all: WarehouseBin[] = secureStorage.getItem<WarehouseBin[]>(STORAGE_KEYS.BINS) || [];
      if (orgId) all = all.filter(b => b.organization_id === orgId);
      if (warehouseId) all = all.filter(b => b.warehouse_id === warehouseId);
      return all;
    } catch {
      return [];
    }
  }

  private static saveLocalBins(bins: WarehouseBin[]): void {
    try {
      secureStorage.setItem(STORAGE_KEYS.BINS, bins);
    } catch (e) {
      console.warn('Local save error:', e);
    }
  }

  private static getLocalAllocations(binId?: string, productId?: string): BinStockAllocation[] {
    try {
      let all: BinStockAllocation[] = secureStorage.getItem<BinStockAllocation[]>(STORAGE_KEYS.ALLOCATIONS) || [];
      if (binId) all = all.filter(a => a.bin_id === binId);
      if (productId) all = all.filter(a => a.product_id === productId);
      return all;
    } catch {
      return [];
    }
  }

  private static saveLocalAllocations(allocs: BinStockAllocation[]): void {
    try {
      secureStorage.setItem(STORAGE_KEYS.ALLOCATIONS, allocs);
    } catch (e) {
      console.warn('Local save error:', e);
    }
  }

  /**
   * جلب جميع المواقع التخزينية لمستودع معين
   */
  static async getBinsByWarehouse(orgId: string, warehouseId?: string): Promise<WarehouseBin[]> {
    const validOrgId = this.sanitizeUuid(orgId);
    const validWhId = this.sanitizeUuid(warehouseId);

    try {
      let query = supabase
        .from('warehouse_bins')
        .select('*')
        .order('zone_name', { ascending: true })
        .order('bin_code', { ascending: true });

      if (validOrgId) query = query.eq('organization_id', validOrgId);
      if (validWhId) query = query.eq('warehouse_id', validWhId);

      const { data: bins, error } = await query;
      if (error) throw error;

      if (!bins || bins.length === 0) {
        return this.getLocalBins(orgId, warehouseId);
      }

      // جلب الكميات المسكنة لكل موقع
      const binIds = bins.map(b => b.id);
      let allocationsMap: Record<string, BinStockAllocation[]> = {};

      if (binIds.length > 0) {
        try {
          const { data: allocs } = await supabase
            .from('bin_stock_allocations')
            .select('*')
            .in('bin_id', binIds);

          if (allocs) {
            allocs.forEach((a: any) => {
              if (!allocationsMap[a.bin_id]) allocationsMap[a.bin_id] = [];
              allocationsMap[a.bin_id].push(a);
            });
          }
        } catch {}
      }

      return bins.map(b => {
        const items = allocationsMap[b.id] || [];
        const currentQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
        const maxCap = Number(b.max_capacity_qty) || 1000;
        const occupancyPct = Math.min(100, Math.round((currentQty / maxCap) * 100));

        return {
          ...b,
          allocated_items: items,
          current_qty: currentQty,
          occupancy_pct: occupancyPct,
        };
      });
    } catch {
      const localBins = this.getLocalBins(orgId, warehouseId);
      return localBins.map(b => {
        const items = this.getLocalAllocations(b.id);
        const currentQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
        const maxCap = Number(b.max_capacity_qty) || 1000;
        const occupancyPct = Math.min(100, Math.round((currentQty / maxCap) * 100));
        return {
          ...b,
          allocated_items: items,
          current_qty: currentQty,
          occupancy_pct: occupancyPct,
        };
      });
    }
  }

  /**
   * إنشاء موقع تخزيني / رف جديد
   */
  static async createBin(data: Partial<WarehouseBin>, orgId: string): Promise<{ success: boolean; data?: WarehouseBin; error?: string }> {
    const validOrgId = this.sanitizeUuid(orgId) || this.generateUuid();
    const validWhId = this.sanitizeUuid(data.warehouse_id) || this.generateUuid();
    const generatedId = this.generateUuid();

    // توليد رمز موقع تخزيني قياسي إذا لم يتم إدخاله
    const zone = data.zone_name || 'Zone A';
    const aisle = data.aisle || 'A1';
    const rack = data.rack || 'R1';
    const shelf = data.shelf || 'S1';
    const binNum = data.bin_number || `B${Math.floor(1 + Math.random() * 999)}`;
    const binCode = data.bin_code || `${zone.replace(/\s+/g, '')}-${aisle}-${rack}-${shelf}-${binNum}`.toUpperCase();
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const barcode = data.barcode?.trim() || `BIN-${validWhId.slice(0, 4).toUpperCase()}-${binCode}-${randomSuffix}`;

    const cleanDbPayload = {
      organization_id: validOrgId,
      warehouse_id: validWhId,
      bin_code: binCode,
      bin_name: data.bin_name || `رف ${zone} - ${aisle}/${rack}`,
      barcode,
      zone_name: zone,
      aisle,
      rack,
      shelf,
      bin_number: binNum,
      bin_type: (data.bin_type as BinType) || 'storage',
      max_capacity_qty: Number(data.max_capacity_qty) || 1000,
      max_weight_kg: Number(data.max_weight_kg) || 500,
      is_active: data.is_active ?? true,
      notes: data.notes || '',
    };

    const localRecord: WarehouseBin = {
      id: generatedId,
      ...cleanDbPayload,
      warehouse_name: data.warehouse_name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      allocated_items: [],
      current_qty: 0,
      occupancy_pct: 0,
    };

    try {
      const { data: created, error } = await supabase
        .from('warehouse_bins')
        .insert(cleanDbPayload)
        .select()
        .single();

      if (error) throw error;

      const existing = this.getLocalBins('');
      localRecord.id = created.id;
      this.saveLocalBins([localRecord, ...existing]);

      return { success: true, data: { ...created, allocated_items: [], current_qty: 0, occupancy_pct: 0 } };
    } catch {
      const existing = this.getLocalBins('');
      this.saveLocalBins([localRecord, ...existing]);
      return { success: true, data: localRecord };
    }
  }

  /**
   * تعديل بيانات موقع تخزيني
   */
  static async updateBin(id: string, data: Partial<WarehouseBin>): Promise<{ success: boolean; error?: string }> {
    const validId = this.sanitizeUuid(id);

    const cleanPayload: any = {
      updated_at: new Date().toISOString(),
    };
    if (data.bin_code !== undefined) cleanPayload.bin_code = data.bin_code;
    if (data.bin_name !== undefined) cleanPayload.bin_name = data.bin_name;
    if (data.barcode !== undefined) cleanPayload.barcode = data.barcode;
    if (data.zone_name !== undefined) cleanPayload.zone_name = data.zone_name;
    if (data.aisle !== undefined) cleanPayload.aisle = data.aisle;
    if (data.rack !== undefined) cleanPayload.rack = data.rack;
    if (data.shelf !== undefined) cleanPayload.shelf = data.shelf;
    if (data.bin_number !== undefined) cleanPayload.bin_number = data.bin_number;
    if (data.bin_type !== undefined) cleanPayload.bin_type = data.bin_type;
    if (data.max_capacity_qty !== undefined) cleanPayload.max_capacity_qty = data.max_capacity_qty;
    if (data.max_weight_kg !== undefined) cleanPayload.max_weight_kg = data.max_weight_kg;
    if (data.is_active !== undefined) cleanPayload.is_active = data.is_active;
    if (data.notes !== undefined) cleanPayload.notes = data.notes;

    try {
      if (validId) {
        await supabase.from('warehouse_bins').update(cleanPayload).eq('id', validId);
      }
    } catch {}

    const localBins = this.getLocalBins('');
    const idx = localBins.findIndex(b => b.id === id);
    if (idx !== -1) {
      localBins[idx] = { ...localBins[idx], ...cleanPayload };
      this.saveLocalBins(localBins);
    }

    return { success: true };
  }

  /**
   * حذف موقع تخزيني
   */
  static async deleteBin(id: string): Promise<{ success: boolean; error?: string }> {
    const validId = this.sanitizeUuid(id);
    try {
      if (validId) {
        await supabase.from('warehouse_bins').delete().eq('id', validId);
      }
    } catch {}

    const localBins = this.getLocalBins('').filter(b => b.id !== id);
    this.saveLocalBins(localBins);

    const localAllocs = this.getLocalAllocations().filter(a => a.bin_id !== id);
    this.saveLocalAllocations(localAllocs);

    return { success: true };
  }

  /**
   * تسكين كمية صنف في موقع تخزيني (Put-away Allocation)
   */
  static async allocateStockToBin(
    orgId: string,
    warehouseId: string,
    binId: string,
    productId: string,
    productName: string,
    quantity: number,
    batchNumber?: string,
    expiryDate?: string
  ): Promise<{ success: boolean; error?: string }> {
    const validOrgId = this.sanitizeUuid(orgId) || this.generateUuid();
    const validWhId = this.sanitizeUuid(warehouseId) || this.generateUuid();
    const validBinId = this.sanitizeUuid(binId);
    const validProdId = this.sanitizeUuid(productId) || this.generateUuid();
    const qty = Number(quantity) || 0;

    const allocPayload = {
      organization_id: validOrgId,
      warehouse_id: validWhId,
      bin_id: validBinId || binId,
      product_id: validProdId,
      quantity: qty,
      batch_number: batchNumber || null,
      expiry_date: expiryDate || null,
      last_putaway_at: new Date().toISOString(),
    };

    try {
      if (validBinId) {
        // التحقق مما إذا كان الصنف موجوداً في هذا الموقع من قبل
        const { data: existing } = await supabase
          .from('bin_stock_allocations')
          .select('id, quantity')
          .eq('bin_id', validBinId)
          .eq('product_id', validProdId)
          .maybeSingle();

        if (existing) {
          const newQty = (Number(existing.quantity) || 0) + qty;
          await supabase
            .from('bin_stock_allocations')
            .update({ quantity: newQty, last_putaway_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase.from('bin_stock_allocations').insert(allocPayload);
        }
      }
    } catch {}

    // تحديث محلي
    const localAllocs = this.getLocalAllocations();
    const existingLocal = localAllocs.find(a => a.bin_id === binId && a.product_id === productId);
    if (existingLocal) {
      existingLocal.quantity = (Number(existingLocal.quantity) || 0) + qty;
      existingLocal.last_putaway_at = new Date().toISOString();
      this.saveLocalAllocations(localAllocs);
    } else {
      const newLocalAlloc: BinStockAllocation = {
        id: this.generateUuid(),
        ...allocPayload,
        product_name: productName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.saveLocalAllocations([newLocalAlloc, ...localAllocs]);
    }

    return { success: true };
  }

  /**
   * سحب / صرف كمية صنف من موقع تخزيني (Picking / Deallocation)
   */
  static async deallocateStockFromBin(
    binId: string,
    productId: string,
    quantity: number
  ): Promise<{ success: boolean; error?: string }> {
    const validBinId = this.sanitizeUuid(binId);
    const validProdId = this.sanitizeUuid(productId);
    const qtyToDeduct = Number(quantity) || 0;

    try {
      if (validBinId && validProdId) {
        const { data: existing } = await supabase
          .from('bin_stock_allocations')
          .select('id, quantity')
          .eq('bin_id', validBinId)
          .eq('product_id', validProdId)
          .maybeSingle();

        if (existing) {
          const currentQty = Number(existing.quantity) || 0;
          const remainingQty = Math.max(0, currentQty - qtyToDeduct);
          if (remainingQty === 0) {
            await supabase.from('bin_stock_allocations').delete().eq('id', existing.id);
          } else {
            await supabase
              .from('bin_stock_allocations')
              .update({ quantity: remainingQty, last_picked_at: new Date().toISOString() })
              .eq('id', existing.id);
          }
        }
      }
    } catch {}

    const localAllocs = this.getLocalAllocations();
    const existingLocalIdx = localAllocs.findIndex(a => a.bin_id === binId && a.product_id === productId);
    if (existingLocalIdx !== -1) {
      const rem = Math.max(0, (Number(localAllocs[existingLocalIdx].quantity) || 0) - qtyToDeduct);
      if (rem === 0) {
        localAllocs.splice(existingLocalIdx, 1);
      } else {
        localAllocs[existingLocalIdx].quantity = rem;
        localAllocs[existingLocalIdx].last_picked_at = new Date().toISOString();
      }
      this.saveLocalAllocations(localAllocs);
    }

    return { success: true };
  }

  /**
   * توليد باركود قياسي للموقع التخزيني
   */
  static generateBinBarcode(binCode: string): string {
    return `BIN-${binCode.toUpperCase().replace(/[^A-Z0-9-]/g, '')}`;
  }

  /**
   * ترجمة نوع الموقع التخزيني
   */
  static getBinTypeArabic(type: BinType): string {
    switch (type) {
      case 'storage': return 'تخزين عام';
      case 'cold_storage': return 'تبريد / ثلاجة';
      case 'fast_moving': return 'سريع الحركة (Picking Zone)';
      case 'receiving': return 'منطقة الاستقبال والفحص';
      case 'shipping': return 'منطقة التحميل والشحن';
      case 'quarantine': return 'حجر صحي / فحص جودة';
      default: return type;
    }
  }
}

export default WmsLocationService;
