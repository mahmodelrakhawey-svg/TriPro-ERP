import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext'; // Import context
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Wallet, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight,
  Loader2,
  FileText,
  PieChart as PieChartIcon,
  Percent,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function AccountingDashboard() {
  const { accounts, entries, refreshData, clearCache, clearTransactions, currentUser } = useAccounting();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
        setLoading(true);
        await refreshData();
        setLoading(false);
    };
    load();
  }, []);

  const { metrics, monthlyData, expenseData, recentEntries } = useMemo(() => {
      const currentYear = new Date().getFullYear();
      const startDate = `${currentYear}-01-01`;
      const endDate = `${currentYear}-12-31`;

      let revenue = 0;
      let expenses = 0;
      const monthlyStats: Record<string, { revenue: number, expense: number }> = {};
      const expenseMap: Record<string, number> = {};
      
      const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      monthsOrder.forEach(m => monthlyStats[m] = { revenue: 0, expense: 0 });

      const yearEntries = entries.filter(e => 
          e.status === 'posted' && 
          e.date >= startDate && 
          e.date <= endDate
      );

      yearEntries.forEach(entry => {
          const date = new Date(entry.date);
          const monthKey = date.toLocaleString('en-US', { month: 'short' });

          entry.lines.forEach(line => {
              const account = accounts.find(a => a.id === line.accountId);
              if (!account) return;

              const type = String(account.type).toLowerCase();
              const debit = Number(line.debit || 0);
              const credit = Number(line.credit || 0);

              if (type.includes('revenue') || type.includes('إيراد') || type.includes('income') || account.code.startsWith('4')) {
                  const amount = credit - debit; 
                  revenue += amount;
                  if (monthlyStats[monthKey]) monthlyStats[monthKey].revenue += amount;
              } 
              else if (type.includes('expense') || type.includes('مصروف') || type.includes('cost') || account.code.startsWith('5')) {
                  const amount = debit - credit;
                  expenses += amount;
                  if (monthlyStats[monthKey]) monthlyStats[monthKey].expense += amount;

                  const accName = account.name;
                  if (amount > 0) {
                      expenseMap[accName] = (expenseMap[accName] || 0) + amount;
                  }
              }
          });
      });

      const cashBalance = accounts
          .filter(a => !a.isGroup && (
              a.code.startsWith('1101') || 
              a.name.includes('صندوق') || 
              a.name.includes('خزينة') || 
              a.name.includes('بنك') ||
              a.name.includes('نقد')
          ))
          .reduce((sum, a) => sum + (a.balance || 0), 0);

      const profitMargin = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;

      const chartData = monthsOrder.map(m => ({
        name: m,
        revenue: monthlyStats[m]?.revenue || 0,
        expense: monthlyStats[m]?.expense || 0,
        profit: (monthlyStats[m]?.revenue || 0) - (monthlyStats[m]?.expense || 0)
      }));

      const expenseChartData = Object.entries(expenseMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      const recent = entries.slice(0, 5).map(e => ({
          id: e.id,
          transaction_date: e.date,
          reference: e.reference,
          description: e.description,
          status: e.status
      }));

      return {
          metrics: {
              totalRevenue: revenue,
              totalExpenses: expenses,
              netProfit: revenue - expenses,
              cashBalance,
              profitMargin
          },
          monthlyData: chartData,
          expenseData: expenseChartData,
          recentEntries: recent
      };

  }, [accounts, entries]);

  if (loading && entries.length === 0) {
    return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">لوحة التحكم المحاسبية</h1>
          <p className="text-slate-500">نظرة عامة على الأداء المالي للسنة الحالية</p>
        </div>
        <div className="flex gap-2">
            {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                <button 
                    onClick={clearTransactions}
                    className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors shadow-sm font-bold text-sm"
                    title="حذف جميع العمليات المالية والمخزنية (تصفير النظام)"
                >
                    <Trash2 size={16} />
                    تصفير العمليات
                </button>
            )}
            <button 
                onClick={async () => {
                  setLoading(true);
                  await clearCache();
                  setLoading(false);
                }}
                className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm font-bold text-sm"
            >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                تحديث البيانات
            </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <DashboardCard 
          title="إجمالي الإيرادات" 
          value={metrics.totalRevenue} 
          icon={<TrendingUp className="text-emerald-500" />} 
          trend="up"
          color="emerald"
        />
        <DashboardCard 
          title="إجمالي المصروفات" 
          value={metrics.totalExpenses} 
          icon={<TrendingDown className="text-red-500" />} 
          trend="down"
          color="red"
        />
        <DashboardCard 
          title="صافي الربح" 
          value={metrics.netProfit} 
          icon={<DollarSign className="text-blue-500" />} 
          trend={metrics.netProfit >= 0 ? "up" : "down"}
          color="blue"
        />
        <DashboardCard 
          title="السيولة النقدية" 
          value={metrics.cashBalance} 
          icon={<Wallet className="text-purple-500" />} 
          trend="neutral"
          color="purple"
        />
        <DashboardCard 
          title="نسبة هامش الربح" 
          value={`${metrics.profitMargin.toFixed(1)}%`} 
          icon={<Percent className="text-teal-500" />} 
          trend={metrics.profitMargin >= 0 ? "up" : "down"}
          color="teal"
        />
      </div>

      {/* Charts & Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6">تحليل الإيرادات والمصروفات (شهري)</h3>
          <div className="h-80 w-full" style={{ minHeight: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} tickFormatter={(val) => `${val/1000}k`} />
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => value.toLocaleString()}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" name="الإيرادات" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpense)" name="المصروفات" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Breakdown Pie Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <PieChartIcon size={18} className="text-slate-400" /> توزيع المصروفات
          </h3>
          <div className="h-80 w-full" style={{ minHeight: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenseData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expenseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => value.toLocaleString()} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Activity size={18} className="text-slate-400" /> آخر القيود
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentEntries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 p-3 border border-slate-50 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="bg-slate-100 p-2 rounded-lg">
                    <FileText size={16} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{entry.description || 'قيد بدون وصف'}</p>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-slate-500 font-mono">{entry.reference}</span>
                      <span className="text-xs text-slate-400">{new Date(entry.transaction_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
              {recentEntries.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-4 col-span-full">لا توجد قيود حديثة</p>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ title, value, icon, trend, color }: any) {
  const colorClasses: any = {
    emerald: 'bg-emerald-50',
    red: 'bg-red-50',
    blue: 'bg-blue-50',
    purple: 'bg-purple-50',
    teal: 'bg-teal-50'
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          {icon}
        </div>
        {trend !== 'neutral' && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${trend === 'up' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend === 'up' ? 'إيجابي' : 'سلبي'}
          </div>
        )}
      </div>
      <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-2xl font-black text-slate-800">{value.toLocaleString()}</h3>
    </div>
  );
}