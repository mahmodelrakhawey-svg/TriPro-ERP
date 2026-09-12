import { describe, it, expect } from 'vitest';

export interface UOMDefinition {
  id: string;
  name: string;
  code: string;
  conversionFactor: number; // Factor to convert this UOM into Base UOM (e.g. 1 Carton = 24 Pieces, factor = 24)
}

export function convertQuantityToBaseUOM(
  quantity: number,
  uom: UOMDefinition
): number {
  const factor = Number(uom.conversionFactor || 1);
  return Math.round((quantity * factor) * 10000) / 10000;
}

export function convertBaseQuantityToUOM(
  baseQuantity: number,
  uom: UOMDefinition
): number {
  const factor = Number(uom.conversionFactor || 1);
  if (factor === 0) return 0;
  return Math.round((baseQuantity / factor) * 10000) / 10000;
}

export function calculateUnitCostInUOM(
  baseCost: number,
  uom: UOMDefinition
): number {
  const factor = Number(uom.conversionFactor || 1);
  return Math.round((baseCost * factor) * 100) / 100;
}

describe('Multi-Unit of Measure (UOM) Conversion & Inventory Accuracy', () => {
  const pieceUOM: UOMDefinition = { id: 'uom-pc', name: 'قطعة', code: 'EA', conversionFactor: 1 };
  const packUOM: UOMDefinition = { id: 'uom-pack', name: 'باكت', code: 'PK', conversionFactor: 6 };
  const cartonUOM: UOMDefinition = { id: 'uom-ctn', name: 'كرتونة', code: 'CTN', conversionFactor: 24 };
  const kgUOM: UOMDefinition = { id: 'uom-kg', name: 'كيلوجرام', code: 'KGM', conversionFactor: 1 };
  const tonUOM: UOMDefinition = { id: 'uom-ton', name: 'طن', code: 'TNE', conversionFactor: 1000 };

  it('يجب تحويل بيع 5 كراتين إلى 120 قطعة في المخزون الأساسي', () => {
    const qtySoldInCartons = 5;
    const baseQtyDeducted = convertQuantityToBaseUOM(qtySoldInCartons, cartonUOM);
    expect(baseQtyDeducted).toBe(120); // 5 * 24
  });

  it('يجب تحويل رصيد مخزن بالقطع إلى كراتين بدقة', () => {
    const stockInPieces = 240;
    const stockInCartons = convertBaseQuantityToUOM(stockInPieces, cartonUOM);
    expect(stockInCartons).toBe(10); // 240 / 24
  });

  it('يجب تحويل تكلفة القطعة (10 ج.م) إلى تكلفة كرتونة (240 ج.م)', () => {
    const pieceCost = 10;
    const cartonCost = calculateUnitCostInUOM(pieceCost, cartonUOM);
    expect(cartonCost).toBe(240); // 10 * 24
  });

  it('يجب تحويل شراء نصف طن دقيق إلى 500 كجم في مستودع الخامات', () => {
    const purchasedTons = 0.5;
    const baseKg = convertQuantityToBaseUOM(purchasedTons, tonUOM);
    expect(baseKg).toBe(500); // 0.5 * 1000
  });

  it('يجب التعامل مع الأجزاء العشرية في وحدات الوزن بدقة (2.350 كجم)', () => {
    const qtyKg = 2.350;
    const baseGrams = convertQuantityToBaseUOM(qtyKg, { id: 'kg', name: 'كجم', code: 'KG', conversionFactor: 1000 });
    expect(baseGrams).toBe(2350);
  });
});
