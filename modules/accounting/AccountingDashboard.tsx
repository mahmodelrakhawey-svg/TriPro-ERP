import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
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
  const { accounts, entries, refreshData, clearCache, clearTransactions, currentUser, emptyRecycleBin } = useAccounting();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
        setLoading(true);
        await refreshData();
        setLoading(false);
    };
    load();
  }, []);

  const { metrics, monthlyData, expenseData, weeklyCashData, recentEntries } = useMemo(() => {
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
              // التأكد من أن الحساب أصل (يبدأ بـ 1) لاستبعاد حسابات المصروفات مثل "عجز الصندوق"
              (String(a.type).toLowerCase().includes('asset') || a.code.startsWith('1')) &&
              (a.code.startsWith('123') || 
              a.code.startsWith('1101') || 
              a.name.includes('صندوق') || 
              a.name.includes('خزينة') || 
              a.name.includes('بنك') ||
              a.name.includes('نقد'))
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

      // --- حساب تطور السيولة الأسبوعي ---
      const cashAccountIds = accounts
          .filter(a => !a.isGroup && (
              (String(a.type).toLowerCase().includes('asset') || a.code.startsWith('1')) &&
              (a.code.startsWith('123') || 
              a.code.startsWith('1101') || 
              a.name.includes('صندوق') || 
              a.name.includes('خزينة') || 
              a.name.includes('بنك') ||
              a.name.includes('نقد'))
          ))
          .map(a => a.id);

      const allCashTransactions = entries.flatMap(entry => 
          entry.lines
              .filter(line => cashAccountIds.includes(line.accountId))
              .map(line => ({
                  date: new Date(entry.date),
                  amount: (line.debit || 0) - (line.credit || 0)
              }))
      );

      const openingCashBalanceForYear = allCashTransactions
          .filter(t => t.date < new Date(startDate))
          .reduce((sum, t) => sum + t.amount, 0);

      const getWeekOfYear = (date: Date) => {
          const start = new Date(date.getFullYear(), 0, 1);
          const diff = (date.getTime() - start.getTime() + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000));
          const oneDay = 1000 * 60 * 60 * 24;
          const day = Math.floor(diff / oneDay);
          return Math.ceil((day + start.getDay() + 1) / 7);
      };

      const weeklyMovements: Record<number, number> = {};
      allCashTransactions
          .filter(t => t.date >= new Date(startDate) && t.date <= new Date(endDate))
          .forEach(t => {
              const week = getWeekOfYear(t.date);
              weeklyMovements[week] = (weeklyMovements[week] || 0) + t.amount;
          });

      let runningCashBalance = openingCashBalanceForYear;
      const weeklyData = Array.from({ length: 52 }, (_, i) => {
          const weekNum = i + 1;
          runningCashBalance += weeklyMovements[weekNum] || 0;
          return { name: `أ ${weekNum}`, balance: runningCashBalance };
      });

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
          weeklyCashData: weeklyData,
          recentEntries: recent
      };

  }, [accounts, entries]);

  if (loading && entries.length === 0) {
    return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
  }

  const handleClearTransactions = async () => {
      if (currentUser?.role === 'demo') {
          if (window.confirm('⚠️ تحذير هام جداً ⚠️\n\nسيتم حذف جميع العمليات المالية والمخزنية (فواتير، قيود، سندات، شيكات...) نهائياً.\nسيتم تصفير الأرصدة والمخزون.\n\nلن يتم حذف: الحسابات، العملاء، الموردين، الأصناف، الإعدادات.\n\nهل أنت متأكد تماماً من رغبتك في الاستمرار؟ (محاكاة)')) {
             if (window.confirm('تأكيد نهائي: هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء! (محاكاة)')) {
                 setLoading(true);
                 setTimeout(() => {
                     alert('تم تنظيف البيانات بنجاح. النظام جاهز للعمل من جديد. ✅ (محاكاة)');
                     setLoading(false);
                     window.location.reload();
                 }, 1000);
             }
          }
          return;
      }
      
      if (!window.confirm('⚠️ تحذير هام جداً ⚠️\n\nسيتم حذف جميع العمليات المالية والمخزنية (فواتير، قيود، سندات، شيكات، سلف موظفين...) نهائياً.\nسيتم تصفير الأرصدة والمخزون.\n\nلن يتم حذف: الحسابات، العملاء، الموردين، الأصناف، الإعدادات، الموظفين.\n\nهل أنت متأكد تماماً من رغبتك في الاستمرار؟')) return;
      
      const confirmation = window.prompt('للتأكيد النهائي، يرجى كتابة كلمة "حذف" في المربع أدناه:');
      if (confirmation !== 'حذف') return;

      setLoading(true);
      try {
          // 1. حذف التفاصيل (Lines)
          const tablesLines = [
              'journal_lines', 'invoice_items', 'purchase_invoice_items', 
              'quotation_items', 'purchase_order_items', 'sales_return_items', 
              'purchase_return_items', 'stock_transfer_items', 'stock_adjustment_items', 
              'inventory_count_items', 'payroll_items'
          ];
          
          for (const table of tablesLines) {
              await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
          }

          // 2. حذف المستندات (Documents)
          const tablesDocs = [
              'invoices', 'purchase_invoices', 'quotations', 'purchase_orders', 
              'sales_returns', 'purchase_returns', 'credit_notes', 'debit_notes',
              'receipt_vouchers', 'payment_vouchers', 'cheques', 
              'stock_transfers', 'stock_adjustments', 'inventory_counts',
              'payrolls', 'employee_advances', 'bank_reconciliations', 'cash_closings',
              'opening_inventories', 'work_orders'
          ];
          
          for (const table of tablesDocs) {
              await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
          }

          // 3. حذف القيود اليومية (Journal Entries)
          await supabase.from('journal_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          
          // 4. تصفير أرصدة الحسابات
          await supabase.from('accounts').update({ balance: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');

          // 5. تحديث السياق
          await clearTransactions();
          
          alert('تم تصفير جميع العمليات التشغيلية وسلف الموظفين بنجاح.');
          window.location.reload();
      } catch (e: any) {
          console.error(e);
          alert('حدث خطأ أثناء التصفير: ' + e.message);
      } finally {
          setLoading(false);
      }
  };

  const handleEmptyRecycleBin = async () => {
      if (currentUser?.role === 'demo') {
          if (window.confirm('هل أنت متأكد من تفريغ سلة المحذوفات بالكامل؟ (محاكاة)')) {
             setLoading(true);
             setTimeout(() => {
                 alert('تم تفريغ سلة المحذوفات بنجاح ✅ (محاكاة)');
                 setLoading(false);
             }, 1000);
          }
          return;
      }

      if (!window.confirm('تحذير: سيتم حذف جميع العناصر الموجودة في سلة المحذوفات نهائياً لجميع الأقسام (العملاء، الموردين، الأصناف...). هل أنت متأكد؟')) return;

      setLoading(true);
      try {
          const tables = ['accounts', 'customers', 'suppliers', 'products', 'warehouses', 'assets', 'employees'];
          for (const table of tables) {
              await emptyRecycleBin(table);
          }
          alert('تم تفريغ سلة المحذوفات بنجاح.');
      } catch (e: any) {
          console.error(e);
          alert('حدث خطأ: ' + e.message);
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">لوحة التحكم المحاسبية</h1>
          <p className="text-slate-500">نظرة عامة على الأداء المالي للسنة الحالية</p>
        </div>
        <div className="flex gap-2">
            {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'demo') && (
                <>
                    <button 
                        onClick={handleClearTransactions}
                        className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors shadow-sm font-bold text-sm"
                        title="حذف جميع العمليات المالية والمخزنية (تصفير النظام)"
                    >
                        <Trash2 size={16} />
                        تصفير العمليات
                    </button>
                    <button 
                        onClick={handleEmptyRecycleBin}
                        className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-600 px-4 py-2 rounded-lg hover:bg-orange-100 transition-colors shadow-sm font-bold text-sm"
                        title="حذف جميع العناصر في سلة المحذوفات نهائياً"
                    >
                        <Trash2 size={16} />
                        تفريغ السلة
                    </button>
                </>
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
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        {/* Main Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Weekly Cash Flow Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Wallet size={18} className="text-slate-400" /> تطور السيولة النقدية الأسبوعي
          </h3>
          <div className="h-80 w-full" style={{ minHeight: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyCashData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} tickFormatter={(val) => `${(val/1000).toFixed(0)}k`} />
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => value.toLocaleString('ar-EG', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                />
                <Area type="monotone" dataKey="balance" stroke="#8884d8" fillOpacity={1} fill="url(#colorCash)" name="رصيد النقدية" strokeWidth={2} />
              </AreaChart>
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
      <h3 className="text-2xl font-black text-slate-800">{value?.toLocaleString() ?? '0'}</h3>
    </div>
  );
}