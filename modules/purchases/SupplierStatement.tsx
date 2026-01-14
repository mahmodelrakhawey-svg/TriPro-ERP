import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { Printer, FileText, Loader2, Search, Download, MessageCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

type Transaction = {
  id: string;
  date: string;
  type: 'invoice' | 'payment' | 'return' | 'debit_note';
  reference: string;
  description: string;
  debit: number;  // مدين (سداد/مرتجع)
  credit: number; // دائن (مشتريات)
  balance: number;
};

const SupplierStatement = () => {
  const { suppliers, settings, currentUser } = useAccounting();
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const selectedSupplier = suppliers.find(s => s.id.toString() === selectedSupplierId.toString());

  const fetchStatement = async () => {
    if (!selectedSupplierId) return;
    setLoading(true);

    if (currentUser?.role === 'demo') {
        setTransactions([
            { id: 'd1', date: new Date(Date.now() - 86400000 * 10).toISOString().split('T')[0], type: 'invoice', reference: 'PINV-DEMO-88', description: 'فاتورة مشتريات بضاعة', credit: 12000, debit: 0, balance: 12000 },
            { id: 'd2', date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0], type: 'payment', reference: 'PV-DEMO-33', description: 'سداد دفعة للمورد', credit: 0, debit: 5000, balance: 7000 }
        ]);
        setOpeningBalance(0);
        setClosingBalance(7000);
        setLoading(false);
        return;
    }

    try {
        // 1. جلب الفواتير (دائن - تزيد الرصيد)
        const { data: invoices } = await supabase.from('purchase_invoices')
            .select('id, invoice_number, invoice_date, total_amount, notes')
            .eq('supplier_id', selectedSupplierId)
            .neq('status', 'draft'); // فقط الفواتير المرحلة

        // 2. جلب المرتجعات (مدين - تنقص الرصيد)
        const { data: returns } = await supabase.from('purchase_returns')
            .select('id, return_number, return_date, total_amount, notes')
            .eq('supplier_id', selectedSupplierId)
            .eq('status', 'posted'); // شرط الترحيل لضمان التطابق مع المحاسبة

        // 3. جلب سندات الصرف (مدين - تنقص الرصيد)
        const { data: payments } = await supabase.from('payment_vouchers')
            .select('id, voucher_number, payment_date, amount, notes')
            .eq('supplier_id', selectedSupplierId)
            // .eq('status', 'posted'); // يمكن تفعيله إذا كان للسندات حالة

        // 4. جلب الإشعارات المدينة (مدين - تنقص الرصيد)
        const { data: debitNotes } = await supabase.from('debit_notes')
            .select('id, debit_note_number, note_date, total_amount, notes')
            .eq('supplier_id', selectedSupplierId);

        // 5. جلب الشيكات الصادرة (مدين - تنقص الرصيد)
        const { data: cheques } = await supabase.from('cheques')
            .select('id, cheque_number, due_date, amount, notes, created_at')
            .eq('party_id', selectedSupplierId)
            .eq('type', 'outgoing')
            .neq('status', 'rejected');

        // تجميع كل الحركات
        let allTrans: any[] = [];

        invoices?.forEach(inv => allTrans.push({
            date: inv.invoice_date, type: 'invoice', ref: inv.invoice_number, desc: 'فاتورة مشتريات', 
            credit: inv.total_amount, debit: 0 
        }));

        returns?.forEach(ret => allTrans.push({
            date: ret.return_date, type: 'return', ref: ret.return_number, desc: 'مرتجع مشتريات', 
            credit: 0, debit: ret.total_amount 
        }));

        payments?.forEach(pay => allTrans.push({
            date: pay.payment_date, type: 'payment', ref: pay.voucher_number, desc: pay.notes || 'سند صرف', 
            credit: 0, debit: pay.amount 
        }));

        debitNotes?.forEach(dn => allTrans.push({
            date: dn.note_date, type: 'debit_note', ref: dn.debit_note_number, desc: 'إشعار مدين', 
            credit: 0, debit: dn.total_amount 
        }));

        cheques?.forEach(chq => allTrans.push({
            date: chq.created_at ? chq.created_at.split('T')[0] : chq.due_date, 
            type: 'payment', 
            ref: chq.cheque_number, 
            desc: `شيك رقم ${chq.cheque_number} (استحقاق ${chq.due_date})`, 
            credit: 0, 
            debit: chq.amount 
        }));

        // ترتيب زمني
        allTrans.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // حساب الرصيد الافتتاحي والحركات
        let openBal = 0;
        const periodTrans: Transaction[] = [];

        allTrans.forEach(t => {
            if (t.date < startDate) {
                openBal += (t.credit - t.debit);
            } else if (t.date <= endDate) {
                periodTrans.push({
                    id: Math.random().toString(), // ID مؤقت للعرض
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
        alert('حدث خطأ أثناء جلب البيانات');
    } finally {
        setLoading(false);
    }
  };

  // جلب البيانات عند تغيير المحددات
  useEffect(() => {
      if (selectedSupplierId) {
          fetchStatement();
      } else {
          setTransactions([]);
          setOpeningBalance(0);
          setClosingBalance(0);
      }
  }, [selectedSupplierId, startDate, endDate]);

  const handleExportExcel = () => {
    const data = [
        ['كشف حساب مورد'],
        ['المورد:', selectedSupplier?.name],
        ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
        [],
        ['التاريخ', 'المستند', 'البيان', 'مدين (سداد)', 'دائن (مشتريات)', 'الرصيد'],
        ['-', '-', 'رصيد افتتاحي', '-', '-', openingBalance],
        ...transactions.map(t => [t.date, t.reference, t.description, t.debit, t.credit, t.balance])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `Supplier_Statement_${selectedSupplier?.name}.xlsx`);
  };

  const handleWhatsApp = () => {
      if (!selectedSupplier) return;
      const phone = selectedSupplier.phone;
      if (!phone) {
          alert('لا يوجد رقم هاتف لهذا المورد');
          return;
      }
      
      const message = `كشف حساب من ${settings.companyName}
المورد: ${selectedSupplier.name}
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
            <FileText className="text-emerald-600" /> كشف حساب مورد
          </h2>
          <div className="flex gap-2">
            <button onClick={handleWhatsApp} disabled={!selectedSupplierId} className="bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-600 disabled:opacity-50">
                <MessageCircle size={18}/> واتساب
            </button>
            <button onClick={handleExportExcel} disabled={!selectedSupplierId} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                <Download size={18}/> تصدير Excel
            </button>
            <button onClick={() => window.print()} disabled={!selectedSupplierId} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-700 disabled:opacity-50">
                <Printer size={18}/> طباعة
            </button>
          </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:hidden grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">المورد</label>
            <div className="relative">
                <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)} className="w-full border rounded-lg p-2.5 pl-10 font-bold bg-slate-50 outline-none focus:border-emerald-500 transition-all appearance-none">
                    <option value="">-- اختر المورد --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Search className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={18} />
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

      {selectedSupplierId && (
          <div id="printable-statement" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8 animate-in fade-in">
              <div className="flex justify-between mb-8 border-b pb-6">
                  <div>
                      <h1 className="text-2xl font-bold text-slate-900">{settings.companyName}</h1>
                      <p className="text-slate-500 font-bold mt-1">كشف حساب المورد: {selectedSupplier?.name}</p>
                      {selectedSupplier?.phone && <p className="text-xs text-slate-400">هاتف: {selectedSupplier.phone}</p>}
                  </div>
                  <div className="text-left">
                      <div className="bg-emerald-600 text-white px-4 py-2 rounded-lg inline-block font-black text-xl mb-2" dir="ltr">
                        {closingBalance.toLocaleString()} <span className="text-sm">{settings.currency}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">الرصيد الحالي (المستحق)</p>
                  </div>
              </div>

              {loading ? (
                  <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-emerald-600" size={32} /></div>
              ) : (
                  <table className="w-full text-right text-sm">
                      <thead className="bg-slate-100 border-y border-slate-200 text-slate-500 font-black uppercase">
                          <tr>
                              <th className="p-4">التاريخ</th>
                              <th className="p-4">المستند</th>
                              <th className="p-4">البيان</th>
                              <th className="p-4 text-center">مدين (سداد)</th>
                              <th className="p-4 text-center">دائن (مشتريات)</th>
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
                                  <td className="p-4 font-mono font-bold text-emerald-600">{t.reference}</td>
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

export default SupplierStatement;
