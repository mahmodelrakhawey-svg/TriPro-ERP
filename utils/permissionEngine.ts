/**
 * ============================================================================
 * محرك الصلاحيات وقواعد التحقق المركزي (Central Permission Engine)
 * TriPro ERP — utils/permissionEngine.ts
 * ============================================================================
 * يوفر تقييماً سريعاً ومنظماً لصلاحيات المستخدمين مع دعم:
 * 1. الأدوار الفائقة (Super Admin, Admin, Owner, Manager)
 * 2. الأدوار القطاعية المتخصصة (HIMS, HR, Stadium, Demo)
 * 3. حراس الموديولات الحساسة (Dashboard & Mobile Access Guards)
 * 4. الرموز الشاملة (Wildcard Pattern Matching)
 * 5. التوريث التلقائي لصلاحيات العرض (View Inheritance)
 * 6. التوافق والترادف الوظيفي (Domain Action Aliases)
 * ============================================================================
 */

import { User } from '../types';

/**
 * خريطة التوافق بين الأفعال والصلاحيات المطلوبة لكل موديول
 */
const DOMAIN_ACTION_ALIASES: Record<string, Record<string, string[]>> = {
  treasury: {
    transfer: ['treasury.transfer', 'treasury.manage', 'treasury.*'],
    manage: ['treasury.manage', 'treasury.transfer', 'treasury.*'],
    receipt_create: ['treasury.receipt_create', 'treasury.create', 'treasury.manage', 'treasury.*'],
    payment_create: ['treasury.payment_create', 'treasury.create', 'treasury.manage', 'treasury.*'],
    create: ['treasury.create', 'treasury.receipt_create', 'treasury.payment_create', 'treasury.manage', 'treasury.*'],
    cheques: ['treasury.cheque_manage', 'treasury.cheques', 'treasury.cheque_collect', 'treasury.manage', 'treasury.*'],
    cheque_manage: ['treasury.cheque_manage', 'treasury.cheques', 'treasury.cheque_collect', 'treasury.manage', 'treasury.*'],
    bank_reconciliation: ['treasury.bank_reconciliation', 'accounting.reconcile', 'treasury.manage', 'treasury.*'],
    reconcile: ['treasury.bank_reconciliation', 'accounting.reconcile', 'treasury.manage', 'treasury.*'],
    update: ['treasury.update', 'treasury.manage', 'treasury.*'],
  },
  accounting: {
    create: ['accounting.journal_create', 'accounting.create', 'accounting.manage', 'accounting.*'],
    journal_create: ['accounting.journal_create', 'accounting.create', 'accounting.manage', 'accounting.*'],
    reconcile: ['accounting.reconcile', 'treasury.bank_reconciliation', 'accounting.manage', 'accounting.*'],
    bank_reconciliation: ['accounting.reconcile', 'treasury.bank_reconciliation', 'accounting.manage', 'accounting.*'],
  },
  hr: {
    payroll_process: ['hr.payroll_process', 'hr.payroll_run', 'hr.manage', 'hr.manage_employee', 'hr.*'],
    payroll_run: ['hr.payroll_process', 'hr.payroll_run', 'hr.manage', 'hr.manage_employee', 'hr.*'],
    manage: ['hr.payroll_process', 'hr.payroll_run', 'hr.manage', 'hr.manage_employee', 'hr.*'],
    advances: ['hr.advances_penalties', 'hr.advances', 'hr.manage', 'hr.*'],
    advances_penalties: ['hr.advances_penalties', 'hr.advances', 'hr.manage', 'hr.*'],
    manage_employee: ['hr.manage_employee', 'hr.manage', 'hr.*'],
  },
  sales: {
    negative_stock: ['sales.negative_stock', 'inventory.negative_stock', 'sales.allow_negative_stock', 'inventory.allow_negative_stock', 'sales.*'],
    allow_negative_stock: ['sales.negative_stock', 'inventory.negative_stock', 'sales.allow_negative_stock', 'inventory.allow_negative_stock', 'sales.*'],
  },
  purchases: {
    return: ['purchases.return', 'purchases.delete', 'purchases.manage', 'purchases.*'],
  },
  inventory: {
    adjustment: ['inventory.adjustment', 'inventory.adjustment_approve', 'inventory.manage', 'inventory.*'],
    negative_stock: ['inventory.negative_stock', 'sales.negative_stock', 'inventory.allow_negative_stock', 'sales.allow_negative_stock', 'inventory.*'],
    allow_negative_stock: ['inventory.negative_stock', 'sales.negative_stock', 'inventory.allow_negative_stock', 'sales.allow_negative_stock', 'inventory.*'],
  },
  reports: {
    multi_currency_statement: ['reports.multi_currency_statement', 'reports.financial_statements', 'reports.view_financial', 'reports.*'],
    cash_bank_movement: ['reports.cash_bank_movement', 'reports.financial_statements', 'reports.view_financial', 'reports.*'],
    income_statement: ['reports.income_statement', 'reports.financial_statements', 'reports.view_financial', 'reports.*'],
    balance_sheet: ['reports.balance_sheet', 'reports.financial_statements', 'reports.view_financial', 'reports.*'],
    trial_balance: ['reports.trial_balance', 'reports.financial_statements', 'reports.view_financial', 'reports.*'],
    cash_flow: ['reports.cash_flow', 'reports.financial_statements', 'reports.view_financial', 'reports.*'],
    changes_in_equity: ['reports.changes_in_equity', 'reports.financial_statements', 'reports.view_financial', 'reports.*'],
    general_ledger: ['reports.general_ledger', 'reports.financial_statements', 'reports.view_financial', 'reports.*'],
    view_financial: ['reports.view_financial', 'reports.financial_statements', 'reports.*'],
    financial_ratios: ['reports.financial_ratios', 'reports.view_financial', 'reports.*'],
    tax_return: ['reports.tax_return', 'reports.view_financial', 'reports.*'],
    customer_aging: ['reports.customer_aging', 'sales.view', 'customers.view', 'reports.*'],
    supplier_aging: ['reports.supplier_aging', 'purchases.view', 'suppliers.view', 'reports.*'],
    customer_statement: ['reports.customer_statement', 'sales.customer_statement', 'customers.view', 'reports.*'],
    supplier_statement: ['reports.supplier_statement', 'purchases.supplier_statement', 'suppliers.view', 'reports.*'],
    employee_statement: ['reports.employee_statement', 'hr.view', 'reports.*'],
    sales_summary: ['reports.sales_summary', 'sales.view', 'reports.*'],
    export_data: ['reports.export_data', 'reports.export', 'reports.*'],
  },
};

