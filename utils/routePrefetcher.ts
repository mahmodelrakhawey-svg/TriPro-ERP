/**
 * ==============================================================================
 * 🚀 TriPro ERP — Smart Route & Component Prefetching Engine
 * utils/routePrefetcher.ts
 * ==============================================================================
 * يقوم هذا المحرك بالجلب المسبق الذكي (Pre-fetching) للشاشات كثيرة الاستخدام
 * في الخلفية عند مرور مؤشر الفأرة (Hover) أو أثناء خمول المعالج (Idle time).
 * النتيجة: زمن فتح الشاشة يصبح 0ms تقريباً دون أي انتظار أو وميض تحميل.
 * ==============================================================================
 */

type LoaderFn = () => Promise<any>;

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

/**
 * جلب مسبق لشاشة معينة عند مرور الفأرة
 */
export function prefetchRoute(path: string | undefined): void {
  if (!path || prefetchedRoutes.has(path)) return;

  const normalizedPath = path.split('?')[0];
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
 */
export function prefetchCriticalDailyRoutes(): void {
  if (typeof window === 'undefined') return;

  const runIdle = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1200));

  runIdle(() => {
    prefetchRoute('/pos');
    prefetchRoute('/sales/invoices');
    prefetchRoute('/accounting/journal');
    prefetchRoute('/purchases/invoices');
  });
}
