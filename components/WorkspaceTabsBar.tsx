import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { secureStorage } from '../utils/securityMiddleware';
import { 
    X, Plus, Home, ShoppingCart, ShoppingBag, DollarSign, 
    BookOpen, Layers, Users, Truck, FileText, BarChart3, 
    Settings, Package, CreditCard, Landmark, CheckCircle2,
    LayoutDashboard
} from 'lucide-react';

export interface WorkspaceTab {
    path: string;
    title: string;
    closable: boolean;
}

// 🗺️ خريطة العناوين والأيقونات الشاملة للمسارات
const ROUTE_INFO: Record<string, { title: string; icon: any }> = {
    '/': { title: 'الرئيسية', icon: Home },
    '/sales-invoice': { title: 'فاتورة مبيعات', icon: ShoppingBag },
    '/invoices-list': { title: 'سجل المبيعات', icon: FileText },
    '/sales-return': { title: 'مرتجع مبيعات', icon: FileText },
    '/sales-returns': { title: 'سجل مرتجع المبيعات', icon: FileText },
    '/customers': { title: 'إدارة العملاء', icon: Users },
    '/customer-statement': { title: 'كشف حساب عميل', icon: FileText },
    '/customer-aging': { title: 'أعمار ديون العملاء', icon: BarChart3 },
    '/customer-reconciliation': { title: 'مطابقة أرصدة العملاء', icon: CheckCircle2 },
    
    '/purchase-invoice': { title: 'فاتورة مشتريات', icon: ShoppingCart },
    '/purchase-invoices': { title: 'سجل المشتريات', icon: FileText },
    '/purchase-return': { title: 'مرتجع مشتريات', icon: FileText },
    '/purchase-returns': { title: 'سجل مرتجع المشتريات', icon: FileText },
    '/suppliers': { title: 'إدارة الموردين', icon: Truck },
    '/supplier-statement': { title: 'كشف حساب مورد', icon: FileText },
    '/supplier-aging': { title: 'أعمار ديون الموردين', icon: BarChart3 },
    '/supplier-balances': { title: 'تقرير أرصدة الموردين', icon: BarChart3 },
    '/supplier-reconciliation': { title: 'مطابقة أرصدة الموردين', icon: CheckCircle2 },
    
    '/payment-vouchers': { title: 'سندات الصرف', icon: CreditCard },
    '/receipt-vouchers': { title: 'سندات القبض', icon: DollarSign },
    '/cheques': { title: 'حافظة الشيكات', icon: Landmark },
    '/general-journal': { title: 'دفتر اليومية', icon: BookOpen },
    '/general-ledger': { title: 'دفتر الأستاذ العام', icon: BookOpen },
    '/journal-entry': { title: 'قيد يومية جديد', icon: FileText },
    '/accounts': { title: 'دليل الحسابات', icon: Layers },
    '/income-statement': { title: 'قائمة الدخل', icon: BarChart3 },
    '/balance-sheet': { title: 'الميزانية العمومية', icon: BarChart3 },
    '/cash-flow': { title: 'قائمة التدفقات النقدية', icon: BarChart3 },
    
    '/products': { title: 'الأصناف والمخزون', icon: Package },
    '/warehouses': { title: 'المستودعات', icon: Package },
    '/stock-transfer': { title: 'تحويل مخزني', icon: Package },
    '/stock-adjustment': { title: 'تسوية مخزنية', icon: Package },
    '/inventory-count': { title: 'الجرد المخزني', icon: Package },
    '/item-movement': { title: 'حركة صنف', icon: BarChart3 },
    
    '/quotations': { title: 'عروض الأسعار', icon: FileText },
    '/sales-orders': { title: 'أوامر البيع', icon: FileText },
    '/purchase-orders': { title: 'أوامر الشراء', icon: FileText },
    '/credit-notes': { title: 'إشعارات دائنة', icon: FileText },
    '/debit-notes': { title: 'إشعارات مدينة', icon: FileText },
    
    '/reports': { title: 'التقارير الشاملة', icon: BarChart3 },
    '/important-reports': { title: 'التقارير الهامة', icon: BarChart3 },
    '/financial-ratios': { title: 'النسب والتحليل المالي', icon: BarChart3 },
    '/settings': { title: 'الإعدادات العامة', icon: Settings },
    '/users': { title: 'المستخدمين والصلاحيات', icon: Users }
};

const DEFAULT_TABS: WorkspaceTab[] = [
    { path: '/', title: 'الرئيسية', closable: false }
];