/**
 * خريطة الموديولات المتكاملة التي تورث صلاحية العرض
 */
const MODULE_VIEW_INHERITANCE: Record<string, string[]> = {
  treasury: ['accounting.view', 'accounting.*'],
  accounting: ['treasury.view', 'treasury.*'],
  sales: ['customers.view', 'customers.*'],
  purchases: ['suppliers.view', 'suppliers.*'],
  inventory: ['products.view', 'products.*'],
  reports: ['accounting.view', 'accounting.*'],
};

/**
 * تقييم صلاحيات الأدوار المخصصة والقطاعية
 */
function checkRoleSpecificRules(
  role: string,
  module: string,
  action: string
): boolean | null {
  // المدير الطبي
  if (role === 'medical_director') {
    if (module === 'hims' || module.startsWith('hims')) {
      return true;
    }
  }

  // موظفو ومديرو الموارد البشرية
  if (role === 'hr' || role === 'hr_officer' || role === 'hr_manager') {
    if (module === 'hr' || module.startsWith('hr')) {
      return true;
    }
    if (module === 'reports') {
      if (['view', 'general_view', 'export_data', 'export'].includes(action)) {
        return true;
      }
    }
  }

  // قطاع الاستاد والمنشآت الرياضية
  if (role === 'stadium_director') {
    if (module === 'stadium' || module.startsWith('stadium')) {
      return true;
    }
  }

  if (role === 'stadium_receptionist') {
    const receptionistModules = ['stadium/members', 'stadium/bookings', 'stadium/programs', 'stadium/gate-scanner'];
    if (receptionistModules.some(m => module === m || module.startsWith(m))) {
      return action !== 'delete';
    }
    if (module === 'stadium') return true;
  }

  if (role === 'stadium_booking_officer') {
    const bookingModules = ['stadium/bookings', 'stadium/facilities'];
    if (bookingModules.some(m => module === m || module.startsWith(m))) {
      return true;
    }
    if (module === 'stadium') return true;
  }

  if (role === 'stadium_gate_security') {
    if (module === 'stadium/gate-scanner' || module === 'stadium') {
      return true;
    }
    return false;
  }

  if (role === 'stadium_maintenance_lead') {
    const maintModules = ['stadium/maintenance', 'stadium/facilities'];
    if (maintModules.some(m => module === m || module.startsWith(m))) {
      return true;
    }
    if (module === 'stadium') return true;
  }

  if (role === 'stadium_sports_supervisor') {
    const sportsModules = ['stadium/programs', 'stadium/coaches', 'stadium/tournaments', 'stadium/reports'];
    if (sportsModules.some(m => module === m || module.startsWith(m))) {
      return true;
    }
    if (module === 'stadium') return true;
  }

  // مستخدم العرض التجريبي (Demo User)
  if (role === 'demo') {
    if (action === 'delete') return false;
    if (module === 'settings' && action === 'update') return false;
    return true;
  }

  return null;
}

