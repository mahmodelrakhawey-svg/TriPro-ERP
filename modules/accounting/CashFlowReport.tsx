import React, { useState, useMemo } from 'react';
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
  const { accounts, entries, currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const [loading, setLoading] = useState(false); // Kept for button state, but context is the source
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„ØªÙˆØ§Ø±ÙŠØ® ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ø®ØªØ§Ø±Ø© Ù…Ù† Ø´Ø±ÙŠØ· Ø§Ù„Ù†Ø¸Ø§Ù…
  React.useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  const cashAccounts = useMemo(() => {
    return (accounts || []).filter(acc => 
      !(acc.isGroup || acc.is_group) &&
      (String(acc.type).toLowerCase() === 'asset') &&
      (acc.code?.startsWith('123') || acc.name?.includes('ØµÙ†Ø¯ÙˆÙ‚') || acc.name?.includes('Ø¨Ù†Ùƒ') || acc.name?.includes('Ù†Ù‚Ø¯') || acc.name?.includes('Ø®Ø²ÙŠÙ†Ø©'))
    );
  }, [accounts]);

  const { transactions, openingBalance } = useMemo(() => {
    if (currentUser?.role === 'demo') {
        return {
            transactions: [
                { id: 'd1', date: new Date().toISOString().split('T')[0], reference: 'OP-DEMO', description: 'Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ', accountName: 'Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ', debit: 15000, credit: 0, balance: 15000 },
                { id: 'd2', date: new Date().toISOString().split('T')[0], reference: 'INV-DEMO-1', description: 'ØªØ­ØµÙŠÙ„ ÙØ§ØªÙˆØ±Ø© Ù…Ø¨ÙŠØ¹Ø§Øª', accountName: 'Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ', debit: 5000, credit: 0, balance: 20000 },
                { id: 'd3', date: new Date().toISOString().split('T')[0], reference: 'EXP-DEMO-1', description: 'Ù…ØµØ±ÙˆÙØ§Øª ØªØ´ØºÙŠÙ„ÙŠØ©', accountName: 'Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ', debit: 0, credit: 1200, balance: 18800 },
            ],
            openingBalance: 0
        };
    }

    const accountIds = selectedAccount === 'all' 
      ? cashAccounts.map(a => a.id)
      : [selectedAccount];

    if (accountIds.length === 0 && selectedAccount === 'all') {
      setErrorMsg('Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø­Ø³Ø§Ø¨Ø§Øª Ù†Ù‚Ø¯ÙŠØ©. ØªØ£ÙƒØ¯ Ù…Ù† Ø¯Ù„ÙŠÙ„ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª.');
    } else {
      setErrorMsg(null);
    }

    let openBal = 0;
    const periodTransactions: Transaction[] = [];

    (entries || []).filter(Boolean).forEach(entry => {
      if (entry.status !== 'posted') return;

      const entryLines = entry.journal_lines || entry.lines || [];
      entryLines.forEach((line: Record<string, any>, index: number) => {
        const lineAccountId = line.account_id || line.accountId;
        if (accountIds.includes(lineAccountId)) {
          const entryDate = (entry.transaction_date || entry.date || '').split('T')[0];
          if (entryDate < startDate) {
            openBal += ((Number(line.debit) || 0) - (Number(line.credit) || 0));
          } else if (entryDate <= endDate) {
            const acc = accounts.find(a => a.id === lineAccountId);
            periodTransactions.push({
              id: `${entry.id}-${index}`, // Unique key using index to avoid duplicates
              date: entryDate,
              reference: entry.reference || '',
              description: line.description || entry.description,
              accountName: acc ? acc.name : (line.accountName || 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ'),
              debit: Number(line.debit) || 0,
              credit: Number(line.credit) || 0,
              balance: 0 // Will be calculated next
            });
          }
        }
      });
    });

    periodTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = openBal;
    const finalTransactions = periodTransactions.map(t => {
        runningBalance += (t.debit - t.credit);
        return { ...t, balance: runningBalance };
    });

    return { transactions: finalTransactions, openingBalance: openBal };

  }, [entries, accounts, cashAccounts, selectedAccount, startDate, endDate, currentUser]);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const data = [
      ['ØªÙ‚Ø±ÙŠØ± Ø­Ø±ÙƒØ© Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ'],
      [`Ø§Ù„ÙØªØ±Ø© Ù…Ù†: ${startDate} Ø¥Ù„Ù‰: ${endDate}`],
      [`Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ: ${openingBalance.toLocaleString()}`],
      [''],
      ['Ø§Ù„ØªØ§Ø±ÙŠØ®', 'Ø§Ù„Ù…Ø±Ø¬Ø¹', 'Ø§Ù„Ø­Ø³Ø§Ø¨', 'Ø§Ù„Ø¨ÙŠØ§Ù†', 'ÙˆØ§Ø±Ø¯ (Ù…Ø¯ÙŠÙ†)', 'ØµØ§Ø¯Ø± (Ø¯Ø§Ø¦Ù†)', 'Ø§Ù„Ø±ØµÙŠØ¯'],
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
      <ReportHeader title="ØªÙ‚Ø±ÙŠØ± Ø­Ø±ÙƒØ© Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ" subtitle={`Ø¹Ù† Ø§Ù„ÙØªØ±Ø© Ù…Ù† ${startDate} Ø¥Ù„Ù‰ ${endDate}`} />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="text-emerald-600" /> Ø­Ø±ÙƒØ© Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ
          </h1>
          <p className="text-slate-500">Ù…Ø±Ø§Ù‚Ø¨Ø© Ø§Ù„ØªØ¯ÙÙ‚Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© Ø§Ù„ÙˆØ§Ø±Ø¯Ø© ÙˆØ§Ù„ØµØ§Ø¯Ø±Ø©</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm">
            <Download size={16} /> ØªØµØ¯ÙŠØ± Excel
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
            <Printer size={16} /> Ø·Ø¨Ø§Ø¹Ø©
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

      {/* Ø±Ø³Ø§Ù„Ø© ÙÙŠ Ø­Ø§Ù„ Ø¹Ø¯Ù… ÙˆØ¬ÙˆØ¯ Ø¨ÙŠØ§Ù†Ø§Øª */}
      {!loading && transactions.length === 0 && !errorMsg && (
        <div className="bg-blue-50 border-r-4 border-blue-500 p-6 rounded-md shadow-sm text-center">
            <p className="text-blue-800 font-bold">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­Ø±ÙƒØ§Øª Ù†Ù‚Ø¯ÙŠØ© ÙÙŠ Ø§Ù„ÙØªØ±Ø© Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©.</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 no-print">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Ø§Ù„Ø­Ø³Ø§Ø¨</label>
            <select 
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
                <option value="all">-- Ø¬Ù…ÙŠØ¹ Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© --</option>
                {cashAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Ù…Ù† ØªØ§Ø±ÙŠØ®</label>
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
            <label className="block text-sm font-bold text-slate-700 mb-1">Ø¥Ù„Ù‰ ØªØ§Ø±ÙŠØ®</label>
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
            onClick={() => { /* Report updates automatically */ }}
            disabled={loading}
            className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 font-bold shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Filter size={18} />}
            Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-bold text-slate-500 mb-1">Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ</p>
              <h3 className="text-xl font-black text-slate-700">{openingBalance.toLocaleString()}</h3>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-1"><ArrowUpCircle size={14} className="text-emerald-500"/> Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ÙˆØ§Ø±Ø¯</p>
              <h3 className="text-xl font-black text-emerald-600">{totalIn.toLocaleString()}</h3>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-1"><ArrowDownCircle size={14} className="text-red-500"/> Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ØµØ§Ø¯Ø±</p>
              <h3 className="text-xl font-black text-red-600">{totalOut.toLocaleString()}</h3>
          </div>
          <div className="bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-700">
              <p className="text-sm font-bold text-slate-400 mb-1">Ø±ØµÙŠØ¯ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚</p>
              <h3 className="text-xl font-black text-white">{closingBalance.toLocaleString()}</h3>
          </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                    <th className="p-4">Ø§Ù„ØªØ§Ø±ÙŠØ®</th>
                    <th className="p-4">Ø§Ù„Ù…Ø±Ø¬Ø¹</th>
                    <th className="p-4">Ø§Ù„Ø­Ø³Ø§Ø¨</th>
                    <th className="p-4">Ø§Ù„Ø¨ÙŠØ§Ù†</th>
                    <th className="p-4 text-emerald-700">ÙˆØ§Ø±Ø¯ (Ù…Ø¯ÙŠÙ†)</th>
                    <th className="p-4 text-red-700">ØµØ§Ø¯Ø± (Ø¯Ø§Ø¦Ù†)</th>
                    <th className="p-4">Ø§Ù„Ø±ØµÙŠØ¯</th>
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
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­Ø±ÙƒØ§Øª Ø®Ù„Ø§Ù„ Ù‡Ø°Ù‡ Ø§Ù„ÙØªØ±Ø©</td></tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
}
