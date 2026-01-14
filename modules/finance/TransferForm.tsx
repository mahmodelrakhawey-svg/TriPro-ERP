import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { ArrowRightLeft, Save, DollarSign, Loader2, Building2 } from 'lucide-react';

const TransferForm = () => {
  const { addTransfer, accounts } = useAccounting();
  const [loading, setLoading] = useState(false);
  
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
      a.code.startsWith('101') || 
      a.name.includes('خزينة') || 
      a.name.includes('نقد') || 
      a.name.includes('بنك') ||
      a.name.includes('صندوق')
    )
  ), [accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.sourceAccountId === formData.destinationAccountId) {
        alert('لا يمكن التحويل لنفس الحساب');
        return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
        alert('يرجى إدخال مبلغ صحيح');
        return;
    }
    
    setLoading(true);
    try {
        await addTransfer({ ...formData, amount: Number(formData.amount) });
        alert('تم التحويل المالي بنجاح ✅');
        setFormData({ ...formData, amount: '', description: '' });
    } catch (error: any) {
        alert('فشل التحويل: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <ArrowRightLeft className="text-blue-600" /> تحويل نقدية
            </h2>
            <p className="text-slate-500">نقل الأموال بين الخزائن والبنوك</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="grid grid-cols-1 gap-6">
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">التاريخ</label>
                  <input type="date" required className="w-full border rounded-lg p-2.5" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">من حساب (المصدر)</label>
                      <div className="relative">
                        <select required className="w-full border rounded-lg p-2.5 appearance-none" value={formData.sourceAccountId} onChange={e => setFormData({...formData, sourceAccountId: e.target.value})}>
                            <option value="">-- اختر --</option>
                            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                        </select>
                        <Building2 className="absolute left-3 top-3 text-slate-400" size={18} />
                      </div>
                  </div>
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">إلى حساب (المستلم)</label>
                      <div className="relative">
                        <select required className="w-full border rounded-lg p-2.5 appearance-none" value={formData.destinationAccountId} onChange={e => setFormData({...formData, destinationAccountId: e.target.value})}>
                            <option value="">-- اختر --</option>
                            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                        </select>
                        <Building2 className="absolute left-3 top-3 text-slate-400" size={18} />
                      </div>
                  </div>
              </div>

              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">المبلغ</label>
                  <div className="relative">
                      <input type="number" required min="0" step="0.01" className="w-full border rounded-lg p-2.5 pl-10 font-bold text-lg" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} placeholder="0.00" />
                      <DollarSign className="absolute left-3 top-3 text-slate-400" size={18} />
                  </div>
              </div>

              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ملاحظات</label>
                  <input type="text" className="w-full border rounded-lg p-2.5" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="سبب التحويل..." />
              </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button type="submit" disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />} إتمام التحويل
              </button>
          </div>
      </form>
    </div>
  );
};

export default TransferForm;