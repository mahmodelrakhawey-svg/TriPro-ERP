import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LucideIcon,
  Search, X, ArrowRight, CornerDownLeft, 
  BookOpen, Layers, ShoppingBag, ShoppingCart, Package, 
  Users, Truck, DollarSign, CreditCard, Landmark, 
  BarChart3, Activity, HeartPulse, Building2, Factory, 
  UtensilsCrossed, Trophy, Settings, ShieldCheck, FileText,
  Clock, CheckCircle2, ChevronRight
} from 'lucide-react';

interface PaletteCommand {
  id: string;
  title: string;
  path: string;
  category: string;
  keywords: string[];
  icon: LucideIcon;
  badge?: string;
}

const COMMAND_LIST: PaletteCommand[] = [
  // 📒 المحاسبة والمالية
  { id: 'general-journal', title: 'دفتر اليومية العامة', path: '/general-journal', category: 'المحاسبة والمالية', keywords: ['قيود', 'يومية', 'دفتر', 'ترحيل', 'journal'], icon: BookOpen },
  { id: 'journal-entry', title: 'إنشاء قيد يومية جديد', path: '/journal-entry', category: 'المحاسبة والمالية', keywords: ['قيد جديد', 'إضافة قيد', 'سند قيد', 'new entry'], icon: FileText, badge: 'جديد' },
  { id: 'general-ledger', title: 'دفتر الأستاذ العام', path: '/general-ledger', category: 'المحاسبة والمالية', keywords: ['أستاذ', 'كشف حساب', 'ledger'], icon: BookOpen },
  { id: 'trial-balance', title: 'ميزان المراجعة المتقدم', path: '/trial-balance', category: 'المحاسبة والمالية', keywords: ['ميزان', 'أرصدة', 'مجاميع', 'trial balance'], icon: BarChart3 },
  { id: 'income-statement', title: 'قائمة الدخل الشامل (الأرباح والخسائر)', path: '/income-statement', category: 'المحاسبة والمالية', keywords: ['دخل', 'أرباح', 'خسائر', 'pnl'], icon: BarChart3 },
  { id: 'balance-sheet', title: 'قائمة المركز المالي (الميزانية العمومية)', path: '/balance-sheet', category: 'المحاسبة والمالية', keywords: ['مركز مالي', 'ميزانية', 'أصول', 'خصوم'], icon: BarChart3 },
  { id: 'cash-flow', title: 'قائمة التدفقات النقدية', path: '/cash-flow', category: 'المحاسبة والمالية', keywords: ['تدفقات', 'سيولة', 'نقدية', 'cash flow'], icon: DollarSign },
  { id: 'accounts', title: 'دليل شجرة الحسابات', path: '/accounts', category: 'المحاسبة والمالية', keywords: ['دليل', 'شجرة', 'حسابات', 'chart of accounts'], icon: Layers },
  { id: 'payment-vouchers', title: 'سندات الصرف النقدي والبنكي', path: '/payment-vouchers', category: 'المحاسبة والمالية', keywords: ['سند صرف', 'مدفوعات', 'صرف'], icon: CreditCard },
  { id: 'receipt-vouchers', title: 'سندات القبض والتحصيل', path: '/receipt-vouchers', category: 'المحاسبة والمالية', keywords: ['سند قبض', 'مقبوضات', 'تحصيل'], icon: DollarSign },
  { id: 'cheques', title: 'حافظة وإدارة الشيكات', path: '/cheques', category: 'المحاسبة والمالية', keywords: ['شيكات', 'شيك وارد', 'شيك صادر', 'تحصيل'], icon: Landmark },
  { id: 'financial-ratios', title: 'النسب والمؤشرات المالية', path: '/financial-ratios', category: 'المحاسبة والمالية', keywords: ['مؤشرات', 'نسب', 'تحليل مالي'], icon: BarChart3 },

  // 🛒 المبيعات والعملاء
  { id: 'sales-invoice', title: 'إنشاء فاتورة مبيعات', path: '/sales-invoice', category: 'المبيعات والعملاء', keywords: ['فاتورة مبيعات', 'بيع', 'إصدار فاتورة'], icon: ShoppingBag, badge: 'سريع' },
  { id: 'invoices-list', title: 'سجل فواتير المبيعات', path: '/invoices-list', category: 'المبيعات والعملاء', keywords: ['فواتير المبيعات', 'سجل الفواتير'], icon: FileText },
  { id: 'customers', title: 'إدارة العملاء والمديونيات', path: '/customers', category: 'المبيعات والعملاء', keywords: ['عميل', 'عملاء', 'زبائن', 'customers'], icon: Users },
  { id: 'customer-statement', title: 'كشف حساب عميل تفصيلي', path: '/customer-statement', category: 'المبيعات والعملاء', keywords: ['كشف عميل', 'حساب عميل'], icon: FileText },
  { id: 'customer-aging', title: 'تقرير أعمار ديون العملاء', path: '/customer-aging', category: 'المبيعات والعملاء', keywords: ['أعمار ديون', 'ديون عملاء', 'تحصيل'], icon: BarChart3 },
  { id: 'quotations', title: 'عروض الأسعار', path: '/quotations', category: 'المبيعات والعملاء', keywords: ['عرض سعر', 'تسعير', 'quotation'], icon: FileText },
  { id: 'sales-orders', title: 'أوامر البيع', path: '/sales-orders', category: 'المبيعات والعملاء', keywords: ['أمر بيع', 'طلبيات'], icon: FileText },
  { id: 'sales-return', title: 'مرتجع مبيعات جديد', path: '/sales-return', category: 'المبيعات والعملاء', keywords: ['مرتجع مبيعات', 'إرجاع'], icon: FileText },

  // 📦 المشتريات والموردين
  { id: 'purchase-invoice', title: 'إنشاء فاتورة مشتريات', path: '/purchase-invoice', category: 'المشتريات والموردين', keywords: ['فاتورة مشتريات', 'شراء', 'توريد'], icon: ShoppingCart },
  { id: 'purchase-invoices-list', title: 'سجل فواتير المشتريات', path: '/purchase-invoices-list', category: 'المشتريات والموردين', keywords: ['فواتير المشتريات', 'سجل الشراء'], icon: FileText },
  { id: 'suppliers', title: 'إدارة الموردين والشركات', path: '/suppliers', category: 'المشتريات والموردين', keywords: ['مورد', 'موردين', 'شركات توريد', 'suppliers'], icon: Truck },
  { id: 'supplier-statement', title: 'كشف حساب مورد تفصيلي', path: '/supplier-statement', category: 'المشتريات والموردين', keywords: ['كشف مورد', 'حساب مورد'], icon: FileText },
  { id: 'supplier-aging', title: 'تقرير أعمار ديون الموردين', path: '/supplier-aging', category: 'المشتريات والموردين', keywords: ['ديون موردين', 'أعمار ديون'], icon: BarChart3 },
  { id: 'purchase-orders', title: 'أوامر الشراء والتوريد', path: '/purchase-orders', category: 'المشتريات والموردين', keywords: ['أمر شراء', 'PO'], icon: FileText },

  // 🏪 المستودعات والمخزون
  { id: 'products', title: 'بطاقات الأصناف والمنتجات', path: '/products', category: 'المستودعات والمخزون', keywords: ['صنف', 'أصناف', 'منتجات', 'باركود', 'سعر'], icon: Package },
  { id: 'warehouses', title: 'إدارة المستودعات والفروع', path: '/warehouses', category: 'المستودعات والمخزون', keywords: ['مخزن', 'مخازن', 'مستودع', 'فرع'], icon: Package },
  { id: 'stock-transfer', title: 'التحويل المخزني بين الفروع', path: '/stock-transfer', category: 'المستودعات والمخزون', keywords: ['تحويل مخزني', 'نقل بضاعة'], icon: Truck },
  { id: 'inventory-count', title: 'الجرد المخزني الفعلي', path: '/inventory-count', category: 'المستودعات والمخزون', keywords: ['جرد', 'مطابقة جرد', 'تسوية جرد'], icon: CheckCircle2 },
  { id: 'stock-adjustment', title: 'التسويات المخزنية والهالك', path: '/stock-adjustment', category: 'المستودعات والمخزون', keywords: ['تسوية', 'هالك', 'تسوية بضاعة'], icon: Package },

  // 🛍️ نقاط البيع والمطاعم
  { id: 'pos', title: 'شاشة كاشير نقاط البيع (POS)', path: '/pos', category: 'نقاط البيع والمطاعم', keywords: ['كاشير', 'pos', 'نقطة بيع', 'تجزئة'], icon: ShoppingBag, badge: 'Touch' },
  { id: 'restaurant-pos', title: 'نقاط بيع المطاعم والصالة', path: '/restaurant/pos', category: 'نقاط البيع والمطاعم', keywords: ['مطعم', 'طاولات', 'وجبات', 'ويتر'], icon: UtensilsCrossed },
  { id: 'kds', title: 'شاشة المطبخ وإعداد الطلبات (KDS)', path: '/kds', category: 'نقاط البيع والمطاعم', keywords: ['شاشة مطبخ', 'kds', 'شيف'], icon: UtensilsCrossed },

  // 🏥 الرعاية الصحية والمستشفيات (HIMS)
  { id: 'hims-dashboard', title: 'لوحة قيادة النظام الطبي (HIMS)', path: '/hims', category: 'الرعاية الصحية والمستشفيات', keywords: ['مستشفى', 'طبي', 'عيادات', 'مرضى'], icon: HeartPulse },
  { id: 'hims-clinics', title: 'العيادات الخارجية وحجز الكشوفات', path: '/hims/clinics/queue', category: 'الرعاية الصحية والمستشفيات', keywords: ['عيادات', 'طبيب', 'كشف', 'حجز طبي'], icon: Activity },
  { id: 'hims-er', title: 'قسم الطوارئ وفرز الحالات (ER)', path: '/hims/emergency/triage', category: 'الرعاية الصحية والمستشفيات', keywords: ['طوارئ', 'إسعاف', 'فرز'], icon: HeartPulse },
  { id: 'hims-inpatients', title: 'تنويم المرضى وتسكين الأسرّة', path: '/hims/inpatients/admissions', category: 'الرعاية الصحية والمستشفيات', keywords: ['تنويم', 'أسرّة', 'إقامة'], icon: Activity },

  // 🏗️ المقاولات والمشاريع
  { id: 'construction', title: 'إدارة مشاريع المقاولات والتشييد', path: '/construction', category: 'المقاولات والمشاريع', keywords: ['مقاولات', 'مشروع', 'مشاريع', 'بناء'], icon: Building2 },
  { id: 'construction-boq', title: 'جدول الكميات والمقايسات (BOQ)', path: '/construction/boq', category: 'المقاولات والمشاريع', keywords: ['كميات', 'مقايسة', 'boq'], icon: FileText },
  { id: 'construction-billing', title: 'مستخلصات المالك ومقاولي الباطن', path: '/construction/billing', category: 'المقاولات والمشاريع', keywords: ['مستخلص', 'مستخلصات', 'تصفية'], icon: DollarSign },

  // 🏭 التصنيع والإنتاج
  { id: 'manufacturing', title: 'لوحة التحكم في الإنتاج والتصنيع', path: '/manufacturing', category: 'التصنيع والإنتاج', keywords: ['تصنيع', 'إنتاج', 'مصنع'], icon: Factory },
  { id: 'manufacturing-bom', title: 'شجرة المنتج والمكونات (BOM)', path: '/manufacturing/bom', category: 'التصنيع والإنتاج', keywords: ['شجرة منتج', 'bom', 'خامات'], icon: Layers },
  { id: 'manufacturing-orders', title: 'أوامر الإنتاج والتشغيل', path: '/manufacturing/orders', category: 'التصنيع والإنتاج', keywords: ['أمر إنتاج', 'أمر شغل'], icon: FileText },
  { id: 'manufacturing-daily-batch', title: 'أمر الإنتاج اليومي المجمّع (تورتات / جاتوهات / شرقي)', path: '/mfg/daily-batch', category: 'التصنيع والإنتاج', keywords: ['إنتاج يومي', 'دفعة', 'مجمع', 'تورتة', 'جاتوه', 'حلواني', 'batch'], icon: Factory },

  // ⚽ الأندية والملاعب
  { id: 'stadium', title: 'لوحة إدارة الأندية والملاعب', path: '/stadium', category: 'الأندية والملاعب', keywords: ['نادي', 'ملاعب', 'رياضة'], icon: Trophy },
  { id: 'stadium-booking', title: 'حجز الملاعب والمرافق الرياضية', path: '/stadium/booking', category: 'الأندية والملاعب', keywords: ['حجز ملعب', 'مباريات'], icon: Trophy },
  { id: 'stadium-memberships', title: 'عضويات واشتراكات الأعضاء', path: '/stadium/memberships', category: 'الأندية والملاعب', keywords: ['عضوية', 'اشتراك', 'أعضاء'], icon: Users },

  // 👥 الموارد البشرية (HR)
  { id: 'hr-employees', title: 'سجل الموظفين والملفات الشخصية', path: '/employees', category: 'الموارد البشرية (HR)', keywords: ['موظف', 'موظفين', 'عاملين', 'hr'], icon: Users },
  { id: 'payroll', title: 'مسير الرواتب ومستحقات الأجور', path: '/payroll', category: 'الموارد البشرية (HR)', keywords: ['رواتب', 'مسير', 'أجور', 'مرتبات'], icon: DollarSign },
  { id: 'advances', title: 'إدارة سلف وعهد الموظفين', path: '/advances', category: 'الموارد البشرية (HR)', keywords: ['سلفة', 'سلف', 'عهد'], icon: CreditCard },
  { id: 'attendance', title: 'الحضور والانصراف وأجهزة البصمة', path: '/attendance', category: 'الموارد البشرية (HR)', keywords: ['بصمة', 'حضور', 'انصراف', 'غياب'], icon: Clock },

  // ⚙️ الإعدادات والإدارة
  { id: 'settings', title: 'إعدادات النظام العامة والضرائب', path: '/settings', category: 'الإعدادات والإدارة', keywords: ['إعدادات', 'ضبط', 'ضرائب', 'شركة'], icon: Settings },
  { id: 'users-permissions', title: 'المستخدمين ومصفوفة الصلاحيات', path: '/users', category: 'الإعدادات والإدارة', keywords: ['مستخدمين', 'صلاحيات', 'أدوار', 'permissions'], icon: ShieldCheck },
];

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // الاستماع لاختصار Ctrl+K و Cmd+K عالمياً في أي مكان بالتطبيق
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const handleCustomOpen = () => setIsOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('tripro:open-command-palette', handleCustomOpen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('tripro:open-command-palette', handleCustomOpen);
    };
  }, [isOpen]);

  // التركيز التلقائي على خانة البحث عند الفتح
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // تصفية العناصر بناءً على كلمة البحث (عنوان، تصنيف، كلمات مفتاحية)
  const filteredCommands = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      // إرجاع أهم الشاشات الشائعة افتراضياً
      return COMMAND_LIST.slice(0, 10);
    }

    return COMMAND_LIST.filter(cmd => {
      const titleMatch = cmd.title.toLowerCase().includes(cleanQuery);
      const categoryMatch = cmd.category.toLowerCase().includes(cleanQuery);
      const keywordMatch = cmd.keywords.some(k => k.toLowerCase().includes(cleanQuery));
      const pathMatch = cmd.path.toLowerCase().includes(cleanQuery);
      return titleMatch || categoryMatch || keywordMatch || pathMatch;
    }).slice(0, 15);
  }, [query]);

  // إعادة ضبط المؤشر عند تغير نتائج البحث
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  const handleSelect = (command: PaletteCommand) => {
    setIsOpen(false);
    navigate(command.path);
  };

  const handleKeyDownInList = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleSelect(filteredCommands[selectedIndex]);
      }
    }
  };

  // تمرير التمرير تلقائياً للعنصر المحدد بلوحة المفاتيح
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => setIsOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="شريط البحث السريع والتنقل في النظام"
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDownInList}
      >
        {/* شريط الإدخال والبحث */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <Search size={20} className="text-blue-600 shrink-0" />
          <input 
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث عن أي شاشة أو تقرير في النظام... (مثال: قيود، فاتورة، كشف عميل، جرد)"
            className="flex-1 bg-transparent text-sm sm:text-base font-bold text-slate-800 placeholder-slate-400 outline-none"
            aria-autocomplete="list"
          />
          {query ? (
            <button 
              type="button" 
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
              title="مسح البحث"
            >
              <X size={16} />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">ESC للإغلاق</kbd>
          )}
        </div>

        {/* قائمة النتائج */}
        <div 
          ref={listRef}
          className="overflow-y-auto p-2 space-y-1 divide-y divide-slate-50 flex-1 max-h-[60vh]"
          role="listbox"
        >
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Search size={32} className="mx-auto opacity-40 text-slate-400" />
              <p className="font-bold text-sm text-slate-600">لا توجد نتائج مطابقة لـ "{query}"</p>
              <p className="text-xs text-slate-400">جرّب البحث باسم الموديول أو كلمة مرادفة (مثل: قيود، مستودع، شيكات)</p>
            </div>
          ) : (
            filteredCommands.map((command, idx) => {
              const isSelected = idx === selectedIndex;
              const IconComp = command.icon;

              return (
                <div
                  key={command.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(command)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-100 ${
                    isSelected 
                      ? 'bg-blue-50 text-blue-900 border-r-4 border-blue-600 shadow-2xs' 
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 transition-colors ${
                      isSelected ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <IconComp size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm truncate">{command.title}</span>
                        {command.badge && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                            {command.badge}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 block font-medium mt-0.5">
                        {command.category} • <span className="font-mono text-slate-400">{command.path}</span>
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 mr-2">
                    {isSelected ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-white px-2 py-1 rounded-lg border border-blue-200 shadow-2xs">
                        <span>فتح</span>
                        <CornerDownLeft size={12} />
                      </span>
                    ) : (
                      <ChevronRight size={16} className="text-slate-300" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* تذييل النافذة */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] shadow-2xs font-mono">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] shadow-2xs font-mono">↓</kbd>
              <span>للتنقل</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] shadow-2xs font-mono">Enter</kbd>
              <span>للفتح</span>
            </span>
          </div>
          <span className="font-bold text-slate-400">TriPro ERP Navigator</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
