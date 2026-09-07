/**
 * TriPro ERP — POS Product & Barcode Resolver Service
 * خدمة معزولة لمسح وفك تشفير الباركودات والموازين وتحديد المنتجات والوحدات
 */
import { db } from '../../../services/offlineService';
import type { CachedProduct } from '../../../services/offlineService';
import { supabase } from '../../../supabaseClient';

export interface ScannedUomInfo {
  uom_name?: string;
  customPrice?: number;
  uom_id?: string;
}

export interface ResolvedScannedProduct {
  matchedProduct?: CachedProduct;
  matchedUomInfo?: ScannedUomInfo;
  weight?: number;
  multiplier: number;
  cleanCode: string;
}

/**
 * فك تشفير باركود الميزان المتغير (Embedded Weight Barcode)
 * البنية: PP CCCCC WWWWW X (البادئة 2 رقم، كود الصنف 5 أرقام، الوزن 5 أرقام، رقم التحقق 1)
 */
export function parseWeightBarcode(barcode: string): { productCode: string; weight: number } | null {
  if (barcode.length === 13) {
    const prefix = barcode.substring(0, 2);
    const validPrefixes = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '99'];
    if (validPrefixes.includes(prefix)) {
      const productCode = barcode.substring(2, 7);
      const weightString = barcode.substring(7, 12);
      const weight = Number(weightString) / 1000; // e.g. 01250 -> 1.250 kg
      return { productCode, weight };
    }
  }
  return null;
}

/**
 * استخراج الكمية المضاعفة من الباركود (مثل: 5*12345 أو 3x12345)
 */
export function parseBarcodeMultiplier(rawCode: string): { code: string; multiplier: number } {
  let multiplier = 1;
  let code = rawCode.trim();

  if (code.includes('*')) {
    const parts = code.split('*');
    if (parts.length === 2 && !isNaN(Number(parts[0])) && Number(parts[0]) > 0) {
      multiplier = Math.round(Number(parts[0]));
      code = parts[1].trim();
    }
  } else if (code.toLowerCase().includes('x')) {
    const parts = code.toLowerCase().split('x');
    if (parts.length === 2 && !isNaN(Number(parts[0])) && Number(parts[0]) > 0) {
      multiplier = Math.round(Number(parts[0]));
      code = parts[1].trim();
    }
  }

  return { code, multiplier };
}

/**
 * البحث الذكي عن الصنف بالباركود (الميزان، العادي، البديل، أو باركودات الوحدات)
 * محلياً عبر Dexie أولاً، ثم سحابياً عبر Supabase
 */
export async function resolveScannedBarcode(
  rawCode: string,
  organizationId?: string
): Promise<ResolvedScannedProduct> {
  const { code, multiplier } = parseBarcodeMultiplier(rawCode);
  if (!code) {
    return { multiplier: 1, cleanCode: '' };
  }

  let matchedProduct: CachedProduct | undefined;
  let matchedUomInfo: ScannedUomInfo | undefined;
  let weight: number | undefined;

  // 1. فحص باركود الميزان
  const weightParse = parseWeightBarcode(code);
  if (weightParse) {
    const { productCode, weight: parsedWeight } = weightParse;
    const numericPlu = parseInt(productCode, 10);

    // البحث في كاش Dexie المحلي
    const allCached = await db.products.toArray();
    matchedProduct = allCached.find(p =>
      (p.plu_number && p.plu_number === numericPlu) ||
      p.barcode === productCode ||
      p.sku === productCode ||
      p.sku === String(numericPlu) ||
      p.barcode2 === productCode
    );

    // Fallback أونلاين
    if (!matchedProduct && organizationId) {
      const { data: onlineList } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .or(`plu_number.eq.${numericPlu},barcode.eq.${productCode},sku.eq.${productCode},sku.eq.${numericPlu},barcode2.eq.${productCode}`);
      if (onlineList && onlineList.length > 0) {
        matchedProduct = onlineList[0] as any;
        try { await db.products.put(matchedProduct as any); } catch (e) {}
      }
    }
    weight = parsedWeight;
  } else {
    // 2. البحث بالباركود العادي أو SKU أو barcode2
    const cleanCode = code.trim().toLowerCase();
    const allCached = await db.products.toArray();

    // 2a. تطابق مباشر في الكاش المحلي
    matchedProduct = allCached.find(p =>
      (p.barcode && p.barcode.trim().toLowerCase() === cleanCode) ||
      (p.sku && p.sku.trim().toLowerCase() === cleanCode) ||
      (p.barcode2 && p.barcode2.trim().toLowerCase() === cleanCode)
    );

    // 2b. البحث في باركودات الوحدات المتعددة (unit_barcodes) محلياً
    if (!matchedProduct) {
      for (const p of allCached) {
        if (Array.isArray((p as any).unit_barcodes)) {
          const foundUom = (p as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === cleanCode);
          if (foundUom) {
            matchedProduct = p;
            matchedUomInfo = {
              uom_name: foundUom.uom_name,
              customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : p.sales_price,
              uom_id: foundUom.uom_id
            };
            break;
          }
        }
      }
    } else if (Array.isArray((matchedProduct as any).unit_barcodes)) {
      const foundUom = (matchedProduct as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === cleanCode);
      if (foundUom) {
        matchedUomInfo = {
          uom_name: foundUom.uom_name,
          customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : matchedProduct.sales_price,
          uom_id: foundUom.uom_id
        };
      }
    }

    // 2c. Fallback أونلاين في Supabase
    if (!matchedProduct && organizationId) {
      const { data: onlineList } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .or(`barcode.ilike.${cleanCode},sku.ilike.${cleanCode},barcode2.ilike.${cleanCode}`);

      if (onlineList && onlineList.length > 0) {
        matchedProduct = onlineList[0] as any;
        try { await db.products.put(matchedProduct as any); } catch (e) {}
      } else {
        // البحث في unit_barcodes أونلاين
        const { data: allOnline } = await supabase
          .from('products')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .not('unit_barcodes', 'is', null);

        if (allOnline && allOnline.length > 0) {
          for (const p of allOnline) {
            if (Array.isArray(p.unit_barcodes)) {
              const foundUom = p.unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === cleanCode);
              if (foundUom) {
                matchedProduct = p as any;
                matchedUomInfo = {
                  uom_name: foundUom.uom_name,
                  customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : p.sales_price,
                  uom_id: foundUom.uom_id
                };
                try { await db.products.put(matchedProduct as any); } catch (e) {}
                break;
              }
            }
          }
        }
      }
    }
  }

  return {
    matchedProduct,
    matchedUomInfo,
    weight,
    multiplier,
    cleanCode: code
  };
}
