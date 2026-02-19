import { useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Link } from 'react-router-dom';
import { 
    BarChart3, TrendingUp, AlertTriangle, 
    ArrowDownLeft, FileText,
    Users, Truck, Package, Activity, Calendar
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    PieChart, Pie, Cell
} from 'recharts';

const ImportantReports = () => {
  const { 
    invoices, purchaseInvoices, products, 
    customers, settings 
  } = useAccounting();

  const analytics = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // 1. Financial Summary (Estimated from Operational Data)
    const totalSales = (invoices || []).reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPurchases = (purchaseInvoices || []).reduce((sum, inv) => sum + inv.totalAmount, 0);
    
    // Calculate Inventory Value
    const inventoryValue = (products || []).reduce((sum, p) => sum + ((p.stock || 0) * (p.purchase_price || 0)), 0);

    // 2. Monthly Trends (Last 6 Months)
    const monthlyTrends = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const monthName = d.toLocaleDateString('ar-EG', { month: 'short' });

        const monthSales = (invoices || [])
            .filter(inv => {
                const invDate = new Date(inv.date);
                return invDate.getFullYear() === d.getFullYear() && invDate.getMonth() === d.getMonth();
            })
            .reduce((sum, inv) => sum + inv.totalAmount, 0);

        const monthPurchases = (purchaseInvoices || [])
            .filter(inv => {
                const invDate = new Date(inv.date);
                return invDate.getFullYear() === d.getFullYear() && invDate.getMonth() === d.getMonth();
            })
            .reduce((sum, inv) => sum + inv.totalAmount, 0);

        monthlyTrends.push({ name: monthName, sales: monthSales, purchases: monthPurchases });
    }

    // 3. Top Customers (by Sales Volume)
    const customerSales: Record<string, number> = {};
    (invoices || []).forEach(inv => {
        const cName = (customers || []).find(c => c.id === inv.customerId)?.name || 'Unknown';
        customerSales[cName] = (customerSales[cName] || 0) + inv.totalAmount;
    });
    const topCustomers = Object.entries(customerSales)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    // 4. Low Stock Alerts
    const lowStockItems = (products || [])
        .filter(p => (p.stock || 0) <= 5)
        .sort((a, b) => (a.stock || 0) - (b.stock || 0))
        .slice(0, 5);

    return {
        totalSales,
        totalPurchases,
        inventoryValue,
        monthlyTrends,
        topCustomers,
        lowStockItems
    };
  }, [invoices, purchaseInvoices, products, customers]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
        {/* Header */}
        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    <Activity className="text-blue-600" size={32} /> تقارير الإدارة العليا
                </h1>
                <p className="text-slate-500 mt-2 font-medium">ملخص شامل للأداء المالي والتشغيلي للمنشأة</p>
            </div>
            <div className="flex gap-3">
                <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-2xl font-bold text-sm flex items-center gap-2">
                    <Calendar size={16} /> {new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <button onClick={() => window.print()} className="bg-slate-900 text-white px-6 py-2 rounded-2xl font-bold hover:bg-slate-800 transition-colors shadow-lg">
                    طباعة التقرير
                </button>
            </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-1">إجمالي المبيعات (التراكمي)</p>
                    <h3 className="text-3xl font-black text-slate-800">{analytics.totalSales.toLocaleString()} <span className="text-sm font-medium text-slate-400">{settings.currency}</span></h3>
                </div>
                <div className="mt-4 flex items-center gap-2 text-emerald-600 font-bold text-sm">
                    <TrendingUp size={16} />
                    <span>مؤشر النمو</span>
                </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-1">قيمة المخزون الحالي</p>
                    <h3 className="text-3xl font-black text-slate-800">{analytics.inventoryValue.toLocaleString()} <span className="text-sm font-medium text-slate-400">{settings.currency}</span></h3>
                </div>
                <div className="mt-4 flex items-center gap-2 text-blue-600 font-bold text-sm">
                    <Package size={16} />
                    <span>بسعر التكلفة</span>
                </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                    <p className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-1">إجمالي المشتريات</p>
                    <h3 className="text-3xl font-black text-slate-800">{analytics.totalPurchases.toLocaleString()} <span className="text-sm font-medium text-slate-400">{settings.currency}</span></h3>
                </div>
                <div className="mt-4 flex items-center gap-2 text-amber-600 font-bold text-sm">
                    <Truck size={16} />
                    <span>التوريدات</span>
                </div>
            </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Sales vs Purchases Trend */}
            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <BarChart3 className="text-indigo-600" /> اتجاهات المبيعات والمشتريات
                </h3>
                <div className="h-80 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.monthlyTrends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
                            <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} tickFormatter={(value) => `${value / 1000}k`} />
                            <Tooltip 
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                cursor={{fill: '#f8fafc'}}
                            />
                            <Legend wrapperStyle={{paddingTop: '20px'}} />
                            <Bar dataKey="sales" name="المبيعات" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={30} />
                            <Bar dataKey="purchases" name="المشتريات" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={30} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Top Customers */}
            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Users className="text-emerald-600" /> كبار العملاء (حسب الحجم)
                </h3>
                <div className="h-80 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={analytics.topCustomers}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {analytics.topCustomers.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => value.toLocaleString()} />
                            <Legend layout="vertical" verticalAlign="middle" align="right" />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* Alerts & Notifications */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Low Stock Alert */}
            <div className="lg:col-span-2 bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <AlertTriangle className="text-red-500" /> تنبيهات المخزون (نواقص)
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                <th className="pb-4 pr-4">الصنف</th>
                                <th className="pb-4 text-center">الرصيد الحالي</th>
                                <th className="pb-4 text-center">سعر التكلفة</th>
                                <th className="pb-4 text-center">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {analytics.lowStockItems.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-4 pr-4 font-bold text-slate-700">{item.name}</td>
                                    <td className="py-4 text-center font-mono text-red-600 font-bold">{item.stock}</td>
                                    <td className="py-4 text-center text-slate-500">{item.purchase_price?.toLocaleString()}</td>
                                    <td className="py-4 text-center">
                                        <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
                                            منخفض جداً
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {analytics.lowStockItems.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">
                                        المخزون في حالة جيدة، لا توجد نواقص حرجة.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick Links */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[40px] text-white shadow-xl">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <FileText className="text-blue-400" /> تقارير تفصيلية
                </h3>
                <div className="space-y-3">
                    <Link to="/income-statement" className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all group">
                        <span className="font-bold">قائمة الدخل</span>
                        <ArrowDownLeft size={18} className="text-blue-400 group-hover:translate-x-[-4px] transition-transform" />
                    </Link>
                    <Link to="/balance-sheet" className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all group">
                        <span className="font-bold">الميزانية العمومية</span>
                        <ArrowDownLeft size={18} className="text-emerald-400 group-hover:translate-x-[-4px] transition-transform" />
                    </Link>
                    <Link to="/cash-flow-report" className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all group">
                        <span className="font-bold">حركة النقدية</span>
                        <ArrowDownLeft size={18} className="text-amber-400 group-hover:translate-x-[-4px] transition-transform" />
                    </Link>
                    <Link to="/sales-reports" className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all group">
                        <span className="font-bold">تحليل المبيعات</span>
                        <ArrowDownLeft size={18} className="text-purple-400 group-hover:translate-x-[-4px] transition-transform" />
                    </Link>
                </div>
            </div>
        </div>
    </div>
  );
};

export default ImportantReports;
