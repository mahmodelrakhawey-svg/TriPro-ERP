import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { Printer, FileText, Loader2, Search, Download, MessageCircle, AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '../../context/ToastContext';

type Transaction = {
  id: string;
  date: string;
  type: 'invoice' | 'receipt' | 'return' | 'credit_note' | 'pos_order';
  reference: string;
  description: string;
  debit: number;  // مدين (فاتورة)
  credit: number; // دائن (سداد/مرتجع)
  balance: number;
  isPosted: boolean; // هل تم ترحيلها للقيد؟
};

interface CustomerStatementProps {
  initialCustomerId?: string;
}

const CustomerStatement: React.FC<CustomerStatementProps> = ({ initialCustomerId }) => {
  const { customers, settings, currentUser, approveInvoice, accounts } = useAccounting();
  const [searchParams] = useSearchParams();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || '');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showUnpostedOnly, setShowUnpostedOnly] = useState(false);
  const [unpostedCount, setUnpostedCount] = useState(0);
  const { showToast } = useToast();
  
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

  const handleFixAll = async () => {
    showToast('هذه الميزة غير مفعلة حالياً.', 'warning');
  };

  const fetchStatement = async () => { // 🛡️ إعادة كتابة شاملة لضمان التطابق مع الأستاذ العام

    if (!selectedCustomerId) return;
    setLoading(true);

    if (currentUser?.role === 'demo') {
        setTransactions([
            { id: 'd1', date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0], type: 'invoice', reference: 'INV-DEMO-101', description: 'فاتورة مبيعات آجلة', debit: 5000, credit: 0, balance: 5000, isPosted: true }, // Example data
            { id: 'd2', date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], type: 'receipt', reference: 'RV-DEMO-55', description: 'دفعة نقدية من الحساب', debit: 0, credit: 2000, balance: 3000, isPosted: true }, // Example data
            { id: 'd3', date: new Date().toISOString().split('T')[0], type: 'invoice', reference: 'INV-DEMO-102', description: 'فاتورة مبيعات جديدة', debit: 1500, credit: 0, balance: 4500, isPosted: true } // Example data
        ]);
        setOpeningBalance(0);
        setClosingBalance(4500);
        setLoading(false);
        return;
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const userOrgId = session?.user?.user_metadata?.org_id;

        if (!userOrgId) {
            showToast('تعذر تحديد المنظمة. يرجى تسجيل الدخول مرة أخرى.', 'error');
            setLoading(false);
            return;
        }

        // حساب العملاء: كود الدليل المصري هو 1221 (Accounts(code) = 1221)
        // مهم: لا نعتمد على accounts المحملة من الـ context لأن عند إنشاء شركة جديدة قد تكون غير محدثة/فارغة.
        const { data: customerAccounts, error: customerAccError } = await supabase
          .from('accounts')
          .select('id')
          .eq('organization_id', userOrgId)
          .eq('code', '1221')
          .limit(1);

        if (customerAccError) throw customerAccError;
        const customerAcc = customerAccounts?.[0] || null;

        if (!customerAcc?.id) {
          showToast('تعذر تحديد حساب العملاء (CUSTOMERS) بكود 1221 لهذه المنظمة.', 'error');
          setLoading(false);
          return;
        }




        // 1) جلب معرفات القيود المرتبطة بكافة مستندات هذا العميل والقيود اليدوية التي تحوي اسمه
        const [invRes, recRes, retRes, cnRes, chqRes, ordRes, manualEntriesRes] = await Promise.all([
            supabase.from('invoices').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
            supabase.from('receipt_vouchers').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
            supabase.from('sales_returns').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
            supabase.from('credit_notes').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
            supabase.from('cheques').select('related_journal_entry_id').eq('party_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
            supabase.from('orders').select('related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
            supabase.from('journal_entries').select('id').eq('organization_id', userOrgId).eq('status', 'posted').ilike('description', `%${selectedCustomer?.name}%`)
        ]);

        const customerEntryIds = new Set<string>();
        invRes.data?.forEach(i => { if (i.related_journal_entry_id) customerEntryIds.add(i.related_journal_entry_id); });
        recRes.data?.forEach(r => { if (r.related_journal_entry_id) customerEntryIds.add(r.related_journal_entry_id); });
        retRes.data?.forEach(r => { if (r.related_journal_entry_id) customerEntryIds.add(r.related_journal_entry_id); });
        cnRes.data?.forEach(c => { if (c.related_journal_entry_id) customerEntryIds.add(c.related_journal_entry_id); });
        chqRes.data?.forEach(c => { if (c.related_journal_entry_id) customerEntryIds.add(c.related_journal_entry_id); });
        ordRes.data?.forEach(o => { if (o.related_journal_entry_id) customerEntryIds.add(o.related_journal_entry_id); });
        manualEntriesRes.data?.forEach(je => { customerEntryIds.add(je.id); });

        let ledgerLines: any[] = [];
        let journalEntries: any[] = [];

        if (customerEntryIds.size > 0) {
            const { data: lines, error: ledgerError } = await supabase
                .from('journal_lines')
                .select('id, journal_entry_id, debit, credit, account_id, organization_id')
                .eq('account_id', customerAcc.id)
                .eq('organization_id', userOrgId)
                .in('journal_entry_id', Array.from(customerEntryIds));

            if (ledgerError) throw ledgerError;
            ledgerLines = lines || [];

            const journalEntryIds = Array.from(new Set(ledgerLines.map((l) => l.journal_entry_id).filter(Boolean)));
            if (journalEntryIds.length > 0) {
                const { data: entries, error: journalEntriesError } = await supabase
                    .from('journal_entries')
                    .select('id, reference, transaction_date, description, status, related_document_id, related_document_type')
                    .in('id', journalEntryIds)
                    .eq('organization_id', userOrgId);

                if (journalEntriesError) throw journalEntriesError;
                journalEntries = entries || [];
            }
        }

        const journalEntryById = new Map((journalEntries || []).map((je) => [je.id, je]));

        let allTrans: Transaction[] = [];
        let unpostedCount = 0;

        // 2. معالجة كل سطر قيد من الأستاذ العام للعميل المختار
        ledgerLines.forEach(line => {
            const je = journalEntryById.get(line.journal_entry_id);
            if (!je) return;

            // تحديد نوع المستند من الوصف أو المرجع
            let type: Transaction['type'] = 'invoice';
            const jeAny: any = je;
            let ref = jeAny.reference || jeAny.id;
            let desc = jeAny.description || 'قيد يومية';
            let isPosted = jeAny.status === 'posted';

            if (ref.startsWith('INV-')) type = 'invoice';
            else if (ref.startsWith('RV-')) type = 'receipt';
            else if (ref.startsWith('SR-')) type = 'return';
            else if (ref.startsWith('CN-')) type = 'credit_note';
            else if (ref.startsWith('CHQ-')) type = 'receipt'; // For incoming cheques
            else if (ref.startsWith('REJ-')) type = 'receipt'; // For rejected cheques reversal
            else if (ref.startsWith('OB-')) type = 'invoice'; // Opening Balance
            else if (jeAny.related_document_type === 'order') type = 'pos_order';

            // إذا كان القيد يمثل دفعة مقدمة مع فاتورة، يتم التعامل معه كـ receipt
            if (desc.includes('دفعة مقدمة مع الفاتورة') && type === 'invoice') {
                type = 'receipt';
            }

            allTrans.push({
                id: line.id, // استخدام معرف سطر القيد لضمان التفرد
                date: je.transaction_date,
                type: type,
                reference: ref,
                description: desc,
                debit: Number(line.debit),
                credit: Number(line.credit),
                balance: 0, // سيتم حسابها لاحقاً
                isPosted: isPosted
            });
        });

        // 3. إضافة مبيعات المطاعم غير المرحّلة (التي لم تُنشأ لها قيود يومية بعد)
        // 3) إضافة مبيعات المطاعم غير المرحّلة (التي لم تُنشأ لها قيود يومية بعد)
        const { data: openOrders } = await supabase.from('orders')
            .select('id, order_number, created_at, grand_total, order_type, status')
            .eq('customer_id', selectedCustomerId)
            .eq('organization_id', userOrgId)
            .is('related_journal_entry_id', null)
            .neq('status', 'CANCELLED');

        openOrders?.forEach(ord => {
            const total = Number(ord.grand_total) || 0;
            if (total > 0) {
                let typeLabel = 'طلب مطعم';
                if (ord.order_type === 'DELIVERY') typeLabel = 'طلب توصيل 🛵';
                else if (ord.order_type === 'TAKEAWAY') typeLabel = 'طلب سفري 🛍️';
                else if (ord.order_type === 'DINE_IN') typeLabel = 'طلب محلي 🍽️';

                allTrans.push({
                    id: ord.id,
                    date: ord.created_at ? ord.created_at.split('T')[0] : '',
                    type: 'pos_order',
                    reference: ord.order_number,
                    description: typeLabel,
                    debit: total,
                    credit: 0,
                    balance: 0,
                    isPosted: false // غير مرحّل
                });
                unpostedCount++;
            }
        });


        // 4. فرز الحركات زمنياً
        allTrans.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // 5. حساب الرصيد الافتتاحي والرصيد الجاري
        let openBal = Number(selectedCustomer?.opening_balance || 0);
        const periodTrans: Transaction[] = [];

        allTrans.forEach(t => {
            if (t.date < startDate) {
                openBal += (t.debit - t.credit);
            } else if (t.date >= startDate && t.date <= endDate) {
                periodTrans.push(t);
            }
        });

        let runningBal = openBal;
        const finalTrans = periodTrans.map(t => {
            runningBal += (t.debit - t.credit);
            return { ...t, balance: runningBal };
        });

        // 6. تحديث الحالات
        setUnpostedCount(unpostedCount + finalTrans.filter(t => !t.isPosted && t.type !== 'pos_order').length);
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

  // Fetch data when filters change (including selectedCustomer for opening_balance)
  useEffect(() => {
      if (selectedCustomerId && selectedCustomer) {
          fetchStatement();
      } else {
          setTransactions([]);
          setOpeningBalance(0);
          setClosingBalance(0);
      }
  }, [selectedCustomerId, startDate, endDate, selectedCustomer]);

  const handleExportExcel = () => {
    const data = [
        ['كشف حساب عميل'],
        ['العميل:', selectedCustomer?.name],
        ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
        [],
        ['التاريخ', 'المستند', 'البيان', 'مدين (فاتورة)', 'دائن (سداد)', 'الرصيد'],
        ['-', '-', 'رصيد افتتاحي', '-', '-', openingBalance],
        ...transactions.map(t => [t.date, t.reference.replace(/^(CHQ-|RV-|INV-|SR-|OB-)/, ''), t.description, t.debit, t.credit, t.balance])
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
          showToast('لا يوجد رقم هاتف لهذا العميل', 'warning');
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
          <div className="md:col-span-3 flex items-center gap-2 mt-2 pt-4 border-t border-slate-100">
            <input 
              type="checkbox" 
              id="unpostedFilter" 
              checked={showUnpostedOnly} 
              onChange={e => setShowUnpostedOnly(e.target.checked)} 
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="unpostedFilter" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
              إظهار فقط الحركات التي ليس لها قيد يومية (وضع المراجعة والتدقيق)
            </label>
          </div>
      </div>

      {unpostedCount > 0 && (
          <div className="bg-red-50 border-2 border-red-200 p-4 rounded-xl flex items-center justify-between animate-bounce print:hidden">
              <div className="flex items-center gap-4">
                  <div className="bg-red-100 p-2 rounded-lg">
                      <ShieldAlert className="text-red-600" size={24} />
                  </div>
                  <div>
                      <h4 className="font-black text-red-900 text-sm">تنبيه عدم تطابق محاسبي!</h4>
                      <p className="text-red-700 text-xs font-bold">يوجد عدد ({unpostedCount}) مستندات في كشف الحساب لم يتم إنشاء قيود يومية لها. هذا سيجعل رصيد دفتر الأستاذ غير مطابق لرصيد العميل.</p>
                  </div>
              </div>
              <button 
                onClick={handleFixAll}
                disabled={loading}
                className="bg-red-600 text-white px-6 py-2 rounded-lg font-black text-sm hover:bg-red-700 transition-all shadow-md flex items-center gap-2 shrink-0"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                إصلاح الكل الآن
              </button>
          </div>
      )}

      {selectedCustomerId && (
          <div id="printable-statement" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8 animate-in fade-in print:break-after-page">

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
                          {transactions.filter(t => !showUnpostedOnly || !t.isPosted).map((t, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                                  <td className="p-4 font-mono font-bold text-blue-600 flex items-center gap-2">
                                      {/* إخفاء البادئات عند العرض فقط ليكون المظهر أنيقاً وموحداً */}
                                      {t.reference.replace(/^(CHQ-|RV-|INV-|SR-|OB-)/, '')}
                                      {!t.isPosted && t.type !== 'pos_order' && (
                                          <span title="هذا المستند ليس له قيد يومية!"><AlertTriangle size={14} className="text-red-500" /></span>
                                      )}
                                      {t.type === 'pos_order' && !t.isPosted && (
                                          <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-200 font-bold">
                                              بانتظار إغلاق الوردية
                                          </span>
                                      )}
                                  </td>
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
