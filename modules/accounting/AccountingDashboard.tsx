import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { MidnightAuditShieldCard } from './components/MidnightAuditShieldCard';
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
  Trash2,
  Calendar,
  Lock
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

// --- Ù…ÙƒÙˆÙ†Ø§Øª Ø§Ù„Ø±Ø³ÙˆÙ… Ø§Ù„Ø¨ÙŠØ§Ù†ÙŠØ© Ø§Ù„Ù…Ø­Ø³Ù†Ø© (Memoized Components) ---

const MonthlyRevenueChart = React.memo(({ data }: { data: any[] }) => (
  <ResponsiveContainer width="100%" height="100%" minHeight={320}>
    <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
        formatter={(value: unknown) => Number(value || 0).toLocaleString()}
      />
      <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" name="Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª" strokeWidth={2} />
      <Area type="monotone" dataKey="expense" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpense)" name="Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª" strokeWidth={2} />
    </AreaChart>
  </ResponsiveContainer>
));

const ExpensesBreakdownChart = React.memo(({ data }: { data: any[] }) => (
  <ResponsiveContainer width="100%" height="100%" minHeight={320}>
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={60}
        outerRadius={80}
        paddingAngle={5}
        dataKey="value"
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(value: unknown) => Number(value || 0).toLocaleString()} />
      <Legend layout="horizontal" verticalAlign="bottom" align="center" />
    </PieChart>
  </ResponsiveContainer>
));

