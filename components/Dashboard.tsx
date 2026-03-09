






import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext'; // Assuming context provides demo data
import { supabase } from '../supabaseClient';
import { 
  TrendingUp, TrendingDown, Users, ShoppingCart, 
  AlertTriangle, ArrowUpRight, ArrowDownLeft, Activity,
  Wallet, FileText, Package, Truck, BarChart2, Calendar, Loader2
} from 'lucide-react'; // 💡 Note: I've removed unused imports for cleaner code
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const Dashboard = () => {
  const { currentUser, settings, getSystemAccount, products: demoProducts, invoices: demoInvoices, purchaseInvoices: demoPurchaseInvoices, customers: demoCustomers } = useAccounting();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    monthSales: 0,
    monthPurchases: 0,
    receivables: 0,
    payables: 0,
    totalReceipts: 0,
    totalPayments: 0,
    lowStockCount: 0
  });
  const [recentJournals, setRecentJournals] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      
      // --- 🧪 FIX: Isolate Demo Mode ---
      if (currentUser?.role === 'demo') {
          // Calculate stats dynamically from demo context data
          const today = new Date();
          const currentMonth = today.getMonth();
          const currentYear = today.getFullYear();

          const monthSales = (demoInvoices || [])
              .filter(inv => {
                  const invDate = new Date(inv.date);
                  return invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear && (inv.status as any) === 'posted';
              })
              .reduce((sum, inv) => sum + inv.total_amount, 0);
          
          const monthPurchases = (demoPurchaseInvoices || [])
              .filter(pInv => {
                  const pInvDate = new Date(pInv.date);
                  return pInvDate.getMonth() === currentMonth && pInvDate.getFullYear() === currentYear && (pInv.status as any) === 'posted';
              })
              .reduce((sum, pInv) => sum + pInv.total_amount, 0);

          const lowStockCount = (demoProducts || []).filter(p => (p.stock || 0) <= (p.min_stock_level || 0)).length;

          const customerSales: Record<string, number> = {};
          (demoInvoices || []).forEach(inv => {
              if ((inv.status as any) === 'posted' && inv.customer_id) {
                  customerSales[inv.customer_id] = (customerSales[inv.customer_id] || 0) + inv.total_amount;
              }
          });
          const topCustomersData = Object.entries(customerSales)
              .map(([customerId, total]) => ({
                  name: (demoCustomers || []).find(c => c.id === customerId)?.name || 'Unknown Customer',
                  total
              }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 5);

          setStats({
              monthSales: monthSales,
              monthPurchases: monthPurchases,
              receivables: getSystemAccount('CUSTOMERS')?.balance || 0,
              payables: getSystemAccount('SUPPLIERS')?.balance || 0,
              totalReceipts: 0, // Simplified for demo
              totalPayments: 0, // Simplified for demo
              lowStockCount: lowStockCount
          });

          setChartData([
              { name: 'يناير', sales: 45000, purchases: 30000 }, { name: 'فبراير', sales: 52000, purchases: 35000 },
              { name: 'مارس', sales: 48000, purchases: 42000 }, { name: 'أبريل', sales: 61000, purchases: 45000 },
              { name: 'مايو', sales: 85000, purchases: 60000 }, { name: 'يونيو', sales: 125000, purchases: 85000 },
          ]);
          
          setRecentInvoices((demoInvoices || []).slice(0, 5).map((inv: any) => ({...inv, customers: {name: (demoCustomers || []).find(c => c.id === inv.customer_id)?.name}})));
          setRecentJournals([]); // Simplified for demo
          setTopCustomers(topCustomersData);
          setLowStockItems((demoProducts || []).filter(p => (p.stock || 0) <= (p.min_stock_level || 0)).slice(0, 3));

          setLoading(false);
          return; // IMPORTANT: Stop execution for demo users
      }

      try {
        // استدعاء دالة RPC واحدة لجلب كل البيانات
        const { data, error } = await supabase.rpc('get_dashboard_stats');
        
        if (error) {
            // معالجة الخطأ في حال عدم وجود الدالة بعد
            if (error.message.includes('function get_dashboard_stats() does not exist')) {
                console.error("Dashboard RPC function not found. Please run the SQL script from the documentation to create it.");
                throw new Error("دالة `get_dashboard_stats()` غير موجودة. يرجى تنفيذ سكربت SQL لإنشائها.");
            }
            throw error;
        }

        if (data) {
            // تم نقل منطق استثناء الأرصدة الافتتاحية إلى دالة get_dashboard_stats في قاعدة البيانات
            // لتحسين الأداء وتقليل عدد الطلبات.
            setStats({
                monthSales: data.monthSales,
                monthPurchases: data.monthPurchases,
                receivables: data.receivables,
                payables: data.payables,
                totalReceipts: data.totalReceipts,
                totalPayments: data.totalPayments,
                lowStockCount: data.lowStockCount
            });
            setChartData(data.chartData || []);
            // تحويل البيانات لتناسب شكل العرض في الواجهة
            setRecentInvoices(data.recentInvoices?.map((inv: any) => ({...inv, customers: { name: inv.customer_name }})) || []);
            setRecentJournals(data.recentJournals || []);
            setTopCustomers(data.topCustomers || []);
            setLowStockItems(data.lowStockItems || []);
        }

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [currentUser, demoProducts, demoInvoices, demoPurchaseInvoices, demoCustomers, getSystemAccount]); // Add context dependencies

  const StatCard = ({ title, value, icon: Icon, color, subValue, subLabel }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-${color.split('-')[1]}-600`}>
          <Icon size={24} className={color.replace('bg-', 'text-')} />
        </div>
        {subValue && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${subValue >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {subValue >= 0 ? '+' : ''}{subValue}%
          </span>
        )}
      </div>
      <h3 className="text-slate-500 text-sm font-bold mb-1">{title}</h3>
      <p className="text-2xl font-black text-slate-800">{value?.toLocaleString() ?? 0} <span className="text-xs text-slate-400 font-normal">{settings?.currency || 'EGP'}</span></p>
      {subLabel && <p className="text-xs text-slate-400 mt-2">{subLabel}</p>}
    </div>
  );

  // استخدام أرصدة الحسابات الفعلية (دفتر الأستاذ) بدلاً من إحصائيات الفواتير فقط
  // هذا يضمن ظهور الأرصدة الافتتاحية والقيود اليدوية
  const customerAcc = getSystemAccount('CUSTOMERS');
  const supplierAcc = getSystemAccount('SUPPLIERS');
  const realReceivables = (currentUser?.role !== 'demo' && customerAcc) ? customerAcc.balance : stats.receivables;
  const realPayables = (currentUser?.role !== 'demo' && supplierAcc) ? supplierAcc.balance : stats.payables;

  return (
    <div className="space-y-8 animate-in fade-in pb-10">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-800">لوحة القيادة الرئيسية</h1>
          <p className="text-slate-500 text-sm">نظرة عامة على أداء المنشأة لهذا الشهر</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-bold text-slate-600">آخر تحديث: {new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 dashboard-stats">
        <StatCard 
            title="مبيعات الشهر" 
            value={stats.monthSales} 
            icon={ShoppingCart} 
            color="bg-blue-100" 
            subLabel="الفواتير المرحلة فقط"
        />
        <StatCard 
            title="مشتريات الشهر" 
            value={stats.monthPurchases} 
            icon={Truck} 
            color="bg-purple-100"
            subLabel="فواتير الشراء المسجلة هذا الشهر"
        />
        <StatCard 
            title="مستحقات لنا (العملاء)" 
            value={realReceivables} 
            icon={TrendingUp} 
            color="bg-emerald-100" 
        />
        <StatCard 
            title="مستحقات علينا (الموردين)" 
            value={realPayables} 
            icon={TrendingDown} 
            color="bg-red-100" 
        />
      </div>

      {/* Key Operations (Quick Links) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 quick-actions">
          <Link to="/sales-invoice" className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-3 group">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <FileText size={20} />
              </div>
              <div>
                  <h4 className="font-bold text-slate-700 text-sm">فاتورة مبيعات</h4>
                  <p className="text-xs text-slate-400">إنشاء فاتورة جديدة</p>
              </div>
          </Link>
          <Link to="/purchase-invoice" className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-3 group">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <ShoppingCart size={20} />
              </div>
              <div>
                  <h4 className="font-bold text-slate-700 text-sm">فاتورة مشتريات</h4>
                  <p className="text-xs text-slate-400">تسجيل توريد بضاعة</p>
              </div>
          </Link>
          <Link to="/products" className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-3 group">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <Package size={20} />
              </div>
              <div>
                  <h4 className="font-bold text-slate-700 text-sm">إدارة المنتجات</h4>
                  <p className="text-xs text-slate-400">الأصناف والمخزون</p>
              </div>
          </Link>
          <Link to="/reports" className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-3 group">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <BarChart2 size={20} />
              </div>
              <div>
                  <h4 className="font-bold text-slate-700 text-sm">التقارير المالية</h4>
                  <p className="text-xs text-slate-400">القوائم والتحليلات</p>
              </div>
          </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Chart & Cash Flow */}
          <div className="lg:col-span-2 space-y-8">
              {/* Monthly Performance Chart */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <BarChart2 className="text-blue-500" size={20} /> الأداء الشهري (مبيعات vs مشتريات)
                  </h3>
                  <div className="h-80" dir="ltr">
                      {loading ? (
                          <div className="w-full h-full flex items-center justify-center">
                              <Loader2 className="animate-spin text-blue-500" size={32} />
                          </div>
                      ) : (
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                              <BarChart data={chartData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip formatter={(value: number) => value.toLocaleString()} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                  <Legend />
                                  <Bar dataKey="sales" name="المبيعات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="purchases" name="المشتريات" fill="#ef4444" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      )}
                  </div>
              </div>

              {/* Cash Flow Summary */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <Wallet className="text-amber-500" size={20} /> التدفق النقدي الشهري
                  </h3>
                  <div className="grid grid-cols-2 gap-8">
                      <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                          <p className="text-sm text-emerald-600 font-bold mb-1">إجمالي المقبوضات</p>
                          <p className="text-2xl font-black text-emerald-700">{stats.totalReceipts.toLocaleString()}</p>
                      </div>
                      <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                          <p className="text-sm text-red-600 font-bold mb-1">إجمالي المدفوعات</p>
                          <p className="text-2xl font-black text-red-700">{stats.totalPayments.toLocaleString()}</p>
                      </div>
                  </div>
              </div>

              {/* Recent Invoices */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <FileText className="text-blue-500" size={20} /> أحدث فواتير المبيعات
                      </h3>
                      <Link to="/invoices-list" className="text-xs text-blue-600 font-bold hover:underline">عرض الكل</Link>
                  </div>
                  <div className="space-y-4">
                      {recentInvoices.map((inv) => (
                          <div key={inv.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg transition-colors border-b border-slate-50 last:border-0">
                              <div className="flex items-center gap-3">
                                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                      <FileText size={16} />
                                  </div>
                                  <div>
                                      <p className="text-sm font-bold text-slate-800">{inv.customers?.name || 'عميل نقدي'}</p>
                                      <p className="text-xs text-slate-400 font-mono">{inv.invoice_number} • {new Date(inv.invoice_date).toLocaleDateString('ar-EG')}</p>
                                  </div>
                              </div>
                              <span className="font-bold text-slate-700">{(inv.total_amount || 0).toLocaleString()}</span>
                          </div>
                      ))}
                      {recentInvoices.length === 0 && <p className="text-center text-slate-400 text-sm py-4">لا توجد فواتير حديثة</p>}
                  </div>
              </div>
          </div>

          {/* Sidebar Widgets */}
          <div className="space-y-8">
              {/* Top Customers */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Users className="text-indigo-500" size={20} /> أعلى العملاء شراءً
                      </h3>
                  </div>
                  <div className="space-y-4">
                      {topCustomers.map((cust: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors border-b border-slate-50 last:border-0">
                              <div className="flex items-center gap-3">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${index === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>#{index + 1}</div>
                                  <span className="font-bold text-slate-700 text-sm">{cust.name}</span>
                              </div>
                              <span className="font-mono font-bold text-blue-600 text-sm">{(cust.total || 0).toLocaleString()}</span>
                          </div>
                      ))}
                      {topCustomers.length === 0 && <p className="text-center text-slate-400 text-sm py-4">لا توجد بيانات كافية</p>}
                  </div>
              </div>

              {/* Low Stock Alerts */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <AlertTriangle className="text-red-500" size={20} /> تنبيهات المخزون
                      </h3>
                      <span className="bg-red-100 text-red-600 text-xs font-black px-2 py-1 rounded-full">{stats.lowStockCount}</span>
                  </div>
                  <div className="space-y-3">
                      {lowStockItems.map((item) => (
                          <div key={item.id} className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100">
                              <div>
                                  <p className="text-sm font-bold text-slate-800">{item.name}</p>
                                  <p className="text-xs text-slate-500 font-mono">{item.sku || 'No SKU'}</p>
                              </div>
                              <div className="text-center">
                                  <span className="text-xs text-red-600 font-bold block">المتوفر</span>
                                  <span className="text-lg font-black text-red-700">{item.stock}</span>
                              </div>
                          </div>
                      ))}
                      {lowStockItems.length === 0 && <p className="text-center text-slate-400 text-sm py-4">المخزون في حالة جيدة ✅</p>}
                  </div>
              </div>

              {/* Recent Journal Entries */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Activity className="text-purple-500" size={20} /> أحدث القيود
                      </h3>
                      <Link to="/general-journal" className="text-xs text-purple-600 font-bold hover:underline">عرض السجل</Link>
                  </div>
                  <div className="space-y-4">
                      {recentJournals.map((entry) => (
                          <div key={entry.id} className="border-l-2 border-purple-200 pl-3 py-1">
                              <p className="text-xs text-slate-400 mb-1">{new Date(entry.transaction_date).toLocaleDateString('ar-EG')} | <span className="font-mono">{entry.reference}</span></p>
                              <p className="text-sm font-bold text-slate-700 line-clamp-1">{entry.description}</p>
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mt-1 inline-block">
                                  {entry.status === 'posted' ? 'مرحل' : 'مسودة'}
                              </span>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
