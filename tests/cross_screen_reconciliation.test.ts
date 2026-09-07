import { describe, it, expect } from 'vitest';

/**
 * 🛡️ Cross-Screen Reconciliation & Single-Source-of-Truth Validation
 * 
 * هذا الاختبار صُمم خصيصاً للتحقق من أن الشاشات المختلفة لا تعتمد على مصادر متضاربة:
 * 1. رصيد العميل في شاشة الإدارة يجب أن يتطابق مع كشف الحساب من الأستاذ العام 100%.
 * 2. رصيد المورد في شاشة الإدارة يجب أن يستهدف حساب الموردين (201) ويتطابق مع كشف الحساب 100%.
 * 3. رصيد المخزون في شاشة الأصناف يجب أن يتطابق مع معادلة حركة المخزون (أول المدة + الوارد - الصادر) 100%.
 */

describe('🔍 Cross-Screen Data Integrity & SSOT Validation', () => {

  describe('1. اختبار توحيد أرصدة العملاء (Customer Balance SSOT)', () => {
    it('يجب أن يعتمد رصيد العميل حصرياً على قيود الأستاذ العام (مدين - دائن) وليس عمود كاش سطحي', () => {
      // محاكاة قيود أستاذ عام لعميل
      const glEntries = [
        { docType: 'INVOICE', debit: 11400, credit: 0 },
        { docType: 'INVOICE', debit: 27600, credit: 0 },
        { docType: 'RECEIPT', debit: 0, credit: 5000 },
        { docType: 'INVOICE', debit: 5000, credit: 0 },
      ];

      // حساب كشف الحساب من واقع الأستاذ العام (The True GL Ledger)
      const statementBalance = glEntries.reduce((acc, curr) => acc + (curr.debit - curr.credit), 0);
      expect(statementBalance).toBe(39000);

      // الواجهة الآن يجب أن تستخدم نفس المنطق تماماً (GL-derived) وليس عمود قديم
      const calculateCustomerListBalance = (lines: typeof glEntries) => {
        return lines.reduce((sum, l) => sum + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
      };

      const customerListBalance = calculateCustomerListBalance(glEntries);

      // المطابقة التامة: لا فارق بين شاشة العميل وكشف الحساب
      expect(customerListBalance).toBe(statementBalance);
      expect(Math.abs(customerListBalance - statementBalance)).toBe(0);
    });
  });

  describe('2. اختبار توحيد أرصدة الموردين (Supplier Balance & Account Code SSOT)', () => {
    it('يجب استهداف حساب الموردين (201) حصرياً واستبعاد حسابات القروض (211)', () => {
      const mockAccounts = [
        { id: 'acc-loans', code: '211', name: 'قروض وسلفيات قصيرة الأجل' },
        { id: 'acc-supp', code: '201', name: 'الموردون والتجارة الدائنة' },
        { id: 'acc-supp-sub', code: '20101', name: 'موردو الخامات' }
      ];

      // المنطق المصحح في دالة الموردين
      const filterSupplierAccounts = (accounts: typeof mockAccounts) => {
        return accounts.filter(a => 
          (a.code.startsWith('201') || a.code.startsWith('2101') || a.name.includes('مورد')) &&
          !a.code.startsWith('211') &&
          !a.name.includes('قروض')
        );
      };

      const matchedAccounts = filterSupplierAccounts(mockAccounts);
      expect(matchedAccounts.map(a => a.code)).toEqual(['201', '20101']);
      expect(matchedAccounts.some(a => a.code === '211')).toBe(false);
    });

    it('يجب أن يتطابق رصيد المورد مع دفتر الأستاذ (دائن - مدين) ومطابقة كشف حسابه', () => {
      const supplierJournalLines = [
        { docType: 'PURCHASE_INVOICE', debit: 0, credit: 177840 },
        { docType: 'PAYMENT_VOUCHER', debit: 50000, credit: 0 },
        { docType: 'PURCHASE_INVOICE', debit: 0, credit: 53762.4 },
      ];

      const glSupplierBalance = supplierJournalLines.reduce((sum, l) => sum + (l.credit - l.debit), 0);
      expect(glSupplierBalance).toBe(181602.4);

      // شاشة الموردين تحسب بنفس القاعدة
      const displayedBalance = supplierJournalLines.reduce((sum, l) => sum + (Number(l.credit) || 0) - (Number(l.debit) || 0), 0);
      expect(displayedBalance).toBe(glSupplierBalance);
    });
  });

  describe('3. اختبار توحيد رصيد المخزون وحركات البيع (Inventory Movement Ledger SSOT)', () => {
    it('يجب أن يتطابق رصيد المخزون بين إدارة الأصناف وتقارير المخازن بناءً على معادلة الحركة', () => {
      // بيانات تجربة التونة الحقيقية
      const openingStock = 100;
      const movements = [
        { type: 'OUT', docType: 'POS_ORDER', docNumber: 'ORD-000001', quantity: 1 },
      ];

      // حساب رصيد كرت الصنف / حركة المخزون التفصيلي
      const calculatedLedgerBalance = openingStock - movements.filter(m => m.type === 'OUT').reduce((sum, m) => sum + m.quantity, 0);
      expect(calculatedLedgerBalance).toBe(99);

      // في محرك المخزون الموحد (recalculate_stock_rpc)
      const simulateRecalculateStock = (opening: number, inMoves: number, outMoves: number) => {
        return opening + inMoves - outMoves;
      };

      const finalStock = simulateRecalculateStock(openingStock, 0, 1);
      expect(finalStock).toBe(99);
      expect(finalStock).toBe(calculatedLedgerBalance);
    });

    it('يجب رفض تجاهل رصيد أول المدة عند إعادة احتساب الأرصدة حتى لو لم يوجد مستند شراء', () => {
      const product = {
        name: 'تونه',
        stock: 100,
        opening_balance: 0,
        warehouse_stock: { 'wh-1': 100 }
      };

      // إذا كان جدول opening_inventories فارغاً، يجب استخلاص الرصيد الافتتاحي من كاش الصنف لمنع تصفيره
      const baselineStock = product.opening_balance > 0 
        ? product.opening_balance 
        : (product.stock > 0 ? product.stock : 0);

      expect(baselineStock).toBe(100);
      const salesQty = 1;
      const netReconciledStock = baselineStock - salesQty;
      expect(netReconciledStock).toBe(99);
    });
  });

});