/**
 * فحص حارس لوحة القيادة
 */
function checkDashboardGuard(
  userRole: string | null,
  userPermissions: Set<string>,
  currentUser: User | null
): boolean {
  if (userRole === 'super_admin' || userRole === 'admin' || userRole === 'demo') return true;
  if (currentUser?.can_view_dashboard === false) return false;
  if (userPermissions.has('dashboard.deny')) return false;
  // 🧭 إذا تم تخصيص وضع عرض لوحة القيادة للمستخدم (خريطة العمليات أو التحليلات)
  if (currentUser?.dashboard_view_mode && (currentUser.dashboard_view_mode === 'workflow_only' || currentUser.dashboard_view_mode === 'analytics_only')) return true;
  if (currentUser?.can_view_dashboard === true) return true;
  if (userPermissions.has('dashboard.view') || userPermissions.has('dashboard.*')) return true;
  if (userPermissions.has('*.*')) return true;
  return false;
}

/**
 * فحص حارس تطبيق الموبايل الميداني
 */
function checkMobileGuard(
  userRole: string | null,
  userPermissions: Set<string>,
  currentUser: User | null
): boolean {
  if (userRole === 'super_admin' || userRole === 'admin') return true;
  if (userRole === 'van_sales') return true;
  if (currentUser?.can_access_mobile === false) return false;
  if (userPermissions.has('mobile.deny')) return false;
  if (currentUser?.can_access_mobile === true) return true;
  if (userPermissions.has('mobile.view') || userPermissions.has('mobile.access') || userPermissions.has('mobile.*')) return true;
  if (userPermissions.has('*.*')) return true;
  return false;
}

/**
 * الدالة المركزية لتقييم الصلاحية
 */
