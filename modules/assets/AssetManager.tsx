import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Building, Plus, Activity, Save, Printer, PlayCircle, X, TrendingUp } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { z } from 'zod';

const AssetManager = () => {
  const { assets, addAsset, runDepreciation, revaluateAsset, accounts } = useAccounting();
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    purchaseDate: '',
    purchaseCost: 0,
    salvageValue: 0,
    usefulLife: 5,
    assetAccountId: '',
    accumulatedDepreciationAccountId: '',
    depreciationExpenseAccountId: '',
    createJournalEntry: true,
    creditAccountId: ''
  });
  const [isDepreciationModalOpen, setIsDepreciationModalOpen] = useState(false);
  const [depreciationDate, setDepreciationDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [isRevaluationModalOpen, setIsRevaluationModalOpen] = useState(false);
  const [revaluationData, setRevaluationData] = useState({
      assetId: '',
      currentValue: 0,
      newValue: 0,
      date: new Date().toISOString().split('T')[0],
      accountId: ''
  });

  const handleRunPeriodDepreciation = async () => {
    if (!window.confirm(`هل أنت متأكد من تشغيل الإهلاك لشهر ${depreciationDate.slice(0, 7)}؟\nسيتم إنشاء قيود إهلاك لجميع الأصول النشطة.`)) return;

    try {
        const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
        if (!org) throw new Error("لم يتم العثور على المنظمة");

        const { data, error } = await supabase.rpc('run_period_depreciation', {
            p_date: depreciationDate,
            p_org_id: org.id
        });

        if (error) throw error;

        showToast(`تمت العملية بنجاح ✅ (تم معالجة: ${data.processed}، تم التخطي: ${data.skipped})`, 'success');
        setIsDepreciationModalOpen(false);
        // تحديث البيانات
        window.location.reload(); 
    } catch (error: any) {
        console.error(error);
        showToast('فشل تشغيل الإهلاك: ' + error.message, 'error');
    }
  };

  // تصحيح الفلتر ليقبل الحروف الصغيرة والكبيرة (asset/ASSET)
  const assetAccounts = accounts.filter(a => (String(a.type).toLowerCase() === 'asset') && !a.isGroup);
  const expenseAccounts = accounts.filter(a => (String(a.type).toLowerCase() === 'expense') && !a.isGroup);
  const revaluationAccounts = accounts.filter(a => !a.isGroup && ['revenue', 'equity', 'expense'].includes(String(a.type).toLowerCase()));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const assetSchema = z.object({
        name: z.string().min(1, 'اسم الأصل مطلوب'),
        purchaseDate: z.string().min(1, 'تاريخ الشراء مطلوب'),
        purchaseCost: z.number().min(0, 'التكلفة يجب أن تكون 0 أو أكثر'),
        salvageValue: z.number().min(0, 'قيمة الخردة يجب أن تكون 0 أو أكثر'),
        usefulLife: z.number().min(0.1, 'العمر الإنتاجي يجب أن يكون أكبر من 0'),
        assetAccountId: z.string().min(1, 'حساب الأصل مطلوب'),
    });

    const validationResult = assetSchema.safeParse(formData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }
    await addAsset(formData);
    setIsModalOpen(false);
  };

  const openRevaluationModal = (asset: any) => {
      setRevaluationData({
          assetId: asset.id,
          currentValue: asset.currentValue,
          newValue: asset.currentValue,
          date: new Date().toISOString().split('T')[0],
          accountId: ''
      });
      setIsRevaluationModalOpen(true);
  };

  const handleRevaluationSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const revaluationSchema = z.object({
          newValue: z.number().min(0, 'القيمة الجديدة يجب أن تكون 0 أو أكثر'),
          date: z.string().min(1, 'تاريخ التقييم مطلوب'),
          accountId: z.string().min(1, 'يرجى اختيار حساب الفائض/الخسارة')
      });

      const validationResult = revaluationSchema.safeParse(revaluationData);
      if (!validationResult.success) {
          showToast(validationResult.error.issues[0].message, 'warning');
          return;
      }
      await revaluateAsset(revaluationData.assetId, revaluationData.newValue, revaluationData.date, revaluationData.accountId);
      setIsRevaluationModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building className="text-blue-600" /> الأصول الثابتة
          </h2>
          <p className="text-slate-500">سجل الأصول، الإهلاك، والقيمة الدفترية</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 shadow-sm">
                <Printer size={18} /> طباعة التقرير
            </button>
            <button onClick={() => setIsDepreciationModalOpen(true)} className="bg-amber-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-700 shadow-sm">
                <PlayCircle size={18} /> تشغيل الإهلاك الشهري
            </button>
            <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 shadow-sm">
                <Plus size={20} /> إضافة أصل
            </button>
        </div>
      </div>

      <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-bold">سجل الأصول الثابتة وإهلاكاتها</h1>
          <p className="text-sm text-slate-500">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b">
            <tr>
              <th className="p-4">اسم الأصل</th>
              <th className="p-4">تاريخ الشراء</th>
              <th className="p-4">التكلفة</th>
              <th className="p-4">مجمع الإهلاك</th>
              <th className="p-4">القيمة الحالية</th>
              <th className="p-4 text-center print:hidden">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {assets.map(asset => (
              <tr key={asset.id} className="hover:bg-slate-50">
                <td className="p-4 font-bold">{asset.name}</td>
                <td className="p-4">{asset.purchaseDate || asset.purchase_date}</td>
                <td className="p-4">{(asset.purchaseCost || asset.purchase_cost || 0).toLocaleString()}</td>
                <td className="p-4 text-red-600">{(asset.totalDepreciation || asset.total_depreciation || 0).toLocaleString()}</td>
                <td className="p-4 font-bold text-emerald-600">{(asset.currentValue || asset.current_value || 0).toLocaleString()}</td>
                <td className="p-4 text-center print:hidden flex justify-center gap-2">
                  <button 
                    disabled={((asset.currentValue || asset.current_value || 0) - (asset.salvageValue || asset.salvage_value || 0)) <= 0.1}
                    onClick={() => {
                        if ((!asset.usefulLife && !asset.useful_life_years) || (asset.usefulLife || asset.useful_life_years || 0) <= 0) {
                            showToast('يرجى تحديد العمر الإنتاجي للأصل أولاً.', 'warning');
                            return;
                        }

                        const depreciableAmount = (asset.purchaseCost || asset.purchase_cost || 0) - (asset.salvageValue || asset.salvage_value || 0);
                        const monthlyDepreciation = depreciableAmount / ((asset.usefulLife || asset.useful_life_years || 1) * 12);
                        
                        // التحقق من القيمة المتبقية لضمان عدم الإهلاك الزائد
                        const currentVal = (asset.currentValue || asset.current_value) ?? (asset.purchaseCost || asset.purchase_cost || 0);
                        const remainingValue = currentVal - (asset.salvageValue || asset.salvage_value || 0);

                        if (remainingValue <= 0.1) {
                             showToast('هذا الأصل مهلك بالكامل (وصل لقيمة الخردة).', 'warning');
                             return;
                        }

                        // إذا كان القسط الشهري أكبر من المتبقي، نأخذ المتبقي فقط (القسط الأخير)
                        const amountToDepreciate = Math.min(monthlyDepreciation, remainingValue);

                        if(window.confirm(`تسجيل إهلاك شهري بقيمة ${amountToDepreciate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}؟`)) {
                            runDepreciation(asset.id, amountToDepreciate, new Date().toISOString().split('T')[0]);
                        }
                    }}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                        ((asset.currentValue || asset.current_value || 0) - (asset.salvageValue || asset.salvage_value || 0)) <= 0.1
                        ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    }`}
                  >
                    {((asset.currentValue || asset.current_value || 0) - (asset.salvageValue || asset.salvage_value || 0)) <= 0.1 ? 'تم الإهلاك' : 'تسجيل إهلاك'}
                  </button>
                  <button 
                    onClick={() => openRevaluationModal(asset)}
                    className="text-xs px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center gap-1"
                    title="إعادة تقييم"
                  >
                    <TrendingUp size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
              <tr>
                  <td colSpan={2} className="p-4 text-left">الإجمالي:</td>
                  <td className="p-4">{assets.reduce((sum, a) => sum + (a.purchaseCost || a.purchase_cost || 0), 0).toLocaleString()}</td>
                  <td className="p-4 text-red-600">{assets.reduce((sum, a) => sum + (a.totalDepreciation || a.total_depreciation || 0), 0).toLocaleString()}</td>
                  <td className="p-4 text-emerald-600">{assets.reduce((sum, a) => sum + (a.currentValue || a.current_value || 0), 0).toLocaleString()}</td>
                  <td className="print:hidden"></td>
              </tr>
          </tfoot>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="font-bold text-lg mb-4">إضافة أصل جديد</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-bold mb-1">اسم الأصل</label><input required type="text" className="w-full border rounded p-2" onChange={e => setFormData({...formData, name: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold mb-1">تاريخ الشراء</label><input required type="date" className="w-full border rounded p-2" onChange={e => setFormData({...formData, purchaseDate: e.target.value})} /></div>
                <div><label className="block text-sm font-bold mb-1">التكلفة</label><input required type="number" className="w-full border rounded p-2" onChange={e => setFormData({...formData, purchaseCost: parseFloat(e.target.value)})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold mb-1">قيمة الخردة</label><input required type="number" className="w-full border rounded p-2" onChange={e => setFormData({...formData, salvageValue: parseFloat(e.target.value)})} /></div>
                <div><label className="block text-sm font-bold mb-1">العمر الإنتاجي (سنوات)</label><input required type="number" className="w-full border rounded p-2" onChange={e => setFormData({...formData, usefulLife: parseFloat(e.target.value)})} /></div>
              </div>
              <div>
                  <label className="block text-sm font-bold mb-1">حساب الأصل</label>
                  <select required className="w-full border rounded p-2" onChange={e => setFormData({...formData, assetAccountId: e.target.value})}>
                      <option value="">اختر...</option>
                      {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
              </div>
              <div>
                  <label className="block text-sm font-bold mb-1">حساب مجمع الإهلاك</label>
                  <select className="w-full border rounded p-2" onChange={e => setFormData({...formData, accumulatedDepreciationAccountId: e.target.value})}>
                      <option value="">اختر (اختياري)...</option>
                      {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
              </div>
              <div>
                  <label className="block text-sm font-bold mb-1">حساب مصروف الإهلاك</label>
                  <select className="w-full border rounded p-2" onChange={e => setFormData({...formData, depreciationExpenseAccountId: e.target.value})}>
                      <option value="">اختر (اختياري)...</option>
                      {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                      <input type="checkbox" checked={formData.createJournalEntry} onChange={e => setFormData({...formData, createJournalEntry: e.target.checked})} id="createEntry" className="w-4 h-4" />
                      <label htmlFor="createEntry" className="text-sm font-bold text-slate-700 cursor-pointer">إنشاء قيد محاسبي آلي؟</label>
                  </div>
                  
                  {formData.createJournalEntry && (
                      <div>
                          <label className="block text-xs font-bold mb-1 text-slate-600">حساب الدفع / الطرف الدائن</label>
                          <select className="w-full border rounded p-2 text-sm" value={formData.creditAccountId} onChange={e => setFormData({...formData, creditAccountId: e.target.value})}>
                              <option value="">-- اختر (الافتراضي: أرصدة افتتاحية) --</option>
                              {accounts.filter(a => !a.isGroup).map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                          </select>
                      </div>
                  )}
              </div>

              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-bold mt-4">حفظ الأصل</button>
              <button type="button" onClick={() => setIsModalOpen(false)} className="w-full bg-slate-100 text-slate-600 py-2 rounded mt-2">إلغاء</button>
            </form>
          </div>
        </div>
      )}

      {/* Depreciation Run Modal */}
      {isDepreciationModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-slate-800">تشغيل إهلاك الفترة</h3>
                    <button onClick={() => setIsDepreciationModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">سيقوم النظام بحساب الإهلاك لجميع الأصول النشطة لهذا الشهر وإنشاء قيود اليومية تلقائياً.</p>
                    <div>
                        <label className="block text-sm font-bold mb-1">تاريخ الإهلاك (نهاية الشهر)</label>
                        <input type="date" value={depreciationDate} onChange={e => setDepreciationDate(e.target.value)} className="w-full border rounded-lg p-2" />
                    </div>
                    <button onClick={handleRunPeriodDepreciation} className="w-full bg-amber-600 text-white py-3 rounded-lg font-bold hover:bg-amber-700 mt-4 flex justify-center items-center gap-2">
                        <Activity size={18} /> بدء المعالجة
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Revaluation Modal */}
      {isRevaluationModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-slate-800">إعادة تقييم الأصل</h3>
                    <button onClick={() => setIsRevaluationModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <form onSubmit={handleRevaluationSubmit} className="space-y-4">
                    <div className="bg-slate-50 p-3 rounded-lg text-sm">
                        <div className="flex justify-between mb-1"><span>القيمة الحالية:</span> <span className="font-bold">{revaluationData.currentValue.toLocaleString()}</span></div>
                        <div className="flex justify-between text-blue-600"><span>الفرق:</span> <span className="font-bold" dir="ltr">{(revaluationData.newValue - revaluationData.currentValue).toLocaleString()}</span></div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">القيمة الجديدة (بعد التقييم)</label>
                        <input type="number" required step="0.01" value={revaluationData.newValue} onChange={e => setRevaluationData({...revaluationData, newValue: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2 font-bold text-lg" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">تاريخ إعادة التقييم</label>
                        <input type="date" required value={revaluationData.date} onChange={e => setRevaluationData({...revaluationData, date: e.target.value})} className="w-full border rounded-lg p-2" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1">حساب الفائض / الخسارة</label>
                        <select required className="w-full border rounded-lg p-2" value={revaluationData.accountId} onChange={e => setRevaluationData({...revaluationData, accountId: e.target.value})}>
                            <option value="">-- اختر الحساب --</option>
                            {revaluationAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                            ))}
                        </select>
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 mt-4 flex justify-center items-center gap-2">
                        <Save size={18} /> حفظ التقييم
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default AssetManager;
