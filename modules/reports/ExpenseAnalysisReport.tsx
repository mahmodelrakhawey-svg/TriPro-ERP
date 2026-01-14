import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { 
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import { Calendar, DollarSign, PieChart as PieChartIcon } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

const ExpenseAnalysisReport = () => {
  const { accounts, entries, settings } = useAccounting();
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const expenseData = useMemo(() => {
    // تصفية حسابات المصروفات
    const expenseAccounts = accounts.filter(a => {
      const type = (a.type || '').toLowerCase().trim();
      return type.includes('expense') || type.includes('مصروف');
    });
    
    const accountTotals: Record<string, number> = {};

    // حساب الإجماليات من القيود المرحلة
    entries.forEach(entry => {
      if (entry.date >= startDate && entry.date <= endDate && entry.status === 'posted') {
        entry.lines.forEach(line => {
          // التحقق مما إذا كان الحساب هو حساب مصروفات
          if (expenseAccounts.some(a => a.id === line.accountId)) {
            // المصروفات طبيعتها مدينة: المدين يزيدها والدائن ينقصها
            const amount = (Number(line.debit) || 0) - (Number(line.credit) || 0);
            if (amount !== 0) {
                accountTotals[line.accountId] = (accountTotals[line.accountId] || 0) + amount;
            }
          }
        });
      }
    });

    // تحويل البيانات لمصفوفة للعرض
    const data = expenseAccounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      code: acc.code,
      value: accountTotals[acc.id] || 0
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

    return data;
  }, [accounts, entries, startDate, endDate]);

  const totalExpenses = expenseData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <PieChartIcon className="text-red-600" /> تحليل المصروفات
          </h2>
          <p className="text-slate-500">تحليل تفصيلي للمصروفات وتوزيعها حسب الحسابات</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            <span className="text-sm font-bold text-slate-600">من:</span>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="border-none bg-transparent text-sm font-bold focus:ring-0"
            />
          </div>
          <div className="w-px h-6 bg-slate-200"></div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-600">إلى:</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="border-none bg-transparent text-sm font-bold focus:ring-0"
            />
          </div>
        </div>
      </div>

      {/* بطاقة الإجمالي والرسم البياني الشريطي */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-6 text-white shadow-lg shadow-red-200">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <DollarSign size={24} className="text-white" />
            </div>
            <span className="bg-white/20 px-3 py-1 rounded-lg text-xs font-bold">الإجمالي</span>
          </div>
          <p className="text-slate-100 text-sm mb-1">إجمالي المصروفات للفترة</p>
          <h3 className="text-3xl font-black">{totalExpenses.toLocaleString()} <span className="text-lg opacity-80">{settings?.currency}</span></h3>
        </div>
        
        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
             <h3 className="font-bold text-slate-700 mb-4">توزيع المصروفات (أعلى 5 حسابات)</h3>
             <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={expenseData.slice(0, 5)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 12}} />
                        <Tooltip formatter={(value) => Number(value).toLocaleString()} />
                        <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
             </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* الرسم البياني الدائري */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-6">نسب المصروفات</h3>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={expenseData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                        >
                            {expenseData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => Number(value).toLocaleString()} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* الجدول التفصيلي */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
                <h3 className="font-bold text-slate-700">تفاصيل الحسابات</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-right">
                    <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                        <tr>
                            <th className="p-4">كود الحساب</th>
                            <th className="p-4">اسم الحساب</th>
                            <th className="p-4">القيمة</th>
                            <th className="p-4">النسبة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {expenseData.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-slate-50">
                                <td className="p-4 font-mono text-slate-500">{item.code}</td>
                                <td className="p-4 font-bold text-slate-700">{item.name}</td>
                                <td className="p-4 font-bold text-red-600">{item.value.toLocaleString()}</td>
                                <td className="p-4 text-slate-500">
                                    {totalExpenses > 0 ? ((item.value / totalExpenses) * 100).toFixed(1) : 0}%
                                </td>
                            </tr>
                        ))}
                        {expenseData.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-slate-400">لا توجد مصروفات مسجلة في هذه الفترة</td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-800">
                        <tr>
                            <td colSpan={2} className="p-4 text-left">الإجمالي</td>
                            <td className="p-4 text-red-600">{totalExpenses.toLocaleString()}</td>
                            <td className="p-4">100%</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ExpenseAnalysisReport;