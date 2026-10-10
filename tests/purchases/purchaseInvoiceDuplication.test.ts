import { describe, it, expect } from 'vitest';

export interface PurchaseInvoiceRecord {
  id: string;
  invoice_number: string;
  invoice_date: string;
  supplier_id: string;
  warehouse_id: string;
  status: 'draft' | 'posted' | 'paid';
  total_amount: number;
  paid_amount: number;
  treasury_account_id?: string | null;
  currency: string;
  exchange_rate: number;
  notes?: string | null;
  discount_type?: 'fixed' | 'percentage';
  discount_value?: number;
  attachments?: any[];
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    discount: number;
    uom_id?: string;
    batch_number?: string;
  }>;
}

/**
 * دالة منطق تكرار واستنساخ فاتورة المشتريات
 */
export function clonePurchaseInvoiceForNewDraft(
  sourceInvoice: PurchaseInvoiceRecord,
  currentDate: string = new Date().toISOString().split('T')[0]
) {
  const originalNumber = sourceInvoice.invoice_number || 'غير محدد';

  const newFormData = {
    supplierId: sourceInvoice.supplier_id || '',
    invoiceNumber: '', // تفريغ رقم الفاتورة ليتم إدخال رقم الفاتورة الجديد أو التوليد التلقائي
    date: currentDate,
    notes: sourceInvoice.notes 
      ? `${sourceInvoice.notes} (مكررة من الفاتورة: ${originalNumber})` 
      : `مكررة من الفاتورة: ${originalNumber}`,
    status: 'draft' as const, // مسودة جديدة حتماً
    currency: sourceInvoice.currency || 'EGP',
    exchangeRate: sourceInvoice.exchange_rate || 1,
    warehouseId: sourceInvoice.warehouse_id || '',
    paidAmount: 0, // تصفير المسدد للفاتورة الجديدة
    treasuryAccountId: '',
    discountType: sourceInvoice.discount_type || 'fixed',
    discountValue: Number(sourceInvoice.discount_value) || 0,
  };

  const clonedItems = (sourceInvoice.items || []).map((item, idx) => ({
    id: `dup-${Date.now()}-${idx}`,
    productId: item.product_id,
    productName: item.product_name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    discount: item.discount,
    uomId: item.uom_id || '',
    batchNumber: '', // تفريغ رقم الباتش للشحنة الجديدة
  }));

  return {
    editingId: null, // تأكيد أنها فاتورة جديدة وليست تعديلاً
    formData: newFormData,
    items: clonedItems,
    attachments: [], // تفريغ المرفقات السابقة
  };
}

describe('📋 Purchase Invoice Duplication Engine (ميزة تكرار فاتورة المشتريات)', () => {
  it('يجب استنساخ فاتورة مرحلة أو مسددة وتحويلها إلى مسودة جديدة برقم فارغ وتاريخ اليوم', () => {
    const originalInvoice: PurchaseInvoiceRecord = {
      id: 'inv-uuid-12345',
      invoice_number: 'PINV-2026-0099',
      invoice_date: '2026-08-15',
      supplier_id: 'sup-uuid-777',
      warehouse_id: 'wh-uuid-1',
      status: 'paid',
      total_amount: 5500,
      paid_amount: 5500,
      treasury_account_id: 'acc-treasury-main',
      currency: 'EGP',
      exchange_rate: 1,
      notes: 'توريد مواد خام عاجل',
      discount_type: 'percentage',
      discount_value: 5,
      attachments: [{ id: 'att-1', file_name: 'receipt.pdf' }],
      items: [
        {
          id: 'item-row-1',
          product_id: 'prod-flour',
          product_name: 'دقيق فاخر',
          quantity: 50,
          unit_price: 100,
          discount: 0,
          uom_id: 'uom-kg',
          batch_number: 'BATCH-2026-OLD'
        },
        {
          id: 'item-row-2',
          product_id: 'prod-sugar',
          product_name: 'سكر أبيض',
          quantity: 10,
          unit_price: 50,
          discount: 25,
          uom_id: 'uom-kg',
          batch_number: 'BATCH-SUGAR-OLD'
        }
      ]
    };

    const result = clonePurchaseInvoiceForNewDraft(originalInvoice, '2026-10-10');

    // 1. الفاتورة يجب أن تكون جديدة ومسودة
    expect(result.editingId).toBeNull();
    expect(result.formData.status).toBe('draft');
    expect(result.formData.invoiceNumber).toBe('');
    expect(result.formData.date).toBe('2026-10-10');

    // 2. تصفير السداد والمرفقات القديمة
    expect(result.formData.paidAmount).toBe(0);
    expect(result.formData.treasuryAccountId).toBe('');
    expect(result.attachments).toHaveLength(0);

    // 3. الاحتفاظ بالمورد والمستودع والخصومات والعملة
    expect(result.formData.supplierId).toBe('sup-uuid-777');
    expect(result.formData.warehouseId).toBe('wh-uuid-1');
    expect(result.formData.discountType).toBe('percentage');
    expect(result.formData.discountValue).toBe(5);
    expect(result.formData.currency).toBe('EGP');

    // 4. الإشارة لرقم الفاتورة الأصلية في الملاحظات للتوثيق
    expect(result.formData.notes).toContain('PINV-2026-0099');

    // 5. استنساخ البنود بنفس الكميات والأسعار مع تفريغ الباتش وتوليد معرفات جديدة
    expect(result.items).toHaveLength(2);
    expect(result.items[0].productId).toBe('prod-flour');
    expect(result.items[0].quantity).toBe(50);
    expect(result.items[0].unitPrice).toBe(100);
    expect(result.items[0].batchNumber).toBe('');
    expect(result.items[0].id).not.toBe('item-row-1');

    expect(result.items[1].productId).toBe('prod-sugar');
    expect(result.items[1].quantity).toBe(10);
    expect(result.items[1].discount).toBe(25);
    expect(result.items[1].batchNumber).toBe('');
  });
});
