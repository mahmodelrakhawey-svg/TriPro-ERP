import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Building, Plus, Activity, Save, Printer, PlayCircle, X, TrendingUp, Pencil, Trash2, QrCode, Tag, Truck, BookOpen } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { z } from 'zod';
import { AssetFieldScanner } from './components/AssetFieldScanner';
import { AssetLabelStudio } from './components/AssetLabelStudio';
import { AssetTransferManager } from './components/AssetTransferManager';

const AssetManager = () => {
  const { assets, addAsset, updateAsset, deleteAsset, runDepreciation, revaluateAsset, accounts, organization, currentUser, currentSelectedOrgId } = useAccounting();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'LIST' | 'SCANNER' | 'LABELS' | 'TRANSFERS'>('LIST');
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

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    purchaseDate: '',
    purchaseCost: 0,
    salvageValue: 0,
    usefulLife: 5,
    assetAccountId: '',
    accumulatedDepreciationAccountId: '',
    depreciationExpenseAccountId: ''
  });

  const handleRunPeriodDepreciation = async () => {
    if (!window.confirm(`هل أنت متأكد من تشغيل الإهلاك لشهر ${depreciationDate.slice(0, 7)}؟\nسيتم إنشاء قيود إهلاك لجميع الأصول النشطة.`)) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const userOrgId = session?.user?.user_metadata?.org_id;
        const orgId = userOrgId || (organization as any)?.id || (currentUser as any)?.organization_id;
        
        if (!orgId) throw new Error("لم يتم العثور على المنظمة");

        const { data, error } = await supabase.rpc('run_period_depreciation', {
            p_date: depreciationDate,
            p_org_id: orgId
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

    // تحويل البيانات لتطابق مسميات أعمدة قاعدة البيانات (snake_case)
    const assetData = {
        name: formData.name,
        purchase_date: formData.purchaseDate,
        purchase_cost: formData.purchaseCost,
        salvage_value: formData.salvageValue,
        useful_life: formData.usefulLife,
        asset_account_id: formData.assetAccountId,
        accumulated_depreciation_account_id: formData.accumulatedDepreciationAccountId,
        depreciation_expense_account_id: formData.depreciationExpenseAccountId,
        create_journal_entry: formData.createJournalEntry,
        credit_account_id: formData.creditAccountId
    };

    await addAsset(assetData);
    setIsModalOpen(false);
  };

  const openRevaluationModal = (asset: any) => {
      const currentVal = asset.currentValue || asset.current_value || 0;
      setRevaluationData({
          assetId: asset.id,
          currentValue: currentVal,
          newValue: currentVal,
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

  const openEditModal = (asset: any) => {
      setEditAssetId(asset.id);
      setEditFormData({
          name: asset.name || '',
          purchaseDate: asset.purchaseDate || asset.purchase_date || '',
          purchaseCost: asset.purchaseCost || asset.purchase_cost || 0,
          salvageValue: asset.salvageValue || asset.salvage_value || 0,
          usefulLife: asset.usefulLife || asset.useful_life || 5,
          assetAccountId: asset.assetAccountId || asset.asset_account_id || '',
          accumulatedDepreciationAccountId: asset.accumulatedDepreciationAccountId || asset.accumulated_depreciation_account_id || '',
          depreciationExpenseAccountId: asset.depreciationExpenseAccountId || asset.depreciation_expense_account_id || ''
      });
      setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editAssetId) return;

      const assetSchema = z.object({
          name: z.string().min(1, 'اسم الأصل مطلوب'),
          purchaseDate: z.string().min(1, 'تاريخ الشراء مطلوب'),
          purchaseCost: z.number().min(0, 'التكلفة يجب أن تكون 0 أو أكثر'),
          salvageValue: z.number().min(0, 'قيمة الخردة يجب أن تكون 0 أو أكثر'),
          usefulLife: z.number().min(0.1, 'العمر الإنتاجي يجب أن يكون أكبر من 0'),
          assetAccountId: z.string().min(1, 'حساب الأصل مطلوب'),
      });

      const validationResult = assetSchema.safeParse(editFormData);
      if (!validationResult.success) {
          showToast(validationResult.error.issues[0].message, 'warning');
          return;
      }

      const updatedAssetData = {
          name: editFormData.name,
          purchase_date: editFormData.purchaseDate,
          purchase_cost: editFormData.purchaseCost,
          salvage_value: editFormData.salvageValue,
          useful_life: editFormData.usefulLife,
          asset_account_id: editFormData.assetAccountId,
          accumulated_depreciation_account_id: editFormData.accumulatedDepreciationAccountId || null,
          depreciation_expense_account_id: editFormData.depreciationExpenseAccountId || null
      };

      try {
          await updateAsset(editAssetId, updatedAssetData);
          showToast('تم تعديل الأصل بنجاح ✅', 'success');
          setIsEditModalOpen(false);
      } catch (err: any) {
          showToast('فشل تعديل الأصل: ' + err.message, 'error');
      }
  };

  const handleDeleteClick = async (asset: any) => {
      if (window.confirm(`هل أنت متأكد من حذف الأصل "${asset.name}"؟`)) {
          try {
              await deleteAsset(asset.id);
              showToast('تم حذف الأصل بنجاح ✅', 'success');
          } catch (err: any) {
              showToast('فشل حذف الأصل: ' + err.message, 'error');
          }
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Building className="text-blue-600 w-7 h-7" /> إدارة الأصول الثابتة والمعدات (Enterprise Asset Suite)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            سجل الأصول، الإهلاك المحاسبي، الجرد الميداني بالباركود، استوديو ملصقات QR، ومناقلات مواقع المقاولات
          </p>
        </div>

        <div className="flex gap-2">
          {activeTab === 'LIST' && (
            <>
              <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-700 shadow-sm transition">
                <Printer size={16} /> طباعة التقرير
              </button>
              <button onClick={() => setIsDepreciationModalOpen(true)} className="bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-amber-700 shadow-sm transition">
                <PlayCircle size={16} /> تشغيل الإهلاك الشهري
              </button>
              <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm transition">
                <Plus size={16} /> إضافة أصل
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 gap-4 bg-white px-6 pt-2 rounded-2xl border shadow-sm print:hidden">
        <button
          onClick={() => setActiveTab('LIST')}
          className={`pb-3 text-xs font-bold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'LIST' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BookOpen className="w-4 h-4" /> سجل الأصول والدفاتر والإهلاك ({assets.length})
        </button>

        <button
          onClick={() => setActiveTab('SCANNER')}
          className={`pb-3 text-xs font-bold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'SCANNER' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <QrCode className="w-4 h-4 text-amber-600" /> ماسح الجرد الميداني السريع (Barcode / QR)
        </button>

        <button
          onClick={() => setActiveTab('LABELS')}
          className={`pb-3 text-xs font-bold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'LABELS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Tag className="w-4 h-4 text-indigo-600" /> استوديو طباعة ملصقات QR والباركود
        </button>

        <button
          onClick={() => setActiveTab('TRANSFERS')}
          className={`pb-3 text-xs font-bold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'TRANSFERS' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Truck className="w-4 h-4 text-emerald-600" /> مناقلات معدات مشاريع المقاولات
        </button>
      </div>

      {/* Tab 1: LIST / BOOK VIEW */}
      {activeTab === 'LIST' && (
        <>
          <div className="hidden print:block text-center mb-6">
              <h1 className="text-2xl font-bold">سجل الأصول الثابتة وإهلاكاتها</h1>
              <p className="text-sm text-slate-500">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b">
                <tr>
                  <th className="p-4">اسم الأصل والباركود</th>
                  <th className="p-4">المشروع والموقع</th>
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
                    <td className="p-4">
                      <span className="font-bold text-slate-900 block">{asset.name}</span>
                      <span className="font-mono text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 w-fit block mt-0.5">
                        {asset.asset_tag || `AST-${asset.id.slice(0, 6).toUpperCase()}`}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-800 block">{asset.project_name || 'المقر الرئيسي'}</span>
                      <span className="text-[10px] text-slate-400">{asset.current_location || 'الموقع الرئيسي'}</span>
                    </td>
                    <td className="p-4 font-mono text-slate-600">{asset.purchaseDate || asset.purchase_date}</td>
                    <td className="p-4 font-mono font-bold text-slate-800">{(asset.purchaseCost || asset.purchase_cost || 0).toLocaleString()} ج.م</td>
                    <td className="p-4 font-mono font-bold text-rose-600">{(asset.totalDepreciation || asset.total_depreciation || 0).toLocaleString()} ج.م</td>
                    <td className="p-4 font-mono font-black text-emerald-600">{(asset.currentValue || asset.current_value || 0).toLocaleString()} ج.م</td>
                    <td className="p-4 text-center print:hidden flex justify-center gap-1.5">
                      <button 
                        disabled={((asset.currentValue || asset.current_value || 0) - (asset.salvageValue || asset.salvage_value || 0)) <= 0.1}
                        onClick={() => {
                            if ((!asset.usefulLife && !asset.useful_life_years) || (asset.usefulLife || asset.useful_life_years || 0) <= 0) {
                                showToast('يرجى تحديد العمر الإنتاجي للأصل أولاً.', 'warning');
                                return;
                            }

                            const depreciableAmount = (asset.purchaseCost || asset.purchase_cost || 0) - (asset.salvageValue || asset.salvage_value || 0);
                            const monthlyDepreciation = depreciableAmount / ((asset.usefulLife || asset.useful_life_years || 1) * 12);
                            
                            const currentVal = (asset.currentValue || asset.current_value) ?? (asset.purchaseCost || asset.purchase_cost || 0);
                            const remainingValue = currentVal - (asset.salvageValue || asset.salvage_value || 0);

                            if (remainingValue <= 0.1) {
                                 showToast('هذا الأصل مهلك بالكامل (وصل لقيمة الخردة).', 'warning');
                                 return;
                            }

                            const amountToDepreciate = Math.min(monthlyDepreciation, remainingValue);

                            if(window.confirm(`تسجيل إهلاك شهري بقيمة ${amountToDepreciate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}؟`)) {
                                runDepreciation(asset.id, amountToDepreciate, new Date().toISOString().split('T')[0]);
                            }
                        }}
                        className={`text-[11px] px-2 py-1 rounded-lg border font-bold transition-colors ${
                            ((asset.currentValue || asset.current_value || 0) - (asset.salvageValue || asset.salvage_value || 0)) <= 0.1
                            ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                        }`}
                      >
                        {((asset.currentValue || asset.current_value || 0) - (asset.salvageValue || asset.salvage_value || 0)) <= 0.1 ? 'تم الإهلاك' : 'إهلاك'}
                      </button>
                      <button 
                        onClick={() => openRevaluationModal(asset)}
                        className="text-xs p-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                        title="إعادة تقييم"
                      >
                        <TrendingUp size={14} />
                      </button>
                      <button 
                        onClick={() => openEditModal(asset)}
                        className="text-xs p-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100"
                        title="تعديل"
                      >
                        <Pencil size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(asset)}
                        className="text-xs p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200 font-mono">
                  <tr>
                      <td colSpan={3} className="p-4 text-left">الإجمالي:</td>
                      <td className="p-4">{assets.reduce((sum, a) => sum + (a.purchaseCost || a.purchase_cost || 0), 0).toLocaleString()} ج.م</td>
                      <td className="p-4 text-rose-600">{assets.reduce((sum, a) => sum + (a.totalDepreciation || a.total_depreciation || 0), 0).toLocaleString()} ج.م</td>
                      <td className="p-4 text-emerald-600">{assets.reduce((sum, a) => sum + (a.currentValue || a.current_value || 0), 0).toLocaleString()} ج.م</td>
                      <td className="print:hidden"></td>
                  </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Tab 2: FIELD BARCODE SCANNER */}
      {activeTab === 'SCANNER' && <AssetFieldScanner />}

      {/* Tab 3: LABEL STUDIO */}
      {activeTab === 'LABELS' && <AssetLabelStudio />}

      {/* Tab 4: TRANSFERS & CONSTRUCTION SITES */}
      {activeTab === 'TRANSFERS' && <AssetTransferManager />}

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
                        <div className="flex justify-between mb-1"><span>القيمة الحالية:</span> <span className="font-bold">{(revaluationData.currentValue || 0).toLocaleString()}</span></div>
                        <div className="flex justify-between text-blue-600"><span>الفرق:</span> <span className="font-bold" dir="ltr">{((revaluationData.newValue || 0) - (revaluationData.currentValue || 0)).toLocaleString()}</span></div>
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
      {/* Edit Asset Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 my-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">تعديل الأصل الثابت</h3>
              <button onClick={() => setIsEditModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">اسم الأصل</label>
                <input required type="text" className="w-full border rounded p-2" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1">تاريخ الشراء</label>
                  <input required type="date" className="w-full border rounded p-2" value={editFormData.purchaseDate} onChange={e => setEditFormData({...editFormData, purchaseDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">التكلفة</label>
                  <input required type="number" className="w-full border rounded p-2" value={editFormData.purchaseCost || ''} onChange={e => setEditFormData({...editFormData, purchaseCost: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1">قيمة الخردة</label>
                  <input required type="number" className="w-full border rounded p-2" value={editFormData.salvageValue || ''} onChange={e => setEditFormData({...editFormData, salvageValue: parseFloat(e.target.value) || 0})} />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">العمر الإنتاجي (سنوات)</label>
                  <input required type="number" className="w-full border rounded p-2" value={editFormData.usefulLife || ''} onChange={e => setEditFormData({...editFormData, usefulLife: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div>
                  <label className="block text-sm font-bold mb-1">حساب الأصل (الميزانية)</label>
                  <select required className="w-full border rounded p-2" value={editFormData.assetAccountId} onChange={e => setEditFormData({...editFormData, assetAccountId: e.target.value})}>
                      <option value="">-- اختر --</option>
                      {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                  </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-bold mb-1">حساب مجمع الإهلاك</label>
                      <select className="w-full border rounded p-2" value={editFormData.accumulatedDepreciationAccountId} onChange={e => setEditFormData({...editFormData, accumulatedDepreciationAccountId: e.target.value})}>
                          <option value="">اختر (اختياري)...</option>
                          {accounts.filter(a => !a.isGroup && (a.code.startsWith('13') || a.name.includes('مجمع'))).map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select>
                  </div>
                  <div>
                      <label className="block text-sm font-bold mb-1">حساب مصروف الإهلاك</label>
                      <select className="w-full border rounded p-2" value={editFormData.depreciationExpenseAccountId} onChange={e => setEditFormData({...editFormData, depreciationExpenseAccountId: e.target.value})}>
                          <option value="">اختر (اختياري)...</option>
                          {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                      </select>
                  </div>
              </div>

              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-bold mt-4 flex items-center justify-center gap-2"><Save size={18} /> حفظ التغييرات</button>
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="w-full bg-slate-100 text-slate-600 py-2 rounded mt-2">إلغاء</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetManager;
