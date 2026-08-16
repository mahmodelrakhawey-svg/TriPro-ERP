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
      // 1. جلب رصيد دفتر الأستاذ (GL) لحساب الموردين ومقاولي الباطن
      // نبحث عن الحساب الرئيسي وأبنائه (201 أو 221 وما يتفرع منها)
      const supplierAccounts = accounts.filter(a => a.code.startsWith(supplierAccountCode) || a.code.startsWith('201') || a.code.startsWith('221'));
      const accountIds = supplierAccounts.map(a => a.id);

      if (accountIds.length === 0) {
          // قد لا يكون الحساب محملاً بعد، لا نظهر تنبيه مزعج
          setLoading(false);
          return;
      }

      const { data: glLines } = await supabase
        .from('journal_lines')
        .select('id, debit, credit, description, account_id, journal_entries!inner(id, reference, transaction_date, description, status)')
        .in('account_id', accountIds)
        .eq('journal_entries.status', 'posted');

      let totalGlCredit = 0;
      let totalGlDebit = 0;
      
      // تخزين القيود للمراجعة وتجميع المبالغ لنفس القيد
      const glEntriesMap = new Map();

      glLines?.forEach((line: any) => {
          const debitVal = Number(line.debit || 0);
          const creditVal = Number(line.credit || 0);
          totalGlCredit += creditVal;
          totalGlDebit += debitVal;
          
          const ref = line.journal_entries?.reference || '';
          const entryKey = line.journal_entries?.id; 
          
          if (!glEntriesMap.has(entryKey)) {
              glEntriesMap.set(entryKey, {
                  id: line.id,
                  journal_entries: line.journal_entries,
                  debit: debitVal,
                  credit: creditVal,
                  description: line.description || line.journal_entries?.description || '',
                  date: line.journal_entries?.transaction_date,
                  ref: ref
              });
          } else {
              const existing = glEntriesMap.get(entryKey);
              existing.debit += debitVal;
              existing.credit += creditVal;
          }
      });

      // رصيد الموردين دائن بطبيعته (دائن - مدين)
      const calculatedGlBalance = totalGlCredit - totalGlDebit;
      setGlBalance(calculatedGlBalance);

      // 2. جلب رصيد الأستاذ المساعد (Sub-ledger) من كشوف حسابات الموردين ومقاولي الباطن
      const { data: suppliersList } = await supabase.from('suppliers').select('id, name, opening_balance').is('deleted_at', null);
      const { data: invoices } = await supabase.from('purchase_invoices').select('supplier_id, total_amount, paid_amount, invoice_number').neq('status', 'draft');
      const { data: returns } = await supabase.from('purchase_returns').select('supplier_id, total_amount, return_number').neq('status', 'draft');
      // سندات الصرف الخاصة بالموردين فقط (استبعاد سندات صرف المصروفات العامة مثل الكهرباء والإيجار التي يكون فيها supplier_id فارغاً)
      const { data: payments } = await supabase.from('payment_vouchers').select('supplier_id, amount, voucher_number, payment_method').not('supplier_id', 'is', null);
      const { data: debitNotes } = await supabase.from('debit_notes').select('supplier_id, total_amount, debit_note_number, status').eq('status', 'posted');
      const { data: cheques } = await supabase.from('cheques').select('party_id, amount, cheque_number, status').eq('type', 'outgoing');
      const { data: subBillings } = await supabase.from('subcontractor_billings').select('id, billing_number, net_amount, gross_amount, status').neq('status', 'draft');

      const subLedgerRefs = new Set<string>();

      // تسجيل جميع مراجع المستندات للمطابقة
      invoices?.forEach(inv => { if (inv.invoice_number) subLedgerRefs.add(inv.invoice_number.trim()); });
      returns?.forEach(ret => { if (ret.return_number) subLedgerRefs.add(ret.return_number.trim()); });
      payments?.forEach(pay => { if (pay.voucher_number) subLedgerRefs.add(pay.voucher_number.trim()); });
      debitNotes?.forEach(dn => { if (dn.debit_note_number) subLedgerRefs.add(dn.debit_note_number.trim()); });
      subBillings?.forEach(sb => {
          if (sb.billing_number) {
              subLedgerRefs.add(sb.billing_number.trim());
              subLedgerRefs.add(`SUB-BILL-${sb.billing_number.replace(/^SUB-(BILL-)?/i, '')}`);
          }
          if (sb.id) subLedgerRefs.add(sb.id);
      });
      cheques?.forEach(chq => {
          const rawNum = String(chq.cheque_number || '').trim();
          if (rawNum) {
              subLedgerRefs.add(`CHQ-${rawNum}`);
              subLedgerRefs.add(rawNum);
              subLedgerRefs.add(`REJ-OUT-${rawNum}`);
              subLedgerRefs.add(`REJ-IN-${rawNum}`);
              subLedgerRefs.add(`REJ-${rawNum}`);
          }
      });

      // إعداد قائمة بأرقام الشيكات لمنع تكرار احتسابها
      const chequeNumbersSet = new Set<string>();
      cheques?.forEach(c => {
          const raw = String(c.cheque_number || '').trim().toUpperCase();
          if (raw) {
              chequeNumbersSet.add(raw);
              chequeNumbersSet.add(raw.replace(/^CHQ-/i, ''));
          }
      });

      // تجميع أرصدة كشوف حسابات الموردين
      let totalSupplierStatementsBalance = 0;
      suppliersList?.forEach(supplier => {
          const opening = Number(supplier.opening_balance || 0);
          
          const supInvoices = invoices?.filter(i => i.supplier_id === supplier.id) || [];
          const supInvTotal = supInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
          
          const supReturns = returns?.filter(r => r.supplier_id === supplier.id) || [];
          const supRetTotal = supReturns.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
          
          const supDebitNotes = debitNotes?.filter(d => d.supplier_id === supplier.id) || [];
          const supDnTotal = supDebitNotes.reduce((sum, d) => sum + Number(d.total_amount || 0), 0);
          
          const supCheques = cheques?.filter(c => c.party_id === supplier.id && c.status !== 'rejected') || [];
          const supChqTotal = supCheques.reduce((sum, c) => sum + Number(c.amount || 0), 0);
          
          const supPayments = payments?.filter(p => p.supplier_id === supplier.id) || [];
          const supPayTotal = supPayments.reduce((sum, p) => {
              const vNum = (p.voucher_number || '').trim().toUpperCase();
              const cleanNum = vNum.replace(/^(CHQ-|PV-)/i, '');
              const isChequeVoucher = vNum.startsWith('CHQ-') || p.payment_method === 'cheque' || chequeNumbersSet.has(cleanNum) || chequeNumbersSet.has(vNum);
              return isChequeVoucher ? sum : sum + Number(p.amount || 0);
          }, 0);

          const supplierBalance = opening + supInvTotal - supRetTotal - supDnTotal - supChqTotal - supPayTotal;
          totalSupplierStatementsBalance += supplierBalance;
      });

      // إضافة إجمالي مستخلصات مقاولي الباطن المعتمدة
      const subBillingsTotal = subBillings?.reduce((sum, sb) => sum + Number(sb.net_amount || 0), 0) || 0;

      const calculatedSubLedgerBalance = totalSupplierStatementsBalance + subBillingsTotal;
      setSubLedgerBalance(calculatedSubLedgerBalance);

      // 3. تحليل الفروقات الذكي
      const isRefMatched = (ref: string, desc: string): boolean => {
          if (!ref && !desc) return false;
          const cleanRef = (ref || '').trim().toUpperCase();
          const cleanDesc = (desc || '').trim();

          // تجاهل قيود الإقفال والافتتاحية
          if (cleanRef.startsWith('CLOSE-') || cleanRef.startsWith('CLOSING-') || cleanRef.startsWith('OPENING-') || cleanRef.startsWith('OB-')) {
              return true;
          }

          // فحص التطابق المباشر
          if (cleanRef && subLedgerRefs.has(cleanRef)) return true;

          // فحص تطابق بادئات ومقاطع الشيكات المرفوضة
          if (cleanRef.startsWith('REJ-OUT-') || cleanRef.startsWith('REJ-IN-') || cleanRef.startsWith('REJ-')) {
              const num = cleanRef.replace(/^REJ-(OUT-|IN-)?/i, '');
              if (subLedgerRefs.has(num) || subLedgerRefs.has(`CHQ-${num}`)) return true;
          }

          // فحص تطابق مستخلصات المقاولين
          if (cleanRef.startsWith('SUB-BILL-') || cleanRef.startsWith('SUB-')) {
              const num = cleanRef.replace(/^SUB-(BILL-)?/i, '');
              if (subLedgerRefs.has(num) || subLedgerRefs.has(`SUB-BILL-${num}`)) return true;
          }

          // فحص التطابق الجزئي في قائمة المراجع
          for (const subRef of subLedgerRefs) {
              const s = String(subRef).trim().toUpperCase();
              if (s && (cleanRef === s || cleanRef.startsWith(s) || s.startsWith(cleanRef) || cleanRef.includes(s))) {
                  return true;
              }
          }

          return false;
      };

      const discrepancies: any[] = [];
      
      glEntriesMap.forEach((entry) => {
          const matched = isRefMatched(entry.ref, entry.description);
          if (!matched) {
              discrepancies.push(entry);
          }
      });

      setDiscrepancyEntries(discrepancies);

    } catch (error) {
      console.error(error);
      // Error handled silently during reconciliation
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
              <p className="text-sm font-bold text-slate-500 mb-2">رصيد دفتر الأستاذ (حساب {supplierAccountCode})</p>
              <h3 className="text-3xl font-black text-slate-800 dir-ltr">{glBalance.toLocaleString()}</h3>
              <p className="text-xs text-slate-400 mt-2">مجموع القيود المرحلة للموردين والمقاولين</p>
          </div>

          {/* Sub-ledger Balance */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <p className="text-sm font-bold text-slate-500 mb-2">رصيد كشوف الحسابات (المستندات)</p>
              <h3 className="text-3xl font-black text-blue-600 dir-ltr">{subLedgerBalance.toLocaleString()}</h3>
              <p className="text-xs text-slate-400 mt-2">فواتير - مستخلصات مقاولين - سندات - شيكات</p>
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
