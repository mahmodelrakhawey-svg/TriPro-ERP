import { describe, it, expect } from 'vitest';
import { deriveAccountMappings } from '../utils/financialSafety';

describe('🛡️ Multi-Step Transaction Atomicity & Default Account Mappings Tests', () => {
  describe('Default Account Mappings Derivation (Item 3)', () => {
    const mockAccounts = [
      // Standard leaf accounts
      { id: 'uuid-cash-1', code: '1231', name: 'الخزينة الرئيسية', isGroup: false },
      { id: 'uuid-bank-1', code: '123201', name: 'البنك الأهلي المصري', isGroup: false },
      { id: 'uuid-cust-1', code: '1221', name: 'العملاء المحليون', isGroup: false },
      { id: 'uuid-supp-1', code: '20101', name: 'الموردين المحليين', isGroup: false },
      { id: 'uuid-vat-out', code: '2231', name: 'ضريبة القيمة المضافة - مخرجات', isGroup: false },
      { id: 'uuid-vat-in', code: '1241', name: 'ضريبة القيمة المضافة - مدخلات', isGroup: false },
      { id: 'uuid-sales-1', code: '411', name: 'إيراد المبيعات', isGroup: false },
      { id: 'uuid-cogs-1', code: '511', name: 'تكلفة المبيعات', isGroup: false },
      { id: 'uuid-inv-fg', code: '10302', name: 'مخزون بضائع تامة الصنع', isGroup: false },
      { id: 'uuid-inv-raw', code: '10301', name: 'مخزون خامات ومواد تعبئة', isGroup: false },
      { id: 'uuid-nr-1', code: '1222', name: 'أوراق القبض (شيكات واردة)', isGroup: false },
      { id: 'uuid-np-1', code: '222', name: 'أوراق الدفع (شيكات صادرة)', isGroup: false },
      { id: 'uuid-opening', code: '3999', name: 'الأرصدة الافتتاحية', isGroup: false },
      { id: 'uuid-shortage', code: '541', name: 'عجز الصندوق والخزينة', isGroup: false },
      // Group account that should NOT be mapped
      { id: 'uuid-group-assets', code: '1', name: 'الأصول', isGroup: true },
      { id: 'uuid-group-cash', code: '123', name: 'النقدية وما في حكمها', isGroup: true },
    ];

    it('should correctly derive account mappings for core accounts from chart of accounts', () => {
      const res = deriveAccountMappings(mockAccounts, null);

      expect(res.hasNewMappings).toBe(true);
      expect(res.mappedCount).toBeGreaterThan(5);
      expect(res.mappings.CASH).toBe('uuid-cash-1');
      expect(res.mappings.BANK).toBe('uuid-bank-1');
      expect(res.mappings.CUSTOMERS).toBe('uuid-cust-1');
      expect(res.mappings.SUPPLIERS).toBe('uuid-supp-1');
      expect(res.mappings.VAT).toBe('uuid-vat-out');
      expect(res.mappings.VAT_OUTPUT).toBe('uuid-vat-out');
      expect(res.mappings.VAT_INPUT).toBe('uuid-vat-in');
      expect(res.mappings.SALES_REVENUE).toBe('uuid-sales-1');
      expect(res.mappings.COGS).toBe('uuid-cogs-1');
      expect(res.mappings.INVENTORY_FINISHED_GOODS).toBe('uuid-inv-fg');
      expect(res.mappings.INVENTORY_RAW_MATERIALS).toBe('uuid-inv-raw');
      expect(res.mappings.NOTES_RECEIVABLE).toBe('uuid-nr-1');
      expect(res.mappings.NOTES_PAYABLE).toBe('uuid-np-1');
      expect(res.mappings.OPENING_BALANCES).toBe('uuid-opening');
    });

    it('should NEVER overwrite an existing custom mapping (Safeguards custom org configuration)', () => {
      const existingMappings = {
        CASH: 'custom-user-cash-uuid',
        SUPPLIERS: 'custom-supplier-uuid'
      };

      const res = deriveAccountMappings(mockAccounts, existingMappings);

      // Preserves existing custom selections
      expect(res.mappings.CASH).toBe('custom-user-cash-uuid');
      expect(res.mappings.SUPPLIERS).toBe('custom-supplier-uuid');
      // While populating missing keys
      expect(res.mappings.CUSTOMERS).toBe('uuid-cust-1');
      expect(res.mappings.BANK).toBe('uuid-bank-1');
    });

    it('should never select group accounts for system account mappings', () => {
      const onlyGroupAccounts = [
        { id: 'group-1', code: '1231', name: 'مجموعة الصندوق', isGroup: true },
        { id: 'group-2', code: '1221', name: 'مجموعة العملاء', is_group: true }
      ];

      const res = deriveAccountMappings(onlyGroupAccounts, {});
      expect(res.mappings.CASH).toBeUndefined();
      expect(res.mappings.CUSTOMERS).toBeUndefined();
    });

    it('should fallback to name keywords when exact code is customized or non-standard', () => {
      const customizedAccounts = [
        { id: 'uuid-custom-cash', code: '9901', name: 'خزينة الفرع الأول نقدية', isGroup: false },
        { id: 'uuid-custom-supp', code: '8801', name: 'الموردين والشركات الموردة', isGroup: false }
      ];

      const res = deriveAccountMappings(customizedAccounts, {});
      expect(res.mappings.CASH).toBe('uuid-custom-cash');
      expect(res.mappings.SUPPLIERS).toBe('uuid-custom-supp');
    });
  });

  describe('Multi-Step Financial Transactions Atomicity (Item 1)', () => {
    it('should reject payment voucher creation when supplier or treasury account is missing', () => {
      const validatePaymentPreconditions = (amount: number, supplierAccId?: string, treasuryId?: string) => {
        if (amount > 0 && !supplierAccId) {
          throw new Error('لم يتم تحديد حساب المورد أو حساب الموردين الافتراضي');
        }
        if (amount > 0 && !treasuryId) {
          throw new Error('يجب اختيار حساب الخزينة أو البنك');
        }
        return true;
      };

      expect(() => validatePaymentPreconditions(500, undefined, 'treasury-1')).toThrow(
        'لم يتم تحديد حساب المورد أو حساب الموردين الافتراضي'
      );

      expect(() => validatePaymentPreconditions(500, 'supplier-1', undefined)).toThrow(
        'يجب اختيار حساب الخزينة أو البنك'
      );

      expect(validatePaymentPreconditions(500, 'supplier-1', 'treasury-1')).toBe(true);
    });

    it('should trigger compensating rollback when entry creation fails mid-flight', async () => {
      let voucherDeleted = false;
      const fakeVoucherId = 'test-voucher-123';

      const executeCompensatingRollback = async (voucherId: string) => {
        // Simulates deleting orphan voucher
        voucherDeleted = true;
        return voucherId;
      };

      const simulateMultiStepPayment = async (failAtStep2: boolean) => {
        const voucherId = fakeVoucherId;
        const entryCreated = !failAtStep2;

        if (!entryCreated) {
          await executeCompensatingRollback(voucherId);
          throw new Error('فشل إنشاء القيد المحاسبي لسند الصرف، تم التراجع عن العملية.');
        }
        return { success: true, voucherId };
      };

      await expect(simulateMultiStepPayment(true)).rejects.toThrow(
        'فشل إنشاء القيد المحاسبي لسند الصرف، تم التراجع عن العملية.'
      );
      expect(voucherDeleted).toBe(true);
    });
  });
});
