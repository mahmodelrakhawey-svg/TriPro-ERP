import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccounting } from '../context/AccountingContext';
import { 
  Activity, 
  Settings, 
  LayoutDashboard, 
  ShoppingCart, 
  Building2,
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
  Barcode,
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
  Ruler,
  ChefHat,
  ScrollText,
  LayoutGrid,
  Star,
  Layers,
  Clock,
  Flame,
  ShieldCheck,
  Smartphone,
  Printer,
  TrendingUp,
  Scissors,
  Camera,
  Monitor,
  FilePlus,
  Calendar,
  CalendarRange,
  Microscope,
  Search,
  BarChart,
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
  CheckSquare,
  Sparkles,
  HeartPulse,
  FlaskConical,
  Bed,
  Trophy,
  Dumbbell,
  Award,
  QrCode,
  ShoppingBag,
  Gift,
  Zap,
  MapPin,
  PackageCheck,
} from 'lucide-react';
import { Wrench } from 'lucide-react'; // Import Wrench icon


 
const Sidebar: React.FC = () => {
  const { organization, currentUser, organizations, currentSelectedOrgId, setCurrentSelectedOrgId, can } = useAccounting();
  const location = useLocation();
  const [openSection, setOpenSection] = useState<string | null>(null);

  const userRole = currentUser?.role;
  const isSuperAdmin = userRole === 'super_admin' || userRole === 'owner';
  const allowedModules = (organization as any)?.allowed_modules || [];

  // دالة للتحقق مما إذا كان الموديول مسموحاً به لهذه الشركة
  const isModuleAllowed = (module: string) => {
    const normalizedModule = module === 'mfg' ? 'manufacturing' : module;
    
    // 🛡️ عزل موديولات المنشأة بناءً على اشتراكها في SaaS
    if (Array.isArray(allowedModules) && allowedModules.length > 0) {
      if (module === 'restaurant') {
        return allowedModules.includes('restaurant') || allowedModules.includes('pos');
      }
      if (module === 'retail') {
        return allowedModules.includes('retail');
      }
      if (module === 'construction') {
        return allowedModules.includes('construction');
      }
      if (module === 'hims') {
        return allowedModules.includes('hims');
      }
      if (module === 'stadium') {
        return allowedModules.includes('stadium');
      }
      if (module === 'manufacturing' || module === 'mfg') {
        return allowedModules.includes('manufacturing') || allowedModules.includes('mfg');
      }
      return allowedModules.includes(module) || allowedModules.includes(normalizedModule);
    }

    // إذا لم تكن هناك قيود مسجلة، أو سوبر أدمن بدون اختيار شركة محددة
    if (userRole === 'demo') return true;
    if (isSuperAdmin && !currentSelectedOrgId) return true;

    return true;
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
    { to: '/sales-order-new', label: 'أمر بيع وتعميد جديد', icon: Plus, color: 'text-emerald-400', module: 'sales', permission: 'sales.create' },
    { to: '/sales-orders', label: 'أوامر البيع والتعميد', icon: Layers, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/sales-return', label: 'مرتجع مبيعات', icon: RotateCcw, color: 'text-emerald-400', module: 'sales', permission: 'sales.return' },
    { to: '/sales-returns-list', label: 'سجل مرتجعات المبيعات', icon: List, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/free-returns-report', label: 'مرتجعات بدون فاتورة أصلية', icon: RotateCcw, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/credit-note', label: 'إشعار دائن جديد', icon: FilePlus, color: 'text-emerald-400', module: 'sales', permission: 'sales.create' },
    { to: '/credit-notes-list', label: 'سجل الإشعارات الدائنة', icon: List, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/offer-beneficiaries', label: 'المستفيدين من العروض', icon: Users, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/customers', label: 'إدارة حسابات العملاء', icon: Users, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/customer-statement', label: 'كشف حساب عميل', icon: BookOpen, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/customer-reconciliation', label: 'مطابقة أرصدة العملاء', icon: CheckSquare, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/customer-aging', label: 'أعمار ديون العملاء', icon: Clock, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/item-sales-analysis', label: 'تحليل مبيعات الأصناف', icon: BarChart3, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/reports/sales-by-user', label: 'تقرير مبيعات الكاشير والمستخدمين', icon: Users, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },
    { to: '/sales-reports', label: 'تقارير المبيعات', icon: BarChart3, color: 'text-emerald-400', module: 'sales', permission: 'sales.view' },

    // موديول المشتريات
    { type: 'section', label: 'المشتريات والموردين' },
    { to: '/purchase-invoice', label: 'فاتورة مشتريات جديدة', icon: FilePlus, color: 'text-orange-400', module: 'purchases', permission: 'purchases.create' },
    { to: '/purchase-invoices-list', label: 'سجل المشتريات', icon: Truck, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/purchase-order-new', label: 'أمر شراء جديد', icon: Plus, color: 'text-orange-400', module: 'purchases', permission: 'purchases.create' },
    { to: '/purchase-order-list', label: 'سجل أوامر الشراء', icon: ClipboardList, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/purchase-return', label: 'مرتجع مشتريات', icon: RotateCw, color: 'text-orange-400', module: 'purchases', permission: 'purchases.delete' },
    { to: '/purchase-returns-list', label: 'سجل مرتجعات المشتريات', icon: List, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/debit-note', label: 'إشعار مدين للمورد', icon: FilePlus, color: 'text-orange-400', module: 'purchases', permission: 'purchases.create' },
    { to: '/debit-notes-list', label: 'سجل الإشعارات المدينة', icon: List, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/net-purchases-report', label: 'تقرير صافي المشتريات', icon: BarChart3, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/supplier-reconciliation', label: 'مطابقة أرصدة الموردين', icon: CheckSquare, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/supplier-balances', label: 'أرصدة الموردين الإجمالية', icon: List, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/suppliers', label: 'إدارة حسابات الموردين', icon: Users, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/supplier-statement', label: 'كشف حساب مورد', icon: BookOpen, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/supplier-aging', label: 'أعمار ديون الموردين', icon: Clock, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/purchases/vendor-contracts', label: 'عقود الموردين والبوانص (Rebates)', icon: ScrollText, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/purchase-analysis', label: 'تحليل المشتريات', icon: BarChart3, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },
    { to: '/purchase-reports', label: 'تقارير المشتريات', icon: BarChart3, color: 'text-orange-400', module: 'purchases', permission: 'purchases.view' },

    // موديول المخازن
    { type: 'section', label: 'المخازن والأصناف' },
    { to: '/products', label: 'الأصناف والخدمات', icon: Package, color: 'text-purple-400', module: 'inventory', permission: 'products.view' },
    { to: '/units-of-measure', label: 'وحدات القياس (UoM)', icon: Ruler, color: 'text-purple-400', module: 'inventory', permission: 'products.view' },
    { to: '/inventory/goods-receipt', label: 'أذون الاستلام المخزني (GRN)', icon: PackageCheck, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/multi-uom-report', label: 'رصيد المخزون المتعدد', icon: Layers, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/inventory-dashboard', label: 'لوحة تحكم المخزون', icon: Activity, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/warehouses', label: 'إدارة المستودعات', icon: LayoutGrid, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/stock-transfer', label: 'تحويل مخزني جديد', icon: ArrowLeftRight, color: 'text-purple-400', module: 'inventory', permission: 'inventory.transfer' },
    { to: '/stock-transfer-list', label: 'سجل التحويلات', icon: FileText, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/inventory-count', label: 'جرد مخزني جديد', icon: ClipboardCheck, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/inventory-history', label: 'سجل عمليات الجرد', icon: History, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/stock-adjustment', label: 'تسوية كميات (يدوي)', icon: Sliders, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/wastage', label: 'إدارة الهالك والفاقد', icon: Trash2, color: 'text-purple-400', module: 'inventory', permission: 'inventory.wastage' },
    { to: '/wastage-report', label: 'تقرير انحراف تكلفة الهالك', icon: AlertTriangle, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/inventory-revaluation', label: 'إعادة تقييم المخزون', icon: RefreshCw, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/stock-movement-cost', label: 'تكلفة حركات المخزون', icon: DollarSign, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/slow-moving', label: 'الأصناف الراكدة', icon: Clock, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/opening-inventory', label: 'رصيد أول المدة', icon: Plus, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/stock-card', label: 'بطاقة مراقبة الصنف', icon: Tags, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/item-movement', label: 'تقرير حركة صنف', icon: ArrowLeftRight, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/top-selling', label: 'الأصناف الأكثر مبيعاً', icon: TrendingUp, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/item-profit', label: 'ربحية الأصناف', icon: DollarSign, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/inventory/expiry-radar', label: 'رادار الصلاحية وتصفية العروض', icon: Flame, color: 'text-orange-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/inventory/shelf-restock', label: 'تقرير إعادة التخزين بالرفوف', icon: MapPin, color: 'text-indigo-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/inventory/replenishment', label: 'إعادة الطلب والتخزين التنبؤي', icon: TrendingUp, color: 'text-amber-400', module: 'inventory', permission: 'inventory.view' },
    { to: '/inventory/pda-stocktaking', label: 'الجرد السريع بالهاند هيلد (PDA)', icon: PackageCheck, color: 'text-purple-400', module: 'inventory', permission: 'inventory.manage' },
    { to: '/detailed-stock-movement', label: 'حركة المخزون التفصيلية', icon: List, color: 'text-purple-400', module: 'inventory', permission: 'inventory.view' },

    // التصنيع والإنتاج
    { type: 'section', label: 'التصنيع والإنتاج' },
    { to: '/mfg/dashboard', label: 'لوحة التحكم الصناعية', icon: LayoutDashboard, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },
    { to: '/mfg/orders', label: 'إدارة أوامر الإنتاج', icon: Factory, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.orders' },
    { to: '/mfg/batch-orders', label: 'جدولة ودمج الطلبات', icon: ClipboardList, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.orders' },
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
    { to: '/mfg/unit-cost-drilldown', label: 'تشريح تكلفة الوحدة', icon: Layers, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },
    { to: '/mfg/alerts-log', label: 'سجل التنبيهات الصناعية', icon: AlertTriangle, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },
    { to: '/mfg/closing', label: 'إغلاق الفترة المالي', icon: Calculator, color: 'text-indigo-400', module: 'manufacturing', permission: 'manufacturing.view' },

    // موديول المقاولات والمشاريع
    { type: 'section', label: 'المقاولات والمشاريع' },
    { to: '/construction/analytics', label: 'لوحة تحليلات المشاريع الإنشائية', icon: Activity, color: 'text-amber-500', module: 'construction', permission: 'accounting.view' },
    { to: '/construction', label: 'إدارة المشاريع الإنشائية', icon: Building2, color: 'text-amber-500', module: 'construction', permission: 'accounting.view' },
    { to: '/construction/labor-reports', label: 'تقارير تكاليف العمالة', icon: UserCheck, color: 'text-amber-500', module: 'construction', permission: 'accounting.view' },
    { to: '/construction/subcontractor-analytics', label: 'تحليل أداء مقاولي الباطن', icon: Users, color: 'text-amber-500', module: 'construction', permission: 'accounting.view' },
    { to: '/subcontractors', label: 'مقاولي الباطن', icon: Users, color: 'text-amber-500', module: 'construction', permission: 'accounting.view' },

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
    { to: '/letters-of-guarantee', label: 'خطابات الضمان البنكية', icon: ScrollText, color: 'text-amber-400', module: 'accounting', permission: 'treasury.cheques' },
    { to: '/letters-of-credit', label: 'الاعتمادات المستندية', icon: ArrowLeftRight, color: 'text-amber-400', module: 'accounting', permission: 'treasury.cheques' },
    { to: '/cheque-movement-report', label: 'تقرير حركة الشيكات', icon: History, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    { to: '/returned-cheques-report', label: 'الشيكات المرتجعة', icon: RotateCcw, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    { to: '/bank-reconciliation', label: 'تسوية المذكرة البنكية', icon: ShieldCheck, color: 'text-amber-400', module: 'accounting', permission: 'accounting.reconcile' },
    { to: '/cash-closing', label: 'إقفال الخزينة والصندوق', icon: Lock, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    { to: '/deficit-report', label: 'تقرير العجز والزيادة', icon: AlertTriangle, color: 'text-amber-400', module: 'accounting', permission: 'treasury.view' },
    { to: '/payment-gateways', label: 'بوابات الدفع الإلكتروني', icon: CreditCard, color: 'text-amber-400', module: 'accounting', permission: 'treasury.manage' },
    
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
    { to: '/budget-variance', label: 'مقارنة وانحراف الموازنة التقديرية', icon: BarChart3, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
    { to: '/fiscal-periods', label: 'الفترات المحاسبية والإقفال الشهري', icon: CalendarRange, color: 'text-cyan-400', module: 'accounting', permission: 'accounting.view' },
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

    // نقاط بيع التجزئة (هايبرماركت وسوبرماركت)
    { type: 'section', label: 'نقاط بيع التجزئة (الهايبرماركت)' },
    { to: '/retail-pos', label: 'نقطة بيع التجزئة (هايبرماركت)', icon: ShoppingCart, color: 'text-rose-400', module: 'retail', permission: 'sales.view' },
    { to: '/retail/price-checker', label: 'كاشف الأسعار الذاتي للمتسوقين', icon: Barcode, color: 'text-cyan-400', module: 'retail', permission: 'sales.view' },
    { to: '/retail/promotions', label: 'العروض الترويجية والخصومات (BOGO)', icon: Sparkles, color: 'text-amber-400', module: 'retail', permission: 'sales.view' },
    { to: '/retail/customer-display', label: 'شاشة العميل المزدوجة (Dual Screen)', icon: Monitor, color: 'text-purple-400', module: 'retail', permission: 'sales.view' },

    // موديول المطاعم والكافيهات
    { type: 'section', label: 'المطاعم والكافيهات' },
    { to: '/pos', label: 'نقطة البيع (مطاعم)', icon: Utensils, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.pos' },
    { to: '/restaurant/waiter', label: 'ويتر الصالة المتنقل (Handheld)', icon: Smartphone, color: 'text-amber-400', module: 'restaurant', permission: 'restaurant.pos' },
    { to: '/restaurant/kiosk', label: 'كشك الخدمة الذاتية (Kiosk)', icon: Monitor, color: 'text-cyan-400', module: 'restaurant', permission: 'restaurant.pos' },
    { to: '/kds', label: 'شاشة المطبخ (KDS)', icon: ChefHat, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.kitchen' },
    { to: '/restaurant/expo', label: 'شاشة التجميع (Master Expo)', icon: Layers, color: 'text-indigo-400', module: 'restaurant', permission: 'restaurant.kitchen' },
    { to: '/restaurant/stations', label: 'محطات المطبخ (Kitchen Stations)', icon: Flame, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant/printers', label: 'طابعات المطبخ والإيصالات (ESC/POS)', icon: Printer, color: 'text-indigo-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant/aggregators', label: 'منصات التوصيل الخارجية (Hub)', icon: ShoppingBag, color: 'text-orange-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant/loyalty', label: 'برنامج الولاء والمحفظة الرقمية', icon: Gift, color: 'text-purple-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant/channel-pricing', label: 'التسعير المتعدد حسب قنوات البيع', icon: Sliders, color: 'text-blue-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant/driver-dispatch', label: 'كباتن التوصيل والعهد (COD)', icon: Truck, color: 'text-amber-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant/tips-pool', label: 'مجمع وتوزيع التبس والإكراميات', icon: Coins, color: 'text-yellow-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant/win-back', label: 'استعادة العملاء الغائبين (CRM)', icon: Gift, color: 'text-pink-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant/auto-reorder', label: 'أوامر الشراء التلقائية (حد الأمان)', icon: Zap, color: 'text-emerald-400', module: 'restaurant', permission: 'purchases.create' },
    { to: '/restaurant/happy-hours', label: 'الساعات السعيدة والتسعير', icon: Clock, color: 'text-pink-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/kitchen-end-day', label: 'جرد نهاية اليوم للمطبخ', icon: ClipboardCheck, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant/butchering-yield', label: 'تشفية وتفكيك الذبائح والدواجن', icon: Scale, color: 'text-amber-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/restaurant-analytics', label: 'مركز ذكاء المطاعم (BI)', icon: Sparkles, color: 'text-blue-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/reports/restaurant-sales', label: 'تقارير مبيعات المطعم', icon: BarChart3, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/reports/sales-by-user', label: 'تقرير مبيعات الكاشير والمستخدمين', icon: Users, color: 'text-rose-400', module: 'restaurant', permission: 'sales.view' },
    { to: '/reports/wastage-analysis', label: 'تحليل هالك وتوالف المطعم', icon: Trash2, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.manage' },
    { to: '/reports/restaurant-profit', label: 'تقرير أرباح وقوائم دخل المطعم', icon: TrendingUp, color: 'text-rose-400', module: 'restaurant', permission: 'restaurant.manage' },
    
    // موديول المستشفيات (HIMS)
    { type: 'section', label: 'إدارة المستشفيات (HIMS)' },
    { to: '/hims/admin', label: 'لوحة القيادة الاستراتيجية', icon: BarChart, color: 'text-indigo-600', module: 'hims', permission: 'hims_core.view' },
    { to: '/hims/appointments', label: 'حجز ومتابعة المواعيد', icon: Calendar, color: 'text-indigo-500', module: 'hims', permission: 'hims_core.view' },
    { to: '/hims/patients', label: 'سجلات المرضى الرقمية', icon: Users, color: 'text-blue-400', module: 'hims', permission: 'hims_core.view' },
    { to: '/hims/doctors', label: 'تعريف الأطباء وتخصصاتهم', icon: UserCheck, color: 'text-blue-500', module: 'hims', permission: 'hims_core.view' },
    { to: '/hims/staff-roster', label: 'إدارة مناوبات الطاقم', icon: CalendarRange, color: 'text-blue-400', module: 'hims', permission: 'hims_core.view' },
    { to: '/hims/services', label: 'إدارة الخدمات الطبية (تحاليل/أشعة)', icon: Wrench, color: 'text-slate-400', module: 'hims', permission: 'hims_core.manage' },
    { to: '/hims/wards-management', label: 'إعداد الأجنحة والأسرة', icon: Settings, color: 'text-slate-400', module: 'hims', permission: 'hims_core.view' },
    { to: '/hims/admissions', label: 'إدارة القبول والتسكين', icon: Bed, color: 'text-indigo-500', module: 'hims', permission: 'hims_inpatient.view' },
    { to: '/hims/er-triage', label: 'رادار فرز الطوارئ (Triage)', icon: Activity, color: 'text-red-400', module: 'hims', permission: 'hims_clinical.view' },
    { to: '/hims/doctor-desktop', label: 'سطح مكتب الطبيب', icon: Activity, color: 'text-indigo-400', module: 'hims', permission: 'hims_clinical.view' },
    { to: '/hims/surgeries', label: 'جدول غرف العمليات', icon: Scissors, color: 'text-emerald-400', module: 'hims', permission: 'hims_clinical.view' },
    { to: '/hims/nurse-station', label: 'محطة التمريض والأسرة', icon: HeartPulse, color: 'text-rose-400', module: 'hims', permission: 'hims_inpatient.view' },
    { to: '/hims/lab', label: 'وحدة المختبر والتحاليل', icon: FlaskConical, color: 'text-cyan-400', module: 'hims', permission: 'hims_ancillary.view' },
    { to: '/hims/lab-tracking', label: 'تتبع عينات المختبر', icon: Search, color: 'text-cyan-400', module: 'hims', permission: 'hims_ancillary.view' },
    { to: '/hims/radiology', label: 'وحدة الأشعة والتشخيص', icon: Camera, color: 'text-purple-400', module: 'hims', permission: 'hims_ancillary.view' },
    { to: '/hims/pharmacy', label: 'الصيدلية الداخلية', icon: Package, color: 'text-emerald-500', module: 'hims', permission: 'hims_billing.view' },
    { to: '/hims/blood-bank', label: 'بنك الدم المركزي', icon: HeartPulse, color: 'text-pink-500', module: 'hims', permission: 'hims_ancillary.view' },
    { to: '/hims/doctor-kpis', label: 'مؤشرات أداء الأطباء', icon: TrendingUp, color: 'text-indigo-600', module: 'hims', permission: 'hims_core.view' },
    { to: '/hims/billing', label: 'صندوق المحاسبة الطبية', icon: DollarSign, color: 'text-emerald-400', module: 'hims', permission: 'hims_billing.view' },
    { to: '/hims/profitability', label: 'تحليل الربحية الطبية', icon: TrendingUp, color: 'text-emerald-600', module: 'hims', permission: 'hims_billing.view' },
    { to: '/hims/insurance-claims', label: 'إدارة مطالبات التأمين', icon: ClipboardList, color: 'text-indigo-400', module: 'hims', permission: 'hims_billing.view' },
    { to: '/hims/inpatient-board', label: 'شاشة رقابة حركة الأسرة', icon: Bed, color: 'text-emerald-500', module: 'hims', permission: 'hims_inpatient.view' },

    // ─────────────────────────────────────────
    // 🏟️ مديول الاستاد الرياضي ومركز التنمية الشبابية
    // ─────────────────────────────────────────
    { type: 'section', label: 'الاستاد الرياضي والمركز الشبابي' },
    { to: '/stadium', label: 'لوحة تحكم الاستاد', icon: Trophy, color: 'text-green-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/gate-scanner', label: 'شاشة فحص البوابات (QR)', icon: QrCode, color: 'text-emerald-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/members', label: 'إدارة الأعضاء والاشتراكات', icon: Users, color: 'text-green-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/facilities', label: 'الملاعب والمرافق', icon: Building2, color: 'text-green-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/maintenance', label: 'صيانة الملاعب والمرافق', icon: Wrench, color: 'text-indigo-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/bookings', label: 'الحجوزات بالساعة', icon: Calendar, color: 'text-green-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/rentals', label: 'عقود الإيجار الدورية', icon: FileText, color: 'text-green-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/programs', label: 'برامج التدريب والأكاديميات', icon: Dumbbell, color: 'text-green-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/tournaments', label: 'البطولات والفعاليات الرياضية', icon: Trophy, color: 'text-amber-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/coaches', label: 'الكوادر والمدربون', icon: Award, color: 'text-green-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/budget', label: 'الموازنة التقديرية للاستاد', icon: PieChart, color: 'text-emerald-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/disbursements', label: 'طلبات واعتمادات الصرف', icon: CheckSquare, color: 'text-amber-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/custodies', label: 'عهد الأنشطة والبطولات', icon: Wallet, color: 'text-amber-400', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/reports/revenue', label: 'تقرير الإيرادات', icon: BarChart3, color: 'text-green-300', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/reports/expenses', label: 'تقرير المصروفات والنفقات', icon: DollarSign, color: 'text-amber-300', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/reports/pnl', label: 'قائمة الفائض والعجز (P&L)', icon: PieChart, color: 'text-emerald-300', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/reports/occupancy', label: 'معدل إشغال المرافق', icon: Activity, color: 'text-green-300', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/reports/member-aging', label: 'الاشتراكات المنتهية', icon: AlertTriangle, color: 'text-green-300', module: 'stadium', permission: 'stadium.view' },
    { to: '/stadium/reports/program-profit', label: 'ربحية البرامج التدريبية', icon: TrendingUp, color: 'text-green-300', module: 'stadium', permission: 'stadium.view' },



    // الإدارة والنظام
    { type: 'section', label: 'الإدارة والنظام' },
    { to: '/users', label: 'إدارة المستخدمين', icon: Users, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/permissions', label: 'الأدوار والصلاحيات', icon: ShieldCheck, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/saas-admin', label: 'إدارة المنصة (SaaS)', icon: ShieldAlert, color: 'text-indigo-500', superAdminOnly: true },
    { to: '/admin/test-dashboard', label: 'مراقبة صحة النظام', icon: Activity, color: 'text-amber-400', superAdminOnly: true, permission: 'admin.logs' },
    { to: '/stress-test', label: 'اختبار كفاءة وتحمل النظام (Stress Test)', icon: Zap, color: 'text-amber-400', superAdminOnly: true, permission: 'admin.manage' },
    { to: '/security-logs', label: 'سجلات الأمان', icon: ScrollText, color: 'text-slate-400', adminOnly: true, permission: 'admin.logs' },
    { to: '/recycle-bin', label: 'سلة المحذوفات', icon: Trash2, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/data-migration', label: 'مركز ترحيل البيانات', icon: Database, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/settings', label: 'إعدادات المنشأة', icon: Settings, color: 'text-slate-400', adminOnly: true, permission: 'admin.manage' },
    { to: '/user-guide', label: 'دليل الاستخدام', icon: BookOpen, color: 'text-blue-400' },
  ];

  // تصفية العناصر بناءً على الأدوار والموديولات المتاحة
  const filteredItems = React.useMemo(() => navItems.filter(item => {
    if (item.type === 'section') return true;
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.adminOnly && !isSuperAdmin && (userRole as string) !== 'admin' && (userRole as string) !== 'manager') return false;
    
    // 🍽️ إحكام عزل شاشات كاشير المطعم ونقاط البيع (Restaurant POS Cashier Lockdown)
    if (userRole === 'restaurant_cashier' || userRole === 'cashier') {
      const allowedCashierPaths = ['/pos', '/retail-pos'];
      if (!item.to || !allowedCashierPaths.includes(item.to)) {
        return false;
      }
      return true;
    }

    // 🛒 مشرف ورئيس الكاشيرية (POS & Retail Supervisor)
    if (userRole === 'pos_supervisor' || userRole === 'retail_supervisor') {
      const allowedSupervisorPaths = [
        '/retail-pos', 
        '/pos', 
        '/retail/price-checker', 
        '/retail/promotions', 
        '/retail/customer-display', 
        '/inventory/expiry-radar', 
        '/inventory/shelf-restock', 
        '/inventory/replenishment',
        '/inventory/pda-stocktaking',
        '/invoices-list', 
        '/sales-returns-list', 
        '/reports/sales-by-user',
        '/sales-reports'
      ];
      if (!item.to || !allowedSupervisorPaths.includes(item.to)) {
        return false;
      }
      return true;
    }

    // 🍽️ كابتن الصالة والويتر المحمول
    if (userRole === 'restaurant_waiter') {
      return item.to === '/restaurant/waiter';
    }

    // 🍽️ طاهي المحطة والمطبخ
    if (userRole === 'restaurant_cook' || (userRole as string) === 'chef') {
      return item.to === '/kds';
    }

    // 🍽️ شيف المطبخ التنفيذي ومسؤول التشغيل
    if (userRole === 'restaurant_chef') {
      const allowedChefPaths = ['/kds', '/restaurant/expo', '/restaurant/stations', '/kitchen-end-day', '/restaurant/butchering-yield'];
      return Boolean(item.to && allowedChefPaths.includes(item.to));
    }

    // 🍽️ كابتن التوصيل والديليفري
    if (userRole === 'restaurant_driver') {
      return item.to === '/restaurant/driver-dispatch';
    }

    // 🏟️ تصفية ذكية للأدوار التخصصية لقطاع الاستاد
    if (userRole && typeof userRole === 'string' && userRole.startsWith('stadium_')) {
      if (!item.to || !item.to.startsWith('/stadium')) {
        return false;
      }
      if (userRole === 'stadium_gate_security') {
        return item.to === '/stadium/gate-scanner';
      }
      if (userRole === 'stadium_booking_officer') {
        return ['/stadium/bookings', '/stadium/facilities', '/stadium/reports/occupancy'].includes(item.to);
      }
      if (userRole === 'stadium_receptionist') {
        return ['/stadium/members', '/stadium/bookings', '/stadium/programs', '/stadium/gate-scanner', '/stadium/reports/member-aging'].includes(item.to);
      }
      if (userRole === 'stadium_maintenance_lead') {
        return ['/stadium/maintenance', '/stadium/facilities'].includes(item.to);
      }
      if (userRole === 'stadium_sports_supervisor') {
        return ['/stadium/programs', '/stadium/coaches', '/stadium/tournaments', '/stadium/reports/program-profit'].includes(item.to);
      }
      if (userRole === 'stadium_director') {
        return true; // صلاحية كاملة على كل شاشات الاستاد
      }
    }

    // Check module allowance (SaaS level)
    if (item.module && !isModuleAllowed(item.module)) return false;
    
    // Granular permission check
    if (item.permission) {
        const [module, action] = item.permission.split('.');
        if (!can(module, action)) return false;
    }

    return true;
  }), [isSuperAdmin, userRole, allowedModules, organization, can]);


  // إخفاء العناوين (Sections) التي لا تحتوي على عناصر تحتها
  const visibleItems = React.useMemo(() => filteredItems.filter((item, idx) => {
    if (item.type !== 'section') return true;
    const nextItem = filteredItems[idx + 1];
    return nextItem && nextItem.type !== 'section';
  }), [filteredItems]);

  // تحويل القائمة المسطحة إلى هيكل شجري للموديولات لتسهيل عرضها كقوائم منسدلة
  const groupedItems = React.useMemo(() => {
    const groups: any[] = [];
    let currentSection: any = null;

    visibleItems.forEach(item => {
      if (item.type === 'section') {
        currentSection = { ...item, children: [] };
        groups.push(currentSection);
      } else if (currentSection) {
        currentSection.children.push(item);
      } else {
        groups.push(item);
      }
    });
    return groups.filter(g => g.type !== 'section' || (Array.isArray(g.children) && g.children.length > 0));
  }, [visibleItems]);

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
              {organizations && organizations.length > 0 ? organizations.map((org: any) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              )) : (
                <option disabled>لا توجد شركات مسجلة</option>
              )}
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