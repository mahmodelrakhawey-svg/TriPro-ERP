import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { Printer, FileText, Loader2, Search, Download, MessageCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

type Transaction = {
  id: string;
  date: string;
  type: 'invoice' | 'receipt' | 'return' | 'credit_note';
  reference: string;
  description: string;
  debit: number;  // مدين (فاتورة)
  credit: number; // دائن (سداد/مرتجع)
  balance: number;
};

interface CustomerStatementProps {
  initialCustomerId?: string;
}

const CustomerStatement: React.FC<CustomerStatementProps> = ({ initialCustomerId }) => {
  const { customers, settings, currentUser } = useAccounting();
  const [searchParams] = useSearchParams();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || '');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const selectedCustomer = customers.find(c => c.id.toString() === selectedCustomerId.toString());

  // قراءة معرف العميل من الرابط عند التحميل
  useEffect(() => {
    if (initialCustomerId) {
        setSelectedCustomerId(initialCustomerId);
    } else {
        const cid = searchParams.get('customerId');
        if (cid) setSelectedCustomerId(cid);
    }
  }, [searchParams, initialCustomerId]);

  const fetchStatement = async () => {
    if (!selectedCustomerId) return;
    setLoading(true);

    if (currentUser?.role === 'demo') {
        setTransactions([
            { id: 'd1', date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0], type: 'invoice', reference: 'INV-DEMO-101', description: 'فاتورة مبيعات آجلة', debit: 5000, credit: 0, balance: 5000 },
            { id: 'd2', date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], type: 'receipt', reference: 'RV-DEMO-55', description: 'دفعة نقدية من الحساب', debit: 0, credit: 2000, balance: 3000 },
            { id: 'd3', date: new Date().toISOString().split('T')[0], type: 'invoice', reference: 'INV-DEMO-102', description: 'فاتورة مبيعات جديدة', debit: 1500, credit: 0, balance: 4500 }
        ]);
        setOpeningBalance(0);
        setClosingBalance(4500);
        setLoading(false);
        return;
    }

    try {
        // 1. Fetch Invoices (Debit)
        const { data: invoices } = await supabase.from('invoices')
            .select('id, invoice_number, invoice_date, total_amount')
            .eq('customer_id', selectedCustomerId)
            .neq('status', 'draft');

        // 2. Fetch Returns (Credit)
        const { data: returns } = await supabase.from('sales_returns')
            .select('id, return_number, return_date, total_amount')
            .eq('customer_id', selectedCustomerId)
            .eq('status', 'posted');

        // 3. Fetch Receipts (Credit)
        const { data: receipts } = await supabase.from('receipt_vouchers')
            .select('id, voucher_number, receipt_date, amount, notes')
            .eq('customer_id', selectedCustomerId)
            // استبعاد سندات التأمين (التي تبدأ بـ DEP-)
            .not('voucher_number', 'like', 'DEP-%');

        // 4. Fetch Credit Notes (Credit)
        const { data: creditNotes } = await supabase.from('credit_notes')
            .select('id, credit_note_number, note_date, total_amount')
            .eq('customer_id', selectedCustomerId);

        // 5. Fetch Cheques (Credit)
        const { data: cheques } = await supabase.from('cheques')
            .select('id, cheque_number, due_date, amount, created_at')
            .eq('party_id', selectedCustomerId)
            .eq('type', 'incoming')
            .neq('status', 'rejected');

        // Combine all transactions
        let allTrans: any[] = [];

        invoices?.forEach(inv => allTrans.push({
            date: inv.invoice_date, type: 'invoice', ref: inv.invoice_number, desc: 'فاتورة مبيعات', 
            debit: inv.total_amount, credit: 0 
        }));

        returns?.forEach(ret => allTrans.push({
            date: ret.return_date, type: 'return', ref: ret.return_number, desc: 'مرتجع مبيعات', 
            debit: 0, credit: ret.total_amount 
        }));

        receipts?.forEach(rec => allTrans.push({
            date: rec.receipt_date, type: 'receipt', ref: rec.voucher_number, desc: rec.notes || 'سند قبض', 
            debit: 0, credit: rec.amount 
        }));

        creditNotes?.forEach(cn => allTrans.push({
            date: cn.note_date, type: 'credit_note', ref: cn.credit_note_number, desc: 'إشعار دائن', 
            debit: 0, credit: cn.total_amount 
        }));

        cheques?.forEach(chq => allTrans.push({
            date: chq.created_at ? chq.created_at.split('T')[0] : chq.due_date, 
            type: 'receipt', 
            ref: chq.cheque_number, 
            desc: `شيك رقم ${chq.cheque_number}`, 
            debit: 0, 
            credit: chq.amount 
        }));

        // Sort chronologically
        allTrans.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate opening balance and period transactions
        let openBal = 0;
        const periodTrans: Transaction[] = [];

        allTrans.forEach(t => {
            if (t.date < startDate) {
                openBal += (t.debit - t.credit);
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

        // Calculate running balance
        let runningBal = openBal;
        const finalTrans = periodTrans.map(t => {
            runningBal += (t.debit - t.credit);
            return { ...t, balance: runningBal };
        });

        setOpeningBalance(openBal);
        setTransactions(finalTrans);
        setClosingBalance(runningBal);

    } catch (error) {
        console.error(error);
        alert('حدث خطأ أثناء جلب البيانات');
    } finally {
        setLoading(false);
    }
  };

  // Fetch data when filters change
  useEffect(() => {
      if (selectedCustomerId) {
          fetchStatement();
      } else {
          setTransactions([]);
          setOpeningBalance(0);
          setClosingBalance(0);
      }
  }, [selectedCustomerId, startDate, endDate]);

  const handleExportExcel = () => {
    const data = [
        ['كشف حساب عميل'],
        ['العميل:', selectedCustomer?.name],
        ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
        [],
        ['التاريخ', 'المستند', 'البيان', 'مدين (فاتورة)', 'دائن (سداد)', 'الرصيد'],
        ['-', '-', 'رصيد افتتاحي', '-', '-', openingBalance],
        ...transactions.map(t => [t.date, t.reference, t.description, t.debit, t.credit, t.balance])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `Customer_Statement_${selectedCustomer?.name}.xlsx`);
  };

  const handleWhatsApp = () => {
      if (!selectedCustomer) return;
      const phone = selectedCustomer.phone;
      if (!phone) {
          alert('لا يوجد رقم هاتف لهذا العميل');
          return;
      }
      
      const message = `كشف حساب من ${settings.companyName}
العميل: ${selectedCustomer.name}
الفترة: ${startDate} إلى ${endDate}
رصيد افتتاحي: ${openingBalance.toLocaleString()}
رصيد ختامي: ${closingBalance.toLocaleString()}
شكراً لتعاملكم معنا.`;

      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="text-blue-600" /> كشف حساب عميل
          </h2>
          <div className="flex gap-2">
            <button onClick={handleWhatsApp} disabled={!selectedCustomerId} className="bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-600 disabled:opacity-50">
                <MessageCircle size={18}/> واتساب
            </button>
            <button onClick={handleExportExcel} disabled={!selectedCustomerId} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                <Download size={18}/> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-700">
                <Printer size={18}/> طباعة
            </button>
          </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:hidden grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">العميل</label>
            <div className="relative">
                <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="w-full border rounded-lg p-2.5 font-bold bg-slate-50 outline-none focus:border-blue-500 transition-all appearance-none">
                    <option value="">-- اختر العميل --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
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

      {selectedCustomerId && (
          <div id="printable-statement" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8 animate-in fade-in">
              <div className="flex justify-between mb-8 border-b pb-6">
                  <div>
                      <h1 className="text-2xl font-bold text-slate-900">{settings.companyName}</h1>
                      <p className="text-slate-500 font-bold mt-1">كشف حساب العميل: {selectedCustomer?.name}</p>
                      {selectedCustomer?.phone && <p className="text-xs text-slate-400">هاتف: {selectedCustomer.phone}</p>}
                  </div>
                  <div className="text-left">
                      <div className="bg-blue-600 text-white px-4 py-2 rounded-lg inline-block font-black text-xl mb-2" dir="ltr">
                        {closingBalance.toLocaleString()} <span className="text-sm">{settings.currency}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">الرصيد الحالي (المستحق على العميل)</p>
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
                              <th className="p-4 text-center">مدين (فاتورة)</th>
                              <th className="p-4 text-center">دائن (سداد)</th>
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
                                  <td className="p-4 text-center font-bold text-emerald-600">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                                  <td className="p-4 text-center font-bold text-red-600">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
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

export default CustomerStatement;
