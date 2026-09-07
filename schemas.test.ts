import { describe, it, expect } from 'vitest';
import { AccountSchema, InvoiceSchema, JournalEntrySchema, VoucherSchema, SupplierSchema, CustomerSchema } from './utils/schemas';

describe('AccountSchema', () => {
  it('should validate a correct account object successfully', () => {
    const validAccount = {
      code: '10101',
      name: 'النقدية بالصندوق',
      type: 'ASSET',
      isGroup: false,
      parentAccount: 'some-uuid-string',
      subType: 'current',
    };
    const result = AccountSchema.safeParse(validAccount);
    expect(result.success).toBe(true);
  });

  it('should fail validation if name is too short', () => {
    const invalidAccount = {
      code: '102',
      name: 'أ', // أقل من حرفين
      type: 'ASSET',
      isGroup: false,
    };
    const result = AccountSchema.safeParse(invalidAccount);
    expect(result.success).toBe(false);
    // التأكد من أن رسالة الخطأ صحيحة
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('اسم الحساب مطلوب.');
    }
  });

  it('should fail validation if code is empty', () => {
    const invalidAccount = {
      code: '', // كود فارغ
      name: 'حساب بدون كود',
      type: 'ASSET',
      isGroup: false,
    };
    const result = AccountSchema.safeParse(invalidAccount);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('رمز الحساب مطلوب.');
    }
  });

  it('should pass validation with optional fields being undefined', () => {
    const validAccount = {
      code: '201',
      name: 'الموردين',
      type: 'LIABILITY',
      isGroup: true,
      // parentAccount, subType, openingBalance, balanceType are optional
    };
    const result = AccountSchema.safeParse(validAccount);
    expect(result.success).toBe(true);
  });
});

describe('CustomerSchema', () => {
  it('should validate a correct customer object successfully', () => {
    const validCustomer = {
      name: 'عميل جديد',
      phone: '0123456789',
      email: 'customer@example.com',
      credit_limit: 10000,
    };
    const result = CustomerSchema.safeParse(validCustomer);
    expect(result.success).toBe(true);
  });

  it('should fail validation if name is too short', () => {
    const invalidCustomer = {
      name: 'عم', // Less than 3 chars
    };
    const result = CustomerSchema.safeParse(invalidCustomer);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('اسم العميل يجب أن يكون 3 أحرف على الأقل.');
    }
  });

  it('should fail validation if email is invalid', () => {
    const invalidCustomer = {
      name: 'عميل صالح',
      email: 'invalid-email',
    };
    const result = CustomerSchema.safeParse(invalidCustomer);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('صيغة البريد الإلكتروني غير صحيحة.');
    }
  });

  it('should fail if credit_limit is negative', () => {
    const invalidCustomer = {
      name: 'عميل صالح',
      credit_limit: -100,
    };
    const result = CustomerSchema.safeParse(invalidCustomer);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('حد الائتمان لا يمكن أن يكون سالباً.');
    }
  });

  it('should pass validation with optional fields being undefined', () => {
    const validCustomer = {
      name: 'عميل بدون تفاصيل',
    };
    const result = CustomerSchema.safeParse(validCustomer);
    expect(result.success).toBe(true);
  });
});

describe('InvoiceSchema', () => {
  const validItem = {
    product_id: 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f', // Corrected UUID
    quantity: 2,
    price: 100,
  };

  const validInvoiceBase = {
    customer_id: 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d', // Corrected UUID
    invoice_date: new Date().toISOString().split('T')[0],
    total_amount: 200,
    items: [validItem],
    warehouse_id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', // Corrected UUID
  };

  it('should validate a correct sales invoice successfully', () => {
    const result = InvoiceSchema.safeParse(validInvoiceBase);
    expect(result.success).toBe(true);
  });

  it('should fail if invoice date is in the future', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const invalidInvoice = {
      ...validInvoiceBase,
      invoice_date: futureDate.toISOString().split('T')[0],
    };
    const result = InvoiceSchema.safeParse(invalidInvoice);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('تاريخ الفاتورة لا يمكن أن يكون في المستقبل.');
    }
  });

  it('should fail if there are no items', () => {
    const invalidInvoice = {
      ...validInvoiceBase,
      items: [],
    };
    const result = InvoiceSchema.safeParse(invalidInvoice);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('يجب إضافة صنف واحد على الأقل في الفاتورة.');
    }
  });

  it('should fail if an item has zero quantity', () => {
    const invalidInvoice = {
      ...validInvoiceBase,
      items: [{ ...validItem, quantity: 0 }],
    };
    const result = InvoiceSchema.safeParse(invalidInvoice);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('الكمية يجب أن تكون رقماً صحيحاً موجباً.');
    }
  });
});

