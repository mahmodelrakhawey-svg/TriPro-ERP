import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { FileText, Search, Printer, Loader2, Filter, Download, CircleDollarSign } from 'lucide-react';
import * as XLSX from 'xlsx';

const MultiCurrencyStatement = () => {
  const { accounts } = useAccounting();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState('ALL'); // 'ALL' or specific currency code like 'USD'
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);

  const currencies = [
    { code: 'SAR', label: 'ريال سعودي' },
    { code: 'USD', label: 'دولار أمريكي' },
    { code: 'EUR', label: 'يورو' },
    { code: 'EGP', label: 'جنيه مصري' },
  ];

  const fetchStatement = async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      // 1. جلب القيود للحساب المختار
      let query = supabase
        .from('journal_lines')
        .select(`
            id, debit, credit, description, 
            journal_entry:journal_entries!inner(transaction_date, reference, description, status)
        `)
        .eq('account_id', selectedAccountId)
        .eq('journal_entry.status', 'posted')
        .order('journal_entry(transaction_date)', { ascending: true });

      // ملاحظة: حالياً جدول journal_lines لا يحتوي على حقل العملة بشكل مباشر، 
      // العملة موجودة في الفواتير والسندات المرتبطة بالقيد.
      // لدعم الفلترة بالعملة بدقة، يجب أن يكون حقل العملة موجوداً في journal_entries أو journal_lines.
      // سنفترض هنا أننا نعرض جميع الحركات بالعملة المحلية (Base Currency) كما هي مسجلة في القيود.
      // إذا أردنا عرض العملة الأصلية، نحتاج لربط القيد بالمستند الأصلي (فاتورة/سند) وجلب العملة منه.
      
      // للتبسيط في هذه المرحلة، سنعرض القيم المسجلة في القيود (وهي بالعملة المحلية بعد التحويل).
      
      const { data, error } = await query;
      if (error) throw error;

      // معالجة البيانات وحساب الرصيد الافتراضي
      let openBal = 0;
      const periodEntries: any[] = [];

      // تحديد طبيعة الحساب (مدين/دائن)
      const account = accounts.find(a => a.id === selectedAccountId);
      const type = String(account?.type || '').toLowerCase();
      const isDebitNature = ['asset', 'expense', 'أصول', 'مصروفات'].some(t => type.includes(t));

      data?.forEach((line: any) => {
          const date = line.journal_entry.transaction_date;
          const debit = Number(line.debit);
          const credit = Number(line.credit);
          
          if (date < startDate) {
              if (isDebitNature) openBal += (debit - credit);
              else openBal += (credit - debit);
          } else if (date <= endDate) {
              periodEntries.push({
                  date: date,
                  reference: line.journal_entry.reference,
                  description: line.description || line.journal_entry.description,
                  debit: debit,
                  credit: credit
              });
          }
      });

      setOpeningBalance(openBal);

      // حساب الرصيد التراكمي
      let runningBalance = openBal;
      const finalEntries = periodEntries.map(entry => {
          if (isDebitNature) runningBalance += (entry.debit - entry.credit);
          else runningBalance += (entry.credit - entry.debit);
          
          return { ...entry, balance: runningBalance };
      });

      setEntries(finalEntries);

    } catch (error: any) {
      console.error(error);
      alert('حدث خطأ: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const accountName = accounts.find(a => a.id === selectedAccountId)?.name || 'Account';
    const data = [
        ['كشف حساب تفصيلي'],
        ['الحساب:', accountName],
        ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
        [],
        ['التاريخ', 'المرجع', 'البيان', 'مدين', 'دائن', 'الرصيد'],
        ['-', '-', 'الرصيد الافتراضي', '-', '-', openingBalance],
        ...entries.map(e => [
            e.date,
            e.reference,
            e.description,
            e.debit,
            e.credit,
            e.balance
        ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `Statement_${accountName}_${startDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-blue-600" /> كشف حساب (متعدد العملات)
            </h2>
            <p className="text-slate-500">استعراض حركة الحسابات والأرصدة</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={entries.length === 0} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm disabled:opacity-50">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 no-print">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">الحساب</label>
                <select 
                    value={selectedAccountId} 
                    onChange={e => setSelectedAccountId(e.target.value)} 
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 bg-white"
                >
                    <option value="">اختر الحساب...</option>
                    {accounts.filter(a => !a.isGroup).map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                    ))}
                </select>
            </div>
            <div><label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" /></div>
            <div><label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" /></div>
        </div>
        
        {/* Currency Filter (Visual only for now as data is base currency) */}
        <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                <CircleDollarSign size={16} className="text-slate-500" />
                <span className="text-sm font-bold text-slate-600">عرض القيم بـ:</span>
                <select value={currency} onChange={e => setCurrency(e.target.value)} className="bg-transparent outline-none text-sm font-bold text-blue-600">
                    <option value="ALL">العملة المحلية (الأساسية)</option>
                    {/* Future: Add logic to filter by original currency if stored */}
                </select>
            </div>
            <button onClick={fetchStatement} disabled={loading || !selectedAccountId} className="flex-1 md:flex-none bg-blue-600 text-white px-8 py-2.5 rounded-lg hover:bg-blue-700 font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />} عرض الكشف
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">المرجع</th>
                    <th className="p-4 w-1/3">البيان</th>
                    <th className="p-4 text-center">مدين</th>
                    <th className="p-4 text-center">دائن</th>
                    <th className="p-4 text-center">الرصيد</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                <tr className="bg-blue-50/50 font-bold text-slate-700">
                    <td className="p-4 text-center">-</td><td className="p-4 text-center">-</td><td className="p-4">الرصيد الافتراضي</td><td className="p-4 text-center">-</td><td className="p-4 text-center">-</td><td className="p-4 text-center font-mono" dir="ltr">{openingBalance.toLocaleString()}</td>
                </tr>
                {entries.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 whitespace-nowrap">{entry.date}</td>
                        <td className="p-4 font-mono text-slate-500">{entry.reference || '-'}</td>
                        <td className="p-4 text-slate-700">{entry.description}</td>
                        <td className="p-4 text-center font-mono text-slate-600">{entry.debit > 0 ? entry.debit.toLocaleString() : '-'}</td>
                        <td className="p-4 text-center font-mono text-slate-600">{entry.credit > 0 ? entry.credit.toLocaleString() : '-'}</td>
                        <td className="p-4 text-center font-mono font-bold text-slate-800" dir="ltr">{entry.balance.toLocaleString()}</td>
                    </tr>
                ))}
                {entries.length === 0 && !loading && (<tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد حركات خلال هذه الفترة</td></tr>)}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default MultiCurrencyStatement;