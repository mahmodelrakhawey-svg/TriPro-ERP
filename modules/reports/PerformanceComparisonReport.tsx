import { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus, Calendar, TrendingUp, Printer } from 'lucide-react';
import ReportHeader from '../../components/ReportHeader';

const PerformanceComparisonReport = () => {
  const { accounts, entries } = useAccounting();
  const currentYear = new Date().getFullYear();
  
  const [period1Start, setPeriod1Start] = useState(`${currentYear}-01-01`);
  const [period1End, setPeriod1End] = useState(`${currentYear}-06-30`);
  
  const [period2Start, setPeriod2Start] = useState(`${currentYear}-07-01`);
  const [period2End, setPeriod2End] = useState(`${currentYear}-12-31`);

  const calculatePeriodData = (start: string, end: string) => {
    let revenue = 0;
    let expenses = 0;

    const periodEntries = entries.filter(e => 
      e.status === 'posted' && 
      e.date >= start && 
      e.date <= end &&
      !e.reference?.startsWith('CLOSE-')
    );

    periodEntries.forEach(entry => {
      entry.lines.forEach(line => {
        const account = accounts.find(a => a.id === line.accountId);
        if (!account) return;

        const type = (account.type || '').toLowerCase();
        const isRevenue = type.includes('revenue') || type.includes('إيراد') || account.code.startsWith('4');
        const isExpense = type.includes('expense') || type.includes('مصروف') || type.includes('تكلفة') || account.code.startsWith('5');

        if (isRevenue) {
           // الإيرادات دائنة (دائن - مدين)
           revenue += (line.credit - line.debit);
        } else if (isExpense) {
           // المصروفات مدينة (مدين - دائن)
           expenses += (line.debit - line.credit);
        }
      });
    });

    return {
      revenue,
      expenses,
      netIncome: revenue - expenses
    };
  };

  const comparisonData = useMemo(() => {
    const p1 = calculatePeriodData(period1Start, period1End);
    const p2 = calculatePeriodData(period2Start, period2End);

    const calculateChange = (val1: number, val2: number) => {
      if (val1 === 0) return val2 === 0 ? 0 : 100;
      return ((val2 - val1) / Math.abs(val1)) * 100;
    };

    return {
      p1,
      p2,
      changes: {
        revenue: calculateChange(p1.revenue, p2.revenue),
        expenses: calculateChange(p1.expenses, p2.expenses),
        netIncome: calculateChange(p1.netIncome, p2.netIncome)
      },
      chartData: [
        { name: 'الإيرادات', period1: p1.revenue, period2: p2.revenue },
        { name: 'المصروفات', period1: p1.expenses, period2: p2.expenses },
        { name: 'صافي الدخل', period1: p1.netIncome, period2: p2.netIncome },
      ]
    };
  }, [entries, accounts, period1Start, period1End, period2Start, period2End]);

  const renderChangeIndicator = (change: number, isExpense: boolean = false) => {
    let isPositiveGood = !isExpense;
    let colorClass = 'text-slate-500';
    let Icon = Minus;

    if (change > 0) {
      colorClass = isPositiveGood ? 'text-emerald-600' : 'text-red-600';
      Icon = ArrowUpRight;
    } else if (change < 0) {
      colorClass = isPositiveGood ? 'text-red-600' : 'text-emerald-600';
      Icon = ArrowDownRight;
    }

    return (
      <div className={`flex items-center gap-1 font-bold ${colorClass} dir-ltr`}>
        <span>{Math.abs(change).toFixed(1)}%</span>
        <Icon size={16} />
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="text-blue-600" /> تقرير مقارنة الأداء
            </h2>
            <p className="text-slate-500">مقارنة النتائج المالية بين فترتين مختلفتين</p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
            <Printer size={18} /> طباعة التقرير
        </button>
      </div>

      <ReportHeader title="تقرير مقارنة الأداء المالي" />

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <h3 className="font-bold text-blue-800 flex items-center gap-2">
                    <Calendar size={18} /> الفترة الأولى (الأساس)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-blue-600 mb-1">من تاريخ</label>
                        <input type="date" value={period1Start} onChange={e => setPeriod1Start(e.target.value)} className="w-full border border-blue-200 rounded p-2 text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-blue-600 mb-1">إلى تاريخ</label>
                        <input type="date" value={period1End} onChange={e => setPeriod1End(e.target.value)} className="w-full border border-blue-200 rounded p-2 text-sm" />
                    </div>
                </div>
            </div>

            <div className="space-y-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
                <h3 className="font-bold text-purple-800 flex items-center gap-2">
                    <Calendar size={18} /> الفترة الثانية (المقارنة)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-purple-600 mb-1">من تاريخ</label>
                        <input type="date" value={period2Start} onChange={e => setPeriod2Start(e.target.value)} className="w-full border border-purple-200 rounded p-2 text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-purple-600 mb-1">إلى تاريخ</label>
                        <input type="date" value={period2End} onChange={e => setPeriod2End(e.target.value)} className="w-full border border-purple-200 rounded p-2 text-sm" />
                    </div>
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-none">
            <h3 className="font-bold text-slate-800 mb-6">الرسم البياني للمقارنة</h3>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData.chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => value.toLocaleString()} />
                        <Legend />
                        <Bar dataKey="period1" name="الفترة الأولى" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="period2" name="الفترة الثانية" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-none">
            <h3 className="font-bold text-slate-800 mb-6">ملخص المقارنة</h3>
            <div className="space-y-6">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="text-sm text-slate-500 mb-1">الإيرادات</div>
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="text-xs text-blue-600 font-bold">ف1: {comparisonData.p1.revenue.toLocaleString()}</div>
                            <div className="text-xs text-purple-600 font-bold">ف2: {comparisonData.p2.revenue.toLocaleString()}</div>
                        </div>
                        {renderChangeIndicator(comparisonData.changes.revenue, false)}
                    </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="text-sm text-slate-500 mb-1">المصروفات</div>
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="text-xs text-blue-600 font-bold">ف1: {comparisonData.p1.expenses.toLocaleString()}</div>
                            <div className="text-xs text-purple-600 font-bold">ف2: {comparisonData.p2.expenses.toLocaleString()}</div>
                        </div>
                        {renderChangeIndicator(comparisonData.changes.expenses, true)}
                    </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="text-sm text-slate-500 mb-1">صافي الدخل</div>
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="text-xs text-blue-600 font-bold">ف1: {comparisonData.p1.netIncome.toLocaleString()}</div>
                            <div className="text-xs text-purple-600 font-bold">ف2: {comparisonData.p2.netIncome.toLocaleString()}</div>
                        </div>
                        {renderChangeIndicator(comparisonData.changes.netIncome, false)}
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceComparisonReport;
