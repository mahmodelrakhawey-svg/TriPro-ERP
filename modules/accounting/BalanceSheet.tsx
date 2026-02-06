import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToastNotification } from '../../utils/toastUtils';
import { Landmark, Filter, Printer, Loader2, AlertTriangle, CheckCircle, Download, Search, RefreshCw } from 'lucide-react';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type BalanceRow = {
  account: Account;
  amount: number;
};

const BalanceSheet = () => {
  const { accounts, currentUser } = useAccounting();
  const toast = useToastNotification();
  const [loading, setLoading] = useState(false);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [ledgerLines, setLedgerLines] = useState<any[]>([]);

  // دالة لجلب الأرصدة التراكمية من قاعدة البيانات مباشرة
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(transaction_date, status)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.transaction_date', asOfDate);

      if (error) throw error;
      setLedgerLines(data || []);
    } catch (err: any) {
      console.error('Error fetching balance sheet data:', err);
      toast.error('فشل جلب البيانات: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role !== 'demo') {
      fetchData();
    } else {
      setLoading(false); // Demo data is already in context
    }
  }, [asOfDate, currentUser]);

  const { assetRows, liabilityRows, equityRows, netIncome } = useMemo(() => {
    if (currentUser?.role === 'demo') {
        const assets: BalanceRow[] = [];
        const liabilities: BalanceRow[] = [];
        const equity: BalanceRow[] = [];
        let currentNetIncome = 0;

        accounts.forEach(acc => {
            if (acc.isGroup || Math.abs(acc.balance || 0) < 0.01) return;

            const type = (acc.type || '').toLowerCase().trim();
            const balance = acc.balance || 0;

            if (type.includes('asset') || type.includes('أصول')) {
                assets.push({ account: acc, amount: balance });
            } else if (type.includes('liability') || type.includes('خصوم')) {
                liabilities.push({ account: acc, amount: -balance });
            } else if (type.includes('equity') || type.includes('ملكية')) {
                equity.push({ account: acc, amount: -balance });
            } else if (type.includes('revenue') || type.includes('إيراد')) {
                currentNetIncome += -balance;
            } else if (type.includes('expense') || type.includes('مصروف')) {
                currentNetIncome -= balance;
            }
        });
        return { assetRows: assets, liabilityRows: liabilities, equityRows: equity, netIncome: currentNetIncome };
    }

    // Logic for real users
    const accountBalances: Record<string, number> = {};
    ledgerLines.forEach(line => {
      if (!accountBalances[line.account_id]) accountBalances[line.account_id] = 0;
      accountBalances[line.account_id] += (line.debit - line.credit);
    });

    const assets: BalanceRow[] = [];
    const liabilities: BalanceRow[] = [];
    const equity: BalanceRow[] = [];
    let pnlSum = 0;

    accounts.forEach(acc => {
      if (acc.isGroup || !accountBalances[acc.id]) return;
      const rawBalance = accountBalances[acc.id];
      const type = (acc.type || '').toLowerCase().trim();
      if (type.includes('asset')) assets.push({ account: acc, amount: rawBalance });
      else if (type.includes('liability')) liabilities.push({ account: acc, amount: -rawBalance });
      else if (type.includes('equity')) equity.push({ account: acc, amount: -rawBalance });
      else if (type.includes('revenue') || type.includes('expense')) pnlSum += rawBalance;
    });

    return { assetRows: assets, liabilityRows: liabilities, equityRows: equity, netIncome: -pnlSum };
  }, [accounts, ledgerLines, currentUser]);

  const filterRows = (rows: BalanceRow[]) => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(row => 
      row.account.name.toLowerCase().includes(term) ||
      row.account.code.toLowerCase().includes(term)
    );
  };

  const filteredAssetRows = filterRows(assetRows);
  const filteredLiabilityRows = filterRows(liabilityRows);
  const filteredEquityRows = filterRows(equityRows);

  const totalAssets = filteredAssetRows.reduce((sum, r) => sum + r.amount, 0);
  const totalLiabilities = filteredLiabilityRows.reduce((sum, r) => sum + r.amount, 0);
  const totalEquity = filteredEquityRows.reduce((sum, r) => sum + r.amount, 0) + netIncome;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  
  // التحقق من التوازن
  const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.1;

  const handleExportExcel = () => {
    const headers = ['البيان', 'المبلغ'];
    
    const csvRows: string[][] = [];

    // الأصول
    csvRows.push(['الأصول', '']);
    assetRows.forEach(row => csvRows.push([`"${row.account.name}"`, row.amount.toFixed(2)]));
    csvRows.push(['إجمالي الأصول', totalAssets.toFixed(2)]);
    csvRows.push(['', '']); // سطر فارغ

    // الخصوم
    csvRows.push(['الخصوم', '']);
    liabilityRows.forEach(row => csvRows.push([`"${row.account.name}"`, row.amount.toFixed(2)]));
    csvRows.push(['إجمالي الخصوم', totalLiabilities.toFixed(2)]);
    csvRows.push(['', '']);

    // حقوق الملكية
    csvRows.push(['حقوق الملكية', '']);
    equityRows.forEach(row => csvRows.push([`"${row.account.name}"`, row.amount.toFixed(2)]));
    csvRows.push(['صافي الدخل (أرباح الفترة)', netIncome.toFixed(2)]);
    csvRows.push(['إجمالي حقوق الملكية', totalEquity.toFixed(2)]);
    csvRows.push(['', '']);

    // الإجمالي النهائي
    csvRows.push(['إجمالي الخصوم وحقوق الملكية', totalLiabilitiesAndEquity.toFixed(2)]);

    const csvContent = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `balance_sheet_${asOfDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[80vh]">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4 no-print">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Landmark className="text-blue-600" />
          الميزانية العمومية (قائمة المركز المالي)
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
            <label className="block text-sm font-bold text-slate-700 mb-1">كما في تاريخ</label>
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
            تحديث التقرير
        </button>
      </div>

      {/* ترويسة التقرير للطباعة */}
      <div className="hidden print:block text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">الميزانية العمومية</h2> 
        <p>كما في {asOfDate}</p>
      </div>

      {loading && (
          <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
      )}

      {!loading && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* الجانب الأيمن: الأصول */}
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 border-b-2 border-blue-500 pb-2">الأصول (Assets)</h3> 
            <table className="w-full text-sm text-right">
                <tbody>
                    {filteredAssetRows.map((row) => (
                        <tr key={row.account.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-2">{row.account.name} <span className="text-xs text-slate-400">({row.account.code})</span></td>
                            <td className="py-2 text-left font-mono">{row.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        </tr>
                    ))}
                    <tr className="font-bold bg-blue-50">
                        <td className="py-3 pr-2">إجمالي الأصول</td>
                        <td className="py-3 pl-2 text-left font-mono text-lg">{totalAssets.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        {/* الجانب الأيسر: الخصوم وحقوق الملكية */}
        <div className="space-y-8">
            
            {/* الخصوم */}
            <div>
                <h3 className="text-lg font-bold text-slate-800 border-b-2 border-red-500 pb-2">الخصوم (Liabilities)</h3> 
                <table className="w-full text-sm text-right">
                    <tbody>
                        {filteredLiabilityRows.map((row) => (
                            <tr key={row.account.id} className="border-b border-slate-50 hover:bg-slate-50">
                                <td className="py-2">{row.account.name} <span className="text-xs text-slate-400">({row.account.code})</span></td>
                                <td className="py-2 text-left font-mono">{row.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                        ))}
                        <tr className="font-bold bg-red-50">
                            <td className="py-3 pr-2">إجمالي الخصوم</td>
                            <td className="py-3 pl-2 text-left font-mono text-lg">{totalLiabilities.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* حقوق الملكية */}
            <div>
                <h3 className="text-lg font-bold text-slate-800 border-b-2 border-emerald-500 pb-2">حقوق الملكية (Equity)</h3> 
                <table className="w-full text-sm text-right">
                    <tbody>
                        {filteredEquityRows.map((row) => (
                            <tr key={row.account.id} className="border-b border-slate-50 hover:bg-slate-50">
                                <td className="py-2">{row.account.name} <span className="text-xs text-slate-400">({row.account.code})</span></td>
                                <td className="py-2 text-left font-mono">{row.amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                        ))}
                        {/* صافي الدخل للفترة الحالية */}
                        <tr className="border-b border-slate-50 bg-yellow-50">
                            <td className="py-2 font-bold">صافي الدخل (أرباح الفترة)</td>
                            <td className="py-2 text-left font-mono font-bold">{netIncome.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        </tr>
                        <tr className="font-bold bg-emerald-50">
                            <td className="py-3 pr-2">إجمالي حقوق الملكية</td>
                            <td className="py-3 pl-2 text-left font-mono text-lg">{totalEquity.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* إجمالي الخصوم وحقوق الملكية */}
            <div className={`p-4 rounded-lg flex justify-between items-center font-bold border ${isBalanced ? 'bg-slate-100 border-slate-200' : 'bg-red-100 border-red-300 text-red-800'}`}>
                <span>إجمالي الخصوم وحقوق الملكية</span>
                <span className="font-mono text-xl">{totalLiabilitiesAndEquity.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
            </div>

            {!isBalanced && (
                <div className="flex items-center gap-2 text-red-600 font-bold bg-red-50 p-3 rounded-lg border border-red-200">
                    <AlertTriangle size={20} />
                    <span>تنبيه: الميزانية غير متزنة! الفرق: {Math.abs(totalAssets - totalLiabilitiesAndEquity).toFixed(2)}</span>
                </div>
            )}
            
            {isBalanced && totalAssets > 0 && (
                <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                    <CheckCircle size={20} />
                    <span>الميزانية متزنة تماماً</span>
                </div>
            )}
        </div>

      </div>
      )}
    </div>
  );
};

export default BalanceSheet;