export function evaluatePermission(
  module: string,
  action: string,
  userRole: string | null,
  userPermissions: Set<string>,
  currentUser: User | null
): boolean {
  // 1. صلاحيات الإدارة العليا الكاملة (Super Admin, Admin & Owner Full Access)
  if (
    userRole === 'super_admin' ||
    userRole === 'admin' ||
    userRole === 'owner'
  ) {
    return true;
  }

  // 1.1 مدير العمليات / الفروع (Manager)
  // يملك صلاحيات تشغيلية واسعة ولكن لا يتجاوز العمليات الإدارية الحساسة وإعدادات النظام دون تدقيق
  if (userRole === 'manager') {
    const sensitiveAdminActions = new Set([
      'settings.delete',
      'settings.manage',
      'users.delete',
      'organization.delete',
      'audit.clear',
      'roles.manage'
    ]);
    if (!sensitiveAdminActions.has(`${module}.${action}`)) {
      return true;
    }
  }

  // 2. التحقق من القواعد الخاصة بالأدوار القطاعية
  if (userRole) {
    const roleDecision = checkRoleSpecificRules(userRole, module, action);
    if (roleDecision !== null) {
      return roleDecision;
    }
  }

  // 3. حراس الموديولات الحساسة (Guards)
  if (module === 'dashboard') {
    return checkDashboardGuard(userRole, userPermissions, currentUser);
  }

  if (module === 'mobile') {
    return checkMobileGuard(userRole, userPermissions, currentUser);
  }

  // 🛡️ فحص مباشر واستثنائي لصلاحية البيع بالسالب للمستخدم
  if (action === 'negative_stock' || action === 'allow_negative_stock') {
    if (
      Boolean((currentUser as any)?.allow_negative_stock) ||
      Boolean((currentUser as any)?.allowNegativeStock) ||
      Boolean((currentUser as any)?.user_metadata?.allow_negative_stock) ||
      Boolean((currentUser as any)?.user_metadata?.allowNegativeStock)
    ) {
      return true;
    }
  }

  // 4. مطابقة الرموز الشاملة (Wildcard Pattern Matching)
  if (
    userPermissions.has(`${module}.${action}`) ||
    userPermissions.has(`${module}.*`) ||
    userPermissions.has(`*.${action}`) ||
    userPermissions.has('*.*')
  ) {
    return true;
  }

  // 5. التوريث التلقائي لصلاحيات العرض (View Inheritance)
  if (action === 'view') {
    for (const p of userPermissions) {
      if (p.startsWith(`${module}.`) || p === '*.*' || p === `${module}.*`) {
        return true;
      }
    }

    const inheritFrom = MODULE_VIEW_INHERITANCE[module];
    if (inheritFrom) {
      for (const requiredPerm of inheritFrom) {
        if (userPermissions.has(requiredPerm)) {
          return true;
        }
      }
    }
  }

  // 6. التحقق عبر خريطة التوافق والترادف الوظيفي (Domain Aliases)
  const moduleAliases = DOMAIN_ACTION_ALIASES[module];
  if (moduleAliases && moduleAliases[action]) {
    const requiredPerms = moduleAliases[action];
    for (const perm of requiredPerms) {
      if (userPermissions.has(perm)) {
        return true;
      }
    }
  }

  // 7. موديول المطاعم ونقاط البيع
  if (module === 'restaurant' || module === 'retail') {
    if (
      userPermissions.has('restaurant.pos') ||
      userPermissions.has('restaurant.kitchen') ||
      userPermissions.has('restaurant.manage') ||
      userPermissions.has('sales.view') ||
      userPermissions.has('retail.*') ||
      userPermissions.has('retail.pos')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * بنية معلومات المنظمة لفحص الموديولات المتاحة
 */
export interface OrganizationModuleScope {
  allowed_modules?: string[] | null;
  plan?: string | null;
  activity_type?: string | null;
}

/**
 * فحص إتاحة الموديول على مستوى المنظمة واشتراكها التجاري
 * يجمع بين 3 مستويات من التخصيص:
 * 1. قائمة الموديولات المخصصة الصريحة (allowed_modules) إن وجدت
 * 2. باقة اشتراك المنظمة (plan: basic, pro, sports, premium, enterprise)
 * 3. نوع نشاط المنظمة التجاري (activity_type)
 */
export function isModuleAllowedForOrganization(
  module: string,
  organization?: OrganizationModuleScope | null,
  userRole?: string | null
): boolean {
  if (!module) return true;

  // 1. صلاحيات السوبر أدمن والمالك وحساب الديمو غير مقيدة
  const role = String(userRole || '').toLowerCase();
  if (role === 'super_admin' || role === 'owner' || role === 'demo') {
    return true;
  }

  // إذا لم يتم تحديد منظمة، نسمح افتراضياً
  if (!organization) return true;

  const rawMod = module.toLowerCase().trim();
  const normalizedModule = rawMod === 'mfg' ? 'manufacturing' : rawMod;

  // 2. إذا تم تخصيص قائمة صريحة للموديولات (Explicit allowed_modules)
  const allowed = organization.allowed_modules;
  if (Array.isArray(allowed) && allowed.length > 0) {
    if (normalizedModule === 'reports' || normalizedModule === 'treasury') {
      return allowed.includes(normalizedModule) || allowed.includes('accounting');
    }
    if (normalizedModule === 'restaurant' || normalizedModule === 'kitchen') {
      return allowed.includes('restaurant') || allowed.includes('pos');
    }
    if (normalizedModule === 'pos' || normalizedModule === 'retail') {
      return allowed.includes('retail') || allowed.includes('pos');
    }
    if (normalizedModule === 'manufacturing' || normalizedModule === 'mfg') {
      return allowed.includes('manufacturing') || allowed.includes('mfg');
    }
    return allowed.includes(normalizedModule) || allowed.includes(rawMod);
  }

  // 3. النواة الأساسية للنظام (Core ERP) متاحة لجميع الشركات والباقات دائماً
  const coreModules = ['dashboard', 'mobile', 'accounting', 'treasury', 'sales', 'purchases', 'inventory', 'reports', 'settings', 'admin'];
  if (coreModules.includes(normalizedModule)) {
    return true;
  }

  // 4. الباقة الشاملة (Enterprise) أو عدم وجود باقة محددة -> إتاحة كاملة دون حجب
  const plan = String(organization.plan || '').toLowerCase().trim();
  const activity = String(organization.activity_type || '').toLowerCase().trim();

  if (!plan && !activity) return true;
  if (plan === 'enterprise' || activity === 'all' || activity === 'enterprise') return true;

  // تحديد الموديول المستهدف
  const isRestaurant = normalizedModule === 'restaurant' || normalizedModule === 'kitchen';
  const isMfg = normalizedModule === 'manufacturing' || normalizedModule === 'mfg';
  const isConstruction = normalizedModule === 'construction';
  const isHims = normalizedModule === 'hims';
  const isStadium = normalizedModule === 'stadium';
  const isRetailPos = normalizedModule === 'retail' || normalizedModule === 'pos';

  // 5. التحقق عبر النشاط التجاري (activity_type) إن كان محدداً
  if (activity) {
    if (isRestaurant && (activity.includes('restaurant') || activity.includes('food') || activity.includes('cafe') || activity.includes('bakery') || activity.includes('confectionery'))) return true;
    if (isMfg && (activity.includes('manufacturing') || activity.includes('factory') || activity.includes('industry'))) return true;
    if (isConstruction && (activity.includes('construction') || activity.includes('contracting') || activity.includes('projects'))) return true;
    if (isHims && (activity.includes('healthcare') || activity.includes('hospital') || activity.includes('clinic') || activity.includes('hims'))) return true;
    if (isStadium && (activity.includes('sports') || activity.includes('stadium') || activity.includes('club'))) return true;
  }

  // 6. التحقق عبر الباقة التعاقدية (plan)
  if (plan) {
    if (plan === 'basic') {
      // باقة أساسية فقط: لا تشمل المطاعم، المصانع، المقاولات، المستشفيات، أو الملاعب
      return !isRestaurant && !isMfg && !isConstruction && !isHims && !isStadium;
    }
    if (plan === 'pro') {
      // باقة احترافية: تشمل نقاط البيع، الموارد البشرية، المطاعم، والحلويات والتصنيع
      // وتحجب فقط القطاعات شديدة التخصص (المستشفيات، الملاعب الرياضية، والمقاولات)
      if (isConstruction || isHims || isStadium) return false;
      return true;
    }
    if (plan === 'sports') {
      // باقة النوادي والملاعب
      return isStadium || isRetailPos;
    }
    if (plan === 'premium') {
      // باقة بريميوم: تشمل كل شيء عدا المستشفيات أو الملاعب أو المقاولات إن لم تكن مطلوبة
      if (isHims || isStadium || isConstruction) return false;
      return true;
    }
  }

  return true;
}
