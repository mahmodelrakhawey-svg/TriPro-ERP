import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccounting } from '../context/AccountingContext';
import { 
    LayoutDashboard, BookOpen, FileText, PieChart, Settings,
    ScrollText, Library, ShoppingCart, Users, Truck, Package, 
    Receipt, RotateCcw, ClipboardList, History, Banknote, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Scale, Store, Wallet, TrendingUp, LogOut, Shield, ListChecks, Landmark, MonitorSmartphone, Briefcase, Settings as Cog, PenTool, FileCheck, Calculator, Gauge, Target, BarChartHorizontal, Bell, BarChartBig, FileMinus, FilePlus, PackageX, CircleDollarSign, FileSpreadsheet, PackageOpen, ShieldAlert, X, BarChart2, ShieldCheck, HelpCircle
    , Lock, Trash2, AlertTriangle
} from 'lucide-react';

const Sidebar = () => {
  const location = useLocation();
  const { currentUser, userPermissions, settings } = useAccounting();

  const getNavClass = (path: string) => {
    const isActive = path === '/' 
      ? location.pathname === '/' 
      : location.pathname.startsWith(path);

    return `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${
      isActive 
        ? 'bg-blue-600 text-white shadow-md translate-x-[-4px]' 
        : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600'
    }`;
  };

  const role = currentUser?.role || 'viewer';
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;

  // Helper to check permissions
  const hasAccess = (modules: string[]) => {
      if (isSuperAdmin) return true;
      if (role === 'demo') return true; // السماح لمستخدم الديمو برؤية كل المديولات
      if (!userPermissions || userPermissions.size === 0) return false;
      
      for (const perm of userPermissions) {
          const [mod] = perm.split('.');
          if (mod === '*' || modules.includes(mod)) return true;
      }
      return false;
  };

  // Helper to check granular permissions (Link Level)
  const canShow = (module: string | string[], keywords: string[]) => {
      if (isSuperAdmin) return true;
      if (role === 'demo') return true; // السماح لمستخدم الديمو برؤية كل الروابط
      if (!userPermissions || userPermissions.size === 0) return false;

      const modulesToCheck = Array.isArray(module) ? module : [module];

      for (const perm of userPermissions) {
          const [permModule, permAction = ''] = perm.split('.');
          // Check if the permission module is one of the modules we're looking for
          if (permModule === '*' || modulesToCheck.includes(permModule)) {
              // Grant access if the action is a wildcard
              if (permAction === '*' || permAction === 'manage' || permAction === 'all') return true;
              
              // Improved Smart matching logic
              // 1. Identify specific keywords in the requested link (e.g. 'invoice' from ['invoice', 'create'])
              const specificKeywords = keywords.filter(k => !['create', 'read', 'view', 'list', 'update', 'delete'].includes(k));
              
              // 2. If the permission action contains any of the specific keywords, grant access
              // e.g. perm='create_invoice' contains 'invoice' -> True
              if (specificKeywords.length > 0 && specificKeywords.some(k => permAction.includes(k))) {
                  return true;
              }

              // 3. If no specific match, check if the permission itself is generic (e.g. 'create')
              // and matches one of the requested keywords.
              const isGenericPerm = ['create', 'read', 'view', 'list', 'update', 'delete', 'manage', 'all'].includes(permAction);
              
              if (isGenericPerm) {
                  if (keywords.some(k => permAction.includes(k))) return true;
                  // Handle common synonyms
                  if (permAction === 'view' && keywords.includes('read')) return true;
                  if (permAction === 'read' && keywords.includes('view')) return true;
              }
          }
      }
      return false;
  };

  // Permission Logic - Updated to match DB modules: 'treasury', 'sales', 'purchases', 'inventory', 'journal_entries', 'hr', 'reports'
  const canAccessFinancials = hasAccess(['treasury', 'finance']);
  const canAccessSales = hasAccess(['sales', 'customers']);
  const canAccessPurchases = hasAccess(['purchases', 'suppliers']);
  const canAccessInventory = hasAccess(['inventory', 'products']);
  const canAccessAccounting = hasAccess(['journal_entries', 'accounting', 'reports']);
  const canAccessHR = hasAccess(['hr']);
  const canAccessManufacturing = hasAccess(['manufacturing']);
  
  return (
    <aside className="w-64 bg-white border-l border-slate-200 h-screen sticky top-0 flex flex-col shadow-sm print:hidden">
      <div className="p-6 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50 relative">
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-20 h-20 object-contain" />
          ) : (
            <img src="/logo.jpg" alt="Logo" className="w-20 h-20 object-contain" />
          )}
          TriPro ERP
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <Link to="/" className={getNavClass('/')}>
          <LayoutDashboard size={18} />
          <span>لوحة القيادة</span>
        </Link>

        {canAccessAccounting && (
            <>
             {canShow(['reports', 'accounting'], ['ratio', 'analysis', 'report', 'read']) && (
             <Link to="/financial-ratios" className={getNavClass('/financial-ratios')}>
                <Gauge size={18} />
                <span>التحليل المالي والنسب</span>
            </Link>
            )}
            {canShow(['reports', 'accounting'], ['expense', 'analysis', 'report', 'read']) && (
            <Link to="/expense-analysis" className={getNavClass('/expense-analysis')}>
                <PieChart size={18} />
                <span>تحليل المصروفات</span>
            </Link>
            )}
            {canShow(['accounting', 'budgets'], ['budget', 'create', 'read']) && (
            <Link to="/budget-setup" className={getNavClass('/budget-setup')}>
                <Target size={18} />
                <span>إعداد الموازنة</span>
            </Link>
            )}
            {canShow(['accounting', 'budgets'], ['budget', 'report', 'read']) && (
            <Link to="/budget-report" className={getNavClass('/budget-report')}>
                <BarChartHorizontal size={18} />
                <span>انحرافات الموازنة</span>
            </Link>
            )}
            </>
        )}
        
        {/* Treasury Module (Mapped to 'treasury' in DB) */}
        {(canAccessFinancials || role === 'demo') && (
            <>
                <div className="pt-4 pb-2 text-xs font-bold text-slate-400 px-4 flex items-center gap-2">
                    <span className="w-full h-px bg-slate-200"></span>
                    <span className="whitespace-nowrap">الخزينة والبنوك</span>
                    <span className="w-full h-px bg-slate-200"></span>
                </div>
                {canShow(['treasury'], ['create']) && (
                <Link to="/receipt-voucher" className={getNavClass('/receipt-voucher')}>
                <ArrowDownLeft size={18} />
                <span>سند قبض (عميل/عام)</span>
                </Link>
                )}
                {canShow(['treasury'], ['view', 'read']) && (
                <Link to="/receipt-vouchers-list" className={getNavClass('/receipt-vouchers-list')}>
                <ListChecks size={18} />
                <span>سجل سندات القبض</span>
                </Link>
                )}
                {canShow(['treasury'], ['create']) && (
                <Link to="/customer-deposit" className={getNavClass('/customer-deposit')}>
                <ShieldCheck size={18} />
                <span>سند قبض تأمين</span>
                </Link>
                )}
                {canShow(['treasury'], ['create']) && (
                <Link to="/payment-voucher" className={getNavClass('/payment-voucher')}>
                <ArrowUpRight size={18} />
                <span>سند صرف (مورد/عام)</span>
                </Link>
                )}
                {canShow(['treasury'], ['view', 'read']) && (
                <Link to="/payment-vouchers-list" className={getNavClass('/payment-vouchers-list')}>
                <ListChecks size={18} />
                <span>سجل سندات الصرف</span>
                </Link>
                )}
                {canShow(['treasury'], ['create']) && (
                <Link to="/expense-voucher" className={getNavClass('/expense-voucher')}>
                <Wallet size={18} />
                <span>سند صرف مصروف</span>
                </Link>
                )}
                {canShow(['treasury'], ['create', 'read']) && (
                <Link to="/cheques" className={getNavClass('/cheques')}>
                <Landmark size={18} />
                <span>إدارة الشيكات</span>
                </Link>
                )}
                {canShow(['treasury'], ['create']) && (
                <Link to="/transfer" className={getNavClass('/transfer')}>
                <ArrowRightLeft size={18} />
                <span>تحويل نقدية/بنوك</span>
                </Link>
                )}
                {canShow(['treasury'], ['create']) && (
                <Link to="/bank-reconciliation" className={getNavClass('/bank-reconciliation')}>
                <Scale size={18} />
                <span>تسوية بنكية</span>
                </Link>
                )}
                {canShow(['treasury'], ['create']) && (
                <Link to="/cash-closing" className={getNavClass('/cash-closing')}>
                <Lock size={18} />
                <span>إقفال الصندوق</span>
                </Link>
                )}
                {canShow(['treasury', 'reports'], ['view', 'read']) && (
                <Link to="/cash-flow-report" className={getNavClass('/cash-flow-report')}>
                <Wallet size={18} />
                <span>حركة الصندوق والبنوك</span>
                </Link>
                )}
                {canShow(['treasury', 'reports'], ['view', 'read']) && (
                <Link to="/payment-method-report" className={getNavClass('/payment-method-report')}>
                <BarChart2 size={18} />
                <span>تقرير طرق الدفع</span>
                </Link>
                )}
            </>
        )}

        {/* Sales & CRM Module (Mapped to 'sales' and 'customers' in DB) */}
        {(canAccessSales || role === 'demo') && (
            <>
                <div className="pt-4 pb-2 text-xs font-bold text-slate-400 px-4 flex items-center gap-2">
                    <span className="w-full h-px bg-slate-200"></span>
                    <span className="whitespace-nowrap">المبيعات والعملاء</span>
                    <span className="w-full h-px bg-slate-200"></span>
                </div>
                {canShow(['sales'], ['create']) && (
                <Link to="/quotations-new" className={getNavClass('/quotations-new')}>
                <FileText size={18} />
                <span>عرض سعر جديد</span>
                </Link>
                )}
                {canShow(['sales'], ['view', 'read']) && (
                <Link to="/quotations-list" className={getNavClass('/quotations-list')}>
                <ListChecks size={18} />
                <span>سجل العروض</span>
                </Link>
                )}
                {canShow(['sales'], ['create']) && (
                <Link to="/sales-invoice" className={getNavClass('/sales-invoice')}>
                <Receipt size={18} />
                <span>فاتورة مبيعات</span>
                </Link>
                )}
                {canShow(['sales'], ['view', 'read']) && (
                <Link to="/invoices-list" className={getNavClass('/invoices-list')}>
                <ListChecks size={18} />
                <span>سجل الفواتير</span>
                </Link>
                )}
                {canShow(['sales'], ['create']) && (
                <Link to="/sales-return" className={getNavClass('/sales-return')}>
                <RotateCcw size={18} />
                <span>مرتجع مبيعات</span>
                </Link>
                )}
                {canShow(['sales'], ['create']) && (
                <Link to="/credit-note" className={getNavClass('/credit-note')}>
                <FileMinus size={18} />
                <span>إشعار دائن</span>
                </Link>
                )}
                {canShow(['sales'], ['view', 'read']) && (
                <Link to="/credit-notes-list" className={getNavClass('/credit-notes-list')}>
                <ListChecks size={18} />
                <span>سجل الإشعارات الدائنة</span>
                </Link>
                )}
                {canShow(['customers'], ['create', 'read', 'view']) && (
                <Link to="/customers" className={getNavClass('/customers')}>
                <Users size={18} />
                <span>العملاء</span>
                </Link>
                )}
                {canShow(['customers', 'sales'], ['read', 'view']) && (
                <Link to="/customer-statement" className={getNavClass('/customer-statement')}>
                <FileText size={18} />
                <span>كشف حساب عميل</span>
                </Link>
                )}
                {canShow(['reports', 'sales'], ['read', 'view']) && (
                <Link to="/customer-aging" className={getNavClass('/customer-aging')}>
                <History size={18} />
                <span>أعمار الديون</span>
                </Link>
                )}
                {canShow(['reports', 'sales'], ['read', 'view']) && (
                <Link to="/sales-reports" className={getNavClass('/sales-reports')}>
                <BarChartBig size={18} />
                <span>تقارير المبيعات</span>
                </Link>
                )}
                {canShow(['reports', 'sales'], ['read', 'view']) && (
                <Link to="/item-sales-analysis" className={getNavClass('/item-sales-analysis')}>
                <BarChart2 size={18} />
                <span>تحليل مبيعات الأصناف</span>
                </Link>
                )}
            </>
        )}

        {/* Purchasing Module (Mapped to 'purchases' and 'suppliers' in DB) */}
        {(canAccessPurchases || role === 'demo') && (
            <>
                <div className="pt-4 pb-2 text-xs font-bold text-slate-400 px-4 flex items-center gap-2">
                    <span className="w-full h-px bg-slate-200"></span>
                    <span className="whitespace-nowrap">إدارة المشتريات</span>
                    <span className="w-full h-px bg-slate-200"></span>
                </div>
                {canShow(['purchases'], ['create']) && (
                <Link to="/purchase-order-new" className={getNavClass('/purchase-order-new')}>
                <FileCheck size={18} />
                <span>أمر شراء جديد (PO)</span>
                </Link>
                )}
                {canShow(['purchases'], ['view', 'read']) && (
                <Link to="/purchase-order-list" className={getNavClass('/purchase-order-list')}>
                <ListChecks size={18} />
                <span>سجل أوامر الشراء</span>
                </Link>
                )}
                {canShow(['purchases'], ['create']) && (
                <Link to="/purchase-invoice" className={getNavClass('/purchase-invoice')}>
                <ShoppingCart size={18} />
                <span>فاتورة مشتريات</span>
                </Link>
                )}
                {canShow(['purchases'], ['view', 'read']) && (
                <Link to="/purchase-invoices-list" className={getNavClass('/purchase-invoices-list')}>
                <ListChecks size={18} />
                <span>سجل فواتير المشتريات</span>
                </Link>
                )}
                {canShow(['purchases'], ['create']) && (
                <Link to="/purchase-return" className={getNavClass('/purchase-return')}>
                <RotateCcw size={18} />
                <span>مرتجع مشتريات</span>
                </Link>
                )}
                {canShow(['purchases'], ['create']) && (
                <Link to="/debit-note" className={getNavClass('/debit-note')}>
                <FilePlus size={18} />
                <span>إشعار مدين</span>
                </Link>
                )}
                {canShow(['purchases'], ['view', 'read']) && (
                <Link to="/debit-notes-list" className={getNavClass('/debit-notes-list')}>
                <ListChecks size={18} />
                <span>سجل الإشعارات المدينة</span>
                </Link>
                )}
                {canShow(['suppliers'], ['create', 'read', 'view']) && (
                <Link to="/suppliers" className={getNavClass('/suppliers')}>
                <Truck size={18} />
                <span>الموردين</span>
                </Link>
                )}
                {canShow(['suppliers', 'purchases'], ['read', 'view']) && (
                <Link to="/supplier-statement" className={getNavClass('/supplier-statement')}>
                <FileText size={18} />
                <span>كشف حساب مورد</span>
                </Link>
                )}
                {canShow(['reports', 'purchases'], ['read', 'view']) && (
                <Link to="/supplier-aging" className={getNavClass('/supplier-aging')}>
                <History size={18} />
                <span>أعمار الديون</span>
                </Link>
                )}
                {canShow(['reports', 'purchases'], ['read', 'view']) && (
                <Link to="/purchase-reports" className={getNavClass('/purchase-reports')}>
                <BarChartBig size={18} />
                <span>تقارير المشتريات</span>
                </Link>
                )}
                {canShow(['reports', 'purchases'], ['read', 'view']) && (
                <Link to="/net-purchases-report" className={getNavClass('/net-purchases-report')}>
                <BarChart2 size={18} />
                <span>صافي المشتريات</span>
                </Link>
                )}
                {canShow(['reports', 'purchases'], ['read', 'view']) && (
                <Link to="/purchase-analysis" className={getNavClass('/purchase-analysis')}>
                <BarChart2 size={18} />
                <span>تحليل المشتريات</span>
                </Link>
                )}
            </>
        )}

        {/* Manufacturing Module */}
        {(canAccessManufacturing || role === 'demo') && (
            <>
                <div className="pt-4 pb-2 text-xs font-bold text-slate-400 px-4 flex items-center gap-2">
                    <span className="w-full h-px bg-slate-200"></span>
                    <span className="whitespace-nowrap">التصنيع</span>
                    <span className="w-full h-px bg-slate-200"></span>
                </div>
                {canShow(['manufacturing'], ['create', 'read']) && (
                <Link to="/manufacturing" className={getNavClass('/manufacturing')}>
                    <Cog size={18} />
                    <span>التصنيع والإنتاج</span>
                </Link>
                )}
                {canShow(['manufacturing', 'reports'], ['read']) && (
                <Link to="/production-cost-analysis" className={getNavClass('/production-cost-analysis')}>
                    <BarChart2 size={18} />
                    <span>تحليل تكاليف الإنتاج</span>
                </Link>
                )}
            </>
        )}

        {/* Inventory Module (Mapped to 'inventory' and 'products' in DB) */}
        {(canAccessInventory || role === 'demo') && (
            <>
                <div className="pt-4 pb-2 text-xs font-bold text-slate-400 px-4 flex items-center gap-2">
                    <span className="w-full h-px bg-slate-200"></span>
                    <span className="whitespace-nowrap">إدارة المخزون</span>
                    <span className="w-full h-px bg-slate-200"></span>
                </div>
                {canShow(['inventory'], ['create', 'read']) && (
                <Link to="/warehouses" className={getNavClass('/warehouses')}>
                <Store size={18} />
                <span>الفروع والمستودعات</span>
                </Link>
                )}
                {canShow(['products'], ['create', 'read', 'view']) && (
                <Link to="/products" className={getNavClass('/products')}>
                <Package size={18} />
                <span>الأصناف والمخزون</span>
                </Link>
                )}
                {canShow(['inventory'], ['create']) && (
                <Link to="/opening-inventory" className={getNavClass('/opening-inventory')}>
                <PackageOpen size={18} />
                <span>بضاعة أول المدة</span>
                </Link>
                )}
                {canShow(['inventory'], ['create']) && (
                <Link to="/stock-transfer" className={getNavClass('/stock-transfer')}>
                <ArrowRightLeft size={18} />
                <span>تحويل مخزني</span>
                </Link>
                )}
                {canShow(['inventory'], ['view', 'read']) && (
                <Link to="/stock-transfer-list" className={getNavClass('/stock-transfer-list')}>
                <ListChecks size={18} />
                <span>سجل التحويلات</span>
                </Link>
                )}
                {canShow(['inventory', 'reports'], ['read', 'view']) && (
                <Link to="/item-movement" className={getNavClass('/item-movement')}>
                <ArrowRightLeft size={18} />
                <span>حركة صنف</span>
                </Link>
                )}
                {canShow(['inventory', 'reports'], ['read', 'view']) && (
                <Link to="/top-selling" className={getNavClass('/top-selling')}>
                <TrendingUp size={18} />
                <span>الأكثر مبيعاً</span>
                </Link>
                )}
                {canShow(['inventory', 'reports'], ['read', 'view']) && (
                <Link to="/slow-moving" className={getNavClass('/slow-moving')}>
                <PackageX size={18} />
                <span>الأصناف الراكدة</span>
                </Link>
                )}
                {canShow(['inventory', 'reports'], ['read', 'view']) && (
                <Link to="/item-profit" className={getNavClass('/item-profit')}>
                <CircleDollarSign size={18} />
                <span>أرباح الأصناف</span>
                </Link>
                )}
                {canShow(['inventory'], ['create']) && (
                <Link to="/inventory-count" className={getNavClass('/inventory-count')}>
                <Calculator size={18} />
                <span>جرد المستودعات</span>
                </Link>
                )}
                {canShow(['inventory'], ['view', 'read']) && (
                <Link to="/inventory-history" className={getNavClass('/inventory-history')}>
                <History size={18} />
                <span>سجل عمليات الجرد</span>
                </Link>
                )}
                {canShow(['inventory'], ['create']) && (
                <Link to="/stock-adjustment" className={getNavClass('/stock-adjustment')}>
                <ClipboardList size={18} />
                <span>تسوية مخزنية</span>
                </Link>
                )}
                {canShow(['inventory'], ['revalue', 'update']) && (
                <Link to="/inventory-revaluation" className={getNavClass('/inventory-revaluation')}>
                    <CircleDollarSign size={18} />
                    <span>إعادة تقييم التكلفة</span>
                </Link>
                )}
                {canShow(['inventory', 'reports'], ['read', 'view']) && (
                <Link to="/stock-movement-cost" className={getNavClass('/stock-movement-cost')}>
                    <BarChart2 size={18} />
                    <span>حركة وتكلفة المخزون</span>
                </Link>
                )}
                {canShow(['inventory', 'reports'], ['read', 'view']) && (
                <Link to="/stock-card" className={getNavClass('/stock-card')}>
                <History size={18} />
                <span>كارت الصنف</span>
                </Link>
                )}
            </>
        )}

        {/* HR Module (Mapped to 'hr' in DB) */}
        {(canAccessHR || role === 'demo') && (
            <>
                <div className="pt-4 pb-2 text-xs font-bold text-slate-400 px-4 flex items-center gap-2">
                    <span className="w-full h-px bg-slate-200"></span>
                    <span className="whitespace-nowrap">الموارد البشرية</span>
                    <span className="w-full h-px bg-slate-200"></span>
                </div>
                {canShow(['hr'], ['create', 'read', 'view']) && (
                <Link to="/employees" className={getNavClass('/employees')}>
                    <Briefcase size={18} />
                    <span>الموظفين</span>
                </Link>
                )}
                {canShow(['hr'], ['create', 'read']) && (
                <Link to="/employee-advances" className={getNavClass('/employee-advances')}>
                    <Banknote size={18} />
                    <span>سلف الموظفين</span>
                </Link>
                )}
                {canShow(['hr'], ['payroll']) && (
                <Link to="/payroll" className={getNavClass('/payroll')}>
                    <Banknote size={18} />
                    <span>مسير الرواتب</span>
                </Link>
                )}
                {canShow(['hr'], ['view', 'read']) && (
                <Link to="/payroll-report" className={getNavClass('/payroll-report')}>
                    <FileText size={18} />
                    <span>كشف الرواتب</span>
                </Link>
                )}
                {canShow(['hr'], ['view', 'read']) && (
                <Link to="/employee-statement" className={getNavClass('/employee-statement')}>
                    <FileText size={18} />
                    <span>كشف حساب موظف</span>
                </Link>
                )}
                {canShow(['hr', 'reports'], ['view', 'read']) && (
                <Link to="/employee-reports" className={getNavClass('/employee-reports')}>
                    <BarChartBig size={18} />
                    <span>تقارير الموظفين</span>
                </Link>
                )}
            </>
        )}

        {/* Accounting Module (Mapped to 'journal_entries' and 'reports' in DB) */}
        {(canAccessAccounting || role === 'demo') && (
            <>
                <div className="pt-4 pb-2 text-xs font-bold text-slate-400 px-4 flex items-center gap-2">
                    <span className="w-full h-px bg-slate-200"></span>
                    <span className="whitespace-nowrap">المحاسبة العامة</span>
                    <span className="w-full h-px bg-slate-200"></span>
                </div>
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/accounting-dashboard" className={getNavClass('/accounting-dashboard')}>
                <LayoutDashboard size={18} />
                <span>لوحة التحكم المحاسبية</span>
                </Link>
                )}
                {canShow(['journal_entries'], ['create']) && (
                <Link to="/journal" className={getNavClass('/journal')}>
                <FileText size={18} />
                <span>إضافة قيد يومية</span>
                </Link>
                )}
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/important-reports" className={getNavClass('/important-reports')}>
                <BarChartBig size={18} className="text-blue-600" />
                <span className="font-bold">تقارير هامة</span>
                </Link>
                )}
                {canShow(['accounting', 'assets'], ['create', 'read']) && (
                <Link to="/assets" className={getNavClass('/assets')}>
                <MonitorSmartphone size={18} />
                <span>الأصول الثابتة</span>
                </Link>
                )}
                {canShow(['journal_entries'], ['view', 'read']) && (
                <Link to="/general-journal" className={getNavClass('/general-journal')}>
                <ScrollText size={18} />
                <span>دفتر اليومية</span>
                </Link>
                )}
                {canShow(['journal_entries'], ['view', 'read']) && (
                <Link to="/journal-export" className={getNavClass('/journal-export')}>
                <FileSpreadsheet size={18} />
                <span>تصدير القيود (Excel)</span>
                </Link>
                )}
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/ledger" className={getNavClass('/ledger')}>
                <Library size={18} />
                <span>دفتر الأستاذ</span>
                </Link>
                )}
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/multi-currency-statement" className={getNavClass('/multi-currency-statement')}>
                <FileText size={18} />
                <span>كشف حساب (عملات)</span>
                </Link>
                )}
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/trial-balance-advanced" className={getNavClass('/trial-balance-advanced')}>
                <Scale size={18} />
                <span>ميزان المراجعة</span>
                </Link>
                )}
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/income-statement" className={getNavClass('/income-statement')}>
                <TrendingUp size={18} />
                <span>قائمة الدخل</span>
                </Link>
                )}
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/balance-sheet" className={getNavClass('/balance-sheet')}>
                <Landmark size={18} />
                <span>الميزانية العمومية</span>
                </Link>
                )}
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/cash-flow" className={getNavClass('/cash-flow')}>
                <Banknote size={18} />
                <span>التدفقات النقدية</span>
                </Link>
                )}
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/cash-flow-report" className={getNavClass('/cash-flow-report')}>
                <Wallet size={18} />
                <span>حركة الصندوق والبنوك</span>
                </Link>
                )}
                {canShow(['reports'], ['view', 'read']) && (
                <Link to="/tax-return" className={getNavClass('/tax-return')}>
                <Calculator size={18} />
                <span>الإقرار الضريبي</span>
                </Link>
                )}
                {canShow(['accounting', 'accounts'], ['read', 'view']) && (
                <Link to="/accounts" className={getNavClass('/accounts')}>
                <BookOpen size={18} />
                <span>دليل الحسابات</span>
                </Link>
                )}
                {canShow(['accounting', 'closing'], ['create']) && (
                <Link to="/fiscal-year-closing" className={getNavClass('/fiscal-year-closing')}>
                <Lock size={18} />
                <span>إغلاق السنة المالية</span>
                </Link>
                )}
            </>
        )}

        {(isAdmin || role === 'demo') && (
            <>
                <div className="pt-4 pb-2 text-xs font-bold text-slate-400 px-4 flex items-center gap-2">
                    <span className="w-full h-px bg-slate-200"></span>
                    <span className="whitespace-nowrap">الإدارة</span>
                    <span className="w-full h-px bg-slate-200"></span>
                </div>
                <Link to="/users" className={getNavClass('/users')}>
                    <Shield size={18} />
                    <span>المستخدمين والصلاحيات</span>
                </Link>
                <Link to="/permissions" className={getNavClass('/permissions')}>
                    <ShieldCheck size={18} />
                    <span>إدارة الأدوار والصلاحيات</span>
                </Link>
                <Link to="/security-logs" className={getNavClass('/security-logs')}>
                    <ShieldAlert size={18} />
                    <span>سجلات الأمان</span>
                </Link>
                <Link to="/deficit-report" className={getNavClass('/deficit-report')}>
                    <AlertTriangle size={18} />
                    <span>تقارير العجز</span>
                </Link>
                <Link to="/recycle-bin" className={getNavClass('/recycle-bin')}>
                    <Trash2 size={18} />
                    <span>سلة المحذوفات</span>
                </Link>
                <Link to="/user-guide" className={getNavClass('/user-guide')}>
                    <HelpCircle size={18} />
                    <span>دليل المستخدم</span>
                </Link>
                {isSuperAdmin && (
                    <Link to="/settings" className={getNavClass('/settings')}>
                        <Settings size={18} />
                        <span>إعدادات النظام</span>
                    </Link>
                )}
            </>
        )}
      </nav>

      {/* The user info and logout button have been moved to the Header component */}
      <div className="p-4 border-t border-slate-100 bg-slate-50"></div>
    </aside>
  );
};

export default Sidebar;
