import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Save, Loader2, Wallet, Calendar, FileText, DollarSign, AlertCircle, CheckCircle, Building2 } from 'lucide-react';

const ExpenseVoucherForm = () => {
  const { accounts, addPaymentVoucher, costCenters } = useAccounting();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    description: '',
    treasuryAccountId: '',
    expenseAccountId: '',
    costCenterId: ''
  });

  // تصفية حسابات الخزينة والبنوك (الأصول المتداولة النقدية)
  const treasuryAccounts = useMemo(() => accounts.filter(a => {
    if (a.isGroup) return false;
    const type = String(a.type || '').toLowerCase();
    const name = a.name.toLowerCase();
    const code = a.code;
    
    const isAsset = type.includes('asset') || type.includes('أصول') || type === '';
    const hasKeyword = name.includes('نقد') || name.includes('خزينة') || name.includes('بنك') || name.includes('صندوق') || name.includes('cash') || name.includes('bank');
    const hasCode = code.startsWith('101');

    return isAsset && (hasKeyword || hasCode);
  }), [accounts]);

  // تصفية حسابات المصروفات
  const expenseAccounts = useMemo(() => accounts.filter(a => {
    if (a.isGroup) return false;
    const type = String(a.type || '').toLowerCase();
    const code = a.code;
    return type.includes('expense') || type.includes('مصروف') || code.startsWith('5');
  }), [accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.treasuryAccountId || !formData.expenseAccountId || !formData.amount) {
        alert('يرجى تعبئة جميع الحقول المطلوبة (المبلغ، الخزينة، حساب المصروف)');
        return;
    }

    setLoading(true);
    try {
        const expenseAccountName = accounts.find(a => a.id === formData.expenseAccountId)?.name;
        
        await addPaymentVoucher({
            date: formData.date,
            amount: Number(formData.amount),
            description: formData.description || `صرف مصروف: ${expenseAccountName}`,
            treasuryAccountId: formData.treasuryAccountId,
            targetAccountId: formData.expenseAccountId,
            costCenterId: formData.costCenterId,
            subType: 'expense',
            partyName: 'مصروفات تشغيلية'
        });
        
        setSuccess(true);
        setFormData({
            date: new Date().toISOString().split('T')[0],
            amount: '',
            description: '',
            treasuryAccountId: formData.treasuryAccountId, // الإبقاء على الخزينة لتسهيل الإدخال المتكرر
            expenseAccountId: '',
            costCenterId: ''
        });
        setTimeout(() => setSuccess(false), 3000);
    } catch (error: any) {
        alert('حدث خطأ: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-in fade-in">
        <div className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <Wallet className="text-red-600" /> سند صرف مصروف
                </h1>
                <p className="text-slate-500 mt-1">تسجيل المصروفات النثرية والتشغيلية وصرفها من الخزينة أو البنك</p>
            </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            {success && (
                <div className="bg-emerald-50 p-4 flex items-center gap-3 text-emerald-700 font-bold border-b border-emerald-100">
                    <CheckCircle size={24} />
                    تم حفظ سند الصرف بنجاح!
                </div>
            )}
            
            <form onSubmit={handleSubmit} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* القسم الأيمن: البيانات المالية */}
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <DollarSign size={16} className="text-slate-400"/> المبلغ
                        </label>
                        <input 
                            type="number" 
                            min="0" 
                            step="0.01"
                            required
                            value={formData.amount}
                            onChange={e => setFormData({...formData, amount: e.target.value})}
                            className="w-full text-3xl font-black text-slate-800 border-b-2 border-slate-200 focus:border-red-500 outline-none py-2 bg-transparent placeholder-slate-200"
                            placeholder="0.00"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <Calendar size={16} className="text-slate-400"/> التاريخ
                        </label>
                        <input 
                            type="date" 
                            required
                            value={formData.date}
                            onChange={e => setFormData({...formData, date: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none font-bold text-slate-600"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <FileText size={16} className="text-slate-400"/> البيان / الوصف
                        </label>
                        <textarea 
                            rows={3}
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none font-medium text-slate-600 resize-none"
                            placeholder="اكتب تفاصيل المصروف هنا..."
                        ></textarea>
                    </div>
                </div>

                {/* القسم الأيسر: الحسابات */}
                <div className="space-y-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">حساب المصروف (المدين)</label>
                        <select 
                            required
                            value={formData.expenseAccountId}
                            onChange={e => setFormData({...formData, expenseAccountId: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none bg-white font-bold text-slate-700"
                        >
                            <option value="">اختر نوع المصروف...</option>
                            {expenseAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">يصرف من (الدائن)</label>
                        <select 
                            required
                            value={formData.treasuryAccountId}
                            onChange={e => setFormData({...formData, treasuryAccountId: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none bg-white font-bold text-slate-700"
                        >
                            <option value="">اختر الخزينة أو البنك...</option>
                            {treasuryAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <Building2 size={16} className="text-slate-400"/> مركز التكلفة (اختياري)
                        </label>
                        <select 
                            value={formData.costCenterId}
                            onChange={e => setFormData({...formData, costCenterId: e.target.value})}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none bg-white font-medium text-slate-600"
                        >
                            <option value="">بدون مركز تكلفة</option>
                            {costCenters.map(cc => (
                                <option key={cc.id} value={cc.id}>{cc.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-slate-100">
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-red-600 text-white py-4 rounded-xl font-black text-lg hover:bg-red-700 transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                        حفظ سند الصرف
                    </button>
                </div>

            </form>
        </div>
    </div>
  );
};

export default ExpenseVoucherForm;
