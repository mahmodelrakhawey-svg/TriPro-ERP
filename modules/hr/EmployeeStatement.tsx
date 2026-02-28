import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Printer, FileText, Loader2, Search, Download, User } from 'lucide-react';
import * as XLSX from 'xlsx';

type Transaction = {
  id: string;
  date: string;
  type: 'salary' | 'advance' | 'deduction' | 'payment';
  reference: string;
  description: string;
  debit: number;  // مدين (سلف/خصم/صرف)
  credit: number; // دائن (راتب مستحق)
  balance: number;
};

const EmployeeStatement = () => {
  const { employees, settings } = useAccounting();
  const { showToast } = useToast();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const selectedEmployee = employees.find(e => e.id.toString() === selectedEmployeeId.toString());

  const fetchStatement = async () => {
    if (!selectedEmployeeId) return;
    setLoading(true);
    try {
        // 1. جلب السلف (مدين - على الموظف)
        const { data: advances } = await supabase.from('employee_advances')
            .select('id, request_date, amount, notes, reference')
            .eq('employee_id', selectedEmployeeId);

        // 2. جلب الرواتب (دائن - للموظف) والخصومات (مدين) من بنود الرواتب
        const { data: payrollItems } = await supabase.from('payroll_items')
            .select(`
                id, 
                gross_salary, 
                additions,
                advances_deducted, 
                other_deductions, 
                net_salary,
                payrolls!inner(payroll_month, payroll_year, created_at)
            `)
            .eq('employee_id', selectedEmployeeId);

        // تجميع كل الحركات
        let allTrans: any[] = [];

        // السلف
        advances?.forEach(adv => allTrans.push({
            date: adv.request_date, 
            type: 'advance', 
            ref: adv.reference || '-', 
            desc: adv.notes || 'سلفة نقدية', 
            debit: adv.amount, 
            credit: 0 
        }));

        // الرواتب
        payrollItems?.forEach((item: any) => {
            const date = item.payrolls.created_at.split('T')[0];
            const monthYear = `${item.payrolls.payroll_month}/${item.payrolls.payroll_year}`;
            
            // استحقاق الراتب (دائن)
            allTrans.push({
                date: date, 
                type: 'salary', 
                ref: `PAY-${monthYear}`, 
                desc: `راتب شهر ${monthYear}`, 
                debit: 0, 
                credit: item.gross_salary 
            });

            // استحقاق الإضافي والمكافآت (دائن - له)
            if (item.additions > 0) {
                allTrans.push({
                    date: date, 
                    type: 'salary', 
                    ref: `PAY-ADD-${monthYear}`, 
                    desc: `إضافي ومكافآت شهر ${monthYear}`, 
                    debit: 0, 
                    credit: item.additions 
                });
            }

            // الخصومات والجزاءات (مدين - عليه)
            if (item.other_deductions > 0) {
                allTrans.push({
                    date: date, 
                    type: 'deduction', 
                    ref: `PAY-DED-${monthYear}`, 
                    desc: `خصومات وجزاءات شهر ${monthYear}`, 
                    debit: item.other_deductions, 
                    credit: 0 
                });
            }

            // ملاحظة: لا نضيف أسطر "خصم السلف" أو "الخصومات" هنا لأنها تسويات داخلية.
            // السلفة سُجلت سابقاً كمدين عند صرفها (ADV).
            // الراتب سُجل كدائن (PAY).
            // صافي الراتب سيسجل كمدين (PAY-NET).
            // المعادلة: (-3000 سلفة) + (10000 راتب) - (7000 صرف) = 0.

            // صرف صافي الراتب (مدين - استلم الموظف حقه)
            // نفترض أن صافي الراتب تم صرفه في نفس تاريخ المسير
            allTrans.push({
                date: date, 
                type: 'payment', 
                ref: `PAY-NET-${monthYear}`, 
                desc: `صرف صافي راتب ${monthYear}`, 
                debit: item.net_salary, 
                credit: 0 
            });
        });

        // ترتيب زمني
        allTrans.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // حساب الرصيد الافتتاحي والحركات
        let openBal = 0;
        const periodTrans: Transaction[] = [];

        allTrans.forEach(t => {
            if (t.date < startDate) {
                // الرصيد = دائن (له) - مدين (عليه)
                // إذا كان الناتج موجب فهو مستحق للموظف، سالب فهو مستحق على الموظف (سلف)
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

        // حساب الرصيد التراكمي
        let runningBal = openBal;
        const finalTrans = periodTrans.map(t => {
            runningBal += (t.credit - t.debit);
            return { ...t, balance: runningBal };
        });

        setOpeningBalance(openBal);
        setTransactions(finalTrans);
        setClosingBalance(runningBal);

    } catch (error) {
        console.error(error);
        showToast('حدث خطأ أثناء جلب البيانات', 'error');
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
        ['كشف حساب موظف'],
        ['الموظف:', selectedEmployee?.full_name],
        ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
        [],
        ['التاريخ', 'المستند', 'البيان', 'مدين (عليه/استلم)', 'دائن (له/استحقاق)', 'الرصيد'],
        ['-', '-', 'رصيد افتتاحي', '-', '-', openingBalance],
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
            <FileText className="text-blue-600" /> كشف حساب موظف
          </h2>
          <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={!selectedEmployeeId} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                <Download size={18}/> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-700">
                <Printer size={18}/> طباعة
            </button>
          </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:hidden grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">الموظف</label>
            <div className="relative">
                <select value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)} className="w-full border rounded-lg p-2.5 pl-10 font-bold bg-slate-50 outline-none focus:border-blue-500 transition-all appearance-none">
                    <option value="">-- اختر الموظف --</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
                <User className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">من تاريخ</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2 bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">إلى تاريخ</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2 bg-slate-50" />
          </div>
      </div>

      {selectedEmployeeId && (
          <div id="printable-statement" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8 animate-in fade-in">
              <div className="flex justify-between mb-8 border-b pb-6">
                  <div>
                      <h1 className="text-2xl font-bold text-slate-900">{settings.companyName}</h1>
                      <p className="text-slate-500 font-bold mt-1">كشف حساب الموظف: {selectedEmployee?.full_name}</p>
                      {selectedEmployee?.phone && <p className="text-xs text-slate-400">هاتف: {selectedEmployee.phone}</p>}
                  </div>
                  <div className="text-left">
                      <div className={`text-white px-4 py-2 rounded-lg inline-block font-black text-xl mb-2 ${closingBalance >= 0 ? 'bg-emerald-600' : 'bg-red-600'}`} dir="ltr">
                        {Math.abs(closingBalance).toLocaleString()} <span className="text-sm">{settings.currency}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                          {closingBalance >= 0 ? 'مستحق للموظف' : 'مستحق على الموظف (سلف)'}
                      </p>
                  </div>
              </div>

              {loading ? (
                  <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
              ) : (
                  <table className="w-full text-right text-sm">
                      <thead className="bg-slate-100 border-y border-slate-200 text-slate-500 font-black uppercase">
                          <tr>
                              <th className="p-4">التاريخ</th>
                              <th className="p-4">المستند</th>
                              <th className="p-4">البيان</th>
                              <th className="p-4 text-center">مدين (عليه)</th>
                              <th className="p-4 text-center">دائن (له)</th>
                              <th className="p-4 text-center">الرصيد</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          <tr className="bg-slate-50 font-bold text-slate-500">
                              <td colSpan={5} className="p-4">رصيد افتتاحي (ما قبل الفترة)</td>
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
                              <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد حركات خلال هذه الفترة</td></tr>
                          )}
                      </tbody>
                  </table>
              )}
              
              <div className="hidden print:block mt-20 pt-8 border-t border-slate-100 text-center text-slate-400 text-xs font-bold">
                {settings.footerText} | طُبع في {new Date().toLocaleString('ar-EG')}
              </div>
          </div>
      )}
    </div>
  );
};

export default EmployeeStatement;
