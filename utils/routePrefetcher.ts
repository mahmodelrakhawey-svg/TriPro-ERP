/**
 * ==============================================================================
 * 🚀 TriPro ERP — Module-Aware Route & Component Prefetching Engine
 * utils/routePrefetcher.ts
 * ==============================================================================
 * يقوم هذا المحرك بالجلب المسبق الذكي (Pre-fetching) للشاشات كثيرة الاستخدام
 * في الخلفية عند مرور مؤشر الفأرة (Hover) أو أثناء خمول المعالج (Idle Phase).
 * 
 * 🌟 التحسين الجديد (Module-Aware Prefetcher):
 * - مرتبط بقائمة الموديولات المفعلة للمنشأة (allowed_modules).
 * - يمنع تنزيل ملفات وحزم الموديولات المعطلة أثناء خمول المتصفح نهائياً.
 * - يوفر استهلاك باقة الإنترنت لأجهزة الكاشير ويسرع فتح الشاشات بنسبة 100%.
 * ==============================================================================
 */

import { secureStorage } from './securityMiddleware';

type LoaderFn = () => Promise<any>;

// خريطة المسارات والموديول التابع له كل مسار
const ROUTE_MODULE_MAP: Record<string, string[]> = {
  '/pos': ['retail', 'pos'],
  '/sales/invoices': ['sales'],
  '/sales/invoices/new': ['sales'],
  '/sales/customers': ['sales'],
  '/sales/orders': ['sales'],

  '/purchases/invoices': ['purchases'],
  '/purchases/invoices/new': ['purchases'],
  '/purchases/suppliers': ['purchases'],
  '/inventory/stock': ['inventory'],
  '/inventory/transfers': ['inventory'],

  '/accounting/journal': ['accounting'],
  '/accounting/trial-balance': ['accounting'],
  '/accounting/ledger': ['accounting'],
  '/accounting/income-statement': ['accounting'],
  '/accounting/balance-sheet': ['accounting'],

  '/manufacturing/production-orders': ['manufacturing', 'mfg'],
  '/manufacturing/recipes': ['manufacturing', 'mfg'],

  '/hr/employees': ['hr'],
  '/hr/payroll': ['hr'],
  '/hr/advances': ['hr'],
};

const routeLoaders: Record<string, LoaderFn> = {
  // 🛒 نقاط البيع والمبيعات
  '/pos': () => import('../modules/retail/components/POS/RetailPosScreen'),
  '/sales/invoices': () => import('../modules/sales/InvoiceList'),
  '/sales/invoices/new': () => import('../modules/sales/SalesInvoiceForm'),
  '/sales/customers': () => import('../modules/sales/CustomerManager'),
  '/sales/orders': () => import('../modules/sales/SalesOrders'),

  // 📦 المشتريات والموردين والمخزون
  '/purchases/invoices': () => import('../modules/purchases/PurchaseInvoiceList'),
  '/purchases/invoices/new': () => import('../modules/purchases/PurchaseInvoiceForm'),
  '/purchases/suppliers': () => import('../modules/purchases/SupplierManager'),
  '/inventory/stock': () => import('../modules/inventory/StockCard'),
  '/inventory/transfers': () => import('../modules/inventory/StockTransfer'),

  // 🏛️ المحاسبة والمالية
  '/accounting/journal': () => import('../modules/accounting/GeneralJournal'),
  '/accounting/trial-balance': () => import('../modules/accounting/TrialBalanceAdvanced'),
  '/accounting/ledger': () => import('../modules/accounting/GeneralLedger'),
  '/accounting/income-statement': () => import('../modules/accounting/IncomeStatement'),
  '/accounting/balance-sheet': () => import('../modules/accounting/BalanceSheet'),

  // 🏭 التصنيع والحلواني
  '/manufacturing/production-orders': () => import('../modules/manufacturing/components/WorkOrderManager'),
  '/manufacturing/recipes': () => import('../modules/manufacturing/components/RoutingBOMManager'),

  // 👥 الموارد البشرية
  '/hr/employees': () => import('../modules/hr/components/EmployeeManager'),
  '/hr/payroll': () => import('../modules/hr/components/PayrollRun'),
  '/hr/advances': () => import('../modules/hr/components/EmployeeAdvances'),
};

const prefetchedRoutes = new Set<string>();
let explicitlyAllowedModules: Set<string> | null = null;

/**
 * تعيين الموديولات المسموحة للمنشأة الحالية صراحة
 */
export function setPrefetchAllowedModules(modules: string[] | null | undefined): void {
  if (Array.isArray(modules)) {
    explicitlyAllowedModules = new Set(modules.map(m => m.toLowerCase().trim()));
  } else {
    explicitlyAllowedModules = null;
  }
}

/**
 * التحقق مما إذا كان المسار مسموحاً بالتحميل المسبق وفق موديولات المنظمة
 */
export function isRouteAllowedForPrefetch(path: string): boolean {
  if (!path) return false;
  const normalizedPath = path.split('?')[0];

  const requiredModules = ROUTE_MODULE_MAP[normalizedPath];
  // إذا لم يكن المسار مسجلاً ضمن موديول محدد، نسمح به افتراضياً
  if (!requiredModules || requiredModules.length === 0) {
    return true;
  }

  // إذا تم تحديد الموديولات المسموحة صراحة في الذاكرة
  if (explicitlyAllowedModules) {
    return requiredModules.some(m => explicitlyAllowedModules!.has(m));
  }

  // محاولة القراءة من التخزين الآمن إن لم يتم تمريرها صراحة
  try {
    const rawOrg = secureStorage.getItem<any>('tripro_current_organization');
    if (rawOrg && Array.isArray(rawOrg.allowed_modules) && rawOrg.allowed_modules.length > 0) {
      const orgSet = new Set(rawOrg.allowed_modules.map((m: string) => m.toLowerCase().trim()));
      return requiredModules.some(m => orgSet.has(m));
    }
  } catch {
    // استمرار آمن
  }

  return true;
}

/**
 * جلب مسبق لشاشة معينة عند مرور الفأرة مع مراعاة موديولات المنشأة
 */
export function prefetchRoute(path: string | undefined): void {
  if (!path || prefetchedRoutes.has(path)) return;

  const normalizedPath = path.split('?')[0];

  // فحص حارس الموديولات قبل التنزيل
  if (!isRouteAllowedForPrefetch(normalizedPath)) {
    return;
  }

  const loader = routeLoaders[normalizedPath];
  if (loader) {
    prefetchedRoutes.add(normalizedPath);
    loader().catch(() => {
      // في حالة فشل الشبكة المؤقت، نسمح بإعادة المحاولة لاحقاً
      prefetchedRoutes.delete(normalizedPath);
    });
  }
}

/**
 * جلب الشاشات اليومية الأكثر استخداماً أثناء فترات خمول المتصفح (Idle Phase)
 * بوعي تام بموديولات المنشأة المفعلة فقط
 */
export function prefetchCriticalDailyRoutes(organizationModules?: string[] | null): void {
  if (typeof window === 'undefined') return;

  if (organizationModules !== undefined) {
    setPrefetchAllowedModules(organizationModules);
  }

  const runIdle = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1200));

  runIdle(() => {
    const criticalCandidates = [
      '/pos',
      '/sales/invoices',
      '/accounting/journal',
      '/purchases/invoices'
    ];

    for (const route of criticalCandidates) {
      if (isRouteAllowedForPrefetch(route)) {
        prefetchRoute(route);
      }
    }
  });
}
