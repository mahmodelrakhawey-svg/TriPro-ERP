import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { FileText, Search, Download, Filter, Printer, Loader2, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ReportHeader from '../../components/ReportHeader';

const TrialBalanceAdvanced = () => {
  const { accounts, settings, refreshData, currentUser } = useAccounting();
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [hideZeroAccounts, setHideZeroAccounts] = useState(true);
  const [showOpeningOnly, setShowOpeningOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);

  // دالة لجلب جميع الحركات من قاعدة البيانات لضمان الدقة
  const fetchLedgerData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setLedgerLines([]);
        setLoading(false);
        return;
    }

    try {
      const { data, error } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', endDate);

      if (error) throw error;
      setLedgerLines(data || []);
    } catch (err: any) {
      console.error('Error fetching ledger:', err);
      alert('فشل جلب البيانات: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await refreshData(); // تحديث دليل الحسابات (لإظهار الدمج)
    await fetchLedgerData(); // تحديث الأرصدة
    setLoading(false);
  };

  useEffect(() => {
    fetchLedgerData();
  }, [endDate]); // إعادة الجلب عند تغيير تاريخ النهاية

  // حساب الأرصدة
  const reportData = useMemo(() => {
    // 1. تهيئة هيكل البيانات لتجميع الأرصدة
    const accStats: Record<string, { open: number, transDr: number, transCr: number }> = {};
    
    // استخدام Map لسهولة الوصول ولإضافة الحسابات المفقودة
    const allAccountsMap = new Map<string, any>();
    accounts.forEach(a => {
        accStats[a.id] = { open: 0, transDr: 0, transCr: 0 };
        allAccountsMap.set(a.id, a);
    });

    // 2. تجميع البيانات من الخطوط المجلوبة من قاعدة البيانات
    ledgerLines.forEach(line => {
      // إذا كان الحساب غير موجود في القائمة (محذوف)، نضيفه مؤقتاً للعرض
      if (!accStats[line.account_id]) {
          accStats[line.account_id] = { open: 0, transDr: 0, transCr: 0 };
          allAccountsMap.set(line.account_id, {
              id: line.account_id,
              code: 'UNKNOWN',
              name: 'حساب محذوف/غير معروف',
              isGroup: false
          });
      }

      const date = line.journal_entries.transaction_date;
      const isBefore = date < startDate;
      const isWithin = date >= startDate && date <= endDate;

      if (isBefore) {
          // الرصيد الافتتاحي: المدين موجب والدائن سالب
          accStats[line.account_id].open += (line.debit - line.credit);
      } else if (isWithin) {
          // حركات الفترة
          accStats[line.account_id].transDr += line.debit;
          accStats[line.account_id].transCr += line.credit;
      }
    });

    // 3. دالة تجميعية للحسابات الرئيسية (Recursive)
    const getAccountStats = (accountId: string): { open: number, transDr: number, transCr: number } => {
        const acc = allAccountsMap.get(accountId);
        if (!acc) return { open: 0, transDr: 0, transCr: 0 };

        // إذا كان حساب فرعي، نرجع قيمه المجمعة سابقاً
        if (!acc.isGroup) {
            return accStats[accountId] || { open: 0, transDr: 0, transCr: 0 };
        }

        // إذا كان حساب رئيسي، نجمع أبناءه
        const children = Array.from(allAccountsMap.values()).filter((a: any) => a.parentAccount === accountId);
        let total = { open: 0, transDr: 0, transCr: 0 };
        
        children.forEach(child => {
            const childStats = getAccountStats(child.id);
            total.open += childStats.open;
            total.transDr += childStats.transDr;
            total.transCr += childStats.transCr;
        });
        
        return total;
    };

    // 4. بناء القائمة النهائية
    let result = Array.from(allAccountsMap.values()).map((acc: any) => {
        const stats = getAccountStats(acc.id);
        return {
            ...acc,
            openBalance: stats.open,
            periodDebit: stats.transDr,
            periodCredit: stats.transCr,
            closeBalance: stats.open + stats.transDr - stats.transCr
        };
    });

    // 5. التصفية والترتيب
    if (hideZeroAccounts) {
        result = result.filter(a => 
            Math.abs(a.openBalance) > 0.01 || 
            a.periodDebit > 0.01 || 
            a.periodCredit > 0.01 ||
            Math.abs(a.closeBalance) > 0.01
        );
    }

    if (searchTerm) {
        result = result.filter(a => 
            a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            a.code.includes(searchTerm)
        );
    }

    return result.sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts, ledgerLines, startDate, endDate, hideZeroAccounts, searchTerm, showOpeningOnly]);

  // حساب الإجماليات
  const totals = useMemo(() => {
    // حساب الإجماليات من البيانات الخام مباشرة لضمان الدقة وتجنب مشاكل الهيكلية
    const rawTotals = { openDr: 0, openCr: 0, transDr: 0, transCr: 0, closeDr: 0, closeCr: 0 };
    
    // نعيد حساب الأرصدة الخام من ledgerLines والحسابات
    // ملاحظة: نستخدم ledgerLines التي تم جلبها بالفعل
    const accStats: Record<string, { open: number, transDr: number, transCr: number }> = {};
    ledgerLines.forEach(line => {
        if (!accStats[line.account_id]) accStats[line.account_id] = { open: 0, transDr: 0, transCr: 0 };
        const date = line.journal_entries.transaction_date;
        if (date < startDate) {
            accStats[line.account_id].open += (line.debit - line.credit);
        } else if (date >= startDate && date <= endDate) {
            accStats[line.account_id].transDr += line.debit;
            accStats[line.account_id].transCr += line.credit;
        }
    });

    Object.values(accStats).forEach(stat => {
        rawTotals.openDr += stat.open > 0 ? stat.open : 0;
        rawTotals.openCr += stat.open < 0 ? Math.abs(stat.open) : 0;
        rawTotals.transDr += stat.transDr;
        rawTotals.transCr += stat.transCr;
        const close = stat.open + stat.transDr - stat.transCr;
        rawTotals.closeDr += close > 0 ? close : 0;
        rawTotals.closeCr += close < 0 ? Math.abs(close) : 0;
    });

    return rawTotals;
  }, [ledgerLines, startDate, endDate]);

  // التحقق من التوازن
  const isBalanced = 
      Math.abs(totals.openDr - totals.openCr) < 0.1 &&
      Math.abs(totals.transDr - totals.transCr) < 0.1 &&
      Math.abs(totals.closeDr - totals.closeCr) < 0.1;

  const exportToExcel = () => {
    const data = reportData.map(r => ({
      'الكود': r.code,
      'الحساب': r.name,
      'رصيد أول (مدين)': r.openBalance > 0 ? r.openBalance : 0,
      'رصيد أول (دائن)': r.openBalance < 0 ? Math.abs(r.openBalance) : 0,
      'حركة (مدين)': r.periodDebit,
      'حركة (دائن)': r.periodCredit,
      'رصيد آخر (مدين)': r.closeBalance > 0 ? r.closeBalance : 0,
      'رصيد آخر (دائن)': r.closeBalance < 0 ? Math.abs(r.closeBalance) : 0,
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ميزان المراجعة");
    XLSX.writeFile(wb, "TrialBalance_Advanced.xlsx");
  };

  const exportToPDF = () => {
    const input = document.getElementById('report-content');
    if (!input) return;

    html2canvas(input, { scale: 2 }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4'); // l = landscape (عرضي)
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save("TrialBalance.pdf");
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-blue-600" /> ميزان المراجعة (بالأرصدة والمجاميع)
            </h2>
            <p className="text-slate-500 text-sm">تقرير تفصيلي للأرصدة الافتتاحية والحركات والأرصدة الختامية</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-bold text-sm">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> تحديث
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors">
                <Printer size={18} /> طباعة
            </button>
            <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                <Download size={18} /> تصدير Excel
            </button>
            <button onClick={exportToPDF} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                <FileText size={18} /> PDF
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
          <div className="w-full md:w-auto">
              <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div className="w-full md:w-auto">
              <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-bold text-slate-700 mb-1">بحث</label>
              <div className="relative">
                  <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="بحث باسم الحساب أو الكود..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
              </div>
          </div>
          <div className="flex items-center gap-2 pb-2">
              <input type="checkbox" id="hideZero" checked={hideZeroAccounts} onChange={e => setHideZeroAccounts(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="hideZero" className="text-sm font-bold text-slate-700 cursor-pointer">إخفاء الحسابات الصفرية</label>
          </div>
          <div className="flex items-center gap-2 pb-2">
              <input type="checkbox" id="showOpening" checked={showOpeningOnly} onChange={e => setShowOpeningOnly(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="showOpening" className="text-sm font-bold text-slate-700 cursor-pointer">عرض الأرصدة الافتتاحية فقط</label>
          </div>
      </div>

      {/* مؤشر التوازن */}
      {!loading && (
        <div className={`p-4 rounded-xl border flex items-center justify-between ${isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            <div className="flex items-center gap-3 font-bold">
                {isBalanced ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                <span>{isBalanced ? 'الميزان متزن تماماً (الأرصدة والمجاميع مطابقة)' : 'تنبيه: الميزان غير متزن! يرجى مراجعة القيود.'}</span>
            </div>
            {!isBalanced && <span className="font-mono font-bold" dir="ltr">الفرق: {Math.abs(totals.closeDr - totals.closeCr).toFixed(2)}</span>}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <ReportHeader title="ميزان المراجعة" subtitle={`من ${startDate} إلى ${endDate}`} />
        <div className="overflow-x-auto" id="report-content">
            <table className="w-full text-right text-sm border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b-2 border-slate-200">
                    <tr>
                        <th rowSpan={2} className="p-3 border-l border-slate-200 w-24">الكود</th>
                        <th rowSpan={2} className="p-3 border-l border-slate-200 min-w-[200px]">اسم الحساب</th>
                        <th colSpan={2} className="p-2 border-l border-slate-200 text-center bg-blue-50">رصيد أول المدة</th>
                        {!showOpeningOnly && <th colSpan={2} className="p-2 border-l border-slate-200 text-center bg-amber-50">الحركة خلال الفترة</th>}
                        {!showOpeningOnly && <th colSpan={2} className="p-2 text-center bg-emerald-50">رصيد آخر المدة</th>}
                    </tr>
                    <tr className="text-xs">
                        <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-blue-50/50">مدين</th>
                        <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-blue-50/50">دائن</th>
                        {!showOpeningOnly && (
                            <>
                                <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-amber-50/50">مدين</th>
                                <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-amber-50/50">دائن</th>
                                <th className="p-2 border-l border-slate-200 border-t border-slate-200 bg-emerald-50/50">مدين</th>
                                <th className="p-2 border-t border-slate-200 bg-emerald-50/50">دائن</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {reportData.map((row) => (
                        <tr key={row.id} className={`hover:bg-slate-50 ${row.isGroup ? 'bg-slate-50 font-bold text-slate-800' : 'text-slate-600'}`}>
                            <td className="p-2 border-l border-slate-100 font-mono">{row.code}</td>
                            <td className="p-2 border-l border-slate-100">{row.name}</td>
                            
                            <td className="p-2 border-l border-slate-100 text-blue-700">{row.openBalance > 0 ? row.openBalance.toLocaleString() : '-'}</td>
                            <td className="p-2 border-l border-slate-100 text-blue-700">{row.openBalance < 0 ? Math.abs(row.openBalance).toLocaleString() : '-'}</td>
                            
                            {!showOpeningOnly && (
                                <>
                                    <td className="p-2 border-l border-slate-100 text-amber-700">{row.periodDebit > 0 ? row.periodDebit.toLocaleString() : '-'}</td>
                                    <td className="p-2 border-l border-slate-100 text-amber-700">{row.periodCredit > 0 ? row.periodCredit.toLocaleString() : '-'}</td>
                                    
                                    <td className="p-2 border-l border-slate-100 text-emerald-700 font-bold">{row.closeBalance > 0 ? row.closeBalance.toLocaleString() : '-'}</td>
                                    <td className="p-2 text-emerald-700 font-bold">{row.closeBalance < 0 ? Math.abs(row.closeBalance).toLocaleString() : '-'}</td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    {loading && (
                        <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /> جاري حساب الأرصدة...</td></tr>
                    )}
                    {!loading && (
                    <tr>
                        <td colSpan={2} className="p-3 text-center border-l border-slate-300">الإجمالي الكلي</td>
                        <td className="p-3 border-l border-slate-300 text-blue-800">{totals.openDr.toLocaleString()}</td>
                        <td className="p-3 border-l border-slate-300 text-blue-800">{totals.openCr.toLocaleString()}</td>
                        {!showOpeningOnly && (
                            <>
                                <td className="p-3 border-l border-slate-300 text-amber-800">{totals.transDr.toLocaleString()}</td>
                                <td className="p-3 border-l border-slate-300 text-amber-800">{totals.transCr.toLocaleString()}</td>
                                <td className="p-3 border-l border-slate-300 text-emerald-800">{totals.closeDr.toLocaleString()}</td>
                                <td className="p-3 text-emerald-800">{totals.closeCr.toLocaleString()}</td>
                            </>
                        )}
                    </tr>
                    )}
                </tfoot>
            </table>
        </div>
      </div>
    </div>
  );
};

export default TrialBalanceAdvanced;
