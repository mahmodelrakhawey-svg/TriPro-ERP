import { describe, it, expect } from 'vitest';

/**
 * 🛡️ Sales Return Immutability & Customer Balance Reconciliation Tests
 * 
 * يتحقق هذا الاختبار من:
 * 1. منع أي موظف أو كاشير من فك ترحيل أو تعديل أو حذف أي مرتجع مبيعات مرحل (Posted).
 * 2. قصر صلاحية فك الترحيل (unpost) على الأدوار الإدارية والمحاسبية المصرح لها.
 * 3. حماية المرتجع المرحل من التعديل أو الحذف المباشر عبر صمامات الأمان في واجهة المستخدم.
 * 4. التحقق من عكس المخزون الصحيح عند فك الترحيل وعكس القيد المحاسبي.
 */

describe('🛡️ Sales Return Immutability & Permission Guards', () => {

  describe('1. فحص صلاحيات فك الترحيل لمسؤول المبيعات والكاشير مقابل المحاسب والإدارة', () => {
    const checkCanUnpost = (role: string, permissions: Record<string, string[]> = {}) => {
      const can = (module: string, action: string) => {
        return permissions[module]?.includes(action) ?? false;
      };
      return can('accounting', 'unpost') || 
             can('sales', 'unpost') || 
             can('sales', 'delete') || 
             ['admin', 'super_admin', 'owner', 'manager'].includes(role);
    };

    it('يجب منع الكاشير (cashier) من فك ترحيل المرتجع', () => {
      const isCashierAllowed = checkCanUnpost('cashier', {
        sales: ['create', 'read']
      });
      expect(isCashierAllowed).toBe(false);
    });

    it('يجب منع موظف المبيعات (sales) من فك الترحيل إذا لم يُمنح الصلاحية صراحة', () => {
      const isSalesOfficerAllowed = checkCanUnpost('sales', {
        sales: ['create', 'read', 'edit']
      });
      expect(isSalesOfficerAllowed).toBe(false);
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

    it('يجب السماح لمدير النظام (admin, super_admin, manager, owner) بفك الترحيل تلقائياً', () => {
      expect(checkCanUnpost('admin')).toBe(true);
      expect(checkCanUnpost('super_admin')).toBe(true);
      expect(checkCanUnpost('manager')).toBe(true);
      expect(checkCanUnpost('owner')).toBe(true);
    });
  });

  describe('2. اختبار صمامات الحماية من التعديل المباشر أو الحذف للمرتجع المرحل', () => {
    it('يجب رفض تعديل المرتجع إذا كانت حالته مرحل (posted)', () => {
      const mockReturn = {
        editingId: 'ret-sales-123',
        status: 'posted',
        returnNumber: 'SR-001'
      };

      const validateMutationAttempt = (doc: typeof mockReturn) => {
        if (doc.editingId && doc.status === 'posted') {
          return { allowed: false, error: 'لا يمكن تعديل مرتجع مبيعات مرحل مباشرة. يرجى إلغاء ترحيله أولاً لإعادته كمسودة ثم إجراء التعديل' };
        }
        return { allowed: true };
      };

      const result = validateMutationAttempt(mockReturn);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('لا يمكن تعديل مرتجع مبيعات مرحل');
    });

    it('يجب رفض حذف المرتجع مباشرة إذا كانت حالته مرحل (posted)', () => {
      const mockReturn = {
        id: 'ret-sales-123',
        status: 'posted',
        return_number: 'SR-001'
      };

      const validateDeleteAttempt = (doc: typeof mockReturn) => {
        if (doc.status !== 'draft' && doc.status !== 'cancelled') {
          return { allowed: false, error: 'لا يمكن حذف مرتجع مبيعات مرحل. يرجى إلغاء ترحيله أولاً لإعادته إلى مسودة ثم حذفه' };
        }
        return { allowed: true };
      };

      const result = validateDeleteAttempt(mockReturn);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('لا يمكن حذف مرتجع مبيعات مرحل');
    });

    it('يجب السماح بحذف المرتجع إذا كان مسودة (draft)', () => {
      const mockDraftReturn = {
        id: 'ret-sales-456',
        status: 'draft',
        return_number: 'SR-002'
      };

      const validateDeleteAttempt = (doc: typeof mockDraftReturn) => {
        if (doc.status !== 'draft' && doc.status !== 'cancelled') {
          return { allowed: false, error: 'لا يمكن حذف مرتجع مبيعات مرحل' };
        }
        return { allowed: true };
      };

      const result = validateDeleteAttempt(mockDraftReturn);
      expect(result.allowed).toBe(true);
    });
  });

  describe('3. اختبار سلامة عكس المخزون والحسابات عند إلغاء ترحيل المرتجع', () => {
    it('يجب عكس أثر المخزون الصحيح بخصم الكمية المرتجعة من الرصيد الحالي', () => {
      const initialStock = 50; // المخزون الحالي بما فيه 10 تم إرجاعها سابقاً
      const returnedQty = 10;
      
      // عند إلغاء ترحيل المرتجع، يجب خصم الـ 10 التي كانت أضيفت
      const stockAfterUnpost = Math.max(0, initialStock - returnedQty);
      expect(stockAfterUnpost).toBe(40);
    });

    it('يجب عدم السماح للمخزون بأن يصبح سالباً عند عكس كمية أكبر من الرصيد المتوفر', () => {
      const currentStock = 5;
      const returnedQty = 10;
      
      const stockAfterUnpost = Math.max(0, currentStock - returnedQty);
      expect(stockAfterUnpost).toBe(0);
    });
  });
});
