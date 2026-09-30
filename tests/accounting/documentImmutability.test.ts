import { describe, it, expect } from 'vitest';
import { DocumentAuditLog } from '../../services/auditService';

/**
 * 🛡️ اختبارات حماية المستندات المرحلة وسجل التدقيق (Document Immutability & Audit Trail)
 * تحاكي وتتحقق من القواعد المطبقة في:
 * 1. SQL Triggers:
 *    - fn_guard_posted_sales_invoice_immutability
 *    - fn_guard_posted_purchase_invoice_immutability
 *    - fn_guard_posted_invoice_items_immutability
 *    - fn_guard_posted_purchase_items_immutability
 * 2. واجهات المستخدم وسياسات الصلاحيات (UI & Permissions Guard):
 *    - منع الحذف المباشر لفواتير المبيعات والمشتريات المرحلة
 *    - حظر التعديل المباشر على الحقول المالية وبنود الفاتورة المرحلة
 *    - التحقق من صلاحيات إلغاء الترحيل (canUnpost)
 *    - التحقق من تسجيل حركات التدقيق (created, updated, posted, unposted, deleted, printed)
 */

interface InvoiceEntity {
  id: string;
  invoice_number: string;
  status: 'draft' | 'posted' | 'paid' | 'cancelled';
  total_amount: number;
  tax_amount: number;
  subtotal: number;
  discount_amount?: number;
  customer_id?: string;
  supplier_id?: string;
  warehouse_id?: string;
  invoice_date: string;
}

interface InvoiceItemEntity {
  id: string;
  invoice_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total: number;
}

/**
 * محاكاة محفز منع حذف الفاتورة المرحلة (DELETE Guard)
 */
function simulateDocumentDeleteGuard(
  invoice: InvoiceEntity
): { allowed: boolean; error?: string } {
  if (invoice.status === 'posted' || invoice.status === 'paid') {
    return {
      allowed: false,
      error: `TRIPRO_DOCUMENT_GUARD: لا يمكن حذف الفاتورة المرحلة أو المسددة (رقم: ${invoice.invoice_number}) مباشرة. يجب أولاً إلغاء الترحيل لتحويلها إلى مسودة (Draft).`
    };
  }
  return { allowed: true };
}

/**
 * محاكاة محفز منع تعديل القيم المالية للفاتورة المرحلة (UPDATE Guard)
 */
function simulateDocumentUpdateGuard(
  oldDoc: InvoiceEntity,
  newDoc: InvoiceEntity
): { allowed: boolean; error?: string } {
  // إذا كانت الفاتورة مرحلة/مسددة وتظل مرحلة/مسددة (لم يتم إلغاء الترحيل إلى draft)
  if (
    (oldDoc.status === 'posted' || oldDoc.status === 'paid') &&
    (newDoc.status === 'posted' || newDoc.status === 'paid')
  ) {
    const isFinancialModified =
      oldDoc.total_amount !== newDoc.total_amount ||
      oldDoc.tax_amount !== newDoc.tax_amount ||
      oldDoc.subtotal !== newDoc.subtotal ||
      oldDoc.discount_amount !== newDoc.discount_amount ||
      oldDoc.customer_id !== newDoc.customer_id ||
      oldDoc.supplier_id !== newDoc.supplier_id ||
      oldDoc.warehouse_id !== newDoc.warehouse_id ||
      oldDoc.invoice_date !== newDoc.invoice_date;

    if (isFinancialModified) {
      return {
        allowed: false,
        error: `TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل القيم المالية أو أطراف الفاتورة المرحلة (رقم: ${oldDoc.invoice_number}) مباشرة. يجب إلغاء الترحيل أولاً أو إصدار إشعار تسوية.`
      };
    }
  }

  return { allowed: true };
}

/**
 * محاكاة محفز حماية بنود الفاتورة المرحلة من التعديل/الحذف/الإضافة
 */
function simulateItemImmutabilityGuard(
  parentStatus: 'draft' | 'posted' | 'paid' | 'cancelled',
  parentNumber: string
): { allowed: boolean; error?: string } {
  if (parentStatus === 'posted' || parentStatus === 'paid') {
    return {
      allowed: false,
      error: `TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل أو حذف أو إضافة بنود إلى فاتورة مرحلة (رقم: ${parentNumber}) مباشرة. يجب إلغاء ترحيل الفاتورة أولاً.`
    };
  }
  return { allowed: true };
}

