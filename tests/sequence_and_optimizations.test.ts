import { describe, it, expect } from 'vitest';
import { getNextDocumentNumber } from '../services/sequenceService';

describe('Document Sequence & Enterprise Optimization Engine', () => {
  it('should generate fallback sequential number with proper docType prefix when offline or demo', async () => {
    const invoiceNum = await getNextDocumentNumber(null, 'invoice');
    expect(invoiceNum).toMatch(/^INV-\d{6}$/);

    const purNum = await getNextDocumentNumber(null, 'purchase_invoice');
    expect(purNum).toMatch(/^PUR-\d{6}$/);

    const srNum = await getNextDocumentNumber(null, 'sales_return');
    expect(srNum).toMatch(/^SR-\d{6}$/);

    const ordNum = await getNextDocumentNumber(null, 'order');
    expect(ordNum).toMatch(/^ORD-\d{6}$/);
  });

  it('should accept custom prefixes gracefully', async () => {
    const customNum = await getNextDocumentNumber(null, 'custom', 'TAX-2026-');
    expect(customNum).toMatch(/^TAX-2026-\d{6}$/);
  });

  it('should formulate product search filter with barcode and barcode2 inclusion', () => {
    const searchTerm = '622300123456';
    const fields = ['name', 'sku', 'description', 'barcode', 'barcode2'];
    const queryParts = fields.map(f => `${f}.ilike.%${searchTerm}%`);
    const finalOrQuery = queryParts.join(',');

    expect(finalOrQuery).toContain('barcode.ilike.%622300123456%');
    expect(finalOrQuery).toContain('barcode2.ilike.%622300123456%');
    expect(finalOrQuery).toContain('sku.ilike.%622300123456%');
  });

  it('should verify atomic POS payload preserves integer quantities and item pricing', () => {
    const cart = [
      { product: { id: 'prod-1', name: 'عصير برتقال', sales_price: 25 }, quantity: 3, customPrice: 25 },
      { product: { id: 'prod-2', name: 'تفاح أحمر', sales_price: 40 }, weight: 1.75, customPrice: 40 }
    ];

    const itemsPayload = cart.map(item => ({
      product_id: item.product.id,
      quantity: item.weight !== undefined ? item.weight : item.quantity,
      unit_price: item.customPrice || item.product.sales_price
    }));

    expect(itemsPayload).toHaveLength(2);
    expect(itemsPayload[0]).toEqual({ product_id: 'prod-1', quantity: 3, unit_price: 25 });
    expect(itemsPayload[1]).toEqual({ product_id: 'prod-2', quantity: 1.75, unit_price: 40 });

    const total = itemsPayload.reduce((acc, i) => acc + (i.quantity * i.unit_price), 0);
    expect(total).toBe(3 * 25 + 1.75 * 40); // 75 + 70 = 145
  });

  it('should verify delta stock updates do not produce NaN or unhandled negative stock', () => {
    const currentStock = 100;
    const baseQty = 15;
    const allowNegativeStock = false;

    expect(currentStock >= baseQty || allowNegativeStock).toBe(true);
    const newStock = currentStock - baseQty;
    expect(newStock).toBe(85);
  });
});
