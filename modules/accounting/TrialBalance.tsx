import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext'; // Import context
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Scale, Filter, Printer, Loader2, Search, Download, RefreshCw } from 'lucide-react';
import ReportHeader from '../../components/ReportHeader';

type Account = {
  id: string;
  code: string;
  name: string;
};

type TrialBalanceRow = {
  account: Account;
  netDebit: number;
  netCredit: number;
};

const TrialBalance = () => {
  const { accounts, refreshData, currentUser } = useAccounting(); // Use accounts from context
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setLoading(false);
        return;
    }

    try {
        await refreshData(); // تحديث الحسابات
        const { data, error } = await supabase
            .from('journal_lines')
            .select('account_id, debit, credit, journal_entries!inner(status, transaction_date)')
            .eq('journal_entries.status', 'posted')
            .lte('journal_entries.transaction_date', asOfDate);
        
        if (error) throw error;
        setLedgerLines(data || []);
    } catch (err: any) {
        console.error(err);
        alert('فشل جلب البيانات: ' + err.message);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [asOfDate]);

  // إعادة حساب الصفوف عند تغير الحسابات في السياق
  const rows = useMemo<TrialBalanceRow[]>(() => {
    if (currentUser?.role === 'demo') {
        return accounts
          .filter(acc => !acc.isGroup)
          .map(acc => {
            const balance = acc.balance || 0;
            if (Math.abs(balance) < 0.01) return null;

            const type = String(acc.type || '').toLowerCase();
            const isDebitNature = type.includes('asset') || type.includes('expense') || type.includes('أصول') || type.includes('مصروفات') || type.includes('تكلفة');
            
            let netDebit = 0;
            let netCredit = 0;

            if (isDebitNature) {
                if (balance >= 0) netDebit = balance;
                else netCredit = -balance;
            } else {
                if (balance >= 0) netCredit = balance;
                else netDebit = -balance;
            }
            
            return { account: acc, netDebit, netCredit };
          }).filter(Boolean) as TrialBalanceRow[];
    }

    const balances: Record<string, number> = {};
    ledgerLines.forEach(l => {
        if (!balances[l.account_id]) balances[l.account_id] = 0;
        balances[l.account_id] += (l.debit - l.credit);
    });

    return accounts
      .filter(acc => !acc.isGroup)
      .map(acc => {
        const balance = balances[acc.id] || 0;
        if (Math.abs(balance) < 0.01) return null;

        const type = String(acc.type || '').toLowerCase();
        const isDebitNature = type.includes('asset') || type.includes('expense') || type.includes('أصول') || type.includes('مصروفات');
        
        return {
          account: acc,
          netDebit: isDebitNature ? balance : 0,
          netCredit: !isDebitNature ? -balance : 0,
        };
      })
      .filter(Boolean) as TrialBalanceRow[];
  }, [accounts, ledgerLines, currentUser]);

  const filteredRows = rows.filter(row => 
    row.account.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.account.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDebit = filteredRows.reduce((sum, r) => sum + r.netDebit, 0);
  const totalCredit = filteredRows.reduce((sum, r) => sum + r.netCredit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleExportExcel = () => {
    const headers = ['رقم الحساب', 'اسم الحساب', 'أرصدة مدينة', 'أرصدة دائنة'];
    
    const csvRows = filteredRows.map(row => [
      row.account.code,
      `"${row.account.name}"`, // وضع علامات تنصيص للاسم لتجنب مشاكل الفواصل
      row.netDebit.toFixed(2),
      row.netCredit.toFixed(2)
    ]);

    // إضافة سطر الإجمالي
    csvRows.push(['', 'الإجمالي', totalDebit.toFixed(2), totalCredit.toFixed(2)]);

    const csvContent = [
      headers.join(','),
      ...csvRows.map(r => r.join(','))
    ].join('\n');

    // إضافة BOM لضمان ظهور اللغة العربية بشكل صحيح في Excel
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trial_balance_${asOfDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRowClick = (accountId: string) => {
    navigate('/ledger', { 
      state: { 
        accountId, 
        endDate: asOfDate,
        startDate: `${new Date(asOfDate).getFullYear()}-01-01` // افتراض بداية السنة
      } 
    });
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[80vh]">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4 no-print">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Scale className="text-blue-600" />
          ميزان المراجعة
        </h1>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-200 font-bold text-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="flex items-end gap-4 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200 no-print">
        <div className="flex-1">
            <label className="block text-sm font-bold text-slate-700 mb-1">حتى تاريخ</label>
            <input 
                type="date" 
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
        </div>
        <div className="flex-1">
            <label className="block text-sm font-bold text-slate-700 mb-1">بحث في الحسابات</label>
            <div className="relative">
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="رقم الحساب أو الاسم..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pl-10 focus:outline-none focus:border-blue-500"
                />
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            </div>
        </div>
        <button 
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-bold shadow-md disabled:opacity-50"
        >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw size={18} />}
            تحديث
        </button>
      </div>

      {/* ترويسة التقرير للطباعة */}
      <ReportHeader title="ميزان المراجعة بالأرصدة" subtitle={`حتى تاريخ ${asOfDate}`} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right border-collapse">
            <thead className="bg-slate-100 text-slate-600 font-bold">
                <tr>
                    <th className="p-3 border border-slate-200">رقم الحساب</th>
                    <th className="p-3 border border-slate-200">اسم الحساب</th>
                    <th className="p-3 border border-slate-200 text-center">أرصدة مدينة</th>
                    <th className="p-3 border border-slate-200 text-center">أرصدة دائنة</th>
                </tr>
            </thead>
            <tbody>
                {filteredRows.map((row) => (
                    <tr 
                        key={row.account.id} 
                        className="hover:bg-blue-50 cursor-pointer transition-colors group"
                        onClick={() => handleRowClick(row.account.id)}
                        title="اضغط لعرض التفاصيل في دفتر الأستاذ"
                    >
                        <td className="p-3 border border-slate-200 font-mono">{row.account.code}</td>
                        <td className="p-3 border border-slate-200 font-medium text-slate-700 group-hover:text-blue-700">{row.account.name}</td>
                        <td className="p-3 border border-slate-200 text-center font-mono text-emerald-700">
                            {row.netDebit > 0 ? row.netDebit.toFixed(2) : '-'}
                        </td>
                        <td className="p-3 border border-slate-200 text-center font-mono text-red-700">
                            {row.netCredit > 0 ? row.netCredit.toFixed(2) : '-'}
                        </td>
                    </tr>
                ))}
                
                {/* الإجماليات */}
                <tr className={`font-bold text-lg ${isBalanced ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <td className="p-3 border border-slate-200" colSpan={2}>الإجمالي</td>
                    <td className="p-3 border border-slate-200 text-center text-emerald-800">
                        {totalDebit.toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200 text-center text-red-800">
                        {totalCredit.toFixed(2)}
                    </td>
                </tr>
            </tbody>
        </table>

        {!isBalanced && !loading && (
            <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg border border-red-200 text-center font-bold">
                تنبيه: الميزان غير متزن! الفرق: {Math.abs(totalDebit - totalCredit).toFixed(2)}
            </div>
        )}
        {isBalanced && !loading && filteredRows.length > 0 && (
            <div className="mt-4 p-4 bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 text-center font-bold">
                الميزان متزن تماماً ✅
            </div>
        )}
      </div>
    </div>
  );
};

export default TrialBalance;
