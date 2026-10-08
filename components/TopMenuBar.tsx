import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import { 
  ChevronDown, Building2, ShoppingCart, Truck, Package, 
  Users, Landmark, BarChart3, HelpCircle, FileText, Plus, 
  Settings, LogOut, Smartphone, RotateCcw, ShieldCheck, 
  Layers, HardHat, Utensils, Scissors, Calendar, Clock, 
  Wallet, Banknote, Scale, Database, CreditCard, ChevronRight,
  Sparkles, ExternalLink, Activity
} from 'lucide-react';

interface MenuItem {
  label: string;
  to?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  shortcut?: string;
  badge?: string;
  divider?: boolean;
  header?: string;
  action?: () => void;
  permission?: string;
}

interface MenuCategory {
  id: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  items: MenuItem[];
}

export const TopMenuBar: React.FC = () => {
  const { organization, organizations, currentSelectedOrgId, setCurrentSelectedOrgId, currentUser } = useAccounting();
  const { can, logout } = useAuth();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // اختصارات لوحة المفاتيح
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setOpenMenu('file'); }
        if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setOpenMenu('company'); }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); setOpenMenu('customers'); }
        if (e.key === 'v' || e.key === 'V') { e.preventDefault(); setOpenMenu('vendors'); }
        if (e.key === 'i' || e.key === 'I') { e.preventDefault(); setOpenMenu('inventory'); }
        if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setOpenMenu('employees'); }
        if (e.key === 'b' || e.key === 'B') { e.preventDefault(); setOpenMenu('banking'); }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setOpenMenu('reports'); }
      }
      if (e.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const menuCategories: MenuCategory[] = [
    {
      id: 'file',
      label: 'ملف (File)',
      items: [
        { header: 'المنشأة والبيانات' },
        { label: 'العودة للرئيسية (Dashboard)', to: '/dashboard', icon: Layers, shortcut: 'Home' },
        { label: 'تطبيق الموبايل الميداني (PWA)', to: '/mobile', icon: Smartphone },
        { divider: true, label: '' },
        { header: 'إدارة النظام' },
        { label: 'إعدادات المنشأة والنظام', to: '/settings', icon: Settings },
        { label: 'سجل الأمان والتدقيق', to: '/security-logs', icon: ShieldCheck },
        { label: 'إقفال السنوات المالية', to: '/fiscal-closing', icon: Calendar },
        { divider: true, label: '' },
        { 
          label: 'تسجيل الخروج', 
          icon: LogOut, 
          action: () => {
            if (window.confirm('هل تريد تأكيد تسجيل الخروج من النظام؟')) {
              if (logout) logout();
              else navigate('/login');
            }
          }
        }
      ]
    },
    {
      id: 'company',
      label: 'الشركة والمحاسبة (Company)',
      items: [
        { header: 'الحسابات العامة والأستاذ' },
        { label: 'دليل الحسابات الشامل (Chart of Accounts)', to: '/accounts', icon: Landmark, shortcut: 'Ctrl+A' },
        { label: 'قيد يومية جديد (New Journal Entry)', to: '/general-journal?new=1', icon: Plus, shortcut: 'Ctrl+J' },
        { label: 'سجل قيود اليومية العامة (Journal Entries)', to: '/general-journal', icon: FileText },
        { label: 'مراكز التكلفة والمشاريع', to: '/cost-centers', icon: Building2 },
        { divider: true, label: '' },
        { header: 'الأصول والتحليلات' },
        { label: 'إدارة الأصول الثابتة والإهلاك', to: '/assets', icon: Landmark },
        { label: 'إعادة تقييم العملات الأجنبية', to: '/currency-revaluation', icon: Scale },
        { label: 'الموازنات التقديرية (Budgeting)', to: '/budgeting', icon: BarChart3 },
        { label: 'لوحة المدير المالي (CFO Dashboard)', to: '/cfo-dashboard', icon: Sparkles }
      ]
    },
    {
      id: 'customers',
      label: 'العملاء والمبيعات (Customers)',
      items: [
        { header: 'عمليات البيع اليومية' },
        { label: 'فاتورة مبيعات جديدة (Create Invoice)', to: '/sales-invoice', icon: Plus, shortcut: 'Ctrl+I' },
        { label: 'سجل فواتير المبيعات (Invoices List)', to: '/invoices-list', icon: ShoppingCart },
        { label: 'سند قبض نقدية / شيك (Receive Payment)', to: '/receipt-voucher', icon: Banknote, shortcut: 'Ctrl+R' },
        { label: 'سجل سندات القبض', to: '/receipt-vouchers-list', icon: FileText },
        { divider: true, label: '' },
        { header: 'العروض والأوامر ونقاط البيع' },
        { label: 'عرض سعر جديد (Estimate / Quote)', to: '/quotations-new', icon: Plus },
        { label: 'سجل عروض الأسعار', to: '/quotations-list', icon: FileText },
        { label: 'أمر بيع وتعميد (Sales Order)', to: '/sales-order-new', icon: Plus },
        { label: 'سجل أوامر البيع', to: '/sales-orders-list', icon: FileText },
        { label: 'كاشير المحلات ونقاط البيع (Retail POS)', to: '/retail-pos', icon: ShoppingCart, badge: 'POS' },
        { label: 'كاشير المطاعم والكافيهات', to: '/pos', icon: Utensils },
        { label: 'الفاتورة والإيصال الإلكتروني (ETA)', to: '/eta-invoices', icon: Landmark },
        { label: 'مرتجع مبيعات (Sales Return)', to: '/sales-return', icon: RotateCcw },
        { divider: true, label: '' },
        { header: 'دليل العملاء والتقارير' },
        { label: 'دليل العملاء (Customers Center)', to: '/customers', icon: Users },
        { label: 'كشف حساب عميل تفصيلي', to: '/customer-statement', icon: FileText }
      ]
    },
    {
      id: 'vendors',
      label: 'الموردون والمشتريات (Vendors)',
      items: [
        { header: 'عمليات الشراء والتوريد' },
        { label: 'فاتورة شراء جديدة (Enter Bill)', to: '/purchase-invoice', icon: Plus, shortcut: 'Ctrl+B' },
        { label: 'سجل فواتير المشتريات (Bills List)', to: '/purchase-invoices-list', icon: Truck },
        { label: 'سند صرف مورد (Pay Bill / Voucher)', to: '/payment-voucher', icon: Banknote, shortcut: 'Ctrl+P' },
        { label: 'سجل سندات الصرف', to: '/payment-vouchers-list', icon: FileText },
        { divider: true, label: '' },
        { header: 'أوامر الشراء والاستلام' },
        { label: 'أمر شراء جديد (Purchase Order)', to: '/purchase-order-new', icon: Plus },
        { label: 'سجل أوامر الشراء (PO)', to: '/purchase-orders-list', icon: FileText },
        { label: 'إذن استلام بضاعة مخزن (GRN)', to: '/goods-receipt', icon: Package },
        { label: 'مرتجع مشتريات (Vendor Return)', to: '/purchase-return', icon: RotateCcw },
        { divider: true, label: '' },
        { header: 'دليل الموردين والمطابقات' },
        { label: 'دليل الموردين (Vendors Center)', to: '/suppliers', icon: Users },
        { label: 'كشف حساب مورد تفصيلي', to: '/supplier-statement', icon: FileText },
        { label: 'مطابقة ومصادقة أرصدة الموردين', to: '/supplier-reconciliation', icon: Scale }
      ]
    },
    {
      id: 'inventory',
      label: 'المخازن والتصنيع (Inventory & Mfg)',
      items: [
        { header: 'إدارة المستودعات والأصناف' },
        { label: 'دليل الأصناف والمنتجات (Items & Services)', to: '/products', icon: Package, shortcut: 'Ctrl+T' },
        { label: 'كارت الصنف وحركة المستودع (Stock Card)', to: '/stock-card', icon: FileText },
        { label: 'التحويل بين المستودعات (Stock Transfer)', to: '/stock-transfer', icon: Truck },
        { label: 'سجل التحويلات المخزنية', to: '/stock-transfers-list', icon: FileText },
        { label: 'أرصدة المخزون والجرد الدوري', to: '/inventory-dashboard', icon: Layers },
        { label: 'وحدات القياس والتحويلات (UOM)', to: '/uom', icon: Scale },
        { divider: true, label: '' },
        { header: 'الصناعة والتكاليف (Manufacturing)' },
        { label: 'لوحة قيادة المصنع والإنتاج', to: '/mfg/dashboard', icon: Building2 },
        { label: 'معادلات وتراكيب الإنتاج (BOM)', to: '/mfg/boms', icon: Scissors },
        { label: 'أوامر الإنتاج والتشغيل (Work Orders)', to: '/mfg/work-orders', icon: HardHat },
        { label: 'إقفال وتكاليف أوامر التصنيع', to: '/mfg/closing', icon: Scale }
      ]
    },
    {
      id: 'employees',
      label: 'الموظفون والرواتب (Employees)',
      items: [
        { header: 'شؤون العاملين' },
        { label: 'دليل وسجل الموظفين (Employee Center)', to: '/hr/employees', icon: Users, shortcut: 'Ctrl+E' },
        { label: 'الحضور والانصراف والورديات', to: '/hr/attendance', icon: Clock },
        { label: 'سلف الموظفين (Advances)', to: '/hr/advances', icon: Banknote },
        { label: 'إدارة الإجازات والأذونات', to: '/hr/leaves', icon: Calendar },
        { divider: true, label: '' },
        { header: 'المرتبات والأجور' },
        { label: 'إعداد واحتساب مسير الرواتب (Run Payroll)', to: '/hr/payroll', icon: FileText },
        { label: 'صرف الرواتب والمستحقات', to: '/hr/disbursement', icon: Wallet },
        { label: 'مكافأة نهاية الخدمة والتسويات', to: '/hr/end-of-service', icon: Scale },
        { label: 'كشف حساب ومستحقات الموظف', to: '/hr/employee-statement', icon: FileText }
      ]
    },
    {
      id: 'banking',
      label: 'البنوك والخزينة (Banking)',
      items: [
        { header: 'النقدية والبنوك' },
        { label: 'حسابات الخزائن والصندوق (Cash on Hand)', to: '/treasury', icon: Wallet },
        { label: 'الحسابات البنكية (Bank Accounts)', to: '/banking', icon: Landmark },
        { label: 'تحويل مالي داخلي (Transfer Funds)', to: '/internal-transfer', icon: RotateCcw },
        { divider: true, label: '' },
        { header: 'الأوراق المالية والتسويات' },
        { label: 'حافظة ودفتر الشيكات (Cheque Register)', to: '/cheques', icon: CreditCard },
        { label: 'مذكرة تسوية الحساب البنكي (Reconciliation)', to: '/bank-reconciliation', icon: Scale },
        { label: 'خطابات الضمان البنكية (LG)', to: '/letters-of-guarantee', icon: FileText },
        { label: 'الاعتمادات المستندية (LC)', to: '/letters-of-credit', icon: FileText }
      ]
    },
    {
      id: 'reports',
      label: 'التقارير (Reports)',
      items: [
        { header: 'القوائم المالية الختامية' },
        { label: 'ميزان المراجعة بالمجاميع والأرصدة (Trial Balance)', to: '/trial-balance-advanced', icon: Scale },
        { label: 'قائمة الدخل والأرباح والخسائر (Income Statement)', to: '/income-statement', icon: BarChart3 },
        { label: 'الميزانية العمومية والمركز المالي (Balance Sheet)', to: '/balance-sheet', icon: Landmark },
        { label: 'دفتر الأستاذ العام (General Ledger)', to: '/general-ledger', icon: FileText },
        { divider: true, label: '' },
        { header: 'التقارير التحليلية والتشغيلية' },
        { label: 'تقرير حركة وتكلفة المبيعات', to: '/sales-analysis', icon: ShoppingCart },
        { label: 'تقرير حركة المشتريات والموردين', to: '/purchase-analysis', icon: Truck },
        { label: 'أعمار ديون العملاء (Aging of AR)', to: '/aging-report', icon: Clock },
        { label: 'حركة المخزون الشاملة والأصناف الراكدة', to: '/stock-movement-report', icon: Package }
      ]
    },
    {
      id: 'help',
      label: 'مساعدة (Help)',
      items: [
        { header: 'الدعم والمعلومات' },
        { label: 'دليل استخدام النظام والشاشات', to: '/user-guide', icon: HelpCircle },
        { label: 'فحص صحة النظام وتوازن القيود', to: '/health-check', icon: Activity },
        { label: 'بيئة الاختبار والفحص الآلي', to: '/admin/test-dashboard', icon: Sparkles },
        { divider: true, label: '' },
        { label: 'حول نظام TriPro ERP', to: '/about', icon: ExternalLink }
      ]
    }
  ];

  const handleItemClick = (item: MenuItem) => {
    setOpenMenu(null);
    if (item.action) {
      item.action();
    }
  };

  return (
    <div 
      ref={menuContainerRef}
      className="bg-[#0f172a] text-slate-200 border-b border-slate-800 text-xs select-none sticky top-0 z-40 print:hidden shadow-xs"
      dir="rtl"
    >
      <div className="flex items-center justify-between px-3 py-0.5 overflow-x-auto no-scrollbar">
        {/* شريط القوائم الرئيسي */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {menuCategories.map((cat) => {
            const isOpen = openMenu === cat.id;
            return (
              <div key={cat.id} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu(isOpen ? null : cat.id)}
                  onMouseEnter={() => {
                    if (openMenu !== null && openMenu !== cat.id) {
                      setOpenMenu(cat.id);
                    }
                  }}
                  className={`
                    px-2.5 py-1.5 rounded-md font-bold text-xs flex items-center gap-1 transition-all
                    ${isOpen 
                      ? 'bg-blue-600 text-white shadow-xs' 
                      : 'hover:bg-slate-800 text-slate-300 hover:text-white'}
                  `}
                >
                  <span>{cat.label}</span>
                  <ChevronDown size={11} className={`opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* القائمة المنسدلة */}
                {isOpen && (
                  <div 
                    className="absolute right-0 top-full mt-1 w-64 sm:w-72 bg-[#1e293b] border border-slate-700/80 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
                  >
                    {cat.items.map((item, idx) => {
                      if (item.divider) {
                        return <div key={idx} className="my-1.5 border-t border-slate-700/60" />;
                      }

                      if (item.header) {
                        return (
                          <div key={idx} className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-800/40">
                            {item.header}
                          </div>
                        );
                      }

                      const Icon = item.icon;

                      if (item.to) {
                        return (
                          <Link
                            key={idx}
                            to={item.to}
                            onClick={() => handleItemClick(item)}
                            className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-200 hover:bg-blue-600 hover:text-white transition-colors group cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {Icon && <Icon size={14} className="text-slate-400 group-hover:text-white shrink-0" />}
                              <span className="truncate font-semibold">{item.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.badge && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 font-bold group-hover:bg-white/20 group-hover:text-white">
                                  {item.badge}
                                </span>
                              )}
                              {item.shortcut && (
                                <span className="text-[10px] text-slate-500 group-hover:text-blue-100 font-mono">
                                  {item.shortcut}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleItemClick(item)}
                          className="w-full text-right flex items-center justify-between px-3 py-1.5 text-xs text-slate-200 hover:bg-blue-600 hover:text-white transition-colors group cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {Icon && <Icon size={14} className="text-slate-400 group-hover:text-white shrink-0" />}
                            <span className="truncate font-semibold">{item.label}</span>
                          </div>
                          {item.shortcut && (
                            <span className="text-[10px] text-slate-500 group-hover:text-blue-100 font-mono shrink-0">
                              {item.shortcut}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* مؤشر الشركة السريع واختصار التنقل */}
        <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400 font-bold pr-2">
          <span className="inline-flex items-center gap-1.5 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/60 text-slate-300">
            <Building2 size={12} className="text-blue-400" />
            <span className="truncate max-w-[150px]">{organization?.name || 'TriPro Enterprise'}</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Alt + الحرف الأول</span>
        </div>
      </div>
    </div>
  );
};

export default TopMenuBar;