describe('SupplierSchema', () => {
  it('should validate a correct supplier object successfully', () => {
    const validSupplier = {
      name: 'شركة التوريدات العالمية',
      phone: '01012345678',
      email: 'info@supplier.com',
      address: 'Cairo, Egypt',
      tax_number: '123456789',
      contact_person: 'Ahmed Ali',
    };
    const result = SupplierSchema.safeParse(validSupplier);
    expect(result.success).toBe(true);
  });

  it('should fail validation if name is too short', () => {
    const invalidSupplier = {
      name: 'ab', // Less than 3 chars
    };
    const result = SupplierSchema.safeParse(invalidSupplier);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('اسم المورد يجب أن يكون 3 أحرف على الأقل.');
    }
  });

  it('should fail validation if email is invalid', () => {
    const invalidSupplier = {
      name: 'Valid Name',
      email: 'not-an-email',
    };
    const result = SupplierSchema.safeParse(invalidSupplier);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('صيغة البريد الإلكتروني غير صحيحة.');
    }
  });

  it('should pass validation with optional fields being undefined or empty string for email', () => {
    const validSupplier = {
      name: 'مورد جديد',
      email: '', // Empty string allowed by schema
    };
    const result = SupplierSchema.safeParse(validSupplier);
    expect(result.success).toBe(true);
  });
});

describe('VoucherSchema', () => {
  const validVoucherBase = {
    amount: 500,
    date: new Date().toISOString().split('T')[0],
    treasuryAccountId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    description: 'Payment for services',
    paymentMethod: 'cash',
  };

  it('should validate a correct voucher with partyId', () => {
    const validVoucher = {
      ...validVoucherBase,
      partyId: 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d',
    };
    const result = VoucherSchema.safeParse(validVoucher);
    expect(result.success).toBe(true);
  });

  it('should validate a correct voucher with targetAccountId', () => {
    const validVoucher = {
      ...validVoucherBase,
      targetAccountId: 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f',
    };
    const result = VoucherSchema.safeParse(validVoucher);
    expect(result.success).toBe(true);
  });

  it('should fail if neither partyId nor targetAccountId is provided', () => {
    const invalidVoucher = {
      ...validVoucherBase,
      partyId: '',
      targetAccountId: '',
    };
    const result = VoucherSchema.safeParse(invalidVoucher);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('يجب تحديد الطرف المستفيد (عميل/مورد) أو الحساب المقابل.');
    }
  });

  it('should fail if amount is negative', () => {
    const invalidVoucher = {
      ...validVoucherBase,
      partyId: 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d',
      amount: -100,
    };
    const result = VoucherSchema.safeParse(invalidVoucher);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('المبلغ يجب أن يكون أكبر من صفر.');
    }
  });

  it('should fail if treasuryAccountId is invalid', () => {
    const invalidVoucher = {
      ...validVoucherBase,
      partyId: 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d',
      treasuryAccountId: 'invalid-uuid',
    };
    const result = VoucherSchema.safeParse(invalidVoucher);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('يجب اختيار حساب الخزينة/البنك.');
    }
  });
});

describe('JournalEntrySchema', () => {
  const validLine1 = {
    account_id: 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d',
    debit: 100,
    credit: 0,
  };
  const validLine2 = {
    account_id: 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f',
    debit: 0,
    credit: 100,
  };

  const validJournalEntryBase = {
    reference: 'JE-001',
    transaction_date: new Date().toISOString().split('T')[0],
    description: 'Test Journal Entry',
    lines: [validLine1, validLine2],
  };

  it('should validate a correct and balanced journal entry', () => {
    const result = JournalEntrySchema.safeParse(validJournalEntryBase);
    expect(result.success).toBe(true);
  });

  it('should fail if the journal entry is unbalanced', () => {
    const unbalancedEntry = {
      ...validJournalEntryBase,
      lines: [
        { ...validLine1, debit: 100 },
        { ...validLine2, credit: 99 }, // Unbalanced
      ],
    };
    const result = JournalEntrySchema.safeParse(unbalancedEntry);
    expect(result.success).toBe(false);
    if (!result.success) {
      const balanceError = result.error.issues.find(issue => issue.path.includes('lines'));
      expect(balanceError?.message).toBe('القيد غير متوازن. إجمالي المدين يجب أن يساوي إجمالي الدائن.');
    }
  });

  it('should fail if the journal entry has less than two lines', () => {
    const singleLineEntry = {
      ...validJournalEntryBase,
      lines: [validLine1],
    };
    const result = JournalEntrySchema.safeParse(singleLineEntry);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('القيد يجب أن يحتوي على طرفين على الأقل.');
    }
  });

  it('should fail if description is too short', () => {
    const entryWithShortDesc = { ...validJournalEntryBase, description: 'ab' };
    const result = JournalEntrySchema.safeParse(entryWithShortDesc);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('الوصف يجب أن يكون 3 أحرف على الأقل.');
    }
  });
});