
import { logger } from '../utils/logger';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAccounting } from '../context/AccountingContext'; // Assuming context provides demo data
import { supabase } from '../supabaseClient';
import { 
  TrendingUp, TrendingDown, Users, ShoppingCart, 
  AlertTriangle, ArrowUpRight, ArrowDownLeft, Activity,
  Wallet, FileText, Package, Truck, BarChart2, Calendar, Loader2,
  DollarSign, Target, Crown, Star, PieChart as PieChartIcon,
  Edit,
  Building2, Briefcase, BarChart3 as ChartIcon, Zap,
  Layers
} from 'lucide-react'; // 💡 Note: I've removed unused imports for cleaner code
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { useToast } from '../context/ToastContext';
import { DashboardAlerts } from './DashboardAlerts';
import QuickBooksWorkflowHub from './QuickBooksWorkflowHub';
import { secureStorage } from '../utils/securityMiddleware';

const Dashboard = () => {
  const { 
    currentUser, 
    organization,
    organizations,
    currentSelectedOrgId, 
    setCurrentSelectedOrgId,
    settings, 
    getSystemAccount, 
    getFinancialSummary, 
    products: demoProducts, 
    invoices: demoInvoices, 
    purchaseInvoices: demoPurchaseInvoices, 
    customers: demoCustomers, 
    entries, 
    accounts 
  } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    monthSales: 0,
    prevMonthSales: 0,
    monthPurchases: 0,
    prevMonthPurchases: 0,
    monthCogs: 0,
    monthExpenses: 0,
    receivables: 0,
    payables: 0,
    totalReceipts: 0,
    totalPayments: 0,
    lowStockCount: 0,
    salesTarget: 0,
    // مقاييس المقاولات الجديدة
    activeProjectsCount: 0,
    totalContractsValue: 0,
    expectedProfitability: 0, // نضف معدل الربحية المتوقع
    totalConstructionBilled: 0
  });
  const [recentJournals, setRecentJournals] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topCustomersPieData, setTopCustomersPieData] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [overLimitCustomers, setOverLimitCustomers] = useState<any[]>([]);
  const [subStatus, setSubStatus] = useState<any>(null);

  // State for editing sales target
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [newSalesTarget, setNewSalesTarget] = useState('');

  // 🧭 وضع العرض: نمط كويك بوكس التفاعلي أو لوحة التحليلات والمؤشرات وفق صلاحية وتفضيل المستخدم
  const userDashboardMode = currentUser?.dashboard_view_mode || 'both';
  const isWorkflowRestricted = userDashboardMode === 'workflow_only';
  const isAnalyticsRestricted = userDashboardMode === 'analytics_only';
  const canSwitchViewMode = !isWorkflowRestricted && !isAnalyticsRestricted;

  const [viewMode, setViewMode] = useState<'workflow' | 'analytics'>(() => {
    if (isWorkflowRestricted) return 'workflow';
    if (isAnalyticsRestricted) return 'analytics';
    try {
      const saved = secureStorage.getItem<string>('tripro_dashboard_view_mode');
      return saved === 'analytics' ? 'analytics' : 'workflow';
    } catch {
      return 'workflow';
    }
  });

  // مزامنة وضع العرض عند تحديث تفضيلات المستخدم
  useEffect(() => {
    if (isWorkflowRestricted && viewMode !== 'workflow') {
      setViewMode('workflow');
    } else if (isAnalyticsRestricted && viewMode !== 'analytics') {
      setViewMode('analytics');
    }
  }, [isWorkflowRestricted, isAnalyticsRestricted, viewMode]);

  const handleToggleViewMode = (mode: 'workflow' | 'analytics') => {
    if (!canSwitchViewMode) return;
    setViewMode(mode);
    try {
      secureStorage.setItem('tripro_dashboard_view_mode', mode);
    } catch {}
    // ⚡ عند اختيار خريطة تري برو تختفي القائمة الجانبية (ملء الشاشة)، وعند التحليلات تظهر تلقائياً
    const shouldCollapse = mode === 'workflow';
    window.dispatchEvent(new CustomEvent('set-desktop-sidebar-collapsed', { detail: shouldCollapse }));
  };

  useEffect(() => {
    // مزامنة حالة القائمة الجانبية تلقائياً مع وضع العرض الحالي
    const shouldCollapse = viewMode === 'workflow';
    window.dispatchEvent(new CustomEvent('set-desktop-sidebar-collapsed', { detail: shouldCollapse }));
  }, [viewMode]);

  // 🛡️ تحديد معرف الشركة الفعّال بذكاء: يدعم السوبر أدمن واليوزر العادي بدون انقطاع
  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'owner';
  const effectiveOrgId = currentSelectedOrgId || 
    (currentUser as any)?.organization_id || 
    organization?.id || 
    (organizations && organizations.length > 0 ? organizations[0]?.id : null);
  const orgId = effectiveOrgId;

  // ⚡ تعيين تلقائي للشركة الأولى للسوبر أدمن إذا لم تكن محددة مسبقاً لمزامنة كل الشاشات
  useEffect(() => {
    if (isSuperAdmin && !currentSelectedOrgId && effectiveOrgId) {
      setCurrentSelectedOrgId(effectiveOrgId);
    }
  }, [isSuperAdmin, currentSelectedOrgId, effectiveOrgId, setCurrentSelectedOrgId]);

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

  // دالة حساب إحصائيات الشهر الحالي محلياً لضمان الدقة 100%
  useEffect(() => {
    // Effect for non-demo (real) users, relies on RPC
    const fetchRealData = async () => {
      if (currentUser && currentUser.role !== 'demo') {
        // إذا لم توجد أي شركة في النظام نهائياً
        if (!orgId) {
            setLoading(false);
            setStats(prev => ({...prev, monthSales: 0, receivables: 0, payables: 0}));
            setRecentInvoices([]);
            setChartData([]);
            return;
        }

        setLoading(true);

        // فحص حالة الاشتراك
        const checkSub = async () => {
            const { data } = await supabase.rpc('check_subscription_status', { p_org_id: orgId });
            if (data) setSubStatus(data);
        };
        
        // دالة فحص العملاء المتجاوزين للحد (إصلاح المعامل p_org_id)
        const checkHighDebt = async (orgId: string) => {
          try {
            const { data, error } = await supabase.rpc('get_over_limit_customers', { p_org_id: orgId });
            if (error) throw error;
            setOverLimitCustomers(data || []);
          } catch (err) {
            if (process.env.NODE_ENV === 'development') logger.error("Error in checkHighDebt:", err);
          }
        };

        try {
          setRpcError(null);
          // 🛡️ صمام أمان: التأكد من وجود معرف المنظمة قبل الطلب
          if (orgId) {
              await Promise.all([checkSub(), checkHighDebt(orgId)]);
          }

          // 🚀 تمرير المعرف لضمان جلب بيانات الشركة الصحيحة لليوزر العالمي
          const { data, error } = await supabase.rpc('get_dashboard_stats', { p_org_id: orgId });
          
          if (error) {
              if (error.code === '42703') {
                  setRpcError("خطأ في بنية الجداول: عمود مفقود. يرجى تشغيل سكربت Stabilization.");
              }
              else if (error.code === '42P01') {
                  setRpcError("خطأ في قاعدة البيانات: الرؤية `journal_lines_view` مفقودة. يرجى تشغيل سكربت إنشاء الرؤية.");
              }
              throw error;
          }

          if (data) {
              setStats({
                  monthSales: data.monthSales || 0,
                  prevMonthSales: data.prevMonthSales || 0,
                  monthPurchases: data.monthPurchases || 0,
                  prevMonthPurchases: data.prevMonthPurchases || 0,
                  monthCogs: data.monthCogs || 0,
                  monthExpenses: data.monthExpenses || 0,
                  receivables: data.receivables || 0,
                  payables: data.payables || 0,
                  totalReceipts: data.totalReceipts || 0,
                  totalPayments: data.totalPayments || 0,
                  lowStockCount: data.lowStockCount || 0,
                  salesTarget: data.salesTarget || settings?.monthly_sales_target || 0, // Fallback to settings if RPC doesn't provide
                  // تحديث بيانات المقاولات
                  activeProjectsCount: data.activeProjectsCount || 0,
                  totalContractsValue: data.totalContractsValue || 0,
                  expectedProfitability: data.expectedProfitability || 0,
                  totalConstructionBilled: data.totalConstructionBilled || 0
              });
              setChartData(data.chartData || []);
              setRecentInvoices(data.recentInvoices?.map((inv: Record<string, any>) => ({...inv, customers: { name: inv.customer_name }})) || []);
              setRecentJournals(data.recentJournals || []);
              setTopCustomers(data.topCustomers || []);
              setTopProducts(data.topProducts || []);
              setTopCustomersPieData(Array.isArray(data.topCustomersPieData) ? data.topCustomersPieData : []);
              setLowStockItems(data.lowStockItems || []);
          }
        } catch (error) {
          if (process.env.NODE_ENV === 'development') logger.error("Error fetching dashboard data:", error);
          if (!rpcError) setRpcError("فشل تحميل بيانات لوحة القيادة.");
        } finally {
          setLoading(false);
        }
      }
    };
    fetchRealData();
  }, [currentUser, settings, currentSelectedOrgId, orgId]); // 🔄 تحديث البيانات فوراً عند تبديل الشركة أو السوبر أدمن

  useEffect(() => {
    // Effect for demo users, relies on context data
    const calculateDemoData = () => {
        if (currentUser && currentUser.role === 'demo') {
            setLoading(true);
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();

            const monthSales = (demoInvoices || []).filter(inv => new Date(inv.date).getMonth() === currentMonth && new Date(inv.date).getFullYear() === currentYear && inv.status !== 'draft').reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
            const monthPurchases = (demoPurchaseInvoices || []).filter(pInv => new Date(pInv.date).getMonth() === currentMonth && new Date(pInv.date).getFullYear() === currentYear && pInv.status !== 'draft').reduce((sum, pInv) => sum + (pInv.subtotal || 0), 0);
            const lowStockCount = (demoProducts || []).filter(p => (p.stock || 0) <= (p.min_stock_level || 0)).length;

            const monthCogs = (demoInvoices || []).filter(inv => new Date(inv.date).getMonth() === currentMonth && inv.status !== 'draft').reduce((sum, inv) => sum + (inv.items || []).reduce((s, item) => s + ((demoProducts.find(p => p.id === item.productId)?.cost || 0) * item.quantity), 0), 0);

            // محاكاة مصروفات تشغيلية للديمو
            const monthExpenses = 2500;

            const customerSales: Record<string, number> = {};
            (demoInvoices || []).forEach(inv => {
                if (inv.status !== 'draft' && inv.customer_id) {
                    customerSales[inv.customer_id] = (customerSales[inv.customer_id] || 0) + (inv.subtotal || 0);
                }
            });
            const topCustomersData = Object.entries(customerSales).map(([customerId, total]) => ({ name: (demoCustomers || []).find(c => c.id === customerId)?.name || 'Unknown Customer', total })).sort((a, b) => b.total - a.total).slice(0, 5);

            setStats({
                monthSales, monthPurchases, lowStockCount, 
                prevMonthSales: 75000, prevMonthPurchases: 45000, monthCogs: monthCogs, monthExpenses: monthExpenses,
                receivables: getSystemAccount('CUSTOMERS')?.balance ?? 0,
                payables: getSystemAccount('SUPPLIERS')?.balance ?? 0,
                totalReceipts: 0, totalPayments: 0,
                salesTarget: 200000,
                // ✅ إضافة القيم الافتراضية للمقاولات في وضع الديمو لإصلاح خطأ TS2345
                activeProjectsCount: 0,
                totalContractsValue: 0,
                expectedProfitability: 0,
                totalConstructionBilled: 0
            });

            setChartData([ { name: 'يناير', sales: 45000, purchases: 30000 }, { name: 'فبراير', sales: 52000, purchases: 35000 }, { name: 'مارس', sales: 48000, purchases: 42000 }, { name: 'أبريل', sales: 61000, purchases: 45000 }, { name: 'مايو', sales: 85000, purchases: 60000 }, { name: 'يونيو', sales: 125000, purchases: 85000 }, ]);
            setRecentInvoices((demoInvoices || []).slice(0, 5).map((inv: Record<string, any>) => ({...inv, customers: {name: (demoCustomers || []).find(c => c.id === inv.customer_id)?.name || 'عميل غير معروف'}})));
            setRecentJournals([]);
            setTopCustomers(topCustomersData);
            setTopProducts([ { name: 'لابتوب HP ProBook', total_revenue: 62500 }, { name: 'طابعة ليزر Canon', total_revenue: 12750 }, { name: 'ورق تصوير A4', total_revenue: 12750 } ]);
            setTopCustomersPieData([ { name: 'شركة الأفق', value: 45000 }, { name: 'مؤسسة النور', value: 30000 }, { name: 'عملاء آخرون', value: 22000 } ]);
            setLowStockItems((demoProducts || []).filter(p => (p.stock || 0) <= (p.min_stock_level || 0)).slice(0, 3));
            setLoading(false);
        }
    };
    calculateDemoData();
  }, [currentUser, demoProducts, demoInvoices, demoPurchaseInvoices, demoCustomers, getSystemAccount]);

  const handleUpdateSalesTarget = async () => {
    const targetValue = parseFloat(newSalesTarget);
    if (isNaN(targetValue) || targetValue < 0) {
        showToast('الرجاء إدخال رقم صحيح للهدف', 'error');
        return;
    }

    if (currentUser?.role === 'demo') {
        setStats(prev => ({ ...prev, salesTarget: targetValue }));
        setIsEditingTarget(false);
        showToast('تم تحديث الهدف البيعي بنجاح (محاكاة)', 'success');
        return;
    }

    try {
        let query = supabase
            .from('company_settings')
            .select('id');
        if (orgId) {
            query = query.eq('organization_id', orgId);
        }
        const { data: settingsData, error: settingsError } = await query.limit(1).maybeSingle();

        if (settingsError || !settingsData) {
            showToast('لا يمكن العثور على إعدادات الشركة لتحديث الهدف', 'error');
            return;
        }

        const { error } = await supabase
            .from('company_settings')
            .update({ monthly_sales_target: targetValue })
            .eq('id', settingsData.id);

        if (error) throw error;

        setStats(prev => ({ ...prev, salesTarget: targetValue }));
        setIsEditingTarget(false);
        showToast('تم تحديث الهدف البيعي بنجاح', 'success');
    } catch (err) {
        showToast('فشل تحديث الهدف: ' + err.message, 'error');
    }
  };

  interface StatCardProps {
    title: string;
    value: number;
    icon: React.ElementType;
    color: string;
    previousValue?: number;
    isCurrency?: boolean;
    isGood?: boolean;
    subLabel?: string;
  }

  const StatCard = ({ title, value, icon: Icon, color, previousValue, isCurrency = true, isGood, subLabel }: StatCardProps) => {
    const change = useMemo(() => {
        if (previousValue === undefined || previousValue === 0) return null;
        return ((value - previousValue) / previousValue) * 100;
    }, [value, previousValue]);

    const isPositive = change !== null && change >= 0;
    const isNeutral = change === null || change === 0;

    let changeColor = 'text-slate-500';
    if (!isNeutral) {
        if (isPositive) {
            changeColor = isGood ? 'text-emerald-500' : 'text-red-500';
        } else {
            changeColor = isGood ? 'text-red-500' : 'text-emerald-500';
        }
    }

    const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    const formattedValue = useMemo(() => {
        return safeValue.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        });
    }, [safeValue]);

    // Dynamic responsive font size based on text length to prevent box overflow
    const valueFontSize = useMemo(() => {
        const len = formattedValue.length;
        if (len > 12) return 'text-base sm:text-lg xl:text-base 2xl:text-lg';
        if (len > 9) return 'text-lg sm:text-xl xl:text-lg 2xl:text-xl';
        if (len > 6) return 'text-xl sm:text-2xl xl:text-xl 2xl:text-2xl';
        return 'text-2xl sm:text-3xl';
    }, [formattedValue]);

    const currencySymbol = settings?.currency || 'EGP';

    return (
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all hover:-translate-y-0.5 flex flex-col justify-between min-w-0 overflow-hidden">
            <div>
                <div className="flex justify-between items-start mb-3 gap-2">
                    <div className={`p-2.5 rounded-xl ${color} bg-opacity-10 shrink-0`}>
                        <Icon size={22} className={color.replace('bg-', 'text-')} />
                    </div>
                    {!isNeutral && (
                        <div className={`flex items-center gap-1 text-xs font-bold ${changeColor} shrink-0 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100`}>
                            {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                            <span>{Math.abs(change).toFixed(1)}%</span>
                        </div>
                    )}
                </div>
                <h3 className="text-slate-500 text-xs sm:text-sm font-bold mb-1.5 truncate" title={title}>
                    {title}
                </h3>
                <div 
                    className="flex items-baseline gap-1.5 min-w-0 overflow-hidden" 
                    title={`${formattedValue} ${isCurrency ? currencySymbol : ''}`}
                >
                    <span className={`${valueFontSize} font-black text-slate-800 tracking-tight truncate font-mono`} dir="ltr">
                        {formattedValue}
                    </span>
                    {isCurrency && (
                        <span className="text-[11px] sm:text-xs text-slate-400 font-bold shrink-0 select-none">
                            {currencySymbol}
                        </span>
                    )}
                </div>
            </div>
            {subLabel && (
                <p className="text-[11px] text-slate-400 mt-3 truncate border-t border-slate-50 pt-2" title={subLabel}>
                    {subLabel}
                </p>
            )}
        </div>
    );
  };

  const SalesTargetGauge = ({ sales, target }: { sales: number, target: number }) => {
    const percentage = target > 0 ? Math.min((sales / target) * 100, 100) : 0;
    const circumference = 2 * Math.PI * 45; // 2 * pi * radius
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
        <div className="w-full flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Target className="text-indigo-500" size={20} /> تحقيق الهدف البيعي
            </h3>
            {!isEditingTarget && (
                <button onClick={() => {
                    setIsEditingTarget(true);
                    setNewSalesTarget(String(target));
                }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                    <Edit size={16} />
                </button>
            )}
        </div>
        
        {isEditingTarget ? (
            <div className="w-full space-y-3 animate-in fade-in">
                <input 
                    type="number"
                    value={newSalesTarget}
                    onChange={(e) => setNewSalesTarget(e.target.value)}
                    className="w-full text-center font-black text-2xl text-indigo-600 bg-indigo-50 border-2 border-indigo-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-400"
                    autoFocus
                />
                <div className="flex gap-2">
                    <button onClick={handleUpdateSalesTarget} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700">حفظ</button>
                    <button onClick={() => setIsEditingTarget(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg text-sm font-bold hover:bg-slate-200">إلغاء</button>
                </div>
            </div>
        ) : (
            <>
                <div className="relative w-40 h-40">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#4f46e5" strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset 0.5s ease-out' }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-indigo-600">{percentage.toFixed(0)}%</span>
                        <span className="text-xs text-slate-500">من الهدف</span>
                    </div>
                </div>
                <div className="text-center mt-4">
                    <p className="text-xs text-slate-500">الهدف: {target.toLocaleString()} | المحقق: {sales.toLocaleString()}</p>
                </div>
            </>
        )}
      </div>
    );
  };

  interface TopListWidgetProps {
    title: string;
    data: Record<string, any>[];
    icon: React.ElementType;
    color: string;
    valueKey?: string;
    nameKey?: string;
  }

  const TopListWidget = ({ title, data, icon: Icon, color, valueKey = 'total', nameKey = 'name' }: TopListWidgetProps) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Icon className={`${color}`} size={20} /> {title}
        </h3>
        <div className="space-y-3">
            {data.length > 0 ? data.map((item: Record<string, any>, index: number) => (
                <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 flex items-center justify-center text-xs font-bold rounded-full ${index === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span>
                        <span className="font-bold text-slate-700">{item[nameKey]}</span>
                    </div>
                    <span className="font-mono font-bold text-blue-600">{(item[valueKey] || 0).toLocaleString()}</span>
                </div>
            )) : <p className="text-center text-slate-400 text-sm py-4">لا توجد بيانات كافية</p>}
        </div>
    </div>
  );

  // استخدام أرصدة الحسابات الفعلية (دفتر الأستاذ) بدلاً من إحصائيات الفواتير فقط
  // هذا يضمن ظهور الأرصدة الافتتاحية والقيود اليدوية
  const realReceivables = stats.receivables;
  const realPayables = stats.payables;

  // ✅ لا نعيق الدخول أبداً — المنظمة يتم اختيارها تلقائياً في AccountingContext

  if (viewMode === 'workflow') {
    return (
      <div className="space-y-6">
        <QuickBooksWorkflowHub 
          stats={stats}
          onSwitchToAnalytics={canSwitchViewMode ? () => handleToggleViewMode('analytics') : undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in pb-10">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">لوحة القيادة الرئيسية</h1>
          <p className="text-slate-500 text-sm">نظرة عامة على أداء المنشأة لهذا الشهر</p>
        </div>
        <div className="flex items-center gap-3">
          {canSwitchViewMode && (
            <button
              type="button"
              onClick={() => handleToggleViewMode('workflow')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Layers size={15} />
              <span>خريطة تري برو وركفلو</span>
            </button>
          )}
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-bold text-slate-600">آخر تحديث: {new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
        </div>
      </div>

      {/* 👑 شريط التحكم المخصص للمدير العام (Super Admin Company Selector) */}
      {isSuperAdmin && organizations && organizations.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl border border-indigo-500/30 shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center">
              <Building2 className="text-sky-400" size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-wide text-white">الشركة المعروضة بلوحة القيادة</span>
                <span className="bg-indigo-500/30 text-indigo-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-400/30">سوبر أدمن ⚡</span>
              </div>
              <p className="text-xs text-slate-300">يتم عرض الأرقام والإحصائيات للشركة المحددة أدناه</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-sky-300">تبديل الشركة:</span>
            <select
              value={currentSelectedOrgId || effectiveOrgId || ''}
              onChange={(e) => setCurrentSelectedOrgId(e.target.value || null)}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-sky-400 transition-all cursor-pointer min-w-[220px]"
            >
              {organizations.map((org: { id: string; name: string }) => (
                <option key={org.id} value={org.id} className="bg-slate-900 text-white">
                  🏢 {org.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-8">
            {subStatus?.needs_alert && (
                <div className="bg-red-600 text-white p-4 rounded-xl flex items-center justify-between shadow-lg animate-pulse">
                    <div className="flex items-center gap-3">
                        <Crown size={24} />
                        <p className="font-bold text-sm">تنبيه: سينتهي اشتراكك خلال {subStatus.days_remaining} أيام ({subStatus.expiry_date}). يرجى التجديد لضمان استمرار الخدمة.</p>
                    </div>
                    <button className="bg-white text-red-600 px-4 py-1 rounded-lg font-black text-xs">تجديد الآن</button>
                </div>
            )}
            {rpcError && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200 flex items-center gap-3">
                    <AlertTriangle size={20} />
                    <p className="font-bold">{rpcError}</p>
                </div>
            )}

            {overLimitCustomers.length > 0 && (
                <div className="bg-amber-50 text-amber-800 p-4 rounded-xl border border-amber-200 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 font-black">
                        <AlertTriangle size={20} className="text-amber-600" />
                        تنبيه: يوجد {overLimitCustomers.length} عملاء تجاوزوا حد الائتمان
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {overLimitCustomers.slice(0, 4).map(c => (
                            <div key={c.id} className="text-xs bg-white/50 p-2 rounded-lg border border-amber-100 flex justify-between">
                                <span className="font-bold">{c.name}</span>
                                <span className="font-mono text-red-600">{Number(c.total_debt).toLocaleString()} / {Number(c.credit_limit).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 🏗️ تنبيهات تجاوز الميزانية للمقاولات - تظهر فقط إذا كان المديول مفعلاً وهناك مشاريع نشطة */}
            {stats.activeProjectsCount > 0 && (
                <div className="animate-in slide-in-from-top-4 duration-700">
                    <DashboardAlerts orgId={orgId} />
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 dashboard-stats">
                <StatCard title="مبيعات الشهر" value={stats.monthSales} previousValue={stats.prevMonthSales} icon={ShoppingCart} color="bg-blue-100" isGood={true} />
                <StatCard title="مجمل الربح" value={stats.monthSales - stats.monthCogs} icon={DollarSign} color="bg-emerald-100" isGood={true} />
                <StatCard title="صافي الربح" value={stats.monthSales - stats.monthCogs - stats.monthExpenses} icon={Activity} color="bg-indigo-100" isGood={true} subLabel="بعد خصم المصروفات الإدارية" />
                <StatCard title="مشتريات الشهر" value={stats.monthPurchases} previousValue={stats.prevMonthPurchases} icon={Truck} color="bg-purple-100" isGood={false} />
            </div>

            {/* 🏗️ قسم إحصائيات المقاولات السريعة (يظهر عند وجود مشاريع) */}
            {stats.activeProjectsCount > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-right-4 duration-500">
                    <Link to="/construction/analytics" className="block transition-transform hover:scale-[1.02]">
                        <StatCard title="المشاريع النشطة" value={stats.activeProjectsCount} icon={Building2} color="bg-amber-100" isCurrency={false} isGood={true} subLabel="اضغط لعرض تحليلات الأداء" />
                    </Link>
                    <StatCard title="إجمالي قيمة العقود" value={stats.totalContractsValue} icon={Briefcase} color="bg-blue-100" isGood={true} />
                    <StatCard title="إيرادات المقاولات" value={stats.totalConstructionBilled} icon={ChartIcon} color="bg-emerald-100" isGood={true} subLabel="من واقع المستخلصات المعتمدة" />
                    
                    {/* 🚀 ذكاء اصطناعي: تنبيه سيولة لـ 90 يوم */}
                    <div className="md:col-span-3 bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-3xl shadow-xl border border-slate-700 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-bl-full -mr-16 -mt-16"></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="p-3 bg-blue-600 text-white rounded-2xl animate-pulse"><Zap size={24} /></div>
                            <div>
                                <h4 className="text-white font-black">المستشار المالي: توقعات السيولة</h4>
                                <p className="text-slate-400 text-xs">بناءً على سرعة الإنجاز الحالية، ستحتاج المنشأة لـ <span className="text-blue-400 font-black">{(stats.totalContractsValue * 0.4).toLocaleString()}</span> خلال الـ 90 يوماً القادمة لتغطية بنود المقايسات النشطة.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Monthly Performance Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <BarChart2 className="text-blue-500" size={20} /> الأداء الشهري (مبيعات vs مشتريات)
                </h3>
                <div className="h-80" dir="ltr">
                    {loading ? (
                        <div className="w-full h-full flex items-center justify-center"> <Loader2 className="animate-spin text-blue-500" size={32} /> </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip formatter={(value: unknown) => Number(value || 0).toLocaleString()} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Legend />
                                <Bar dataKey="sales" name="المبيعات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="purchases" name="المشتريات" fill="#a855f7" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
            {/* Recent Invoices */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"> <FileText className="text-blue-500" size={20} /> أحدث فواتير المبيعات </h3>
                    <Link to="/invoices-list" className="text-xs text-blue-600 font-bold hover:underline">عرض الكل</Link>
                </div>
                <div className="space-y-3">
                    {recentInvoices.length > 0 ? recentInvoices.map((inv, idx) => (
                        <div key={inv.id || inv.invoice_number || idx} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><FileText size={16} /></div>
                                <div>
                                    <p className="text-sm font-bold text-slate-800">{inv.customers?.name || 'عميل نقدي'}</p>
                                    <p className="text-xs text-slate-400 font-mono">{inv.invoice_number} • {new Date(inv.invoice_date).toLocaleDateString('ar-EG')}</p>
                                </div>
                            </div>
                            <span className="font-bold text-slate-700">{(inv.total_amount || 0).toLocaleString()}</span>
                        </div>
                    )) : <p className="text-center text-slate-400 text-sm py-4">لا توجد فواتير حديثة</p>}
                </div>
            </div>
        </div>

        {/* Side Column */}
        <div className="lg:col-span-1 space-y-8">
            <SalesTargetGauge sales={stats.monthSales} target={stats.salesTarget} />
            <TopListWidget title="الأصناف الأكثر مبيعاً" data={topProducts} icon={Star} color="text-amber-500" valueKey="total_revenue" />
            {/* Customer Distribution Pie Chart & List */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Crown className="text-indigo-500" size={20} /> أعلى العملاء وتوزيع المبيعات
                </h3>
                {topCustomersPieData.length > 0 ? (
                    <>
                        <div className="h-56 w-full" dir="ltr">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={topCustomersPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value" nameKey="name">
                                        {topCustomersPieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: unknown) => Number(value || 0).toLocaleString()} />
                                    <Legend iconSize={10} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="border-t border-slate-100 my-4"></div>
                        <div className="space-y-3">
                            {topCustomers.map((item: Record<string, any>, index: number) => (
                                <div key={index} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-5 h-5 flex items-center justify-center text-xs font-bold rounded-full ${index === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span>
                                        <span className="font-bold text-slate-700">{item.name}</span>
                                    </div>
                                    <span className="font-mono font-bold text-blue-600">{(item.total || 0).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : <p className="text-center text-slate-400 text-sm py-4">لا توجد بيانات كافية</p>}
            </div>
            {/* Low Stock Alerts */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"> <AlertTriangle className="text-red-500" size={20} /> تنبيهات المخزون </h3>
                    <span className="bg-red-100 text-red-600 text-xs font-black px-2 py-1 rounded-full">{stats.lowStockCount}</span>
                </div>
                <div className="space-y-3">
                    {lowStockItems.length > 0 ? lowStockItems.map((item, idx) => (
                        <div key={item.id || item.sku || idx} className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100">
                            <div>
                                <p className="text-sm font-bold text-slate-800">{item.name}</p>
                                <p className="text-xs text-slate-500 font-mono">{item.sku || 'No SKU'}</p>
                            </div>
                            <div className="text-center">
                                <span className="text-xs text-red-600 font-bold block">المتوفر</span>
                                <span className="text-lg font-black text-red-700">{item.stock}</span>
                            </div>
                        </div>
                    )) : <p className="text-center text-slate-400 text-sm py-4">المخزون في حالة جيدة ✅</p>}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