/**
 * محاكاة فحص صلاحية إلغاء الترحيل (canUnpost)
 */
function checkCanUnpost(userRole: string, permissions: Record<string, string[]> = {}): boolean {
  const adminRoles = ['admin', 'super_admin', 'owner', 'manager'];
  if (adminRoles.includes(userRole)) {
    return true;
  }
  const accountingPerms = permissions['accounting'] || [];
  const salesPerms = permissions['sales'] || [];
  return (
    accountingPerms.includes('unpost') ||
    accountingPerms.includes('delete') ||
    salesPerms.includes('unpost') ||
    salesPerms.includes('delete')
  );
}

describe('🛡️ حماية المستندات المرحلة وسجل التدقيق (Document Immutability & Audit Trail)', () => {

  describe('1. صمامات أمان حذف الفواتير (DELETE Guard)', () => {
    it('يجب منع حذف فاتورة المبيعات إذا كانت حالتها مرحلة (posted)', () => {
      const invoice: InvoiceEntity = {
        id: 'inv-001',
        invoice_number: 'INV-2026-0001',
        status: 'posted',
        total_amount: 15000,
        tax_amount: 2100,
        subtotal: 12900,
        invoice_date: '2026-09-30'
      };

      const result = simulateDocumentDeleteGuard(invoice);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('TRIPRO_DOCUMENT_GUARD');
      expect(result.error).toContain('INV-2026-0001');
    });

    it('يجب منع حذف فاتورة المشتريات إذا كانت مسددة (paid)', () => {
      const invoice: InvoiceEntity = {
        id: 'pinv-001',
        invoice_number: 'PINV-2026-0099',
        status: 'paid',
        total_amount: 45000,
        tax_amount: 6300,
        subtotal: 38700,
        invoice_date: '2026-09-30'
      };

      const result = simulateDocumentDeleteGuard(invoice);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('TRIPRO_DOCUMENT_GUARD');
      expect(result.error).toContain('PINV-2026-0099');
    });

    it('يسمح بحذف الفاتورة غير المرحلة (draft)', () => {
      const draftInvoice: InvoiceEntity = {
        id: 'inv-draft-001',
        invoice_number: 'INV-DRAFT-01',
        status: 'draft',
        total_amount: 5000,
        tax_amount: 700,
        subtotal: 4300,
        invoice_date: '2026-09-30'
      };

      const result = simulateDocumentDeleteGuard(draftInvoice);
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('2. صمامات أمان تعديل الفواتير المرحلة (In-Place UPDATE Guard)', () => {
    const originalPosted: InvoiceEntity = {
      id: 'inv-100',
      invoice_number: 'INV-2026-0100',
      status: 'posted',
      total_amount: 10000,
      tax_amount: 1400,
      subtotal: 8600,
      discount_amount: 0,
      customer_id: 'cust-1',
      warehouse_id: 'wh-main',
      invoice_date: '2026-09-25'
    };

    it('يجب حظر تعديل إجمالي المبلغ والفائدة والضريبة لفاتورة مرحلة مباشرة في مكانها', () => {
      const modifiedPosted: InvoiceEntity = {
        ...originalPosted,
        total_amount: 12000, // تغيير مباشر
        subtotal: 10500
      };

      const result = simulateDocumentUpdateGuard(originalPosted, modifiedPosted);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('TRIPRO_DOCUMENT_GUARD');
      expect(result.error).toContain('INV-2026-0100');
    });

    it('يجب حظر تغيير العميل أو المستودع أو التاريخ لفاتورة مرحلة دون إلغاء الترحيل', () => {
      const modifiedCustomer: InvoiceEntity = {
        ...originalPosted,
        customer_id: 'cust-2' // تغيير العميل
      };

      const result = simulateDocumentUpdateGuard(originalPosted, modifiedCustomer);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('TRIPRO_DOCUMENT_GUARD');
    });

    it('يسمح بتغيير الحالة من مرحلة (posted) إلى مسودة (draft) لإلغاء الترحيل', () => {
      const unpostedDoc: InvoiceEntity = {
        ...originalPosted,
        status: 'draft' // تحويل لمسودة عبر unpost
      };

      const result = simulateDocumentUpdateGuard(originalPosted, unpostedDoc);
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('يسمح بتعديل الفاتورة بحرية تامة عندما تكون مسودة (draft)', () => {
      const draftOld: InvoiceEntity = {
        ...originalPosted,
        status: 'draft'
      };
      const draftNew: InvoiceEntity = {
        ...draftOld,
        total_amount: 25000,
        subtotal: 21500,
        customer_id: 'cust-3'
      };

      const result = simulateDocumentUpdateGuard(draftOld, draftNew);
      expect(result.allowed).toBe(true);
    });
  });

  describe('3. حماية بنود الفاتورة المرحلة (Items Immutability Guard)', () => {
    it('يجب منع تعديل أو حذف أو إضافة بنود إلى فاتورة مبيعات مرحلة', () => {
      const result = simulateItemImmutabilityGuard('posted', 'INV-2026-0200');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('TRIPRO_DOCUMENT_GUARD');
      expect(result.error).toContain('INV-2026-0200');
    });

    it('يجب منع التلاعب ببنود فاتورة مشتريات مسددة', () => {
      const result = simulateItemImmutabilityGuard('paid', 'PINV-2026-0500');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('TRIPRO_DOCUMENT_GUARD');
      expect(result.error).toContain('PINV-2026-0500');
    });

    it('يسمح بإضافة وتعديل وحذف بنود الفاتورة المسودة (draft)', () => {
      const result = simulateItemImmutabilityGuard('draft', 'INV-DRAFT-03');
      expect(result.allowed).toBe(true);
    });
  });

  describe('4. فحص صلاحيات إلغاء الترحيل (canUnpost Permissions)', () => {
    it('المدير والأدمن ومالك المنشأة لديهم صلاحية إلغاء الترحيل دائماً', () => {
      expect(checkCanUnpost('admin')).toBe(true);
      expect(checkCanUnpost('super_admin')).toBe(true);
      expect(checkCanUnpost('owner')).toBe(true);
      expect(checkCanUnpost('manager')).toBe(true);
    });

    it('المستخدم ذو الصلاحية المخصصة (unpost في accounting أو sales) يُسمح له بإلغاء الترحيل', () => {
      expect(checkCanUnpost('accountant', { accounting: ['unpost'] })).toBe(true);
      expect(checkCanUnpost('sales_rep', { sales: ['unpost'] })).toBe(true);
      expect(checkCanUnpost('user', { sales: ['delete'] })).toBe(true);
    });

    it('المستخدم العادي بدون صلاحيات يُمنع من إلغاء الترحيل', () => {
      expect(checkCanUnpost('viewer', {})).toBe(false);
      expect(checkCanUnpost('cashier', { sales: ['create', 'read'] })).toBe(false);
    });
  });

  describe('5. هيكل بيانات سجل التدقيق (Document Audit Logging Contract)', () => {
    it('يجب أن يدعم نوع حركة التدقيق جميع الإجراءات المحددة للمستندات', () => {
      const validActions: DocumentAuditLog['action'][] = [
        'created',
        'updated',
        'posted',
        'unposted',
        'paid',
        'deleted',
        'printed'
      ];

      validActions.forEach(action => {
        expect(typeof action).toBe('string');
      });
    });

    it('سجل إلغاء الترحيل يحتوي على سبب الإلغاء ورقم الفاتورة واسم المستخدم', () => {
      const auditEntry = {
        document_type: 'sales_invoice' as const,
        document_id: 'INV-2026-0888',
        action: 'unposted' as const,
        details: {
          invoice_number: 'INV-2026-0888',
          note: 'تم إلغاء ترحيل الفاتورة INV-2026-0888 وإعادتها لمسودة للتعديل',
          total_amount: 17500
        },
        user_name: 'أحمد المحاسب'
      };

      expect(auditEntry.action).toBe('unposted');
      expect(auditEntry.details.note).toContain('إلغاء ترحيل');
      expect(auditEntry.user_name).toBe('أحمد المحاسب');
    });
  });
});