const WeeklyCashFlowChart = React.memo(({ data }: { data: any[] }) => (
  <ResponsiveContainer width="100%" height="100%" minHeight={320}>
    <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
        formatter={(value: unknown) => Number(value || 0).toLocaleString('ar-EG', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
      />
      <Area type="monotone" dataKey="balance" stroke="#8884d8" fillOpacity={1} fill="url(#colorCash)" name="Ø±ØµÙŠØ¯ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©" strokeWidth={2} />
    </AreaChart>
  </ResponsiveContainer>
));

const ManufacturingVariances = React.memo(({ data }: { data: any[] }) => (
  <div className="space-y-4">
    {data.map((item, idx) => (
      <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
        <div>
          <p className="text-xs font-bold text-slate-500">{item.order_number}</p>
          <p className="text-sm font-black text-slate-800">{item.finished_product}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${item.variance_qty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {item.variance_qty < 0 ? 'Ø²ÙŠØ§Ø¯Ø© Ø§Ø³ØªÙ‡Ù„Ø§Ùƒ' : 'ØªÙˆÙÙŠØ± Ù…ÙˆØ§Ø¯'}
          </p>
          <p className="text-xs text-slate-400">Ø¨Ù†Ø³Ø¨Ø© {Math.abs(item.variance_percentage)}%</p>
        </div>
      </div>
    ))}
    {data.length === 0 && <p className="text-center text-slate-400 text-sm">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø§Ù†Ø­Ø±Ø§ÙØ§Øª Ù…Ø³Ø¬Ù„Ø©</p>}
  </div>
));

export default function AccountingDashboard() {
  const { accounts, entries, refreshData, clearCache, clearTransactions, currentUser, emptyRecycleBin, deleteOrganization, organizations, selectedFiscalYear } = useAccounting();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(selectedFiscalYear || new Date().getFullYear());
  const [selectedOrgIdToDelete, setSelectedOrgIdToDelete] = useState('');
  const [mfgVariances, setMfgVariances] = useState([]);

  // Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø®ØªØ§Ø±Ø© Ù…Ø¹ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ù„Ù„Ù†Ø¸Ø§Ù…
  useEffect(() => {
    if (selectedFiscalYear) {
      setSelectedYear(selectedFiscalYear);
    }
  }, [selectedFiscalYear]);

  useEffect(() => {
    const load = async () => {
        setLoading(true);
        await refreshData();
        setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const orgId = currentUser?.organization_id;
    if (!orgId) return;

    // Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù†Ø­Ø±Ø§ÙØ§Øª Ø§Ù„ØªØµÙ†ÙŠØ¹ Ù„Ù„Ù…Ù†Ø¸Ù…Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ© ÙÙ‚Ø· Ù„Ù…Ù†Ø¹ ØªØ³Ø±ÙŠØ¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª ÙÙŠ Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¹Ø§Ù„Ù…ÙŠ
    supabase.from('v_mfg_material_variances').select('*').eq('organization_id', orgId).limit(3).then(({data}) => {
      if (data) setMfgVariances(data as any);
    });
  }, [selectedYear, currentUser?.organization_id]);

  const { metrics, monthlyData, expenseData, revenueData, weeklyCashData, recentEntries } = useMemo(() => {
      // Return default empty data if accounts or entries are not yet loaded
      if (!accounts || accounts.length === 0 || !entries) { // entries can be empty, but not null/undefined
          return {
              metrics: { totalRevenue: 0, totalExpenses: 0, netProfit: 0, cashBalance: 0, profitMargin: 0, totalTax: 0 },
              monthlyData: [], expenseData: [], revenueData: [], weeklyCashData: [], recentEntries: []
          };
      }

      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      let revenue = 0;
      let expenses = 0;
      let totalTax = 0;
      const monthlyStats: Record<string, { revenue: number, expense: number }> = {};
      const revenueMap: Record<string, number> = {};
      const expenseMap: Record<string, number> = {};
      
      const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      monthsOrder.forEach(m => monthlyStats[m] = { revenue: 0, expense: 0 });

      const yearEntries = entries.filter(e => 
          e.status === 'posted' &&
          String(e.transaction_date || e.date || e.created_at || '').startsWith(String(selectedYear))
      );
      // Debugging: Check filtered entries
      // logger.log('Filtered yearEntries for', selectedYear, ':', yearEntries);

      yearEntries.forEach(entry => {
          const dateValue = entry.transaction_date || entry.date;
          // Debugging: Check date value
          // logger.log(`Processing entry ${entry.id}: dateValue=${dateValue}`);
          if (!dateValue) return;
          const date = new Date(dateValue);
          if (isNaN(date.getTime())) return;

          const monthKey = date.toLocaleString('en-US', { month: 'short' });

          (entry.journal_lines || []).forEach(line => {
              const account = accounts.find(a => a.id === line.account_id);
              if (!account) return;

              const type = String(account.type || '').toLowerCase();
              const code = String(account.code || ''); // Ensure code is always a string
              const debit = Number(line.debit || 0);
              const credit = Number(line.credit || 0);

              if (type.includes('revenue') || type.includes('Ø¥ÙŠØ±Ø§Ø¯') || type.includes('income') || code.startsWith('4')) {
                  const amount = credit - debit; 
                  revenue += amount;
                  if (monthlyStats[monthKey]) monthlyStats[monthKey].revenue += amount;
                  
                  if (amount !== 0) {
                      revenueMap[account.name] = (revenueMap[account.name] || 0) + amount;
                  }
                  // logger.log(`    -> Revenue detected: ${account.name}, Amount: ${amount}`);
              } 
              else if (type.includes('expense') || type.includes('Ù…ØµØ±ÙˆÙ') || type.includes('cost') || code.startsWith('5')) {
                  const amount = debit - credit;
                  expenses += amount;
                  if (monthlyStats[monthKey]) monthlyStats[monthKey].expense += amount;

                  const accName = account.name;
                  if (amount > 0) {
                      expenseMap[accName] = (expenseMap[accName] || 0) + amount;
                  }
                  // logger.log(`    -> Expense detected: ${account.name}, Amount: ${amount}`);
              }
              // ØªØªØ¨Ø¹ Ø§Ù„Ø¶Ø±Ø§Ø¦Ø¨ (Ø­Ø³Ø§Ø¨Ø§Øª ØªØ¨Ø¯Ø£ Ø¨Ù€ 223 Ø£Ùˆ ØªØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ ÙƒÙ„Ù…Ø© Ø¶Ø±ÙŠØ¨Ø©)
              if (code.startsWith('223') || String(account.name || '').includes('Ø¶Ø±ÙŠØ¨Ø©') || String(account.name || '').toLowerCase().includes('tax')) {
                  totalTax += (credit - debit);
              }
          });
      });

      const cashBalance = accounts
          .filter(a => !a.isGroup && (
              // Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø£Ù† Ø§Ù„Ø­Ø³Ø§Ø¨ Ø£ØµÙ„ (ÙŠØ¨Ø¯Ø£ Ø¨Ù€ 1) Ù„Ø§Ø³ØªØ¨Ø¹Ø§Ø¯ Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª Ù…Ø«Ù„ "Ø¹Ø¬Ø² Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚"
              (String(a.type).toLowerCase().includes('asset') || a.code.startsWith('1')) &&
              (String(a.code || '').startsWith('123') ||
              String(a.code || '').startsWith('1101') ||
              String(a.name || '').includes('ØµÙ†Ø¯ÙˆÙ‚') ||
              String(a.name || '').includes('Ø®Ø²ÙŠÙ†Ø©') ||
              String(a.name || '').includes('Ø¨Ù†Ùƒ') ||
              String(a.name || '').includes('Ù†Ù‚Ø¯'))
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

      const revenueChartData = Object.entries(revenueMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      // --- Ø­Ø³Ø§Ø¨ ØªØ·ÙˆØ± Ø§Ù„Ø³ÙŠÙˆÙ„Ø© Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ÙŠ ---
      const cashAccountIds = accounts
          .filter(a => !a.isGroup && (
              (String(a.type).toLowerCase().includes('asset') || a.code.startsWith('1')) &&
              (String(a.code || '').startsWith('123') ||
              String(a.code || '').startsWith('1101') ||
              String(a.name || '').includes('ØµÙ†Ø¯ÙˆÙ‚') ||
              String(a.name || '').includes('Ø®Ø²ÙŠÙ†Ø©') ||
              String(a.name || '').includes('Ø¨Ù†Ùƒ') ||
              String(a.name || '').includes('Ù†Ù‚Ø¯'))
          ))
          .map(a => a.id);

      const allCashTransactions = entries.flatMap(entry => 
          (entry.journal_lines || [])
              .filter(line => cashAccountIds.includes(line.account_id))
              .map(line => ({
                  date: new Date(entry.transaction_date || entry.date || ''),
                  amount: (line.debit || 0) - (line.credit || 0)
              }))
      ).filter(t => !isNaN(t.date.getTime()));

      const openingCashBalanceForYear = allCashTransactions
          .filter(t => t.date < new Date(startDate))
          .reduce((sum, t) => sum + t.amount, 0);

      const getWeekOfYear = (date: Date) => {
          const start = new Date(date.getUTCFullYear(), 0, 1);
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
          return { name: `Ø£ ${weekNum}`, balance: runningCashBalance };
      });

      const recent = entries.slice(0, 5).map(e => ({
          id: e.id,
          transaction_date: e.transaction_date || e.date || e.created_at,
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
              profitMargin,
              totalTax
          },
          monthlyData: chartData,
          expenseData: expenseChartData,
          revenueData: revenueChartData,
          weeklyCashData: weeklyData,
          recentEntries: recent
      };

  }, [accounts, entries, selectedYear]);

  if (loading && entries.length === 0) {
    return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
  }

  const handleClearTransactions = async () => {
      if (currentUser?.role === 'demo') {
          if (window.confirm('âš ï¸ ØªØ­Ø°ÙŠØ± Ù‡Ø§Ù… Ø¬Ø¯Ø§Ù‹ âš ï¸\n\nØ³ÙŠØªÙ… Ø­Ø°Ù Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ© ÙˆØ§Ù„Ù…Ø®Ø²Ù†ÙŠØ© (ÙÙˆØ§ØªÙŠØ±ØŒ Ù‚ÙŠÙˆØ¯ØŒ Ø³Ù†Ø¯Ø§ØªØŒ Ø´ÙŠÙƒØ§Øª...) Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹.\nØ³ÙŠØªÙ… ØªØµÙÙŠØ± Ø§Ù„Ø£Ø±ØµØ¯Ø© ÙˆØ§Ù„Ù…Ø®Ø²ÙˆÙ†.\n\nÙ„Ù† ÙŠØªÙ… Ø­Ø°Ù: Ø§Ù„Ø­Ø³Ø§Ø¨Ø§ØªØŒ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ØŒ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†ØŒ Ø§Ù„Ø£ØµÙ†Ø§ÙØŒ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª.\n\nÙ‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ ØªÙ…Ø§Ù…Ø§Ù‹ Ù…Ù† Ø±ØºØ¨ØªÙƒ ÙÙŠ Ø§Ù„Ø§Ø³ØªÙ…Ø±Ø§Ø±ØŸ (Ù…Ø­Ø§ÙƒØ§Ø©)')) {
             if (window.confirm('ØªØ£ÙƒÙŠØ¯ Ù†Ù‡Ø§Ø¦ÙŠ: Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ØŸ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡! (Ù…Ø­Ø§ÙƒØ§Ø©)')) {
                 setLoading(true);
                 setTimeout(() => {
                     showToast('ØªÙ… ØªÙ†Ø¸ÙŠÙ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ù†Ø¬Ø§Ø­. Ø§Ù„Ù†Ø¸Ø§Ù… Ø¬Ø§Ù‡Ø² Ù„Ù„Ø¹Ù…Ù„ Ù…Ù† Ø¬Ø¯ÙŠØ¯. âœ… (Ù…Ø­Ø§ÙƒØ§Ø©)', 'success');
                     setLoading(false);
                     window.location.reload();
                 }, 1000);
             }
          }
          return;
      }
      
      if (!window.confirm('âš ï¸ ØªØ­Ø°ÙŠØ± Ù‡Ø§Ù… Ø¬Ø¯Ø§Ù‹ âš ï¸\n\nØ³ÙŠØªÙ… Ø­Ø°Ù Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ© ÙˆØ§Ù„Ù…Ø®Ø²Ù†ÙŠØ© (ÙÙˆØ§ØªÙŠØ±ØŒ Ù‚ÙŠÙˆØ¯ØŒ Ø³Ù†Ø¯Ø§ØªØŒ Ø´ÙŠÙƒØ§ØªØŒ Ø³Ù„Ù Ù…ÙˆØ¸ÙÙŠÙ†...) Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹.\nØ³ÙŠØªÙ… ØªØµÙÙŠØ± Ø§Ù„Ø£Ø±ØµØ¯Ø© ÙˆØ§Ù„Ù…Ø®Ø²ÙˆÙ†.\n\nÙ„Ù† ÙŠØªÙ… Ø­Ø°Ù: Ø§Ù„Ø­Ø³Ø§Ø¨Ø§ØªØŒ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ØŒ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†ØŒ Ø§Ù„Ø£ØµÙ†Ø§ÙØŒ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§ØªØŒ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†.\n\nÙ‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ ØªÙ…Ø§Ù…Ø§Ù‹ Ù…Ù† Ø±ØºØ¨ØªÙƒ ÙÙŠ Ø§Ù„Ø§Ø³ØªÙ…Ø±Ø§Ø±ØŸ')) return;

      const confirmation = window.prompt('Ù„Ù„ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠØŒ ÙŠØ±Ø¬Ù‰ ÙƒØªØ§Ø¨Ø© ÙƒÙ„Ù…Ø© "Ø­Ø°Ù" ÙÙŠ Ø§Ù„Ù…Ø±Ø¨Ø¹ Ø£Ø¯Ù†Ø§Ù‡:');
      if (confirmation !== 'Ø­Ø°Ù') return;

      const orgId = currentUser?.organization_id;
      if (!orgId) return;

      setLoading(true);
      try {
          // 1. Ø­Ø°Ù Ø§Ù„ØªÙØ§ØµÙŠÙ„ (Lines)
          const tablesLines = [
              'butchering_order_items', 'invoice_items', 'purchase_invoice_items',
              'quotation_items', 'purchase_order_items', 'sales_return_items',
              'purchase_return_items', 'stock_transfer_items', 'stock_adjustment_items',
              'inventory_count_items', 'payroll_items', 'inventory_transactions',
              'order_items', 'kitchen_orders', 'payments', 'order_item_modifiers', 'order_discounts',
              'receipt_voucher_attachments', 'payment_voucher_attachments', 'cheque_attachments', 'journal_attachments',
              'project_boq', 'project_material_issue_items',
              'employee_allowances', 'payroll_variables',
              'system_error_logs', 'security_logs', 'budgets', 'notification_audit_log',
              'project_attachments', 'project_inspections', 'subcontractor_billings', 'project_milestones',
              'project_custody_expenses', 'project_change_orders',
              'equipment_usage_logs', 'project_site_attendance', 'project_tool_custody',
              'hims_billing_items', 'hims_clinical_notes', 'hims_nursing_activities', 'hims_lab_orders', 'hims_clinical_measurements',
              'hims_medication_log', 'hims_radiology_orders', 'hims_blood_donations', 'hims_blood_transfusions', 'hims_patient_vitals',
              'hims_lab_specimens', 'hims_nurse_tasks', 'hims_staff_roster',
              'mfg_step_attachments', 'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_production_variances', 'mfg_operation_logs',
              'mfg_batch_serials', 'mfg_qc_inspections', 'mfg_material_request_items', 'mfg_byproducts_logs',
              'mfg_beginning_wip_inventory', 'mfg_alerts_log', 'mfg_period_cost_snapshots',
              'work_order_costs', 'work_order_material_usage', 'mfg_order_progress' // mfg_order_progress should be cleared before mfg_production_orders
          ];
          
          for (const table of tablesLines) {
          try {
              await supabase.from(table).delete().eq('organization_id', orgId);
          } catch (e) {
              // Log specific error for debugging, but continue with other tables
              logger.warn(`Table ${table} could not be cleared or does not exist: ${e?.message || e}`);
          }
       }

          // Clear modifier_groups and modifiers if they are considered transactional for orders
          // However, they are more like master data for product configuration, so keeping them out of handleClearTransactions
          // If they need to be cleared, they should be in handleClearMasterData

          // 2. Ø­Ø°Ù Ø§Ù„Ù…Ø³ØªÙ†Ø¯Ø§Øª (Documents)
          const tablesDocs = [
              'butchering_orders', 'invoices', 'purchase_invoices', 'quotations', 'purchase_orders',
              'sales_returns', 'purchase_returns', 'credit_notes', 'debit_notes',
              'receipt_vouchers', 'payment_vouchers', 'cheques',
              'stock_transfers', 'stock_adjustments', 'inventory_counts',
              'payrolls', 'employee_advances', 'bank_reconciliations', 'cash_closings',
              'opening_inventories', 'project_daily_reports', 'pos_cash_drawer_logs',
              'orders', 'table_sessions', 'shifts', 'rejected_cash_closings', 'restaurant_customer_points',
              'sales_orders', 'delivery_orders', 'notifications',
              'project_progress_billings', 'project_custodies', 'project_material_issues', 'project_change_orders', 'subcontractor_contracts', 'projects',
              'hims_billing', 'hims_visits', 'hims_prescriptions', 'hims_appointments', 'hims_surgeries', 'hims_insurance_claims', 'hims_admissions', 'hims_triage_records',
              'mfg_material_requests', 'mfg_production_orders', 'work_orders'
          ];
          
          for (const table of tablesDocs) {
          try {
              await supabase.from(table).delete().eq('organization_id', orgId);
          } catch (e) {
              logger.warn(`Table ${table} could not be cleared or does not exist`);
          }
       }

          // 3. Ø­Ø°Ù Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„ÙŠÙˆÙ…ÙŠØ© (Journal Entries)
          await supabase.from('journal_entries').delete().eq('organization_id', orgId);
          
          // 4. ØªØµÙÙŠØ± Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª ÙÙŠ Ø§Ù„Ø¯Ù„ÙŠÙ„
          await supabase.from('accounts').update({ balance: 0 }).eq('organization_id', orgId);

          // 4.5. ØªØµÙÙŠØ± Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠØ© ÙˆØ§Ù„Ø­Ø§Ù„ÙŠØ© Ù„Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙˆÙ…Ø®Ø²ÙˆÙ† Ø§Ù„Ø£ØµÙ†Ø§Ù
          await supabase.from('customers').update({ balance: 0, opening_balance: 0 }).eq('organization_id', orgId);
          await supabase.from('suppliers').update({ balance: 0, opening_balance: 0 }).eq('organization_id', orgId);
          await supabase.from('products').update({ stock: 0, current_stock: 0 }).eq('organization_id', orgId);
          
          // 5. ØªØµÙÙŠØ± Ø­Ø§Ù„Ø© Ø·Ø§ÙˆÙ„Ø§Øª Ø§Ù„Ù…Ø·Ø¹Ù… (Ø¬Ø¹Ù„Ù‡Ø§ Ù…ØªØ§Ø­Ø©)
          await supabase.from('restaurant_tables').update({ status: 'AVAILABLE' }).neq('id', '00000000-0000-0000-0000-000000000000');

          // 6. ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø³ÙŠØ§Ù‚
          await clearTransactions();
          
          showToast('ØªÙ… ØªØµÙÙŠØ± Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª ÙˆØ§Ù„Ù‚ÙŠÙˆØ¯ ÙˆØ§Ù„Ø£Ø±ØµØ¯Ø© Ø¨Ù†Ø¬Ø§Ø­.', 'success');
          window.location.reload();
      } catch (e) {
          logger.error(e);
          showToast('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªØµÙÙŠØ± Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª: ' + e.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleClearMasterData = async () => {
      if (currentUser?.role === 'demo') {
          if (window.confirm('âš ï¸ ØªØ­Ø°ÙŠØ± Ù‡Ø§Ù… âš ï¸\n\nØ³ÙŠØªÙ… Ø­Ø°Ù Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙˆØ§Ù„Ù…ÙˆØ¸ÙÙŠÙ† ÙˆØ§Ù„Ø£ØµÙ†Ø§Ù.\n\nÙ‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ØŸ (Ù…Ø­Ø§ÙƒØ§Ø©)')) {
             setLoading(true);
             setTimeout(() => {
                 showToast('ØªÙ… Ø­Ø°Ù Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­ âœ… (Ù…Ø­Ø§ÙƒØ§Ø©)', 'success');
                 setLoading(false);
                 window.location.reload();
             }, 1000);
          }
          return;
      }
      
      if (!window.confirm('âš ï¸ ØªØ­Ø°ÙŠØ± Ù‡Ø§Ù… âš ï¸\n\nØ³ÙŠØªÙ… Ø­Ø°Ù Ù‚ÙˆØ§Ø¦Ù… (Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ØŒ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†ØŒ Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ†ØŒ Ø§Ù„Ø£ØµÙ†Ø§Ù) Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹.\nÙŠÙÙØ¶Ù„ ØªØµÙÙŠØ± Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø£ÙˆÙ„Ø§Ù‹ Ù„ØªØ¬Ù†Ø¨ Ø§Ù„Ø£Ø®Ø·Ø§Ø¡ Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø©.\n\nÙ‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ØŸ')) return;
      
      const confirmation = window.prompt('Ù„Ù„ØªØ£ÙƒÙŠØ¯ØŒ Ø§ÙƒØªØ¨ "Ø­Ø°Ù" ÙÙŠ Ø§Ù„Ù…Ø±Ø¨Ø¹ Ø£Ø¯Ù†Ø§Ù‡:');
      if (confirmation !== 'Ø­Ø°Ù') return;
      
      const orgId = currentUser?.organization_id;
      if (!orgId) return;

      setLoading(true);
      try {
          // Ù…Ø­Ø§ÙˆÙ„Ø© Ø­Ø°Ù Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„ Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ø§Ù„Ø£ØµÙ†Ø§Ù Ø£ÙˆÙ„Ø§Ù‹
          try { await supabase.from('modifiers').delete().eq('organization_id', orgId); } catch (e) {}
          try { await supabase.from('modifier_groups').delete().eq('organization_id', orgId); } catch (e) {}
          try { await supabase.from('bill_of_materials').delete().eq('organization_id', orgId); } catch (e) {}
          try { await supabase.from('opening_inventories').delete().eq('organization_id', orgId); } catch (e) {}

          const tables = ['products', 'customers', 'suppliers', 'employees', 'item_categories', 'menu_categories'];
          // Add HIMS and Construction master data that can be cleared if desired
          const masterTablesToClear = [...tables, 'hims_patients', 'hims_doctors', 'hims_wards', 'hims_beds', 'hims_lab_tests', 'hims_radiology_types', 'hims_icd10_codes', 'hims_drug_interactions', 'hims_staff_roster', 'hims_settings', 'hims_blood_donors', 'subcontractors', 'projects', 'project_boq', 'subcontractor_contracts', 'equipment', 'project_tool_custody', 'mfg_work_centers', 'bill_of_materials', 'mfg_routings', 'mfg_routing_steps', 'mfg_step_materials'];

          // Clear master data tables
          for (const table of masterTablesToClear) {
              const { error } = await supabase.from(table).delete().eq('organization_id', orgId);
              if (error) throw error;
          }
          
          await clearCache();
          showToast('ØªÙ… ØªØµÙÙŠØ± Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­.', 'success');
          window.location.reload();
      } catch (e) {
          logger.error(e);
          showToast('Ø­Ø¯Ø« Ø®Ø·Ø£ (Ø±Ø¨Ù…Ø§ ØªÙˆØ¬Ø¯ Ø¹Ù…Ù„ÙŠØ§Øª Ù…Ø±ØªØ¨Ø·Ø©): ' + e.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleEmptyRecycleBin = async () => {
      if (currentUser?.role === 'demo') {
          if (window.confirm('Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† ØªÙØ±ÙŠØº Ø³Ù„Ø© Ø§Ù„Ù…Ø­Ø°ÙˆÙØ§Øª Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ØŸ (Ù…Ø­Ø§ÙƒØ§Ø©)')) {
             setLoading(true);
             setTimeout(() => {
                 showToast('ØªÙ… ØªÙØ±ÙŠØº Ø³Ù„Ø© Ø§Ù„Ù…Ø­Ø°ÙˆÙØ§Øª Ø¨Ù†Ø¬Ø§Ø­ âœ… (Ù…Ø­Ø§ÙƒØ§Ø©)', 'success');
                 setLoading(false);
             }, 1000);
          }
          return;
      }

      if (!window.confirm('ØªØ­Ø°ÙŠØ±: Ø³ÙŠØªÙ… Ø­Ø°Ù Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ù†Ø§ØµØ± Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ Ø³Ù„Ø© Ø§Ù„Ù…Ø­Ø°ÙˆÙØ§Øª Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹ Ù„Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ù‚Ø³Ø§Ù… (Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ØŒ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†ØŒ Ø§Ù„Ø£ØµÙ†Ø§Ù...). Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ØŸ')) return;

      setLoading(true);
      try {
          const tables = ['accounts', 'customers', 'suppliers', 'products', 'warehouses', 'assets', 'employees'];
          for (const table of tables) {
              await emptyRecycleBin(table);
          }
          showToast('ØªÙ… ØªÙØ±ÙŠØº Ø³Ù„Ø© Ø§Ù„Ù…Ø­Ø°ÙˆÙØ§Øª Ø¨Ù†Ø¬Ø§Ø­.', 'success');
      } catch (e) {
          logger.error(e);
          showToast('Ø­Ø¯Ø« Ø®Ø·Ø£: ' + e.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ… Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ©</h1>
          <p className="text-slate-500">Ù†Ø¸Ø±Ø© Ø¹Ø§Ù…Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø£Ø¯Ø§Ø¡ Ø§Ù„Ù…Ø§Ù„ÙŠ Ù„Ø³Ù†Ø© {selectedYear}</p>
        </div>
        <div className="flex gap-2">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1 shadow-sm">
                <Calendar size={16} className="text-slate-400" />
                <select 
                    value={selectedYear} 
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent border-none text-sm font-bold focus:ring-0 outline-none cursor-pointer text-blue-600"
                >
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
            {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'demo') && (
                <>
                    <button 
                        onClick={handleClearTransactions}
                        className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors shadow-sm font-bold text-sm"
                        title="Ø­Ø°Ù Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ© ÙˆØ§Ù„Ù…Ø®Ø²Ù†ÙŠØ© (ØªØµÙÙŠØ± Ø§Ù„Ù†Ø¸Ø§Ù…)"
                    >
                        <Trash2 size={16} />
                        ØªØµÙÙŠØ± Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª
                    </button>
                    <button 
                        onClick={handleClearMasterData}
                        className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2 rounded-lg hover:bg-rose-100 transition-colors shadow-sm font-bold text-sm"
                        title="Ø­Ø°Ù Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙˆØ§Ù„Ù…ÙˆØ¸ÙÙŠÙ† ÙˆØ§Ù„Ø£ØµÙ†Ø§Ù ÙÙ‚Ø·"
                    >
                        <Trash2 size={16} />
                        ØªØµÙÙŠØ± Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ©
                    </button>
                    <button 
                        onClick={handleEmptyRecycleBin}
                        className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-600 px-4 py-2 rounded-lg hover:bg-orange-100 transition-colors shadow-sm font-bold text-sm"
                        title="Ø­Ø°Ù Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ù†Ø§ØµØ± ÙÙŠ Ø³Ù„Ø© Ø§Ù„Ù…Ø­Ø°ÙˆÙØ§Øª Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹"
                    >
                        <Trash2 size={16} />
                        ØªÙØ±ÙŠØº Ø§Ù„Ø³Ù„Ø©
                    </button>
                    <button 
                        onClick={() => navigate('/fiscal-year-closing')}
                        className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-600 px-4 py-2 rounded-lg hover:bg-amber-100 transition-colors shadow-sm font-bold text-sm"
                        title="Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© ÙˆØªØµÙÙŠØ± Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ù…Ø¤Ù‚ØªØ©"
                    >
                        <Lock size={16} />
                        Ø¥Ù‚ÙØ§Ù„ Ø§Ù„Ø³Ù†Ø©
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
                ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
            </button>
        </div>
        {currentUser?.role === 'super_admin' && organizations.length > 0 && (
            <div className="flex items-center gap-2 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800">Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø´Ø±ÙƒØ§Øª</h3>
                <select 
                    value={selectedOrgIdToDelete}
                    onChange={(e) => setSelectedOrgIdToDelete(e.target.value)}
                    className="bg-transparent border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-blue-500 outline-none cursor-pointer text-blue-600"
                >
                    <option value="">-- Ø§Ø®ØªØ± Ø´Ø±ÙƒØ© Ù„Ù„Ø­Ø°Ù --</option>
                    {organizations.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                </select>
                <button 
                    onClick={async () => {
                        if (selectedOrgIdToDelete) {
                            setLoading(true);
                            try {
                                const res = await deleteOrganization(selectedOrgIdToDelete);
                                if (res?.success) {
                                    setSelectedOrgIdToDelete('');
                                }
                            } finally {
                                setLoading(false);
                            }
                        } else {
                            showToast('Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ø®ØªÙŠØ§Ø± Ø´Ø±ÙƒØ© Ø£ÙˆÙ„Ø§Ù‹', 'warning');
                        }
                    }}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-bold shadow-sm transition-colors text-sm"
                >
                    <Trash2 size={16} />
                    Ø­Ø°Ù Ø§Ù„Ø´Ø±ÙƒØ© Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©
                </button>
            </div>
        )}
      </div>

      {/* ðŸ›¡ï¸ Ø¯Ø±Ø¹ Ø§Ù„Ù†Ø²Ø§Ù‡Ø© ÙˆØ§Ù„ØªØ¯Ù‚ÙŠÙ‚ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ø§Ù„Ù„ÙŠÙ„ÙŠ */}
      <MidnightAuditShieldCard organizationId={currentUser?.organization_id || ''} />

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <DashboardCard
          title="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª" 
          value={metrics.totalRevenue} 
          icon={<TrendingUp className="text-emerald-500" />} 
          trend="up"
          color="emerald"
        />
        <DashboardCard 
          title="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª" 
          value={metrics.totalExpenses} 
          icon={<TrendingDown className="text-red-500" />} 
          trend="down"
          color="red"
        />
        <DashboardCard 
          title="ØµØ§ÙÙŠ Ø§Ù„Ø±Ø¨Ø­" 
          value={metrics.netProfit} 
          icon={<DollarSign className="text-blue-500" />} 
          trend={metrics.netProfit >= 0 ? "up" : "down"}
          color="blue"
        />
        <DashboardCard 
          title="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¶Ø±Ø§Ø¦Ø¨" 
          value={metrics.totalTax} 
          icon={<Percent className="text-amber-500" />} 
          trend={metrics.totalTax > 0 ? "up" : "neutral"}
          color="purple"
        />
        <DashboardCard 
          title="Ù†Ø³Ø¨Ø© Ù‡Ø§Ù…Ø´ Ø§Ù„Ø±Ø¨Ø­" 
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
          <h3 className="font-bold text-slate-800 mb-6">ØªØ­Ù„ÙŠÙ„ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª ÙˆØ§Ù„Ù…ØµØ±ÙˆÙØ§Øª (Ø´Ù‡Ø±ÙŠ)</h3>
          <div className="h-80 w-full" style={{ minHeight: '320px' }}>
            <MonthlyRevenueChart data={monthlyData} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Breakdown Pie Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <TrendingUp size={18} className="text-slate-400" /> ØªØ­Ù„ÙŠÙ„ Ù…ØµØ§Ø¯Ø± Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª
          </h3>
          <div className="h-80 w-full" style={{ minHeight: '320px' }}>
            <ExpensesBreakdownChart data={revenueData} />
          </div>
        </div>

        {/* Expense Breakdown Pie Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <PieChartIcon size={18} className="text-slate-400" /> ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª
          </h3>
          <div className="h-80 w-full" style={{ minHeight: '320px' }}>
            <ExpensesBreakdownChart data={expenseData} />
          </div>
        </div>

        {/* Manufacturing Intelligence Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Activity size={18} className="text-indigo-500" /> Ø°ÙƒØ§Ø¡ Ø§Ù„ØªØµÙ†ÙŠØ¹ (Ø§Ù†Ø­Ø±Ø§ÙØ§Øª Ø§Ù„Ù…ÙˆØ§Ø¯)
          </h3>
          <ManufacturingVariances data={mfgVariances} />
        </div>

        {/* Weekly Cash Flow Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Wallet size={18} className="text-slate-400" /> ØªØ·ÙˆØ± Ø§Ù„Ø³ÙŠÙˆÙ„Ø© Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ÙŠ
          </h3>
          <div className="h-80 w-full" style={{ minHeight: '320px' }}>
            <WeeklyCashFlowChart data={weeklyCashData} />
          </div>
        </div>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Activity size={18} className="text-slate-400" /> Ø¢Ø®Ø± Ø§Ù„Ù‚ÙŠÙˆØ¯
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentEntries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 p-3 border border-slate-50 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="bg-slate-100 p-2 rounded-lg">
                    <FileText size={16} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{entry.description || 'Ù‚ÙŠØ¯ Ø¨Ø¯ÙˆÙ† ÙˆØµÙ'}</p>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-slate-500 font-mono">{entry.reference}</span>
                      <span className="text-xs text-slate-400">{entry.transaction_date && !isNaN(new Date(entry.transaction_date).getTime()) ? new Date(entry.transaction_date).toLocaleDateString('ar-EG') : '---'}</span>
                    </div>
                  </div>
                </div>
              ))}
              {recentEntries.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-4 col-span-full">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù‚ÙŠÙˆØ¯ Ø­Ø¯ÙŠØ«Ø©</p>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ title, value, icon, trend, color }: Record<string, any>) {
  const colorClasses: Record<string, string> = {
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
            {trend === 'up' ? 'Ø¥ÙŠØ¬Ø§Ø¨ÙŠ' : 'Ø³Ù„Ø¨ÙŠ'}
          </div>
        )}
      </div>
      <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-2xl font-black text-slate-800">{value?.toLocaleString() ?? '0'}</h3>
    </div>
  );
}
