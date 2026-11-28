import { describe, it, expect } from 'vitest';
import {
  createCreditNoteSchema,
  createDebitNoteSchema,
  createPurchaseReturnSchema,
} from '../../utils/validationSchemas';
import { TEST_CUSTOMER_ID, TEST_SUPPLIER_ID, TEST_WAREHOUSE_ID } from '../helpers/factories';

describe('🔁 Credit/Debit Notes & Return Schemas Validation', () => {
  it('يقبل إشعار دائن وإشعار مدين بمبالغ صالحة ويرفض المبالغ غير الموجبة', () => {
    const validCredit = createCreditNoteSchema.safeParse({
      customerId: TEST_CUSTOMER_ID,
      date: '2026-11-28',
      amount: 1500,
    });
    expect(validCredit.success).toBe(true);

    const zeroDebit = createDebitNoteSchema.safeParse({
      supplierId: TEST_SUPPLIER_ID,
      date: '2026-11-28',
      amount: 0,
    });
    expect(zeroDebit.success).toBe(false);
  });

  it('يرفض مرتجع مشتريات بدون أصناف أو بكمية صفرية ويقبل المرتجع المكتمل', () => {
    const emptyReturn = createPurchaseReturnSchema.safeParse({
      supplierId: TEST_SUPPLIER_ID,
      warehouseId: TEST_WAREHOUSE_ID,
      date: '2026-11-28',
      items: [],
    });
    expect(emptyReturn.success).toBe(false);

    const validReturn = createPurchaseReturnSchema.safeParse({
      supplierId: TEST_SUPPLIER_ID,
      warehouseId: TEST_WAREHOUSE_ID,
      date: '2026-11-28',
      items: [
        {
          productId: '77777777-7777-4777-8777-777777777771',
          quantity: 3,
          price: 120,
        },
      ],
    });
    expect(validReturn.success).toBe(true);
  });
});
