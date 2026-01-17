






import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { supabase } from '../supabaseClient';
import { 
  TrendingUp, TrendingDown, Users, ShoppingCart, 
  AlertTriangle, ArrowUpRight, ArrowDownLeft, Activity,
  Wallet, FileText, Package, Truck, BarChart2, Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const Dashboard = () => {
  const { getSystemAccount, currentUser, accounts } = useAccounting();
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
      
      // ---------------------------------------------------------
      // 🧪 وضع الديمو: عرض بيانات وهمية (Demo Mode Data)
      // ---------------------------------------------------------
      if (currentUser?.role === 'demo') {
          // محاكاة تأخير بسيط لواقعية التجربة
          await new Promise(resolve => setTimeout(resolve, 600));

          setStats({
            monthSales: 125000,
            monthPurchases: 85000,
            receivables: 45000,
            payables: 32000,
            totalReceipts: 98000,
            totalPayments: 65000,
            lowStockCount: 3
          });

          setChartData([
              { name: 'يناير', sales: 45000, purchases: 30000 },
              { name: 'فبراير', sales: 52000, purchases: 35000 },
              { name: 'مارس', sales: 48000, purchases: 42000 },
              { name: 'أبريل', sales: 61000, purchases: 45000 },
              { name: 'مايو', sales: 85000, purchases: 60000 },
              { name: 'يونيو', sales: 125000, purchases: 85000 },
          ]);

          setRecentInvoices([
              { id: 'd1', invoice_number: 'INV-001023', customers: { name: 'شركة الأفق للتجارة' }, total_amount: 15000, invoice_date: new Date().toISOString() },
              { id: 'd2', invoice_number: 'INV-001022', customers: { name: 'مؤسسة النور' }, total_amount: 8500, invoice_date: new Date(Date.now() - 86400000).toISOString() },
              { id: 'd3', invoice_number: 'INV-001021', customers: { name: 'عميل نقدي' }, total_amount: 1200, invoice_date: new Date(Date.now() - 172800000).toISOString() },
              { id: 'd4', invoice_number: 'INV-001020', customers: { name: 'شركة البناء الحديث' }, total_amount: 22500, invoice_date: new Date(Date.now() - 259200000).toISOString() },
              { id: 'd5', invoice_number: 'INV-001019', customers: { name: 'سوبر ماركت البركة' }, total_amount: 4300, invoice_date: new Date(Date.now() - 345600000).toISOString() },
          ]);

          setTopCustomers([
              { name: 'شركة الأفق للتجارة', total: 150000 },
              { name: 'مجموعة الرواد', total: 98000 },
              { name: 'مؤسسة النور', total: 75000 },
              { name: 'سوبر ماركت البركة', total: 45000 },
              { name: 'شركة المقاولات العامة', total: 32000 },
          ]);

          setLowStockItems([
             { id: 'dp1', name: 'لابتوب HP ProBook', sku: 'HP-PB-450', stock: 2 },
             { id: 'dp2', name: 'طابعة Canon LBP', sku: 'CN-LBP-6030', stock: 1 },
             { id: 'dp3', name: 'حبر طابعة HP 85A', sku: 'HP-85A', stock: 5 },
          ]);

          setRecentJournals([
              { id: 'dj1', transaction_date: new Date().toISOString(), reference: 'INV-001023', description: 'فاتورة مبيعات - شركة الأفق', status: 'posted' },
              { id: 'dj2', transaction_date: new Date().toISOString(), reference: 'RCT-00501', description: 'سند قبض من عميل', status: 'posted' },
              { id: 'dj3', transaction_date: new Date(Date.now() - 86400000).toISOString(), reference: 'PAY-00201', description: 'سداد دفعة لمورد', status: 'posted' },
              { id: 'dj4', transaction_date: new Date(Date.now() - 172800000).toISOString(), reference: 'JE-00105', description: 'إثبات مصروفات كهرباء', status: 'posted' },
              { id: 'dj5', transaction_date: new Date(Date.now() - 259200000).toISOString(), reference: 'INV-001020', description: 'فاتورة مبيعات - البناء الحديث', status: 'posted' },
          ]);

          setLoading(false);
          return;
      }

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

      // لحساب الرسم البياني (آخر 6 أشهر)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(now.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      const startOfChart = sixMonthsAgo.toISOString();

      try {
        // 1. المبيعات الشهرية (من الفواتير المرحلة)
        const { data: sales } = await supabase
          .from('invoices')
          .select('total_amount')
          .gte('invoice_date', startOfMonth)
          .lte('invoice_date', endOfMonth)
          .neq('status', 'draft');
        
        const monthSales = sales?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;

        // 2. المشتريات الشهرية
        const { data: purchases } = await supabase
          .from('purchase_invoices')
          .select('total_amount')
          .gte('invoice_date', startOfMonth)
          .lte('invoice_date', endOfMonth)
          .neq('status', 'draft');

        const monthPurchases = purchases?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;

        // 3. المستحقات (من أرصدة الحسابات في السياق - التي تم تحديثها لتكون دقيقة)
        const customersAcc = getSystemAccount('CUSTOMERS');
        const suppliersAcc = getSystemAccount('SUPPLIERS');
        
        // استخدام الرصيد من السياق (الذي يجلبه الآن من السيرفر بدقة)
        const receivables = customersAcc?.balance || 0;
        const payables = Math.abs(suppliersAcc?.balance || 0);

        // 4. التدفق النقدي الشهري (مقبوضات ومدفوعات)
        const { data: receipts } = await supabase
          .from('receipt_vouchers')
          .select('amount')
          .gte('receipt_date', startOfMonth)
          .lte('receipt_date', endOfMonth);
        
        const totalReceipts = receipts?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;

        const { data: payments } = await supabase
          .from('payment_vouchers')
          .select('amount')
          .gte('payment_date', startOfMonth)
          .lte('payment_date', endOfMonth);
        
        const totalPayments = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

        // 5. تنبيهات المخزون الحرج
        // جلب المنتجات التي رصيدها أقل من الحد الأدنى
        let criticalStock: any[] = [];
        try {
            const { data: allProds } = await supabase
                .from('products')
                .select('id, name, sku, stock, min_stock_level')
                // نلغي الفلتر من السيرفر مؤقتاً لتجنب الخطأ 400 إذا كان العمود غير مفهرس أو به مشكلة
                // ونقوم بالتصفية في الذاكرة
                .not('min_stock_level', 'is', null); 
                
            criticalStock = allProds?.filter((p: any) => p.min_stock_level > 0 && p.stock <= p.min_stock_level) || [];
        } catch (e) {
            console.warn("Low stock alert fetch failed", e);
        }

        // 6. أحدث القيود
        const { data: recentJ } = await supabase
            .from('journal_entries')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        // 7. أحدث الفواتير
        const { data: recentInv } = await supabase
            .from('invoices')
            .select('*, customers(name)')
            .order('created_at', { ascending: false })
            .limit(5);

        // 8. أعلى العملاء (بناءً على الفواتير المرحلة)
        const { data: topCust } = await supabase
            .from('invoices')
            .select('customer_id, total_amount, customers(name)')
            .eq('status', 'posted')
            .order('total_amount', { ascending: false })
            .limit(5);
        
        // تجميع مبيعات العملاء (تقريبي لأغراض العرض السريع)
        const custMap: Record<string, any> = {};
        topCust?.forEach((inv: any) => {
            if (!custMap[inv.customer_id]) custMap[inv.customer_id] = { name: inv.customers?.name, total: 0 };
            custMap[inv.customer_id].total += inv.total_amount;
        });
        const topCustomersList = Object.values(custMap).sort((a: any, b: any) => b.total - a.total).slice(0, 5);

        // 9. بيانات الرسم البياني (آخر 6 أشهر)
        const { data: chartSales } = await supabase
            .from('invoices')
            .select('invoice_date, total_amount')
            .gte('invoice_date', startOfChart)
            .neq('status', 'draft');
            
        const { data: chartPurchases } = await supabase
            .from('purchase_invoices')
            .select('invoice_date, total_amount')
            .gte('invoice_date', startOfChart)
            .neq('status', 'draft');

        // معالجة بيانات الرسم البياني
        const months = [];
        for (let i = 0; i < 6; i++) {
            const d = new Date(sixMonthsAgo);
            d.setMonth(d.getMonth() + i);
            months.push({
                name: d.toLocaleDateString('ar-EG', { month: 'long' }),
                key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
                sales: 0,
                purchases: 0
            });
        }

        chartSales?.forEach((inv: any) => {
            const key = inv.invoice_date.slice(0, 7);
            const month = months.find(m => m.key === key);
            if (month) month.sales += inv.total_amount;
        });

        chartPurchases?.forEach((inv: any) => {
            const key = inv.invoice_date.slice(0, 7);
            const month = months.find(m => m.key === key);
            if (month) month.purchases += inv.total_amount;
        });

        setChartData(months);
        setStats({
            monthSales,
            monthPurchases,
            receivables,
            payables,
            totalReceipts,
            totalPayments,
            lowStockCount: criticalStock.length
        });
        setLowStockItems(criticalStock.slice(0, 5));
        setRecentJournals(recentJ || []);
        setRecentInvoices(recentInv || []);
        setTopCustomers(topCustomersList);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [accounts]); // إعادة الجلب عند تحديث الحسابات

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
      <p className="text-2xl font-black text-slate-800">{value.toLocaleString()} <span className="text-xs text-slate-400 font-normal">ج.م</span></p>
      {subLabel && <p className="text-xs text-slate-400 mt-2">{subLabel}</p>}
    </div>
  );

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
        />
        <StatCard 
            title="مستحقات لنا (العملاء)" 
            value={stats.receivables} 
            icon={TrendingUp} 
            color="bg-emerald-100" 
        />
        <StatCard 
            title="مستحقات علينا (الموردين)" 
            value={stats.payables} 
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
                      <ResponsiveContainer width="100%" height="100%">
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
                              <span className="font-bold text-slate-700">{inv.total_amount.toLocaleString()}</span>
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
                              <span className="font-mono font-bold text-blue-600 text-sm">{cust.total.toLocaleString()}</span>
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
