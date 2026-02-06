import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { FileText, Printer, Download, TrendingUp, TrendingDown, Loader2, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';
const IncomeStatement = () => {
  const { accounts, settings, currentUser } = useAccounting();
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [showLogo, setShowLogo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);

  // دالة لجلب البيانات من قاعدة البيانات مباشرة لضمان الدقة والشمولية
  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setLoading(false);
        return;
    }

    try {
      const { data, error } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status, reference)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.transaction_date', startDate)
        .lte('journal_entries.transaction_date', endDate);

      if (error) throw error;
      setLedgerLines(data || []);
    } catch (err: any) {
      console.error('Error fetching income statement data:', err);
      alert('فشل جلب البيانات: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const reportData = useMemo(() => {
    // 1. تحديد حسابات الإيرادات والمصروفات
    const pnlAccounts = accounts.filter(a => {
      const type = (a.type || '').toLowerCase();
      return (
        type.includes('revenue') || 
        type.includes('expense') || 
        type.includes('إيراد') || 
        type.includes('مصروف') || 
        type.includes('تكلفة') ||
        a.code.startsWith('4') || 
        a.code.startsWith('5')
      );
    });

    // 2. حساب الأرصدة من البيانات المجلوبة
    const accountBalances: Record<string, number> = {};
    
    if (currentUser?.role === 'demo') {
        accounts.forEach(acc => {
             const type = String(acc.type || '').toLowerCase();
             const isDebitNature = type.includes('asset') || type.includes('expense') || type.includes('أصول') || type.includes('مصروفات') || type.includes('تكلفة');
             // في الديمو، الرصيد في السياق موجب دائماً حسب الطبيعة.
             // نحوله إلى (مدين - دائن) ليتوافق مع المنطق أدناه
             if (isDebitNature) {
                 accountBalances[acc.id] = acc.balance || 0;
             } else {
                 accountBalances[acc.id] = -(acc.balance || 0);
             }
        });
    } else {
        ledgerLines.forEach(line => {
          if (line.journal_entries?.reference?.startsWith('CLOSE-')) return;
          if (accountBalances[line.account_id] === undefined) accountBalances[line.account_id] = 0;
          accountBalances[line.account_id] += (line.debit - line.credit);
        });
    }

    const revenues: any[] = [];
    const cogs: any[] = []; // تكلفة البضاعة المباعة
    const expenses: any[] = [];
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalExpense = 0;

    pnlAccounts.forEach(acc => {
      const balance = accountBalances[acc.id] || 0;
      if (Math.abs(balance) < 0.01) return;

      const type = (acc.type || '').toLowerCase();
      const isRevenue = type.includes('revenue') || type.includes('إيراد') || acc.code.startsWith('4');
      // تحديد تكلفة البضاعة المباعة (تبدأ بـ 501 أو تحتوي على كلمة تكلفة)
      const isCogs = acc.code.startsWith('511') || acc.code.startsWith('501') || acc.name.includes('تكلفة') || acc.name.toLowerCase().includes('cost');

      if (isRevenue) {
        // الإيرادات دائنة، لذا الرصيد (مدين - دائن) سيكون سالباً، نعكسه ليظهر موجب
        const val = -balance; 
        revenues.push({ ...acc, value: val });
        totalRevenue += val;
      } else if (isCogs) {
        // تكلفة البضاعة (مدينة)
        const val = balance;
        cogs.push({ ...acc, value: val });
        totalCogs += val;
      } else {
        // المصروفات الأخرى (مدينة)
        const val = balance;
        expenses.push({ ...acc, value: val });
        totalExpense += val;
      }
    });

    const grossProfit = totalRevenue - totalCogs;

    return {
      revenues: revenues.sort((a, b) => a.code.localeCompare(b.code)),
      cogs: cogs.sort((a, b) => a.code.localeCompare(b.code)),
      expenses: expenses.sort((a, b) => a.code.localeCompare(b.code)),
      totalRevenue,
      totalCogs,
      grossProfit,
      totalExpense,
      netIncome: grossProfit - totalExpense
    };
  }, [accounts, ledgerLines, currentUser]);

  const handlePrint = () => {
    window.print();
  };

  const exportToExcel = () => {
    const data = [
      ['قائمة الدخل'],
      [`من: ${startDate} إلى: ${endDate}`],
      [''],
      ['الإيرادات'],
      ...reportData.revenues.map(r => [r.code, r.name, r.value]),
      ['إجمالي الإيرادات', '', reportData.totalRevenue],
      [''],
      ['تكلفة البضاعة المباعة'],
      ...reportData.cogs.map(c => [c.code, c.name, c.value]),
      ['إجمالي تكلفة البضاعة', '', reportData.totalCogs],
      [''],
      ['مجمل الربح', '', reportData.grossProfit],
      [''],
      ['المصروفات التشغيلية'],
      ...reportData.expenses.map(e => [e.code, e.name, e.value]),
      ['إجمالي المصروفات', '', reportData.totalExpense],
      [''],
      ['صافي الربح/الخسارة', '', reportData.netIncome]
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Income Statement");
    XLSX.writeFile(wb, `Income_Statement_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="text-emerald-600" />
            قائمة الدخل (الأرباح والخسائر)
          </h2>
          <p className="text-slate-500 text-sm">تقرير الأداء المالي عن الفترة المحددة</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors font-bold text-sm">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
            <Printer size={18} /> طباعة
          </button>
          <button onClick={exportToExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
            <Download size={18} /> تصدير Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
        <div className="w-full md:w-auto">
          <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div className="w-full md:w-auto">
          <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div className="flex items-center gap-2 pb-3">
          <input type="checkbox" id="showLogo" checked={showLogo} onChange={e => setShowLogo(e.target.checked)} className="w-4 h-4" />
          <label htmlFor="showLogo" className="text-sm font-bold text-slate-700 cursor-pointer">إظهار الشعار عند الطباعة</label>
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none" id="report-content">
        <ReportHeader title="قائمة الدخل" subtitle={`عن الفترة من ${startDate} إلى ${endDate}`} />

        {loading && (
            <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
        )}

        {!loading && (
        <div className="p-8">
          {/* Revenues */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-emerald-700 mb-4 border-b border-emerald-100 pb-2 flex items-center gap-2">
              <TrendingUp size={20} /> الإيرادات
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {reportData.revenues.map(r => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 text-slate-600 font-mono w-24">{r.code}</td>
                    <td className="py-2 text-slate-800">{r.name}</td>
                    <td className="py-2 text-right font-medium text-slate-700">{r.value.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="bg-emerald-50 font-bold text-emerald-800">
                  <td colSpan={2} className="py-3 px-2">إجمالي الإيرادات</td>
                  <td className="py-3 px-2 text-right">{reportData.totalRevenue.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Cost of Goods Sold (COGS) */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-amber-700 mb-4 border-b border-amber-100 pb-2 flex items-center gap-2">
              <TrendingDown size={20} /> تكلفة البضاعة المباعة
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {reportData.cogs.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 text-slate-600 font-mono w-24">{c.code}</td>
                    <td className="py-2 text-slate-800">{c.name}</td>
                    <td className="py-2 text-right font-medium text-slate-700">{c.value.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="bg-amber-50 font-bold text-amber-800">
                  <td colSpan={2} className="py-3 px-2">إجمالي تكلفة البضاعة</td>
                  <td className="py-3 px-2 text-right">{reportData.totalCogs.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Gross Profit */}
          <div className="mb-8 bg-blue-50 p-3 rounded-lg border border-blue-100 flex justify-between items-center font-bold text-blue-800">
              <span>مجمل الربح (Gross Profit)</span>
              <span className="text-xl">{reportData.grossProfit.toLocaleString()}</span>
          </div>

          {/* Operating Expenses */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-red-700 mb-4 border-b border-red-100 pb-2 flex items-center gap-2">
              <TrendingDown size={20} /> المصروفات التشغيلية
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {reportData.expenses.map(e => (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 text-slate-600 font-mono w-24">{e.code}</td>
                    <td className="py-2 text-slate-800">{e.name}</td>
                    <td className="py-2 text-right font-medium text-slate-700">{e.value.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="bg-red-50 font-bold text-red-800">
                  <td colSpan={2} className="py-3 px-2">إجمالي المصروفات</td>
                  <td className="py-3 px-2 text-right">{reportData.totalExpense.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net Income */}
          <div className={`mt-8 p-4 rounded-xl border-2 text-center ${reportData.netIncome >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            <h3 className="text-lg font-bold mb-1">صافي {reportData.netIncome >= 0 ? 'الربح' : 'الخسارة'}</h3>
            <p className="text-3xl font-black dir-ltr">{reportData.netIncome.toLocaleString()}</p>
          </div>
        </div>
        )}

        <div className="p-8 border-t border-slate-100 mt-8 hidden print:block">
            <div className="flex justify-between text-sm text-slate-500 pt-8">
                <div className="text-center w-1/3">
                    <p className="mb-8">المحاسب</p>
                    <div className="border-t border-slate-300 w-2/3 mx-auto"></div>
                </div>
                <div className="text-center w-1/3">
                    <p className="mb-8">المدير المالي</p>
                    <div className="border-t border-slate-300 w-2/3 mx-auto"></div>
                </div>
                <div className="text-center w-1/3">
                    <p className="mb-8">المدير العام</p>
                    <div className="border-t border-slate-300 w-2/3 mx-auto"></div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default IncomeStatement;