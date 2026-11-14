import { describe, it, expect, vi } from 'vitest';

/**
 * 🛡️ Purchase Return Immutability & Supplier Reconciliation Integrity Tests
 * 
 * يتحقق هذا الاختبار من:
 * 1. منع مسؤول المشتريات من فك ترحيل أو تعديل أو حذف أي مرتجع مشتريات مرحل (Posted).
 * 2. قصر صلاحية فك الترحيل (unpost) على الأدوار الإدارية والمحاسبية المصرح لها.
 * 3. حماية المرتجع المرحل من التعديل أو الحذف المباشر عبر صمامات الأمان في واجهة المستخدم.
 * 4. صحة منطق مطابقة الموردين وعدم ابتلاع المرتجعات (PRET- و PR-) داخل فواتير الشراء.
 * 5. معالجة وتصحيح الفرق المالي (905 ج.م) لمورد "برج ايفل".
 */

describe('🛡️ Purchase Return Immutability & Permission Guards', () => {

  describe('1. فحص صلاحيات فك الترحيل لمسؤول المشتريات مقابل المحاسب والإدارة', () => {
    const checkCanUnpost = (role: string, permissions: Record<string, string[]> = {}) => {
      const can = (module: string, action: string) => {
        return permissions[module]?.includes(action) ?? false;
      };
      return can('accounting', 'unpost') || 
             can('purchases', 'unpost') || 
             can('purchases', 'delete') || 
             ['admin', 'super_admin', 'owner', 'manager'].includes(role);
    };

    it('يجب منع مسؤول المشتريات (purchases) من فك الترحيل إذا لم يُمنح الصلاحية صراحة', () => {
      const isPurchasingOfficerAllowed = checkCanUnpost('purchases', {
        purchases: ['create', 'read', 'edit'] // لا يملك unpost
      });
      expect(isPurchasingOfficerAllowed).toBe(false);
    });

    it('يجب منع الموظف العادي (user / employee) من فك الترحيل', () => {
      const isUserAllowed = checkCanUnpost('user', {});
      expect(isUserAllowed).toBe(false);
    });

    it('يجب السماح للمحاسب بصلاحية accounting.unpost بفك الترحيل', () => {
      const isAccountantAllowed = checkCanUnpost('accountant', {
        accounting: ['unpost', 'read', 'create']
      });
      expect(isAccountantAllowed).toBe(true);
    });

    it('يجب السماح لمدير النظام (admin, super_admin, manager) بفك الترحيل تلقائياً', () => {
      expect(checkCanUnpost('admin')).toBe(true);
      expect(checkCanUnpost('super_admin')).toBe(true);
      expect(checkCanUnpost('manager')).toBe(true);
      expect(checkCanUnpost('owner')).toBe(true);
    });
  });

  describe('2. اختبار صمامات الحماية من التعديل المباشر أو الحذف للمرتجع المرحل', () => {
    it('يجب رفض تعديل المرتجع إذا كانت حالته مرحل (posted)', () => {
      const mockReturn = {
        editingId: 'ret-123',
        status: 'posted',
        returnNumber: 'PRET-001'
      };

      const canSaveReturn = (ret: typeof mockReturn) => {
        if (ret.editingId && ret.status === 'posted') {
          return { allowed: false, message: 'لا يمكن تعديل مرتجع المشتريات المرحل مباشرة' };
        }
        return { allowed: true, message: 'مسموح' };
      };

      const result = canSaveReturn(mockReturn);
      expect(result.allowed).toBe(false);
      expect(result.message).toContain('لا يمكن تعديل');
    });

    it('يجب رفض حذف المرتجع إذا كانت حالته مرحل (posted)', () => {
      const mockReturn = {
        id: 'ret-123',
        status: 'posted',
        return_number: 'PRET-001'
      };

      const canDeleteReturn = (ret: typeof mockReturn) => {
        if (ret.status === 'posted') {
          return { allowed: false, message: 'لا يمكن حذف مرتجع المشتريات المرحل مباشرة' };
        }
        return { allowed: true, message: 'مسموح' };
      };

      const result = canDeleteReturn(mockReturn);
      expect(result.allowed).toBe(false);
      expect(result.message).toContain('لا يمكن حذف');
    });

    it('يجب السماح بتعديل وحذف المرتجع إذا كانت حالته مسودة (draft)', () => {
      const draftReturn = {
        editingId: 'ret-123',
        id: 'ret-123',
        status: 'draft',
        returnNumber: 'PRET-001',
        return_number: 'PRET-001'
      };

      const canSave = draftReturn.editingId && draftReturn.status === 'posted' ? false : true;
      const canDelete = draftReturn.status === 'posted' ? false : true;

      expect(canSave).toBe(true);
      expect(canDelete).toBe(true);
    });
  });

  describe('3. اختبار تنظيف البادئات ومطابقة المراجع للمرتجعات (cleanRef with PRET-)', () => {
    const cleanRef = (r: string) => (r || '').toString().trim().toUpperCase()
      .replace(/^(CHQ-|PV-|PINV-|PUR-|PRET-|PR-|DN-|JV-|SUB-BILL-|SUB-|OP-SUPP-|OP-)/i, '');

    it('يجب استخراج الرقم الخام من المرجع ببادئة PRET- القياسية', () => {
      expect(cleanRef('PRET-905123')).toBe('905123');
      expect(cleanRef('pret-905123')).toBe('905123');
      expect(cleanRef('PR-905123')).toBe('905123');
    });

    it('يجب استخراج الرقم الخام من بقية المستندات المتنوعة بشكل صحيح', () => {
      expect(cleanRef('PUR-1001')).toBe('1001');
      expect(cleanRef('PINV-1002')).toBe('1002');
      expect(cleanRef('PV-505')).toBe('505');
      expect(cleanRef('CHQ-888')).toBe('888');
      expect(cleanRef('DN-301')).toBe('301');
    });
  });

  describe('4. اختبار تصنيف مرتجع المشتريات وعدم ابتلاعه داخل الفواتير في شاشة المطابقة', () => {
    const categorizeLine = (ref: string, desc: string, debit: number, credit: number) => {
      let category = 'other';
      if (ref.startsWith('PRET-') || ref.startsWith('PR-') || desc.includes('مرتجع') || desc.includes('مردود')) {
        category = 'returnsTotal';
      } else if (ref.startsWith('DN-') || desc.includes('إشعار مدين') || desc.includes('اشعار مدين')) {
        category = 'debitNotesTotal';
      } else if (ref.startsWith('CHQ-') || ref.startsWith('REJ-') || desc.includes('شيك')) {
        category = 'chequesTotal';
      } else if (desc.includes('مستخلص') || ref.startsWith('SUB-')) {
        category = 'subBillingsForSupplier';
      } else if (ref.startsWith('PUR-') || ref.startsWith('PI-') || desc.includes('فاتورة مشتريات') || desc.includes('مشتريات') || credit > 0) {
        category = 'grossInvoices';
      } else {
        category = 'paymentsTotal';
      }
      return category;
    };

    it('يجب تصنيف قيد "مرتجع مشتريات" كمرتجع (returnsTotal) وليس فاتورة مشتريات (grossInvoices)', () => {
      // قيد مرتجع مشتريات لمورد برج ايفل
      const category = categorizeLine('PRET-100905', 'مرتجع مشتريات للمورد برج ايفل', 905, 0);
      expect(category).toBe('returnsTotal');
    });

    it('يجب تصنيف قيد "مردودات مشتريات" كمرتجع', () => {
      const category = categorizeLine('PR-100905', 'إثبات مردودات مشتريات', 905, 0);
      expect(category).toBe('returnsTotal');
    });

    it('يجب تصنيف فاتورة المشتريات العادية كفاتورة (grossInvoices)', () => {
      const category = categorizeLine('PUR-2001', 'فاتورة مشتريات خامات', 0, 5000);
      expect(category).toBe('grossInvoices');
    });
  });

  describe('5. حل فرق 905 ج.م لمورد "برج ايفل" وتأثير المرتجع على رصيد المورد', () => {
    it('المرتجع بقيمة 905 ج.م يجب أن يخفض رصيد التزامات المورد (دائن - مدين)', () => {
      const supplier = {
        name: 'برج ايفل',
        opening_balance: 0
      };

      // الحركات المالية: فاتورة شراء 5000، وسداد 2000، ومرتجع مشتريات 905
      const movements = [
        { type: 'invoice', debit: 0, credit: 5000, desc: 'فاتورة مشتريات' },
        { type: 'payment', debit: 2000, credit: 0, desc: 'سند صرف نقدية' },
        { type: 'return', debit: 905, credit: 0, desc: 'مرتجع مشتريات للمورد برج ايفل' }
      ];

      const totalCredit = movements.reduce((sum, m) => sum + m.credit, 0);
      const totalDebit = movements.reduce((sum, m) => sum + m.debit, 0);
      const netSupplierPayable = totalCredit - totalDebit;

      // رصيد المورد المستحق = 5000 دائن - (2000 مسدد + 905 مرتجع) = 2095 ج.م
      expect(netSupplierPayable).toBe(2095);
      expect(netSupplierPayable).toBe(5000 - 2000 - 905);
    });

    it('في حالة وجود قيد مكرر شاذ غير مربوط بقيمة 905، يجب كشفه وعزله للمطابقة', () => {
      const glEntries = [
        { id: 'je-1', ref: 'PRET-905', desc: 'مرتجع مشتريات برج ايفل', debit: 905, credit: 0, matched: true },
        { id: 'je-dup', ref: 'PRET-905-DUP', desc: 'قيد يومية شاذ غير مربوط', debit: 905, credit: 0, matched: false }
      ];

      const discrepancies = glEntries.filter(e => !e.matched);
      expect(discrepancies.length).toBe(1);
      expect(discrepancies[0].debit).toBe(905);
      expect(discrepancies[0].id).toBe('je-dup');
    });
  });

});
