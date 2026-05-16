import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccounting } from '../context/AccountingContext';
import { 
  Activity, 
  Settings, 
  LayoutDashboard, 
  ShoppingCart, 
  Truck, 
  Package, 
  Users, 
  Factory, 
  Utensils, 
  Wallet, 
  Shield, 
  FileText,
  ShieldAlert,
  Plus,
  RotateCcw,
  RotateCw,
  ClipboardList,
  ArrowLeftRight,
  ClipboardCheck,
  Sliders,
  Trash2,
  BookOpen,
  Scale,
  BarChart3,
  List,
  CreditCard,
  Coins,
  ChevronLeft,
  ChevronDown,
  Landmark,
  Banknote,
  ChefHat,
  ScrollText,
  LayoutGrid,
  Star,
  Layers,
  Clock,
  ShieldCheck,
  TrendingUp,
  FilePlus,
  Calculator,
  PieChart,
  Play,
  History,
  UserCheck,
  FileBarChart,
  Tags,
  Box,
  DollarSign,
  RefreshCw,
  AlertTriangle,
  Target,
  Download,
  Database,
  Lock,
  Paperclip,
  CheckSquare
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const { organization, currentUser, organizations, currentSelectedOrgId, setCurrentSelectedOrgId, can } = useAccounting();
  const location = useLocation();
  const [openSection, setOpenSection] = useState<string | null>(null);

  const userRole = currentUser?.role;
  const isSuperAdmin = userRole === 'super_admin' || userRole === 'owner';
  const allowedModules = (organization as any)?.allowed_modules || [];

  // دالة للتحقق مما إذا كان الموديول مسموحاً به لهذه الشركة
  const isModuleAllowed = (module: string) => {
    return isSuperAdmin || allowedModules.includes(module) || allowedModules.length === 0;
  };

  // تعريف عناصر القائمة
  const navItems = [
    { to: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, color: 'text-blue-400', permission: 'reports.view' },
    
    // موديول المبيعات
    { type: 'section', label: 'المبيعات والعملاء' },
    { to: '/sales-invoice', label: 'فاتورة مبيعات جديدة', icon: FilePlus, color: 'text-emerald-400', module: 'sales', permission: 'sales.create' },
    { to: '/invoices-list', label: 'سجل فواتير البيع', icon: ShoppingCart, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/quotations-new', label: 'عرض سعر جديد', icon: Plus, color: 'text-emerald-400', module: 'sales', permission: 'sales.quotation' },
    { to: '/quotations-list', label: 'سجل عروض الأسعار', icon: FileText, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/sales-orders', label: 'أوامر البيع والتعميد', icon: Layers, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/sales-return', label: 'مرتجع مبيعات', icon: RotateCcw, color: 'text-emerald-400', module: 'sales', permission: 'sales.return' },
    { to: '/credit-note', label: 'إشعار دائن جديد', icon: FilePlus, color: 'text-emerald-400', module: 'sales', permission: 'sales.create' },
    { to: '/credit-notes-list', label: 'سجل الإشعارات الدائنة', icon: List, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/offer-beneficiaries', label: 'المستفيدين من العروض', icon: Users, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/customers', label: 'إدارة حسابات العملاء', icon: Users, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/customer-statement', label: 'كشف حساب عميل', icon: BookOpen, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/customer-aging', label: 'أعمار ديون العملاء', icon: Clock, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/item-sales-analysis', label: 'تحليل مبيعات الأصناف', icon: BarChart3, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/sales-reports', label: 'تقارير المبيعات', icon: BarChart3, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },

    // موديول المشتريات
    { type: 'section', label: 'المشتريات والموردين' },
    { to: '/purchase-invoice', label: 'فاتورة مشتريات جديدة', icon: FilePlus, color: 'text-orange-400', module: 'purchases', permission: 'purchases.create' },
    { to: '/purchase-invoices-list', label: 'سجل المشتريات', icon: Truck, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/purchase-order-new', label: 'أمر شراء جديد', icon: Plus, color: 'text-orange-400', module: 'purchases', permission: 'purchases.create' },
    { to: '/purchase-order-list', label: 'سجل أوامر الشراء', icon: ClipboardList, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/purchase-return', label: 'مرتجع مشتريات', icon: RotateCw, color: 'text-orange-400', module: 'purchases', permission: 'purchases.delete' },
    { to: '/debit-note', label: 'إشعار مدين للمورد', icon: FilePlus, color: 'text-orange-400', module: 'purchases', permission: 'purchases.create' },
    { to: '/debit-notes-list', label: 'سجل الإشعارات المدينة', icon: List, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/net-purchases-report', label: 'تقرير صافي المشتريات', icon: BarChart3, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/supplier-reconciliation', label: 'مطابقة أرصدة الموردين', icon: CheckSquare, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/supplier-balances', label: 'أرصدة الموردين الإجمالية', icon: List, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/suppliers', label: 'إدارة حسابات الموردين', icon: Users, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/supplier-statement', label: 'كشف حساب مورد', icon: BookOpen, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/supplier-aging', label: 'أعمار ديون الموردين', icon: Clock, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/purchase-analysis', label: 'تحليل المشتريات', icon: BarChart3, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/purchase-reports', label: 'تقارير المشتريات', icon: BarChart3, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },

    // موديول المخازن
    { type: 'section', label: 'المخازن والأصناف' },
    { to: '/products', label: 'الأصناف والخدمات', icon: Package, color: 'text-purple-400', module: 'inventory', permission: 'products.view' },
    { to: '/inventory-dashboard', label: 'لوحة تحكم المخزون', icon: Activity, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/warehouses', label: 'إدارة المستودعات', icon: LayoutGrid, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/stock-transfer', label: 'تحويل مخزني جديد', icon: ArrowLeftRight, color: 'text-purple-400', module: 'inventory', permission: 'inventory.transfer' },
    { to: '/stock-transfer-list', label: 'سجل التحويلات', icon: FileText, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/inventory-count', label: 'جرد مخزني جديد', icon: ClipboardCheck, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/inventory-history', label: 'سجل عمليات الجرد', icon: History, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/stock-adjustment', label: 'تسوية كميات (يدوي)', icon: Sliders, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/wastage', label: 'إدارة الهالك والفاقد', icon: Trash2, color: 'text-purple-400', module: 'inventory', permission: 'inventory.wastage' },
    { to: '/inventory-revaluation', label: 'إعادة تقييم المخزون', icon: RefreshCw, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/stock-movement-cost', label: 'تكلفة حركات المخزون', icon: DollarSign, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/slow-moving', label: 'الأصناف الراكدة', icon: Clock, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/opening-inventory', label: 'رصيد أول المدة', icon: Plus, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/stock-card', label: 'بطاقة مراقبة الصنف', icon: Tags, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/item-movement', label: 'تقرير حركة صنف', icon: ArrowLeftRight, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/top-selling', label: 'الأصناف الأكثر مبيعاً', icon: TrendingUp, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/item-profit', label: 'ربحية الأصناف', icon: DollarSign, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/detailed-stock-movement', label: 'حركة المخزون التفصيلية', icon: List, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },

    // التصنيع والإنتاج
    { type: 'section', label: 'التصنيع والإنتاج' },
    { to: '/mfg/dashboard', label: 'لوحة التحكم الصناعية', icon: LayoutDashboard, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },
    { to: '/mfg/batch-orders', label: 'أوامر الإنتاج (Batches)', icon: ClipboardList, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.orders' },
    { to: '/mfg/shop-floor', label: 'أرضية المصنع (تتبع لحظي)', icon: Activity, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },
    { to: '/mfg/quality-control', label: 'مركز رقابة الجودة', icon: ShieldCheck, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.qc' },
    { to: '/mfg/routing-bom', label: 'وصفات وقوائم المواد', icon: List, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.routings' },
    { to: '/mfg/material-requests', label: 'طلبات صرف الخامات', icon: FileText, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.material_requests' },
    { to: '/mfg/profitability', label: 'تقرير ربحية الإنتاج', icon: TrendingUp, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },
    { to: '/mfg/variance-report', label: 'تحليل انحراف المواد', icon: FileBarChart, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },
    { to: '/mfg/genealogy', label: 'تتبع أصل المنتج (SN)', icon: History, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.serials' },
    { to: '/mfg/raw-materials-turnover', label: 'دوران المواد الخام', icon: RefreshCw, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },
    { to: '/mfg/wip-monthly-summary', label: 'ملخص الإنتاج تحت التشغيل', icon: PieChart, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },
    { to: '/mfg/production-cost-analysis', label: 'تحليل تكاليف الإنتاج', icon: Calculator, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },

    // الخزينة والبنوك
    { type: 'section', label: 'الخزينة والبنوك' },
    { to: '/receipt-voucher', label: 'سند قبض جديد', icon: FilePlus, color: 'text-amber-400', module: 'accounting', permission: 'treasury.create' },
    { to: '/receipt-vouchers-list', label: 'سجل سندات القبض', icon: Wallet, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    { to: '/payment-voucher', label: 'سند صرف جديد', icon: FilePlus, color: 'text-amber-400', module: 'accounting', permission: 'treasury.create' },
    { to: '/payment-vouchers-list', label: 'سجل سندات الصرف', icon: CreditCard, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    { to: '/expense-voucher', label: 'صرف مصروفات تشغيلية', icon: Coins, color: 'text-amber-400', module: 'accounting', permission: 'treasury.create' },
    { to: '/transfer', label: 'تحويل بين الخزائن/البنوك', icon: ArrowLeftRight, color: 'text-amber-400', module: 'accounting', permission: 'treasury.manage' },
    { to: '/customer-deposit', label: 'سجل تأمينات العملاء', icon: Landmark, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    { to: '/cheques', label: 'إدارة الشيكات والبنوك', icon: Landmark, color: 'text-amber-400', module: 'accounting', permission: 'treasury.cheques' },
    { to: '/cheque-movement-report', label: 'تقرير حركة الشيكات', icon: History, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    { to: '/returned-cheques-report', label: 'الشيكات المرتجعة', icon: RotateCcw, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    { to: '/bank-reconciliation', label: 'تسوية المذكرة البنكية', icon: ShieldCheck, color: 'text-amber-400', module: 'accounting', permission: 'accounting.reconcile' },
    { to: '/cash-closing', label: 'إقفال الصندوق اليومي', icon: Lock, color: 'text-amber-400', module: 'accounting', permission: 'treasury.manage' },
    { to: '/deficit-report', label: 'تقرير العجز والزيادة', icon: AlertTriangle, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    
    // المحاسبة والتقارير المالية
    { type: 'section', label: 'المحاسبة والتقارير' },
    { to: '/accounting-dashboard', label: 'لوحة التحكم المحاسبية', icon: LayoutDashboard, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/important-reports', label: 'تقارير مالية هامة', icon: FileBarChart, color: 'text-cyan-400', module: 'accounting', permission: 'reports.view_financial' },
    { to: '/journal', label: 'قيد يومية جديد', icon: FilePlus, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.create' },
    { to: '/general-journal', label: 'دفتر اليومية العامة', icon: FileText, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/draft-journals', label: 'مسودات القيود', icon: ClipboardList, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/ledger', label: 'دفتر الأستاذ التفصيلي', icon: BookOpen, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/trial-balance-advanced', label: 'ميزان المراجعة (متطور)', icon: Scale, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/income-statement', label: 'قائمة الدخل (P&L)', icon: TrendingUp, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/balance-sheet', label: 'الميزانية العمومية', icon: BarChart3, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/cash-flow', label: 'قائمة التدفقات النقدية', icon: Activity, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/cash-flow-report', label: 'تقرير التدفقات النقدية', icon: Activity, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/performance-comparison', label: 'مقارنة الأداء المالي', icon: TrendingUp, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/multi-currency-statement', label: 'كشف حساب متعدد العملات', icon: BookOpen, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/payment-method-report', label: 'تقرير طرق التحصيل', icon: Wallet, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/attachments-report', label: 'تقرير المرفقات والمستندات', icon: Paperclip, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/tax-return', label: 'الإقرار الضريبي (VAT)', icon: Calculator, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/financial-ratios', label: 'النسب المالية والأداء', icon: TrendingUp, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/expense-analysis', label: 'تحليل وتوزيع المصروفات', icon: PieChart, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/budget-setup', label: 'الموازنات التقديرية', icon: Target, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/fiscal-year-closing', label: 'إقفال السنة المالية', icon: Lock, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.post' },
    { to: '/accounts', label: 'شجرة الحسابات (COA)', icon: List, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.coa' },
    { to: '/assets', label: 'إدارة الأصول الثابتة', icon: Box, color: 'text-cyan-400', module: 'accounting', permission: 'assets.manage' },
    { to: '/journal-export', label: 'تصدير القيود والبيانات', icon: Download, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    
    // الموارد البشرية
    { type: 'section', label: 'الموارد البشرية' },
    { to: '/employees', label: 'بيانات الموظفين', icon: Users, color: 'text-pink-400', module: 'hr', permission: 'hr.view' },
    { to: '/payroll-run', label: 'تنفيذ مسير الرواتب', icon: Play, color: 'text-pink-400', module: 'hr', permission: 'hr.manage' },
    { to: '/employee-advances', label: 'السلف والقروض', icon: Coins, color: 'text-pink-400', module: 'hr', permission: 'hr.advances' },
    { to: '/payroll-report', label: 'مسيرات الرواتب', icon: Banknote, color: 'text-pink-400', module: 'hr', permission: 'hr.view' },
    { to: '/employee-statement', label: 'كشف حساب موظف', icon: BookOpen, color: 'text-pink-400', module: 'hr', permission: 'hr.view' },
    { to: '/employee-reports', label: 'تقارير الموارد البشرية', icon: PieChart, color: 'text-pink-400', module: 'hr', permission: 'hr.view' },

    // المطعم ونقاط البيع
    { type: 'section', label: 'المطعم والبيع' },
    { to: '/pos', label: 'نقطة البيع', icon: Utensils, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.pos' },
    { to: '/kds', label: 'شاشة المطبخ', icon: ChefHat, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.kitchen' },
    { to: '/kitchen-end-day', label: 'جرد نهاية اليوم', icon: ClipboardCheck, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/reports/restaurant-sales', label: 'تقارير مبيعات المطعم', icon: BarChart3, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.manage' },
    
    // الإدارة والنظام
    { type: 'section', label: 'الإدارة والنظام' },
    { to: '/users', label: 'إدارة المستخدمين', icon: Users, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/permissions', label: 'الأدوار والصلاحيات', icon: ShieldCheck, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/saas-admin', label: 'إدارة المنصة (SaaS)', icon: ShieldAlert, color: 'text-indigo-500', superAdminOnly: true },
    { to: '/admin/test-dashboard', label: 'مراقبة صحة النظام', icon: Activity, color: 'text-amber-400', superAdminOnly: true, permission: 'admin.logs' },
    { to: '/security-logs', label: 'سجلات الأمان', icon: ScrollText, color: 'text-slate-400', adminOnly: true, permission: 'admin.logs' },
    { to: '/recycle-bin', label: 'سلة المحذوفات', icon: Trash2, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/data-migration', label: 'مركز ترحيل البيانات', icon: Database, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/settings', label: 'إعدادات المنشأة', icon: Settings, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/user-guide', label: 'دليل الاستخدام', icon: BookOpen, color: 'text-blue-400' },
  ];

  // تصفية العناصر بناءً على الأدوار والموديولات المتاحة
  const filteredItems = navItems.filter(item => {
    if (item.type === 'section') return true;
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.adminOnly && !isSuperAdmin && userRole !== 'admin' && userRole !== 'manager') return false;
    
    // Check module allowance (SaaS level)
    if (item.module && !isModuleAllowed(item.module)) return false;
    
    // Granular permission check
    if (item.permission) {
        const [module, action] = item.permission.split('.');
        if (!can(module, action)) return false;
    }

    return true;
  });

  // إخفاء العناوين (Sections) التي لا تحتوي على عناصر تحتها
  const visibleItems = filteredItems.filter((item, idx) => {
    if (item.type !== 'section') return true;
    const nextItem = filteredItems[idx + 1];
    return nextItem && nextItem.type !== 'section';
  });

  // تحويل القائمة المسطحة إلى هيكل شجري للموديولات لتسهيل عرضها كقوائم منسدلة
  const groupedItems: any[] = [];
  let currentSection: any = null;

  visibleItems.forEach(item => {
    if (item.type === 'section') {
      currentSection = { ...item, children: [] };
      groupedItems.push(currentSection);
    } else if (currentSection) {
      currentSection.children.push(item);
    } else {
      groupedItems.push(item); // العناصر التي تسبق أول قسم (مثل لوحة التحكم)
    }
  });

  const toggleSection = (label: string) => {
    setOpenSection(openSection === label ? null : label);
  };

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col p-4 h-screen shadow-xl sticky top-0 overflow-y-auto custom-scrollbar shrink-0" dir="rtl">
      <div className="text-2xl font-black mb-8 px-2 tracking-tight text-blue-500 shrink-0">TriPro ERP</div>
      
      <nav className="flex-1">
        <ul className="space-y-1">
          {groupedItems.map((item, index) => {
            if (item.type === 'section') {
              const isOpen = openSection === item.label;
              const hasActiveChild = item.children?.some((child: any) => location.pathname === child.to);
              
              return (
                <li key={`section-${index}`} className="pt-2">
                  <button 
                    onClick={() => toggleSection(item.label)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all font-bold hover:bg-gray-800 group ${isOpen || hasActiveChild ? 'bg-gray-800 text-blue-400' : 'text-gray-400'}`}
                  >
                    <span className="text-xs font-black uppercase tracking-widest leading-none">
                      {item.label}
                    </span>
                    <ChevronLeft size={14} className={`transition-transform duration-300 ${isOpen ? '-rotate-90 text-blue-500' : 'opacity-50'}`} />
                  </button>
                  
                  {(isOpen || hasActiveChild) && (
                    <ul className="mt-1 mr-2 space-y-1 border-r border-gray-800 pr-3 animate-in slide-in-from-right-1 duration-200">
                      {item.children.map((child: any) => {
                        const isActive = location.pathname === child.to;
                        return (
                          <li key={child.to}>
                            <Link 
                              to={child.to} 
                              className={`flex items-center gap-3 p-2 rounded-lg transition-all font-bold text-xs ${
                                isActive 
                                  ? 'bg-blue-600 text-white shadow-md' 
                                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
                              }`}
                            >
                              <child.icon size={14} className={isActive ? 'text-white' : child.color} />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            }

            const isActive = location.pathname === item.to;

            return (
              <li key={item.to}>
                <Link 
                  to={item.to} 
                  className={`flex items-center gap-3 p-2.5 rounded-xl transition-all font-bold group ${
                    isActive 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'hover:bg-gray-800 text-gray-300 hover:text-white'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg transition-colors ${
                    isActive ? 'bg-white/20' : 'bg-gray-800 group-hover:bg-gray-700'
                  }`}>
                    <item.icon size={18} className={isActive ? 'text-white' : item.color} />
                  </div>
                  <span className="text-sm">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Super Admin Organization Selector */}
      {isSuperAdmin && (
        <div className="mt-4 pt-4 border-t border-gray-800 shrink-0">
          <div className="px-2 mb-2">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 text-blue-400">
              الشركة النشطة (تحكم عالمي)
            </label>
            <select
              value={currentSelectedOrgId || ''}
              onChange={(e) => setCurrentSelectedOrgId(e.target.value || null)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-xs p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            >
              <option value="">-- اختر شركة لعرض بياناتها --</option>
              {organizations.map((org: any) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* معلومات المستخدم في الأسفل */}
      <div className="mt-auto pt-4 border-t border-gray-800 shrink-0">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white shadow-lg shrink-0">
            {currentUser?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate text-gray-200">
              {currentUser?.full_name || 'مستخدم النظام'}
            </span>
            <span className="text-[10px] text-gray-500 font-medium truncate uppercase tracking-tighter">
              {userRole === 'super_admin' ? 'مدير المنصة' : userRole}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;