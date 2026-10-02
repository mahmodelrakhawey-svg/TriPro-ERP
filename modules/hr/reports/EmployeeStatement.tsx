import { logger } from '../../../utils/logger';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { Printer, FileText, Loader2, Search, Download, User } from 'lucide-react';
import * as XLSX from 'xlsx';

type Transaction = {
  id: string;
  date: string;
  type: 'salary' | 'advance' | 'deduction' | 'payment';
  reference: string;
  description: string;
  debit: number;  // Ù…Ø¯ÙŠÙ† (Ø³Ù„Ù/Ø®ØµÙ…/ØµØ±Ù)
  credit: number; // Ø¯Ø§Ø¦Ù† (Ø±Ø§ØªØ¨ Ù…Ø³ØªØ­Ù‚)
  balance: number;
};

const EmployeeStatement = () => {
  const { employees, settings, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const { showToast } = useToast();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  // Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„ØªÙˆØ§Ø±ÙŠØ® ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ø®ØªØ§Ø±Ø© Ù…Ù† Ø´Ø±ÙŠØ· Ø§Ù„Ù†Ø¸Ø§Ù…
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);
  
  const selectedEmployee = employees.find(e => e.id.toString() === selectedEmployeeId.toString());

  const fetchStatement = async () => {
    if (!selectedEmployeeId) return;
    setLoading(true);
    try {
        // 1. Ø¬Ù„Ø¨ Ø§Ù„Ø³Ù„Ù (Ù…Ø¯ÙŠÙ† - Ø¹Ù„Ù‰ Ø§Ù„Ù…ÙˆØ¸Ù)
        const { data: advances } = await supabase.from('employee_advances')
            .select('id, request_date, amount, notes, reference')
            .eq('employee_id', selectedEmployeeId);

        // 2. Ø¬Ù„Ø¨ Ø§Ù„Ø±ÙˆØ§ØªØ¨ (Ø¯Ø§Ø¦Ù† - Ù„Ù„Ù…ÙˆØ¸Ù) ÙˆØ§Ù„Ø®ØµÙˆÙ…Ø§Øª (Ù…Ø¯ÙŠÙ†) Ù…Ù† Ø¨Ù†ÙˆØ¯ Ø§Ù„Ø±ÙˆØ§ØªØ¨
        const { data: payrollItems } = await supabase.from('payroll_items')
            .select(`
                id, 
                gross_salary, 
                additions,
                payroll_tax,
                advances_deducted, 
                other_deductions, 
                net_salary,
                payrolls!inner(payroll_month, payroll_year, created_at, payment_date)
            `)
            .eq('employee_id', selectedEmployeeId);

        // ØªØ¬Ù…ÙŠØ¹ ÙƒÙ„ Ø§Ù„Ø­Ø±ÙƒØ§Øª
        let allTrans: any[] = [];

        // Ø§Ù„Ø³Ù„Ù
        advances?.forEach(adv => allTrans.push({
            date: adv.request_date, 
            type: 'advance', 
            ref: adv.reference || '-', 
            desc: adv.notes || 'Ø³Ù„ÙØ© Ù†Ù‚Ø¯ÙŠØ©', 
            debit: adv.amount, 
            credit: 0 
        }));

        // Ø§Ù„Ø±ÙˆØ§ØªØ¨
        payrollItems?.forEach((item: Record<string, any>) => {
            const date = item.payrolls.payment_date || item.payrolls.created_at.split('T')[0];
            const monthYear = `${item.payrolls.payroll_month}/${item.payrolls.payroll_year}`;
            
            // Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ø§Ù„Ø±Ø§ØªØ¨ (Ø¯Ø§Ø¦Ù†)
            allTrans.push({
                date: date, 
                type: 'salary', 
                ref: `PAY-${monthYear}`, 
                desc: `Ø±Ø§ØªØ¨ Ø´Ù‡Ø± ${monthYear}`, 
                debit: 0, 
                credit: item.gross_salary 
            });

            // Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ø§Ù„Ø¥Ø¶Ø§ÙÙŠ ÙˆØ§Ù„Ù…ÙƒØ§ÙØ¢Øª (Ø¯Ø§Ø¦Ù† - Ù„Ù‡)
            if (item.additions > 0) {
                allTrans.push({
                    date: date, 
                    type: 'salary', 
                    ref: `PAY-ADD-${monthYear}`, 
                    desc: `Ø¥Ø¶Ø§ÙÙŠ ÙˆÙ…ÙƒØ§ÙØ¢Øª Ø´Ù‡Ø± ${monthYear}`, 
                    debit: 0, 
                    credit: item.additions 
                });
            }
            

            // Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø§Ù„Ø¹Ù…Ù„ (Ù…Ø¯ÙŠÙ† - Ø¹Ù„ÙŠÙ‡)
            if (item.payroll_tax > 0) {
                allTrans.push({
                    date: date, 
                    type: 'deduction', 
                    ref: `PAY-TAX-${monthYear}`,
                    desc: `Ø¶Ø±ÙŠØ¨Ø© ÙƒØ³Ø¨ Ø¹Ù…Ù„ Ø´Ù‡Ø± ${monthYear}`,
                    debit: item.payroll_tax,
                    credit: 0 
                });
            }

            // Ù…Ù„Ø§Ø­Ø¸Ø©: Ù„Ø§ Ù†Ø¶ÙŠÙ Ø£Ø³Ø·Ø± "Ø®ØµÙ… Ø§Ù„Ø³Ù„Ù" Ø£Ùˆ "Ø§Ù„Ø®ØµÙˆÙ…Ø§Øª" Ù‡Ù†Ø§ Ù„Ø£Ù†Ù‡Ø§ ØªØ³ÙˆÙŠØ§Øª Ø¯Ø§Ø®Ù„ÙŠØ©.
            // Ø§Ù„Ø³Ù„ÙØ© Ø³ÙØ¬Ù„Øª Ø³Ø§Ø¨Ù‚Ø§Ù‹ ÙƒÙ…Ø¯ÙŠÙ† Ø¹Ù†Ø¯ ØµØ±ÙÙ‡Ø§ (ADV).
            // Ø§Ù„Ø±Ø§ØªØ¨ Ø³ÙØ¬Ù„ ÙƒØ¯Ø§Ø¦Ù† (PAY).
            // ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨ Ø³ÙŠØ³Ø¬Ù„ ÙƒÙ…Ø¯ÙŠÙ† (PAY-NET).
            // Ø§Ù„Ù…Ø¹Ø§Ø¯Ù„Ø©: (-3000 Ø³Ù„ÙØ©) + (10000 Ø±Ø§ØªØ¨) - (7000 ØµØ±Ù) = 0.

            // ØµØ±Ù ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨ (Ù…Ø¯ÙŠÙ† - Ø§Ø³ØªÙ„Ù… Ø§Ù„Ù…ÙˆØ¸Ù Ø­Ù‚Ù‡)
            // Ù†ÙØªØ±Ø¶ Ø£Ù† ØµØ§ÙÙŠ Ø§Ù„Ø±Ø§ØªØ¨ ØªÙ… ØµØ±ÙÙ‡ ÙÙŠ Ù†ÙØ³ ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…Ø³ÙŠØ±
            allTrans.push({
                date: date, 
                type: 'payment', 
                ref: `PAY-NET-${monthYear}`, 
                desc: `ØµØ±Ù ØµØ§ÙÙŠ Ø±Ø§ØªØ¨ ${monthYear}`, 
                debit: item.net_salary, 
                credit: 0 
            });
        });

        // ØªØ±ØªÙŠØ¨ Ø²Ù…Ù†ÙŠ
        allTrans.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠ ÙˆØ§Ù„Ø­Ø±ÙƒØ§Øª
        let openBal = 0;
        const periodTrans: Transaction[] = [];

        allTrans.forEach(t => {
            if (t.date < startDate) {
                // Ø§Ù„Ø±ØµÙŠØ¯ = Ø¯Ø§Ø¦Ù† (Ù„Ù‡) - Ù…Ø¯ÙŠÙ† (Ø¹Ù„ÙŠÙ‡)
                // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ù†Ø§ØªØ¬ Ù…ÙˆØ¬Ø¨ ÙÙ‡Ùˆ Ù…Ø³ØªØ­Ù‚ Ù„Ù„Ù…ÙˆØ¸ÙØŒ Ø³Ø§Ù„Ø¨ ÙÙ‡Ùˆ Ù…Ø³ØªØ­Ù‚ Ø¹Ù„Ù‰ Ø§Ù„Ù…ÙˆØ¸Ù (Ø³Ù„Ù)
                openBal += (t.credit - t.debit);
            } else if (t.date <= endDate) {
                periodTrans.push({
                    id: Math.random().toString(),
                    date: t.date,
                    type: t.type,
                    reference: t.ref,
                    description: t.desc,
                    debit: t.debit,
                    credit: t.credit,
                    balance: 0
                });
            }
        });

        // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„ØªØ±Ø§ÙƒÙ…ÙŠ
        let runningBal = openBal;
        const finalTrans = periodTrans.map(t => {
            runningBal += (t.credit - t.debit);
            return { ...t, balance: runningBal };
        });

        setOpeningBalance(openBal);
        setTransactions(finalTrans);
        setClosingBalance(runningBal);

    } catch (error) {
        logger.error(error);
        showToast('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª', 'error');
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      if (selectedEmployeeId) {
          fetchStatement();
      } else {
          setTransactions([]);
          setOpeningBalance(0);
          setClosingBalance(0);
      }
  }, [selectedEmployeeId, startDate, endDate]);

  const handleExportExcel = () => {
    const data = [
        ['ÙƒØ´Ù Ø­Ø³Ø§Ø¨ Ù…ÙˆØ¸Ù'],
        ['Ø§Ù„Ù…ÙˆØ¸Ù:', selectedEmployee?.full_name],
        ['Ù…Ù† ØªØ§Ø±ÙŠØ®:', startDate, 'Ø¥Ù„Ù‰ ØªØ§Ø±ÙŠØ®:', endDate],
        [],
        ['Ø§Ù„ØªØ§Ø±ÙŠØ®', 'Ø§Ù„Ù…Ø³ØªÙ†Ø¯', 'Ø§Ù„Ø¨ÙŠØ§Ù†', 'Ù…Ø¯ÙŠÙ† (Ø¹Ù„ÙŠÙ‡/Ø§Ø³ØªÙ„Ù…)', 'Ø¯Ø§Ø¦Ù† (Ù„Ù‡/Ø§Ø³ØªØ­Ù‚Ø§Ù‚)', 'Ø§Ù„Ø±ØµÙŠØ¯'],
        ['-', '-', 'Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ', '-', '-', openingBalance],
        ...transactions.map(t => [t.date, t.reference, t.description, t.debit, t.credit, t.balance])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `Employee_Statement_${selectedEmployee?.full_name}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-blue-600" /> ÙƒØ´Ù Ø­Ø³Ø§Ø¨ Ù…ÙˆØ¸Ù
          </h2>
          <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={!selectedEmployeeId} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                <Download size={18}/> ØªØµØ¯ÙŠØ± Excel
            </button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-700">
                <Printer size={18}/> Ø·Ø¨Ø§Ø¹Ø©
            </button>
          </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:hidden grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Ø§Ù„Ù…ÙˆØ¸Ù</label>
            <div className="relative">
                <select value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)} className="w-full border rounded-lg p-2.5 pl-10 font-bold bg-slate-50 outline-none focus:border-blue-500 transition-all appearance-none">
                    <option value="">-- Ø§Ø®ØªØ± Ø§Ù„Ù…ÙˆØ¸Ù --</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
                <User className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Ù…Ù† ØªØ§Ø±ÙŠØ®</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2 bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Ø¥Ù„Ù‰ ØªØ§Ø±ÙŠØ®</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2 bg-slate-50" />
          </div>
      </div>

      {selectedEmployeeId && (
          <div id="printable-statement" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8 animate-in fade-in">
              <div className="flex justify-between mb-8 border-b pb-6">
                  <div>
                      <h1 className="text-2xl font-bold text-slate-900">{settings.companyName}</h1>
                      <p className="text-slate-500 font-bold mt-1">ÙƒØ´Ù Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¸Ù: {selectedEmployee?.full_name}</p>
                      {selectedEmployee?.phone && <p className="text-xs text-slate-400">Ù‡Ø§ØªÙ: {selectedEmployee.phone}</p>}
                  </div>
                  <div className="text-left">
                      <div className={`text-white px-4 py-2 rounded-lg inline-block font-black text-xl mb-2 ${closingBalance >= 0 ? 'bg-emerald-600' : 'bg-red-600'}`} dir="ltr">
                        {Math.abs(closingBalance).toLocaleString()} <span className="text-sm">{settings.currency}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                          {closingBalance >= 0 ? 'Ù…Ø³ØªØ­Ù‚ Ù„Ù„Ù…ÙˆØ¸Ù' : 'Ù…Ø³ØªØ­Ù‚ Ø¹Ù„Ù‰ Ø§Ù„Ù…ÙˆØ¸Ù (Ø³Ù„Ù)'}
                      </p>
                  </div>
              </div>

              {loading ? (
                  <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
              ) : (
                  <table className="w-full text-right text-sm">
                      <thead className="bg-slate-100 border-y border-slate-200 text-slate-500 font-black uppercase">
                          <tr>
                              <th className="p-4">Ø§Ù„ØªØ§Ø±ÙŠØ®</th>
                              <th className="p-4">Ø§Ù„Ù…Ø³ØªÙ†Ø¯</th>
                              <th className="p-4">Ø§Ù„Ø¨ÙŠØ§Ù†</th>
                              <th className="p-4 text-center">Ù…Ø¯ÙŠÙ† (Ø¹Ù„ÙŠÙ‡)</th>
                              <th className="p-4 text-center">Ø¯Ø§Ø¦Ù† (Ù„Ù‡)</th>
                              <th className="p-4 text-center">Ø§Ù„Ø±ØµÙŠØ¯</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          <tr className="bg-slate-50 font-bold text-slate-500">
                              <td colSpan={5} className="p-4">Ø±ØµÙŠØ¯ Ø§ÙØªØªØ§Ø­ÙŠ (Ù…Ø§ Ù‚Ø¨Ù„ Ø§Ù„ÙØªØ±Ø©)</td>
                              <td className="p-4 text-center font-mono" dir="ltr">{openingBalance.toLocaleString()}</td>
                          </tr>
                          {transactions.map((t, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                                  <td className="p-4 font-mono font-bold text-blue-600">{t.reference}</td>
                                  <td className="p-4 text-slate-700">{t.description}</td>
                                  <td className="p-4 text-center font-bold text-red-600">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                                  <td className="p-4 text-center font-bold text-emerald-600">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
                                  <td className="p-4 text-center font-mono font-black bg-slate-50/50" dir="ltr">{t.balance.toLocaleString()}</td>
                              </tr>
                          ))}
                          {transactions.length === 0 && (
                              <tr><td colSpan={6} className="p-8 text-center text-slate-400">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­Ø±ÙƒØ§Øª Ø®Ù„Ø§Ù„ Ù‡Ø°Ù‡ Ø§Ù„ÙØªØ±Ø©</td></tr>
                          )}
                      </tbody>
                  </table>
              )}
              
              <div className="hidden print:block mt-20 pt-8 border-t border-slate-100 text-center text-slate-400 text-xs font-bold">
                {settings.footerText} | Ø·ÙØ¨Ø¹ ÙÙŠ {new Date().toLocaleString('ar-EG')}
              </div>
          </div>
      )}
    </div>
  );
};

export default EmployeeStatement;
