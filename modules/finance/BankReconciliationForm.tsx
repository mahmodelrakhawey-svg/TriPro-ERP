﻿import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { 
  Landmark, DollarSign, CheckCircle, AlertCircle, 
  Save, ArrowRightLeft, CheckSquare, Square, Loader2, 
  Calculator, Plus, X
} from 'lucide-react';

const BankReconciliationForm = () => {
  const { accounts, entries, refreshData, addEntry } = useAccounting();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [statementDate, setStatementDate] = useState(new Date().toISOString().split('T')[0]);
  const [statementBalance, setStatementBalance] = useState<number>(0);
  const [reconciledIds, setReconciledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [view, setView] = useState<'new' | 'history'>('new');
  const [previousReconciliation, setPreviousReconciliation] = useState<any>(null);

  // حالة نافذة التسوية (مصروفات/فوائد)
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjType, setAdjType] = useState<'expense' | 'income'>('expense');
  const [adjAmount, setAdjAmount] = useState(0);
  const [adjDesc, setAdjDesc] = useState('');

  // تصفية حسابات البنوك (الأصول التي تحتوي على كلمة بنك أو كود يبدأ بـ 102)
  const bankAccounts = useMemo(() => accounts.filter(a => {
    const type = (a.type || '').toUpperCase();
    return (type === 'ASSET' || type === 'أصول') && (a.name.includes('بنك') || a.name.includes('Bank') || a.code.startsWith('102') || a.code.startsWith('1103'));
  }), [accounts]);

  // جلب تاريخ التسويات للحساب المختار
  useEffect(() => {
    if (!selectedAccountId) {
        setHistory([]);
        setPreviousReconciliation(null);
        return;
    }
    
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('bank_reconciliations')
          .select('*')
          .eq('account_id', selectedAccountId)
          .order('statement_date', { ascending: false });
        
        if (error) throw error;
        
        setHistory(data || []);
        if (data && data.length > 0) {
          setPreviousReconciliation(data[0]); // آخر تسوية
        } else {
          setPreviousReconciliation(null);
        }
      } catch (err) {
        console.error("Error fetching reconciliation history:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [selectedAccountId]);

  // تجميع كل المعرفات التي تم تسويتها سابقاً لاستبعادها
  const allPreviouslyReconciledIds = useMemo(() => {
    const ids = new Set<string>();
    history.forEach(rec => {
      if (Array.isArray(rec.reconciled_ids)) {
        rec.reconciled_ids.forEach((id: string) => ids.add(id));
      }
    });
    return ids;
  }, [history]);

  // جلب حركات الحساب من القيود (التي لم يتم تسويتها)
  const transactions = useMemo(() => {
    if (!selectedAccountId) return [];

    const lines: any[] = [];
    entries.forEach(entry => {
        if (entry.status === 'posted') {
            entry.lines.forEach((line: any) => {
                // التحقق من الحساب واستبعاد ما تم تسويته سابقاً
                if (line.accountId === selectedAccountId && line.id && !allPreviouslyReconciledIds.has(line.id)) {
                    // تصفية حسب التاريخ (فقط الحركات حتى تاريخ الكشف)
                    if (entry.date <= statementDate) {
                        lines.push({
                            ...line,
                            date: entry.date,
                            reference: entry.reference,
                            entryId: entry.id,
                            type: line.debit > 0 ? 'debit' : 'credit',
                            amount: line.debit > 0 ? line.debit : line.credit
                        });
                    }
                }
            });
        }
    });
    return lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [entries, selectedAccountId, statementDate, allPreviouslyReconciledIds]);

  // التعامل مع تحديد الحركات
  const toggleReconciled = (id: string) => {
    const newSet = new Set(reconciledIds);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setReconciledIds(newSet);
  };

  const selectAll = () => {
    if (reconciledIds.size === transactions.length) {
        setReconciledIds(new Set());
    } else {
        const newSet = new Set<string>();
        transactions.forEach(t => newSet.add(t.id));
        setReconciledIds(newSet);
    }
  };

  // الحسابات والأرقام
  const openingBalance = previousReconciliation ? Number(previousReconciliation.statement_balance) : 0;
  
  const clearedItems = transactions.filter(t => reconciledIds.has(t.id));
  const totalClearedDeposits = clearedItems.filter(t => t.debit > 0).reduce((sum, t) => sum + t.amount, 0);
  const totalClearedPayments = clearedItems.filter(t => t.credit > 0).reduce((sum, t) => sum + t.amount, 0);
  
  // الرصيد المحتسب = رصيد البداية + الإيداعات المسواة - المدفوعات المسواة
  const calculatedBalance = openingBalance + totalClearedDeposits - totalClearedPayments;
  
  // الفرق = رصيد الكشف (المدخل) - الرصيد المحتسب
  const difference = statementBalance - calculatedBalance;

  // رصيد الدفتر الحالي (للمعلومة)
  const bookBalance = useMemo(() => {
      if (!selectedAccountId) return 0;
      const acc = accounts.find(a => a.id === selectedAccountId);
      return acc ? acc.balance : 0;
  }, [selectedAccountId, accounts]);

  const handleSave = async () => {
    if (!selectedAccountId) return;
    if (Math.abs(difference) > 0.01) {
        if (!window.confirm('يوجد فرق في التسوية. هل أنت متأكد من الحفظ؟ سيبقى الفرق معلقاً.')) return;
    }

    setSaving(true);
    try {
        const { error } = await supabase.from('bank_reconciliations').insert({
            account_id: selectedAccountId,
            statement_date: statementDate,
            statement_balance: statementBalance,
            book_balance: bookBalance,
            opening_balance: openingBalance,
            total_deposits: totalClearedDeposits,
            total_payments: totalClearedPayments,
            reconciled_ids: Array.from(reconciledIds),
            status: Math.abs(difference) < 0.01 ? 'balanced' : 'unbalanced',
            notes: Math.abs(difference) > 0.01 ? `تم الحفظ بفرق: ${difference.toFixed(2)}` : 'تسوية متطابقة'
        });

        if (error) throw error;

        alert('تم حفظ التسوية البنكية بنجاح ✅');
        setReconciledIds(new Set());
        setStatementBalance(0);
        refreshData();
        // إعادة تحميل التاريخ
        const { data } = await supabase.from('bank_reconciliations').select('*').eq('account_id', selectedAccountId).order('statement_date', { ascending: false });
        setHistory(data || []);
        if (data && data.length > 0) setPreviousReconciliation(data[0]);

    } catch (error: any) {
        console.error(error);
        alert('فشل حفظ التسوية: ' + error.message);
    } finally {
        setSaving(false);
    }
  };

  const handleCreateAdjustment = async () => {
      if (!selectedAccountId || adjAmount <= 0) return;
      
      const bankChargesAcc = accounts.find(a => a.code === '5203');
      const bankInterestAcc = accounts.find(a => a.code === '4202');

      if (adjType === 'expense' && !bankChargesAcc) {
          alert('حساب المصروفات البنكية (5203) غير موجود في الدليل. يرجى تحديث الصفحة.');
          return;
      }
      if (adjType === 'income' && !bankInterestAcc) {
          alert('حساب الفوائد البنكية (4202) غير موجود في الدليل. يرجى تحديث الصفحة.');
          return;
      }

      setSaving(true);
      try {
          const lines = [];
          const description = adjDesc || (adjType === 'expense' ? 'مصروفات بنكية - تسوية' : 'فوائد بنكية - تسوية');

          if (adjType === 'expense') {
              // من ح/ مصروفات بنكية إلى ح/ البنك
              lines.push({ accountId: bankChargesAcc!.id, debit: adjAmount, credit: 0, description });
              lines.push({ accountId: selectedAccountId, debit: 0, credit: adjAmount, description });
          } else {
              // من ح/ البنك إلى ح/ فوائد دائنة
              lines.push({ accountId: selectedAccountId, debit: adjAmount, credit: 0, description });
              lines.push({ accountId: bankInterestAcc!.id, debit: 0, credit: adjAmount, description });
          }

          await addEntry({
              date: statementDate,
              reference: `ADJ-${Date.now().toString().slice(-6)}`,
              description: description,
              status: 'posted',
              lines: lines as any[]
          });

          alert('تم إنشاء قيد التسوية بنجاح ✅');
          setShowAdjustmentModal(false);
          setAdjAmount(0);
          setAdjDesc('');
          await refreshData(); // تحديث البيانات لظهور القيد الجديد في القائمة
      } catch (error: any) {
          alert('فشل إنشاء القيد: ' + error.message);
      } finally {
          setSaving(false);
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Landmark className="text-blue-600" /> تسوية بنكية
            </h2>
            <p className="text-slate-500">مطابقة رصيد البنك في النظام مع كشف الحساب البنكي</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
                onClick={() => setView('new')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${view === 'new' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                تسوية جديدة
            </button>
            <button 
                onClick={() => setView('history')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${view === 'history' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                سجل التسويات
            </button>
        </div>
      </div>

      {view === 'new' ? (
        <>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">اختر الحساب البنكي</label>
                  <select 
                    value={selectedAccountId} 
                    onChange={e => setSelectedAccountId(e.target.value)}
                    className="w-full border rounded-lg p-2.5 bg-slate-50 focus:bg-white transition-colors"
                  >
                      <option value="">-- اختر البنك --</option>
                      {bankAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                      ))}
                  </select>
              </div>
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ كشف الحساب</label>
                  <input 
                    type="date" 
                    value={statementDate} 
                    onChange={e => setStatementDate(e.target.value)}
                    className="w-full border rounded-lg p-2.5"
                  />
              </div>
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">رصيد الكشف (النهائي)</label>
                  <div className="relative">
                    <input 
                        type="number" 
                        value={statementBalance || ''} 
                        onChange={e => setStatementBalance(parseFloat(e.target.value) || 0)}
                        className="w-full border rounded-lg p-2.5 pl-10 font-bold text-lg text-blue-700"
                        placeholder="0.00"
                    />
                    <DollarSign className="absolute left-3 top-3 text-slate-400" size={18} />
                  </div>
              </div>
          </div>

          {selectedAccountId && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <ArrowRightLeft size={18} /> الحركات غير المسواة
                        </h3>
                        <div className="text-sm text-slate-500">
                            عدد الحركات: {transactions.length}
                        </div>
                        <button 
                            onClick={() => setShowAdjustmentModal(true)}
                            className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-bold flex items-center gap-1 transition-colors"
                        >
                            <Plus size={14} />
                            إضافة تسوية (مصروف/فائدة)
                        </button>
                    </div>
                    
                    <div className="overflow-y-auto flex-1 p-2">
                        {transactions.length > 0 ? (
                            <table className="w-full text-right text-sm">
                                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 w-10">
                                            <button onClick={selectAll} className="text-slate-400 hover:text-blue-600">
                                                {reconciledIds.size === transactions.length && transactions.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
                                            </button>
                                        </th>
                                        <th className="p-3">التاريخ</th>
                                        <th className="p-3">المرجع</th>
                                        <th className="p-3">البيان</th>
                                        <th className="p-3 text-emerald-600">إيداع (مدين)</th>
                                        <th className="p-3 text-red-600">صرف (دائن)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {transactions.map((t) => (
                                        <tr 
                                            key={t.id} 
                                            className={`hover:bg-blue-50 cursor-pointer transition-colors ${reconciledIds.has(t.id) ? 'bg-blue-50/50' : ''}`}
                                            onClick={() => toggleReconciled(t.id)}
                                        >
                                            <td className="p-3">
                                                <div className={reconciledIds.has(t.id) ? "text-blue-600" : "text-slate-300"}>
                                                    {reconciledIds.has(t.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                                                </div>
                                            </td>
                                            <td className="p-3 font-mono text-slate-600">{t.date}</td>
                                            <td className="p-3 font-mono text-xs bg-slate-100 rounded w-fit px-2">{t.reference}</td>
                                            <td className="p-3 text-slate-700 max-w-[200px] truncate" title={t.description}>{t.description}</td>
                                            <td className="p-3 font-bold text-emerald-600">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                                            <td className="p-3 font-bold text-red-600">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <CheckCircle size={48} className="mb-4 opacity-20" />
                                <p>لا توجد حركات غير مسواة حتى هذا التاريخ</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                        <h3 className="font-bold text-slate-800 border-b pb-2 flex items-center gap-2">
                            <Calculator size={18} /> ملخص التسوية
                        </h3>
                        
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between text-slate-600">
                                <span>رصيد البداية (آخر تسوية):</span>
                                <span className="font-mono">{openingBalance.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-emerald-600">
                                <span>+ إيداعات مسواة:</span>
                                <span className="font-mono font-bold">{totalClearedDeposits.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-red-600">
                                <span>- مدفوعات مسواة:</span>
                                <span className="font-mono font-bold">{totalClearedPayments.toLocaleString()}</span>
                            </div>
                            <div className="border-t pt-2 flex justify-between font-bold text-slate-800 text-base">
                                <span>= الرصيد المحتسب:</span>
                                <span className="font-mono">{calculatedBalance.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-blue-700 bg-blue-50 p-2 rounded">
                                <span>رصيد الكشف (الهدف):</span>
                                <span className="font-mono font-bold">{statementBalance.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className={`p-4 rounded-lg text-center border-2 ${Math.abs(difference) < 0.01 ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
                            <div className="text-xs font-bold uppercase mb-1">الفرق</div>
                            <div className="text-2xl font-black font-mono">{difference.toLocaleString()}</div>
                            {Math.abs(difference) < 0.01 ? (
                                <div className="flex items-center justify-center gap-1 mt-2 text-sm font-bold">
                                    <CheckCircle size={16} /> متطابق
                                </div>
                            ) : (
                                <div className="flex items-center justify-center gap-1 mt-2 text-sm font-bold">
                                    <AlertCircle size={16} /> غير متطابق
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={handleSave}
                            disabled={saving || !selectedAccountId}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                            حفظ التسوية
                        </button>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-500">
                        <p className="font-bold mb-1">معلومات الحساب:</p>
                        <div className="flex justify-between mb-1">
                            <span>رصيد الدفتر الحالي:</span>
                            <span className="font-mono">{bookBalance.toLocaleString()}</span>
                        </div>
                        <p className="mt-2 text-slate-400">
                            * رصيد الدفتر قد يختلف عن رصيد الكشف بسبب الشيكات التي لم تصرف أو الإيداعات بالطريق.
                        </p>
                    </div>
                </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-right">
                <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                    <tr>
                        <th className="p-4">تاريخ الكشف</th>
                        <th className="p-4">رصيد البداية</th>
                        <th className="p-4">إيداعات</th>
                        <th className="p-4">مدفوعات</th>
                        <th className="p-4">رصيد النهاية</th>
                        <th className="p-4">الحالة</th>
                        <th className="p-4">ملاحظات</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {history.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50">
                            <td className="p-4 font-mono">{rec.statement_date}</td>
                            <td className="p-4 font-mono">{Number(rec.opening_balance).toLocaleString()}</td>
                            <td className="p-4 font-mono text-emerald-600">+{Number(rec.total_deposits).toLocaleString()}</td>
                            <td className="p-4 font-mono text-red-600">-{Number(rec.total_payments).toLocaleString()}</td>
                            <td className="p-4 font-mono font-bold text-blue-700">{Number(rec.statement_balance).toLocaleString()}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${rec.status === 'balanced' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {rec.status === 'balanced' ? 'متطابق' : 'يوجد فرق'}
                                </span>
                            </td>
                            <td className="p-4 text-sm text-slate-500">{rec.notes}</td>
                        </tr>
                    ))}
                    {history.length === 0 && (
                        <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400">لا يوجد سجل تسويات لهذا الحساب</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      )}

      {/* نافذة إضافة قيد تسوية */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800">إضافة قيد تسوية بنكية</h3>
                    <button onClick={() => setShowAdjustmentModal(false)} className="text-slate-400 hover:text-red-500">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">نوع الحركة</label>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setAdjType('expense')}
                                className={`flex-1 py-2 rounded-lg font-bold text-sm border ${adjType === 'expense' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-600'}`}
                            >
                                مصروفات بنكية
                            </button>
                            <button 
                                onClick={() => setAdjType('income')}
                                className={`flex-1 py-2 rounded-lg font-bold text-sm border ${adjType === 'income' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600'}`}
                            >
                                فوائد بنكية (إيراد)
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ</label>
                        <input type="number" min="0" step="0.01" value={adjAmount || ''} onChange={e => setAdjAmount(parseFloat(e.target.value) || 0)} className="w-full border rounded-lg p-2" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">البيان / الملاحظات</label>
                        <input type="text" value={adjDesc} onChange={e => setAdjDesc(e.target.value)} placeholder={adjType === 'expense' ? 'مثال: عمولات بنكية' : 'مثال: فوائد دائنة'} className="w-full border rounded-lg p-2" />
                    </div>
                    <button 
                        onClick={handleCreateAdjustment}
                        disabled={saving || adjAmount <= 0}
                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {saving ? 'جاري الحفظ...' : 'إنشاء القيد'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default BankReconciliationForm;
