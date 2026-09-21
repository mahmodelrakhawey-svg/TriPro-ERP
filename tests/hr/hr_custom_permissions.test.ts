import { describe, it, expect } from 'vitest';

/**
 * دالة التحقق من الصلاحيات - متطابقة مع منطق can() المحدث في AuthContext
 */
export const evaluatePermission = (
  userRole: string | null,
  userPermissions: Set<string>,
  module: string,
  action: string
): boolean => {
  if (userRole === 'super_admin' || userRole === 'admin' || userRole === 'owner' || userRole === 'manager') return true;

  if ((userRole === 'hr' || userRole === 'hr_officer' || userRole === 'hr_manager') && (module === 'hr' || module.startsWith('hr') || module === 'reports')) {
    if (module === 'reports') {
      return ['view', 'general_view', 'export_data', 'export'].includes(action);
    }
    return true;
  }

  // الرموز الشاملة المباشرة
  if (userPermissions.has(`${module}.${action}`)) return true;
  if (userPermissions.has(`${module}.*`)) return true;
  if (userPermissions.has(`*.${action}`)) return true;
  if (userPermissions.has(`*.*`)) return true;

  // 🌟 الوراثة التلقائية لصلاحية العرض (Dynamic Module View Inheritance):
  if (action === 'view') {
    for (const p of userPermissions) {
      if (p.startsWith(`${module}.`) || p === '*.*' || p === `${module}.*`) {
        return true;
      }
    }
    if (module === 'treasury' && (userPermissions.has('accounting.view') || userPermissions.has('accounting.*'))) return true;
    if (module === 'accounting' && (userPermissions.has('treasury.view') || userPermissions.has('treasury.*'))) return true;
  }

  // توافق موديول الخزينة والسندات والتحويلات والشيكات (Treasury & Banking)
  if (module === 'treasury') {
    if (action === 'transfer' && (
      userPermissions.has('treasury.transfer') || 
      userPermissions.has('treasury.manage') || 
      userPermissions.has('treasury.*')
    )) {
      return true;
    }
    if (action === 'manage' && (
      userPermissions.has('treasury.manage') || 
      userPermissions.has('treasury.transfer') || 
      userPermissions.has('treasury.*')
    )) {
      return true;
    }
    if (action === 'receipt_create' && (
      userPermissions.has('treasury.receipt_create') || 
      userPermissions.has('treasury.create') || 
      userPermissions.has('treasury.manage') || 
      userPermissions.has('treasury.*')
    )) {
      return true;
    }
    if (action === 'payment_create' && (
      userPermissions.has('treasury.payment_create') || 
      userPermissions.has('treasury.create') || 
      userPermissions.has('treasury.manage') || 
      userPermissions.has('treasury.*')
    )) {
      return true;
    }
    if (action === 'create' && (
      userPermissions.has('treasury.create') || 
      userPermissions.has('treasury.receipt_create') || 
      userPermissions.has('treasury.payment_create') || 
      userPermissions.has('treasury.manage') || 
      userPermissions.has('treasury.*')
    )) {
      return true;
    }
    if (action === 'cheques' || action === 'cheque_manage') {
      if (
        userPermissions.has('treasury.cheque_manage') || 
        userPermissions.has('treasury.cheques') || 
        userPermissions.has('treasury.cheque_collect') || 
        userPermissions.has('treasury.manage') || 
        userPermissions.has('treasury.*')
      ) {
        return true;
      }
    }
    if (action === 'bank_reconciliation' || action === 'reconcile') {
      if (
        userPermissions.has('treasury.bank_reconciliation') || 
        userPermissions.has('accounting.reconcile') || 
        userPermissions.has('treasury.manage') || 
        userPermissions.has('treasury.*')
      ) {
        return true;
      }
    }
  }

  return false;
};

/**
 * دالة فحص عناصر القائمة الجانبية وفق المعمارية الشاملة (Universal Dynamic RBAC Architecture)
 */