export const WorkspaceTabsBar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // استرجاع التبويبات المحفوظة
    const [tabs, setTabs] = useState<WorkspaceTab[]>(() => {
        try {
            const saved = secureStorage.getItem('tripro_workspace_tabs');
            if (saved) {
                const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {}
        return DEFAULT_TABS;
    });

    // تحديث وإضافة التبويب الحالي تلقائياً عند التنقل
    useEffect(() => {
        const currentPath = location.pathname;
        if (!currentPath || currentPath === '/login') return;

        const info = ROUTE_INFO[currentPath] || {
            title: currentPath.replace('/', '').replace(/-/g, ' ') || 'شاشة',
            icon: LayoutDashboard
        };

        setTabs(prevTabs => {
            const exists = prevTabs.some(t => t.path === currentPath);
            if (exists) return prevTabs;

            const newTab: WorkspaceTab = {
                path: currentPath,
                title: info.title,
                closable: currentPath !== '/'
            };
            const updated = [...prevTabs, newTab];
            try {
                secureStorage.setItem('tripro_workspace_tabs', JSON.stringify(updated));
            } catch (e) {}
            return updated;
        });
    }, [location.pathname]);

    // حفظ التبويبات عند تغييرها
    const saveTabs = (newTabs: WorkspaceTab[]) => {
        setTabs(newTabs);
        try {
            secureStorage.setItem('tripro_workspace_tabs', JSON.stringify(newTabs));
        } catch (e) {}
    };

    // إغلاق تبويب محدد
    const handleCloseTab = (e: React.MouseEvent, targetPath: string) => {
        e.stopPropagation();
        if (targetPath === '/') return;

        const newTabs = tabs.filter(t => t.path !== targetPath);
        saveTabs(newTabs);

        // إذا كان التبويب المغلق هو النشط حالياً، انتقل للتبويب السابق
        if (location.pathname === targetPath) {
            const closedIdx = tabs.findIndex(t => t.path === targetPath);
            const nextTab = newTabs[Math.max(0, closedIdx - 1)] || { path: '/' };
            navigate(nextTab.path);
        }
    };

    // إغلاق كافة التبويبات الأخرى
    const handleCloseOthers = () => {
        const currentPath = location.pathname;
        const currentInfo = ROUTE_INFO[currentPath] || { title: 'شاشة', icon: LayoutDashboard };
        const newTabs: WorkspaceTab[] = [
            { path: '/', title: 'الرئيسية', closable: false }
        ];
        if (currentPath !== '/') {
            newTabs.push({ path: currentPath, title: currentInfo.title, closable: true });
        }
        saveTabs(newTabs);
    };

    // التمرير بالعجلة
    const handleWheel = (e: React.WheelEvent) => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft += e.deltaY;
        }
    };

    const filteredRoutes = Object.entries(ROUTE_INFO).filter(([path, info]) => 
        path !== '/' && (info.title.toLowerCase().includes(searchTerm.toLowerCase()) || path.includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex items-center justify-between gap-3 select-none print:hidden shadow-xs relative z-30">
            {/* 📑 قائمة التبويبات الأفقية */}
            <div 
                ref={scrollContainerRef}
                onWheel={handleWheel}
                className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 scroll-smooth"
            >
                {tabs.map((tab) => {
                    const isActive = location.pathname === tab.path;
                    const info = ROUTE_INFO[tab.path] || { title: tab.title, icon: LayoutDashboard };
                    const IconComponent = info.icon || LayoutDashboard;

                    return (
                        <div
                            key={tab.path}
                            onClick={() => navigate(tab.path)}
                            className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer text-xs font-bold transition-all duration-150 whitespace-nowrap border ${
                                isActive 
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs font-black' 
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/80 hover:border-slate-300'
                            }`}
                            title={tab.title}
                        >
                            <IconComponent size={14} className={isActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'} />
                            <span>{tab.title}</span>

                            {tab.closable && (
                                <button
                                    type="button"
                                    onClick={(e) => handleCloseTab(e, tab.path)}
                                    className={`p-0.5 rounded-md hover:bg-rose-100 hover:text-rose-600 transition-colors ${
                                        isActive ? 'text-emerald-700' : 'text-slate-400 opacity-60 group-hover:opacity-100'
                                    }`}
                                    title="إغلاق التبويب"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ⚡ أدوات التبويبات وسرعة الفتح */}
            <div className="flex items-center gap-1 shrink-0">
                {/* زر فتح شاشة سريعة + */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className={`p-1.5 rounded-xl border flex items-center gap-1 text-xs font-bold transition-all shadow-xs ${
                            isMenuOpen 
                                ? 'bg-emerald-600 text-white border-emerald-600' 
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                        title="فتح شاشة سريعة في تبويب جديد"
                    >
                        <Plus size={15} />
                        <span className="hidden sm:inline">شاشة جديدة</span>
                    </button>

                    {/* قائمة الشاشات المنبثقة */}
                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                            <div className="absolute left-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in slide-in-from-top-2">
                                <div className="mb-2">
                                    <input 
                                        type="text" 
                                        placeholder="ابحث عن شاشة لفتحها..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-emerald-500 font-bold"
                                        autoFocus
                                    />
                                </div>
                                <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-slate-50">
                                    {filteredRoutes.map(([path, info]) => {
                                        const IconComp = info.icon;
                                        return (
                                            <button
                                                key={path}
                                                type="button"
                                                onClick={() => {
                                                    navigate(path);
                                                    setIsMenuOpen(false);
                                                    setSearchTerm('');
                                                }}
                                                className="w-full flex items-center gap-2.5 p-2 rounded-xl text-right text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                            >
                                                <div className="p-1 rounded-lg bg-slate-100 text-slate-500">
                                                    <IconComp size={14} />
                                                </div>
                                                <span className="flex-1">{info.title}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* زر إغلاق التبويبات الأخرى */}
                {tabs.length > 2 && (
                    <button
                        type="button"
                        onClick={handleCloseOthers}
                        className="px-2 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        title="إغلاق التبويبات الأخرى والإبقاء على الشاشة الحالية فقط"
                    >
                        إغلاق الباقي
                    </button>
                )}
            </div>
        </div>
    );
};

export default WorkspaceTabsBar;
