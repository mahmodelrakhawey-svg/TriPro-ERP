import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { 
  ArrowRightLeft, Save, DollarSign, Loader2, Building2, 
  History, Trash2, Edit, Search, Plus, AlertCircle, X, RefreshCw 
} from 'lucide-react';
import { z } from 'zod';

const TransferForm = () => {
  const { addTransfer, updateTransfer, deleteTransfer, accounts, entries } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    sourceAccountId: '',
    destinationAccountId: '',
    amount: '',
    description: ''
  });

  // تصفية حسابات النقدية والبنوك (الأصول المتداولة - النقدية وما في حكمها)
  const treasuryAccounts = useMemo(() => accounts.filter(a => 
    !a.isGroup && (
      a.code.startsWith('123') || a.code.startsWith('101') || 
      a.name.includes('خزينة') || 
      a.name.includes('نقد') || 
      a.name.includes('بنك') ||
      a.name.includes('صندوق')
    )
  ), [accounts]);

  // فلترة وتحضير التحويلات المالية من قيود اليومية المتاحة في السياق
  const treasuryTransfers = useMemo(() => {
    return (entries || [])
      .filter(entry => entry.reference && entry.reference.startsWith('TRF-'))
      .map(entry => {
        const lines = entry.journal_lines || [];
        // سطر الدائن هو الحساب المصدر (نقصت أمواله)
        const sourceLine = lines.find(l => Number(l.credit) > 0);
        // سطر المدين هو الحساب المستلم (زادت أمواله)
        const destLine = lines.find(l => Number(l.debit) > 0);
        
        const sourceAccount = accounts.find(a => a.id === sourceLine?.account_id);
        const destinationAccount = accounts.find(a => a.id === destLine?.account_id);
        
        return {
          id: entry.id,
          date: entry.transaction_date,
          description: entry.description,
          reference: entry.reference,
          amount: sourceLine ? Number(sourceLine.credit) : (destLine ? Number(destLine.debit) : 0),
          sourceAccountId: sourceLine?.account_id || '',
          sourceAccountName: sourceAccount ? `${sourceAccount.name} (${sourceAccount.code})` : 'غير معروف',
          destinationAccountId: destLine?.account_id || '',
          destinationAccountName: destinationAccount ? `${destinationAccount.name} (${destinationAccount.code})` : 'غير معروف',
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries, accounts]);

  // فلترة حسب البحث السريع
  const filteredTransfers = useMemo(() => {
    if (!searchTerm.trim()) return treasuryTransfers;
    const term = searchTerm.toLowerCase();
    return treasuryTransfers.filter(t => 
      t.description?.toLowerCase().includes(term) ||
      t.reference?.toLowerCase().includes(term) ||
      t.sourceAccountName?.toLowerCase().includes(term) ||
      t.destinationAccountName?.toLowerCase().includes(term) ||
      t.amount.toString().includes(term) ||
      t.date.includes(term)
    );
  }, [treasuryTransfers, searchTerm]);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      sourceAccountId: '',
      destinationAccountId: '',
      amount: '',
      description: ''
    });
    setEditingId(null);
  };

  const handleEditInit = (transfer: any) => {
    setFormData({
      date: transfer.date,
      sourceAccountId: transfer.sourceAccountId,
      destinationAccountId: transfer.destinationAccountId,
      amount: transfer.amount.toString(),
      description: transfer.description || ''
    });
    setEditingId(transfer.id);
    setActiveTab('new');
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await deleteTransfer(id);
      showToast('تم التراجع عن التحويل المالي وحذف القيد بنجاح 🗑️', 'success');
      setDeleteConfirmId(null);
    } catch (error: any) {
      showToast('فشل التراجع عن التحويل: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const transferSchema = z.object({
        sourceAccountId: z.string().min(1, 'الرجاء اختيار الحساب المصدر'),
        destinationAccountId: z.string().min(1, 'الرجاء اختيار الحساب المستلم'),
        amount: z.number().min(0.01, 'المبلغ يجب أن يكون أكبر من 0'),
        date: z.string().min(1, 'التاريخ مطلوب'),
    }).refine(data => data.sourceAccountId !== data.destinationAccountId, {
        message: "لا يمكن التحويل لنفس الحساب",
        path: ["destinationAccountId"]
    });

    const validationResult = transferSchema.safeParse({
        sourceAccountId: formData.sourceAccountId,
        destinationAccountId: formData.destinationAccountId,
        amount: Number(formData.amount),
        date: formData.date
    });

    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }
    
    setLoading(true);
    try {
        if (editingId) {
          await updateTransfer(editingId, { ...formData, amount: Number(formData.amount) });
          showToast('تم تعديل التحويل المالي وتحديث الأرصدة بنجاح ✅', 'success');
          resetForm();
          setActiveTab('history');
        } else {
          await addTransfer({ ...formData, amount: Number(formData.amount) });
          showToast('تم التحويل المالي بنجاح ✅', 'success');
          resetForm();
        }
    } catch (error: any) {
        showToast('فشل العملية: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className={`mx-auto space-y-6 animate-in fade-in transition-all duration-300 ${activeTab === 'history' ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <ArrowRightLeft className="text-blue-600" /> تحويل نقدية
            </h2>
            <p className="text-slate-500">نقل الأموال بين الخزائن والبنوك وإدارة قيودها</p>
        </div>

        {/* أزرار التبويب */}
        <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 border border-slate-200/50 self-end md:self-auto">
          <button
            onClick={() => { setActiveTab('new'); if (!editingId) resetForm(); }}
            className={`flex items-center gap-1.5 px-4 py-2 font-bold text-sm rounded-lg transition-all ${
              activeTab === 'new'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {editingId ? <Edit size={16} /> : <Plus size={16} />}
            <span>{editingId ? 'تعديل التحويل' : 'تحويل جديد'}</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-4 py-2 font-bold text-sm rounded-lg transition-all ${
              activeTab === 'history'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <History size={16} />
            <span>سجل التحويلات</span>
            {treasuryTransfers.length > 0 && (
              <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs font-black">
                {treasuryTransfers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'new' ? (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          {editingId && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg flex justify-between items-center text-sm font-bold">
              <span className="flex items-center gap-2">
                <AlertCircle size={18} />
                أنت تقوم الآن بتعديل التحويل المالي ذو الرقم المرجعي الموضح في سجل التحويلات.
              </span>
              <button type="button" onClick={resetForm} className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <X size={16} /> إلغاء التعديل
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">التاريخ</label>
                  <input 
                    type="date" 
                    required 
                    className="w-full border rounded-lg p-2.5 outline-none focus:border-blue-500" 
                    value={formData.date} 
                    onChange={e => setFormData({...formData, date: e.target.value})} 
                  />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">من حساب (المصدر)</label>
                      <div className="relative">
                        <select 
                          required 
                          className="w-full border rounded-lg p-2.5 appearance-none outline-none focus:border-blue-500" 
                          value={formData.sourceAccountId} 
                          onChange={e => setFormData({...formData, sourceAccountId: e.target.value})}
                        >
                            <option value="">-- اختر --</option>
                            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                        </select>
                        <Building2 className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={18} />
                      </div>
                  </div>
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">إلى حساب (المستلم)</label>
                      <div className="relative">
                        <select 
                          required 
                          className="w-full border rounded-lg p-2.5 appearance-none outline-none focus:border-blue-500" 
                          value={formData.destinationAccountId} 
                          onChange={e => setFormData({...formData, destinationAccountId: e.target.value})}
                        >
                            <option value="">-- اختر --</option>
                            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                        </select>
                        <Building2 className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={18} />
                      </div>
                  </div>
              </div>

              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ</label>
                  <div className="relative">
                      <input 
                        type="number" 
                        required 
                        min="0" 
                        step="0.01" 
                        className="w-full border rounded-lg p-2.5 pl-10 font-bold text-lg outline-none focus:border-blue-500" 
                        value={formData.amount} 
                        onChange={e => setFormData({...formData, amount: e.target.value})} 
                        placeholder="0.00" 
                      />
                      <DollarSign className="absolute left-3 top-3.5 text-slate-400" size={18} />
                  </div>
              </div>

              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
                  <input 
                    type="text" 
                    className="w-full border rounded-lg p-2.5 outline-none focus:border-blue-500" 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    placeholder="سبب التحويل..." 
                  />
              </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
              {editingId && (
                <button 
                  type="button" 
                  onClick={resetForm}
                  className="border border-slate-200 text-slate-600 px-6 py-3 rounded-lg font-bold hover:bg-slate-50"
                >
                  إلغاء
                </button>
              )}
              <button 
                type="submit" 
                disabled={loading} 
                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
              >
                  {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />} 
                  <span>{editingId ? 'تحديث التحويل' : 'إتمام التحويل'}</span>
              </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col space-y-4 p-6">
          {/* محرك البحث السريع */}
          <div className="relative">
            <Search className="absolute right-4 top-3 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="البحث في التحويلات السابقة بالتاريخ، المبلغ، الملاحظات، أو الحسابات..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full border rounded-xl px-12 py-2.5 outline-none focus:border-blue-500 bg-slate-50 font-bold text-slate-700 text-sm" 
            />
          </div>

          {filteredTransfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
              <History size={48} className="text-slate-300" />
              <p className="font-bold text-slate-500">لا توجد تحويلات مالية سابقة مطابقة للبحث</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-black uppercase tracking-wider">
                  <tr>
                    <th className="py-4 px-4">كود العملية</th>
                    <th className="py-4 px-4">التاريخ</th>
                    <th className="py-4 px-4">من حساب (المصدر)</th>
                    <th className="py-4 px-4 text-center">→</th>
                    <th className="py-4 px-4">إلى حساب (المستلم)</th>
                    <th className="py-4 px-4 text-center">المبلغ</th>
                    <th className="py-4 px-4">ملاحظات</th>
                    <th className="py-4 px-4 text-center w-28">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredTransfers.map(transfer => (
                    <tr key={transfer.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-4 px-4 font-mono font-bold text-blue-600">{transfer.reference}</td>
                      <td className="py-4 px-4 text-slate-600 font-medium">{transfer.date}</td>
                      <td className="py-4 px-4 font-semibold text-slate-700">{transfer.sourceAccountName}</td>
                      <td className="py-4 px-4 text-center text-slate-400">
                        <ArrowRightLeft size={14} className="inline text-blue-400" />
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-700">{transfer.destinationAccountName}</td>
                      <td className="py-4 px-4 text-center font-black text-slate-900">
                        {transfer.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-4 text-slate-500 text-xs max-w-xs truncate" title={transfer.description}>
                        {transfer.description || '-'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => handleEditInit(transfer)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="تعديل التحويل"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => setDeleteConfirmId(transfer.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="التراجع عن التحويل"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* مودال التأكيد على التراجع والحذف */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-6">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-50 rounded-xl">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-lg font-bold">تأكيد التراجع عن التحويل المالي</h3>
            </div>
            
            <p className="text-slate-600 text-sm leading-relaxed">
              هل أنت متأكد من رغبتك في التراجع عن هذه العملية؟ سيتم حذف القيود اليومية المحاسبية المرتبطة بالتحويل نهائياً وإعادة احتساب الأرصدة المتأثرة تلقائياً. لا يمكن التراجع عن هذا الإجراء لاحقاً.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setDeleteConfirmId(null)}
                disabled={loading}
                className="px-4 py-2 border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-sm"
              >
                إلغاء
              </button>
              <button 
                type="button" 
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-50 text-sm shadow-md shadow-red-100"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                <span>نعم، تراجع واحذف</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransferForm;