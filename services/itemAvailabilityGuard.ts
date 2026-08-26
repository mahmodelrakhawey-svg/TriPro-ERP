/**
 * ==============================================================================
 * Item Availability & Auto 86ing Guard
 * TriPro ERP — services/itemAvailabilityGuard.ts
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { secureStorage } from '../utils/securityMiddleware';

export interface PortionAvailabilityResult {
  productId: string;
  productName: string;
  isAvailable: boolean;
  is86: boolean;
  maxPortionsAvailable: number;
  criticalRawMaterialName?: string;
  criticalRawMaterialStock?: number;
}

const LOCAL_MANUAL_86_KEY = 'tripro_manual_86_products_v1';

class ItemAvailabilityGuard {
  /**
   * حساب عدد الأطباق المتبقية التي يمكن إعدادها بناءً على رصيد الخامات في الـ Recipe
   */
  public calculateMaxPortions(
    productId: string,
    bomIngredients: Array<{ raw_material_id: string; quantity_required: number; raw_material_name?: string }>,
    productsMap: Record<string, { stock?: number; warehouse_stock?: any; name?: string }>,
    warehouseId?: string
  ): PortionAvailabilityResult {
    const manual86List = this.getManual86List();
    if (manual86List.includes(productId)) {
      return {
        productId,
        productName: productsMap[productId]?.name || 'الصنف',
        isAvailable: false,
        is86: true,
        maxPortionsAvailable: 0
      };
    }

    if (!bomIngredients || bomIngredients.length === 0) {
      // إذا لم يكن للصنف وصفة مكونات، يعتمد على رصيده المباشر إن كان صنف مخزني
      const p = productsMap[productId];
      let directStock = 999;
      if (p) {
        if (warehouseId && p.warehouse_stock && p.warehouse_stock[warehouseId] !== undefined) {
          directStock = Number(p.warehouse_stock[warehouseId]);
        } else if (p.stock !== undefined) {
          directStock = Number(p.stock);
        }
      }

      const isAvail = directStock > 0;
      return {
        productId,
        productName: p?.name || 'الصنف',
        isAvailable: isAvail,
        is86: !isAvail,
        maxPortionsAvailable: directStock
      };
    }

    let minPortions = 999999;
    let criticalMaterial = '';
    let criticalStock = 0;

    for (const ing of bomIngredients) {
      const rawProd = productsMap[ing.raw_material_id];
      if (!rawProd) continue;

      let rawStock = 0;
      if (warehouseId && rawProd.warehouse_stock && rawProd.warehouse_stock[warehouseId] !== undefined) {
        rawStock = Number(rawProd.warehouse_stock[warehouseId]);
      } else {
        rawStock = Number(rawProd.stock || 0);
      }

      const req = Number(ing.quantity_required || 0);
      if (req > 0) {
        const possiblePortions = Math.floor(rawStock / req);
        if (possiblePortions < minPortions) {
          minPortions = Math.max(0, possiblePortions);
          criticalMaterial = ing.raw_material_name || rawProd.name || 'مادة خام';
          criticalStock = rawStock;
        }
      }
    }

    const isAvailable = minPortions > 0;

    return {
      productId,
      productName: productsMap[productId]?.name || 'الصنف',
      isAvailable,
      is86: !isAvailable,
      maxPortionsAvailable: minPortions === 999999 ? 100 : minPortions,
      criticalRawMaterialName: criticalMaterial,
      criticalRawMaterialStock: criticalStock
    };
  }

  public getManual86List(): string[] {
    const list = secureStorage.getItem<string[]>(LOCAL_MANUAL_86_KEY);
    return Array.isArray(list) ? list : [];
  }

  public setManual86(productId: string, is86: boolean): void {
    const list = this.getManual86List();
    const updated = is86 ? Array.from(new Set([...list, productId])) : list.filter(id => id !== productId);
    secureStorage.setItem(LOCAL_MANUAL_86_KEY, updated);

    // Update in Supabase if column exists
    supabase.from('products').update({ is_86: is86 }).eq('id', productId).then();
  }
}

export const itemAvailabilityGuard = new ItemAvailabilityGuard();