export const isSidebarItemAllowed = (
  userRole: string,
  userPermissions: Set<string>,
  item: { to?: string; permission?: string; module?: string },
  isModuleAllowed: (module: string) => boolean = () => true
): boolean => {
  // فحص اشتراك المنشأة في الموديول
  if (item.module && !isModuleAllowed(item.module)) return false;

  // 🌟 القاعدة العامة الشاملة (Universal Rule):
  // الصلاحية الصريحة تعلو دائماً على قيود الدور وتظهر العنصر فوراً!
  if (item.permission) {
    const [mod, act] = item.permission.split('.');
    if (evaluatePermission(userRole, userPermissions, mod, act)) {
      return true;
    }
  }

  // قيود الأدوار الافتراضية لمن لا يملكون صلاحيات صريحة
  if (userRole === 'restaurant_cashier' || userRole === 'cashier') {
    const allowedCashierPaths = ['/pos', '/retail-pos'];
    return Boolean(item.to && allowedCashierPaths.includes(item.to));
  }

  if (userRole === 'hr' || userRole === 'hr_officer') {
    const allowedHrPaths = [
      '/hr/dashboard',
      '/employees',
      '/hr/biometrics',
      '/hr/shifts',
      '/hr/attendance',
      '/hr/leaves',
      '/hr/penalties',
      '/payroll-run',
      '/employee-advances',
      '/hr/end-of-service',
      '/payroll-report',
      '/employee-statement',
      '/employee-reports',
      '/user-guide'
    ];
    return Boolean(item.to && allowedHrPaths.includes(item.to));
  }

  // فحص الصلاحية للأدوار العامة
  if (item.permission) {
    const [mod, act] = item.permission.split('.');
    return evaluatePermission(userRole, userPermissions, mod, act);
  }

  return true;
};

describe('🛡️ المعمارية الشاملة لتفعيل الصلاحيات المباشرة (Universal Dynamic RBAC Architecture)', () => {
  it('يجب السماح بتحويل الخزن وعرض الخزينة عند منح صلاحية treasury.transfer', () => {
    const hrPermissions = new Set([
      'hr.view',
      'treasury.transfer'
    ]);

    expect(evaluatePermission('hr', hrPermissions, 'treasury', 'transfer')).toBe(true);
    expect(evaluatePermission('hr', hrPermissions, 'treasury', 'view')).toBe(true);
    expect(evaluatePermission('hr', hrPermissions, 'treasury', 'receipt_create')).toBe(false);
  });

  it('يجب أن تظهر شاشة تحويل الخزن /transfer في الشريط الجانبي لموظف HR فور منحه treasury.transfer', () => {
    const hrPermissions = new Set([
      'treasury.transfer'
    ]);

    const transferItem = { to: '/transfer', module: 'treasury', permission: 'treasury.transfer' };
    const receiptItem = { to: '/receipt-voucher', module: 'treasury', permission: 'treasury.receipt_create' };

    expect(isSidebarItemAllowed('hr', hrPermissions, transferItem)).toBe(true);
    // لم يتم منحه سند قبض
    expect(isSidebarItemAllowed('hr', hrPermissions, receiptItem)).toBe(false);
  });

  it('يجب أن تظهر جميع شاشات الخزينة الثلاث (سند قبض، سند صرف، تحويل خزن) لموظف HR في شركة لينزا', () => {
    const hrPermissions = new Set([
      'treasury.receipt_create',
      'treasury.payment_create',
      'treasury.transfer'
    ]);

    const receiptItem = { to: '/receipt-voucher', module: 'treasury', permission: 'treasury.receipt_create' };
    const paymentItem = { to: '/payment-voucher', module: 'treasury', permission: 'treasury.payment_create' };
    const transferItem = { to: '/transfer', module: 'treasury', permission: 'treasury.transfer' };
    const receiptListItem = { to: '/receipt-vouchers-list', module: 'treasury', permission: 'treasury.view' };
    const forbiddenAccounting = { to: '/general-journal', module: 'accounting', permission: 'accounting.view' };

    expect(isSidebarItemAllowed('hr', hrPermissions, receiptItem)).toBe(true);
    expect(isSidebarItemAllowed('hr', hrPermissions, paymentItem)).toBe(true);
    expect(isSidebarItemAllowed('hr', hrPermissions, transferItem)).toBe(true);
    expect(isSidebarItemAllowed('hr', hrPermissions, receiptListItem)).toBe(true);
    expect(isSidebarItemAllowed('hr', hrPermissions, forbiddenAccounting)).toBe(false);
  });

  it('المعمارية العامة: أي دور (مثلاً كاشير) عند منحه أي صلاحية خاصة (مثل تحويل خزن) تظهر له فوراً', () => {
    const cashierPermissions = new Set([
      'treasury.transfer'
    ]);

    const posItem = { to: '/pos', module: 'restaurant', permission: 'restaurant.pos' };
    const transferItem = { to: '/transfer', module: 'treasury', permission: 'treasury.transfer' };
    const ungrantedVoucher = { to: '/payment-voucher', module: 'treasury', permission: 'treasury.payment_create' };

    // يرى نقطة البيع بحكم دوره
    expect(isSidebarItemAllowed('cashier', cashierPermissions, posItem)).toBe(true);
    // يرى شاشة التحويل بحكم الصلاحية المباشرة الممنوحة له
    expect(isSidebarItemAllowed('cashier', cashierPermissions, transferItem)).toBe(true);
    // لا يرى سند الصرف لأنه لم يُمنح له
    expect(isSidebarItemAllowed('cashier', cashierPermissions, ungrantedVoucher)).toBe(false);
  });
});
