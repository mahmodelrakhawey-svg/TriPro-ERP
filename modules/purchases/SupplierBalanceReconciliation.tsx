import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import { Scale, AlertTriangle, CheckCircle, Search, ArrowRight, RefreshCw, Trash2, Plus, Save, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SupplierBalanceReconciliation = () => {
  const { accounts, suppliers, getSystemAccount } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [glBalance, setGlBalance] = useState(0);
  const [subLedgerBalance, setSubLedgerBalance] = useState(0);
  const [discrepancyEntries, setDiscrepancyEntries] = useState<any[]>([]);
  
  // تحديد حساب الموردين الرئيسي (221 في الدليل المصري)
  const supplierAcc = getSystemAccount('SUPPLIERS');
  const supplierAccountCode = supplierAcc ? supplierAcc.code : '221';

  // حالة نافذة الإصلاح (إنشاء سند)
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [entryToFix, setEntryToFix] = useState<any>(null);
  const [fixFormData, setFixFormData] = useState({
    supplierId: '',
    treasuryAccountId: '',
    notes: ''
  });

  // تصفية حسابات النقدية والبنوك
  const treasuryAccounts = useMemo(() => accounts.filter(a => !a.isGroup && (a.code.startsWith('123') || a.code.startsWith('101') || a.name.includes('صندوق') || a.name.includes('بنك'))), [accounts]);

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      // 1. جلب رصيد دفتر الأستاذ (GL) لحساب الموردين
      // نبحث عن الحساب الرئيسي وأبنائه
      const supplierAccounts = accounts.filter(a => a.code.startsWith(supplierAccountCode));
      const accountIds = supplierAccounts.map(a => a.id);

      if (accountIds.length === 0) {
          // قد لا يكون الحساب محملاً بعد، لا نظهر تنبيه مزعج
          setLoading(false);
          return;
      }

      const { data: glLines } = await supabase
        .from('journal_lines')
        .select('id, debit, credit, description, account_id, journal_entries!inner(id, reference, transaction_date, status)')
        .in('account_id', accountIds)
        .eq('journal_entries.status', 'posted');

      let totalGlCredit = 0;
      let totalGlDebit = 0;
      
      // تخزين القيود للمراجعة
      const glEntriesMap = new Map();

      glLines?.forEach((line: any) => {
          totalGlCredit += line.credit;
          totalGlDebit += line.debit;
          
          // تخزين القيد مع المرجع للمقارنة
          const ref = line.journal_entries?.reference || '';
          // نستخدم مفتاحاً فريداً للقيد لتجنب التكرار في حال وجود أكثر من سطر لنفس القيد
          const entryKey = line.journal_entries?.id; 
          
          if (!glEntriesMap.has(entryKey)) {
              glEntriesMap.set(entryKey, {
                  ...line,
                  date: line.journal_entries?.transaction_date,
                  ref: ref
              });
          }
      });

      // رصيد الموردين دائن بطبيعته (دائن - مدين)
      const calculatedGlBalance = totalGlCredit - totalGlDebit;
      setGlBalance(calculatedGlBalance);

      // 2. جلب رصيد الأستاذ المساعد (Sub-ledger) من المستندات
      
      const { data: invoices } = await supabase.from('purchase_invoices').select('total_amount, invoice_number').neq('status', 'draft');
      const { data: returns } = await supabase.from('purchase_returns').select('total_amount, return_number').neq('status', 'draft');
      const { data: payments } = await supabase.from('payment_vouchers').select('amount, voucher_number');
      const { data: debitNotes } = await supabase.from('debit_notes').select('total_amount, debit_note_number');
      const { data: cheques } = await supabase.from('cheques').select('amount, cheque_number').eq('type', 'outgoing').neq('status', 'rejected');

      let totalInvoiced = 0;
      let totalPaid = 0;
      const subLedgerRefs = new Set();

      invoices?.forEach(inv => {
          totalInvoiced += Number(inv.total_amount);
          subLedgerRefs.add(inv.invoice_number);
      });

      returns?.forEach(ret => {
          totalPaid += Number(ret.total_amount);
          subLedgerRefs.add(ret.return_number);
      });

      payments?.forEach(pay => {
          totalPaid += Number(pay.amount);
          subLedgerRefs.add(pay.voucher_number);
      });

      debitNotes?.forEach(dn => {
          totalPaid += Number(dn.total_amount);
          subLedgerRefs.add(dn.debit_note_number);
      });

      cheques?.forEach(chq => {
          totalPaid += Number(chq.amount);
          subLedgerRefs.add(`CHQ-${chq.cheque_number}`);
      });

      const calculatedSubLedgerBalance = totalInvoiced - totalPaid;
      setSubLedgerBalance(calculatedSubLedgerBalance);

      // 3. تحليل الفروقات
      const discrepancies: any[] = [];
      
      glEntriesMap.forEach((entry) => {
          const ref = entry.ref;
          // تجاهل قيود الإقفال والافتتاحية
          if (ref.startsWith('CLOSE-') || ref.startsWith('OPENING-')) return;

          // التحقق مما إذا كان المرجع موجوداً في المستندات الفرعية
          // تحسين: البحث الذكي (Smart Match)
          // إذا كان المرجع في الأستاذ يحتوي على المرجع في السجلات الفرعية (مثلاً CHQ-236-432 يحتوي CHQ-236)
          let isMatched = subLedgerRefs.has(ref);
          
          if (!isMatched) {
              // محاولة البحث الجزئي للشيكات والسندات
              isMatched = Array.from(subLedgerRefs).some((subRef: any) => ref.startsWith(String(subRef)));
          }

          if (!isMatched) {
              discrepancies.push(entry);
          }
      });

      setDiscrepancyEntries(discrepancies);

    } catch (error) {
      console.error(error);
      // alert('حدث خطأ أثناء المطابقة'); // تم تعطيل التنبيه لتجنب الإزعاج أثناء التحميل
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء.')) {
        return;
    }
    try {
        const { error } = await supabase.from('journal_entries').delete().eq('id', entryId);
        if (error) throw error;
        showToast('تم حذف القيد بنجاح.', 'success');
        fetchReconciliation(); // تحديث البيانات فوراً
    } catch (err: any) {
        console.error(err);
        showToast('فشل حذف القيد: ' + err.message, 'error');
    }
  };

  const openFixModal = (entry: any) => {
    setEntryToFix(entry);
    setFixFormData({
        supplierId: '',
        treasuryAccountId: treasuryAccounts[0]?.id || '',
        notes: entry.description || ''
    });
    setFixModalOpen(true);
  };

  const handleFixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fixFormData.supplierId || !fixFormData.treasuryAccountId) {
        showToast('الرجاء اختيار المورد وحساب الدفع', 'warning');
        return;
    }

    try {
        const { error } = await supabase.from('payment_vouchers').insert({
            voucher_number: entryToFix.ref,
            payment_date: entryToFix.date,
            amount: entryToFix.debit, // المبلغ المدين في حساب المورد هو مبلغ السداد
            supplier_id: fixFormData.supplierId,
            treasury_account_id: fixFormData.treasuryAccountId,
            notes: fixFormData.notes,
            related_journal_entry_id: entryToFix.journal_entries.id,
            payment_method: 'cash'
        });

        if (error) throw error;
        
        showToast('تم إنشاء سند الصرف وربطه بالقيد بنجاح ✅', 'success');
        setFixModalOpen(false);
        fetchReconciliation();
    } catch (err: any) {
        console.error(err);
        showToast('خطأ: ' + err.message, 'error');
    }
  };

  useEffect(() => {
    fetchReconciliation();
  }, [accounts]); // إعادة التشغيل عند تحميل الحسابات

  const difference = glBalance - subLedgerBalance;
  const isBalanced = Math.abs(difference) < 1;

  return (
    <div className="space-y-6 animate-in fade-in p-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Scale className="text-blue-600" /> مطابقة أرصدة الموردين
            </h2>
            <p className="text-slate-500">مقارنة بين رصيد دفتر الأستاذ (GL) وأرصدة كشوف الحسابات</p>
        </div>
        <button onClick={fetchReconciliation} className="flex items-center gap-2 bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 font-bold text-slate-600">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* GL Balance */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-bold text-slate-500 mb-2">رصيد دفتر الأستاذ (حساب 201)</p>
              <h3 className="text-3xl font-black text-slate-800 dir-ltr">{glBalance.toLocaleString()}</h3>
              <p className="text-xs text-slate-400 mt-2">مجموع القيود المرحلة</p>
          </div>

          {/* Sub-ledger Balance */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-bold text-slate-500 mb-2">رصيد كشوف الحسابات (المستندات)</p>
              <h3 className="text-3xl font-black text-blue-600 dir-ltr">{subLedgerBalance.toLocaleString()}</h3>
              <p className="text-xs text-slate-400 mt-2">فواتير - سندات - مرتجعات</p>
          </div>

          {/* Difference */}
          <div className={`p-6 rounded-xl shadow-sm border ${isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-sm font-bold mb-2 ${isBalanced ? 'text-emerald-600' : 'text-red-600'}`}>الفرق (Discrepancy)</p>
              <h3 className={`text-3xl font-black dir-ltr ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>{difference.toLocaleString()}</h3>
              <div className="flex items-center gap-2 mt-2">
                  {isBalanced ? <CheckCircle size={16} className="text-emerald-600"/> : <AlertTriangle size={16} className="text-red-600"/>}
                  <span className={`text-xs font-bold ${isBalanced ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isBalanced ? 'الحسابات متطابقة' : 'يوجد فرق يحتاج معالجة'}
                  </span>
              </div>
          </div>
      </div>

      {/* Discrepancy Analysis */}
      {!isBalanced && discrepancyEntries.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-red-50 flex justify-between items-center">
                  <h3 className="font-bold text-red-800 flex items-center gap-2">
                      <Search size={18} /> قيود في الأستاذ غير موجودة في كشوف الموردين
                  </h3>
                  <span className="text-xs bg-white px-2 py-1 rounded text-red-600 font-bold">{discrepancyEntries.length} قيد</span>
              </div>
              <div className="p-4 bg-yellow-50 text-yellow-800 text-sm mb-0">
                  <p><strong>تنبيه:</strong> هذه القيود تم تسجيلها محاسبياً على حساب الموردين، ولكن لا يوجد لها مستند مقابل (سند صرف/فاتورة) في نظام المشتريات. هذا هو سبب الفرق.</p>
              </div>
              <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-bold">
                      <tr>
                          <th className="p-4">التاريخ</th>
                          <th className="p-4">رقم القيد (المرجع)</th>
                          <th className="p-4">البيان</th>
                          <th className="p-4 text-center">مدين</th>
                          <th className="p-4 text-center">دائن</th>
                          <th className="p-4 text-center">إجراء</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {discrepancyEntries.map((entry, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-4">{entry.date}</td>
                              <td className="p-4 font-mono font-bold text-blue-600">{entry.ref}</td>
                              <td className="p-4 text-slate-700">{entry.description}</td>
                              <td className="p-4 text-center font-bold text-emerald-600">{entry.debit > 0 ? entry.debit.toLocaleString() : '-'}</td>
                              <td className="p-4 text-center font-bold text-red-600">{entry.credit > 0 ? entry.credit.toLocaleString() : '-'}</td>
                              <td className="p-4 text-center flex items-center justify-center gap-2">
                                  <button 
                                    onClick={() => navigate('/general-journal', { state: { initialSearch: entry.ref } })}
                                    className="text-blue-600 hover:underline text-xs font-bold flex items-center justify-center gap-1"
                                  >
                                      عرض القيد <ArrowRight size={12} />
                                  </button>
                                  {entry.debit > 0 && (
                                      <button 
                                        onClick={() => openFixModal(entry)}
                                        className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                                        title="إنشاء سند صرف لهذا القيد"
                                      >
                                          <Plus size={14} /> إنشاء سند
                                      </button>
                                  )}
                                  <button 
                                    onClick={() => handleDeleteEntry(entry.journal_entries.id)}
                                    className="text-red-600 hover:bg-red-50 p-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                                    title="حذف القيد نهائياً"
                                  >
                                      <Trash2 size={14} /> حذف
                                  </button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {/* نافذة إنشاء السند المفقود */}
      {fixModalOpen && entryToFix && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <RefreshCw className="text-blue-600" /> معالجة القيد المفقود
                    </h3>
                    <button onClick={() => setFixModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleFixSubmit} className="p-6 space-y-4">
                    <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 mb-4">
                        <p><strong>رقم القيد:</strong> {entryToFix.ref}</p>
                        <p><strong>المبلغ:</strong> {entryToFix.debit.toLocaleString()}</p>
                        <p className="text-xs mt-1">سيتم إنشاء سند صرف وربطه بهذا القيد ليظهر في كشف الحساب.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">المورد</label>
                        <select required className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={fixFormData.supplierId} onChange={e => setFixFormData({...fixFormData, supplierId: e.target.value})}>
                            <option value="">-- اختر المورد --</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">حساب الدفع (الخزينة/البنك)</label>
                        <select required className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={fixFormData.treasuryAccountId} onChange={e => setFixFormData({...fixFormData, treasuryAccountId: e.target.value})}>
                            {treasuryAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
                        <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={fixFormData.notes} onChange={e => setFixFormData({...fixFormData, notes: e.target.value})} />
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2 shadow-md transition-colors mt-4">
                        <Save size={18} /> حفظ السند
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default SupplierBalanceReconciliation;
