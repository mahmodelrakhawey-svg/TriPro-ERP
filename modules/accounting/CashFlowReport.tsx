import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import { useAccounting } from '../../context/AccountingContext';
import { Wallet, Calendar, Download, Printer, Loader2, Filter, ArrowUpCircle, ArrowDownCircle, AlertTriangle } from 'lucide-react';
import ReportHeader from '../../components/ReportHeader';
import * as XLSX from 'xlsx';

type Transaction = {
  id: string;
  date: string;
  description: string;
  reference: string;
  accountName: string;
  debit: number; // In
  credit: number; // Out
  balance: number;
};

export default function CashFlowReport() {
  const { accounts, currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState<number>(0);

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  const cashAccounts = useMemo(() => {
    return (accounts || []).filter(acc => 
      !(acc.isGroup || acc.is_group) &&
      (String(acc.type).toLowerCase() === 'asset') &&
      (acc.code?.startsWith('123') || acc.name?.includes('صندوق') || acc.name?.includes('بنك') || acc.name?.includes('نقد') || acc.name?.includes('خزينة'))
    );
  }, [accounts]);

  const fetchCashFlow = useCallback(async () => {
    if (currentUser?.role === 'demo') {
      const demoList = [
        { id: 'd1', date: new Date().toISOString().split('T')[0], reference: 'OP-DEMO', description: 'رصيد افتتاحي', accountName: 'الصندوق الرئيسي', debit: 15000, credit: 0, balance: 15000 },
        { id: 'd2', date: new Date().toISOString().split('T')[0], reference: 'INV-DEMO-1', description: 'تحصيل فاتورة مبيعات', accountName: 'الصندوق الرئيسي', debit: 5000, credit: 0, balance: 20000 },
        { id: 'd3', date: new Date().toISOString().split('T')[0], reference: 'EXP-DEMO-1', description: 'مصروفات تشغيلية', accountName: 'الصندوق الرئيسي', debit: 0, credit: 1200, balance: 18800 },
      ];
      setOpeningBalance(0);
      setTransactions(demoList);
      return;
    }

    const accountIds = selectedAccount === 'all' 
      ? cashAccounts.map(a => a.id)
      : [selectedAccount];

    if (accountIds.length === 0) {
      if (selectedAccount === 'all' && cashAccounts.length === 0 && (accounts || []).length > 0) {
        setErrorMsg('لم يتم العثور على حسابات نقدية في دليل الحسابات.');
      }
      setTransactions([]);
      setOpeningBalance(0);
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      // 🚀 جلب مباشر من قاعدة البيانات عبر chunking لمنع اقتطاع القيود (تجاوز حد الـ 1000 قيد)
      let allLines: Record<string, any>[] = [];
      let from = 0;
      const CHUNK_SIZE = 1000;
      const userOrgId = currentUser?.organization_id;

      while (true) {
        let query = supabase
          .from('journal_lines')
          .select(`
            id, debit, credit, description, account_id,
            journal_entries!inner(id, transaction_date, reference, description, status, organization_id)
          `)
          .in('account_id', accountIds)
          .eq('journal_entries.status', 'posted')
          .lte('journal_entries.transaction_date', endDate);

        if (userOrgId) {
          query = query.eq('journal_entries.organization_id', userOrgId);
        }

        const { data: chunk, error: chunkErr } = await query
          .range(from, from + CHUNK_SIZE - 1);

        if (chunkErr) throw chunkErr;
        if (!chunk || chunk.length === 0) break;

        allLines = allLines.concat(chunk);
        if (chunk.length < CHUNK_SIZE) break;
        from += CHUNK_SIZE;
      }

      // حساب الرصيد الافتتاحي وفرز حركات الفترة
      let openBal = 0;
      const periodTransactions: Transaction[] = [];

      allLines.forEach((line: Record<string, any>) => {
        const rawJe = line.journal_entries || line.journal_entry;
        const je = Array.isArray(rawJe) ? rawJe[0] : rawJe;
        if (!je) return;

        const entryDate = (je.transaction_date || '').split('T')[0];
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;

        if (entryDate < startDate) {
          openBal += (debit - credit);
        } else if (entryDate <= endDate) {
          const acc = accounts.find(a => a.id === line.account_id);
          periodTransactions.push({
            id: line.id,
            date: entryDate,
            reference: je.reference || '',
            description: line.description || je.description || '',
            accountName: acc ? acc.name : 'حساب نقدية',
            debit: debit,
            credit: credit,
            balance: 0
          });
        }
      });

      // فرز زمني تصاعدي دقيق للحركات
      periodTransactions.sort((a, b) => {
        const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (timeDiff !== 0) return timeDiff;
        return (a.reference || '').localeCompare(b.reference || '');
      });

      // احتساب الرصيد التراكمي خطوة بخطوة
      let runningBalance = openBal;
      const finalTransactions = periodTransactions.map(t => {
        runningBalance += (t.debit - t.credit);
        return { ...t, balance: runningBalance };
      });

      setOpeningBalance(openBal);
      setTransactions(finalTransactions);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Error fetching cash flow report:', error);
      setErrorMsg('فشل جلب بيانات حركة الصندوق: ' + (error?.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedAccount, cashAccounts, accounts, endDate, startDate]);

  // التحديث التلقائي عند تغيير الحساب أو التواريخ أو انتهاء تحميل الحسابات
  useEffect(() => {
    if (cashAccounts.length > 0 || selectedAccount !== 'all') {
      fetchCashFlow();
    }
  }, [fetchCashFlow, cashAccounts.length, selectedAccount]);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const data = [
      ['تقرير حركة الصندوق والبنوك'],
      [`الفترة من: ${startDate} إلى: ${endDate}`],
      [`الرصيد الافتتاحي: ${openingBalance.toLocaleString()}`],
      [''],
      ['التاريخ', 'المرجع', 'الحساب', 'البيان', 'وارد (مدين)', 'صادر (دائن)', 'الرصيد'],
      ...transactions.map(t => [
        t.date, 
        t.reference, 
        t.accountName, 
        t.description, 
        t.debit, 
        t.credit, 
        t.balance
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Cash Flow");
    XLSX.writeFile(wb, `CashFlow_${startDate}_${endDate}.xlsx`);
  };

  const totalIn = transactions.reduce((sum, t) => sum + t.debit, 0);
  const totalOut = transactions.reduce((sum, t) => sum + t.credit, 0);
  const closingBalance = openingBalance + totalIn - totalOut;

  return (
    <div className="max-w-6xl mx-auto p-6 animate-in fade-in space-y-6 print:p-0">
      
      {/* Header for Printing */}
      <ReportHeader title="تقرير حركة الصندوق والبنوك" subtitle={`عن الفترة من ${startDate} إلى ${endDate}`} />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="text-emerald-600" /> حركة الصندوق والبنوك
          </h1>
          <p className="text-slate-500">مراقبة التدفقات النقدية الواردة والصادرة</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm">
            <Download size={16} /> تصدير Excel
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-md shadow-sm flex items-center gap-3">
          <AlertTriangle className="text-red-500" />
          <p className="text-red-700 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* رسالة في حال عدم وجود بيانات */}
      {!loading && transactions.length === 0 && !errorMsg && (
        <div className="bg-blue-50 border-r-4 border-blue-500 p-6 rounded-md shadow-sm text-center">
          <p className="text-blue-800 font-bold">لا توجد حركات نقدية في الفترة المحددة.</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 no-print">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">الحساب</label>
            <select 
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">-- جميع حسابات النقدية --</option>
              {cashAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
            <div className="relative">
              <Calendar className="absolute top-2.5 right-3 text-slate-400" size={16} />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <div className="relative">
              <Calendar className="absolute top-2.5 right-3 text-slate-400" size={16} />
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <button 
            onClick={fetchCashFlow}
            disabled={loading}
            className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 font-bold shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Filter size={18} />}
            عرض التقرير
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-sm font-bold text-slate-500 mb-1">الرصيد الافتتاحي</p>
          <h3 className="text-xl font-black text-slate-700">{openingBalance.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-1"><ArrowUpCircle size={14} className="text-emerald-500"/> إجمالي الوارد</p>
          <h3 className="text-xl font-black text-emerald-600">{totalIn.toLocaleString()}</h3>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-1"><ArrowDownCircle size={14} className="text-red-500"/> إجمالي الصادر</p>
          <h3 className="text-xl font-black text-red-600">{totalOut.toLocaleString()}</h3>
        </div>
        <div className="bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-700">
          <p className="text-sm font-bold text-slate-400 mb-1">رصيد الإغلاق</p>
          <h3 className="text-xl font-black text-white">{closingBalance.toLocaleString()}</h3>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
            <tr>
              <th className="p-4">التاريخ</th>
              <th className="p-4">المرجع</th>
              <th className="p-4">الحساب</th>
              <th className="p-4">البيان</th>
              <th className="p-4 text-emerald-700">وارد (مدين)</th>
              <th className="p-4 text-red-700">صادر (دائن)</th>
              <th className="p-4">الرصيد</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 whitespace-nowrap">{t.date}</td>
                <td className="p-4 font-mono text-xs bg-slate-50 rounded w-fit">{t.reference}</td>
                <td className="p-4 text-slate-600">{t.accountName}</td>
                <td className="p-4 text-slate-800 max-w-xs truncate" title={t.description}>{t.description}</td>
                <td className="p-4 font-bold text-emerald-600">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                <td className="p-4 font-bold text-red-600">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
                <td className="p-4 font-black text-slate-800 dir-ltr text-left">{t.balance.toLocaleString()}</td>
              </tr>
            ))}
            {transactions.length === 0 && !loading && !errorMsg && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد حركات خلال هذه الفترة</td></tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin text-emerald-600" size={20} />
                    <span>جاري تحميل حركات الصندوق بدقة من الخادم...</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}