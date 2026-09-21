import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { Organization } from '../types/saasTypes';
import {
  GitFork,
  Loader2,
  X,
  CheckCircle,
  Building2,
  AlertTriangle
} from 'lucide-react';

const CloneCompanyModal = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  organizations, 
  initialSourceOrg 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSuccess: () => void, 
  organizations: Organization[], 
  initialSourceOrg?: Organization | null 
}) => {
  const [sourceOrgId, setSourceOrgId] = useState(initialSourceOrg?.id || '');
  const [targetOrgId, setTargetOrgId] = useState('');
  const [loading, setLoading] = useState(false);
  const [cloneResult, setCloneResult] = useState<any | null>(null);
  const { showToast } = useToast();

  const [options, setOptions] = useState({
    includeAccounts: true,
    includeSettings: true,
    includeWarehouses: true,
    includeCostCenters: true,
    includeUoms: true,
    includeCategories: true,
    includeProducts: true,
    includeCustomers: true,
    includeSuppliers: true,
    includeRestaurant: true
  });

  useEffect(() => {
    if (initialSourceOrg) {
      setSourceOrgId(initialSourceOrg.id);
    }
  }, [initialSourceOrg, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setCloneResult(null);
      setTargetOrgId('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceOrgId || !targetOrgId) {
      return showToast('يرجى اختيار الشركة المصدر والشركة الهدف', 'error');
    }
    if (sourceOrgId === targetOrgId) {
      return showToast('لا يمكن استنساخ الشركة إلى نفسها', 'error');
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('clone_organization_template', {
        p_source_org_id: sourceOrgId,
        p_target_org_id: targetOrgId,
        p_options: {
          include_accounts: options.includeAccounts,
          include_settings: options.includeSettings,
          include_warehouses: options.includeWarehouses,
          include_cost_centers: options.includeCostCenters,
          include_uoms: options.includeUoms,
          include_categories: options.includeCategories,
          include_products: options.includeProducts,
          include_customers: options.includeCustomers,
          include_suppliers: options.includeSuppliers,
          include_restaurant: options.includeRestaurant
        }
      });

      if (error) throw error;
      setCloneResult(data);
      showToast('تم استنساخ القالب والدليل بنجاح تام! 🎉', 'success');
      onSuccess();
    } catch (err: any) {
      showToast('فشل الاستنساخ: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
            <GitFork className="text-purple-600" /> استنساخ قالب وإعدادات شركة
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
        </div>

        {cloneResult ? (
          <div className="p-6 space-y-6 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle size={40} />
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-800">اكتمل الاستنساخ بنجاح!</h4>
              <p className="text-sm text-slate-500 mt-1">تم نقل الهيكل والدليل من <span className="font-bold text-slate-700">{cloneResult.source_org}</span> إلى <span className="font-bold text-slate-700">{cloneResult.target_org}</span></p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-right bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs font-bold text-slate-700">
              <div className="flex justify-between p-2 bg-white rounded-lg"><span>الحسابات المنسوخة:</span><span className="text-purple-600">{cloneResult.accounts_cloned}</span></div>
              <div className="flex justify-between p-2 bg-white rounded-lg"><span>المخازن المنسوخة:</span><span className="text-purple-600">{cloneResult.warehouses_cloned}</span></div>
              <div className="flex justify-between p-2 bg-white rounded-lg"><span>مراكز التكلفة:</span><span className="text-purple-600">{cloneResult.cost_centers_cloned}</span></div>
              <div className="flex justify-between p-2 bg-white rounded-lg"><span>وحدات القياس:</span><span className="text-purple-600">{cloneResult.uoms_cloned}</span></div>
              {cloneResult.products_cloned > 0 && <div className="flex justify-between p-2 bg-white rounded-lg"><span>الأصناف:</span><span className="text-purple-600">{cloneResult.products_cloned}</span></div>}
              {cloneResult.customers_cloned > 0 && <div className="flex justify-between p-2 bg-white rounded-lg"><span>العملاء:</span><span className="text-purple-600">{cloneResult.customers_cloned}</span></div>}
            </div>

            <button 
              onClick={() => { setCloneResult(null); onClose(); }} 
              className="w-full bg-blue-600 text-white font-black py-3.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg"
            >
              تم
            </button>
          </div>
        ) : (
          <form onSubmit={handleClone} className="flex flex-col flex-1 min-h-0">
            <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3.5 text-xs font-medium text-purple-900 leading-relaxed">
                💡 يقوم المحرك بنسخ شجرة الحسابات، الإعدادات، ومراكز التكلفة بدقة تامة وبمعرفات جديدة دون نسخ الفواتير أو الحركات المالية السابقة لحماية الاستقلال المالي للشركة.
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">الشركة المصدر (المراد النسخ منها)</label>
                <select 
                  required 
                  value={sourceOrgId} 
                  onChange={e => setSourceOrgId(e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl p-2.5 font-bold text-slate-700 bg-slate-50 focus:border-purple-500 outline-none"
                >
                  <option value="">-- اختر الشركة المصدر --</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id} disabled={org.id === targetOrgId}>{org.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 mb-1.5">الشركة الهدف (المراد الاستنساخ إليها)</label>
                <select 
                  required 
                  value={targetOrgId} 
                  onChange={e => setTargetOrgId(e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl p-2.5 font-bold text-slate-700 bg-slate-50 focus:border-purple-500 outline-none"
                >
                  <option value="">-- اختر الشركة الهدف --</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id} disabled={org.id === sourceOrgId}>{org.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">عناصر الاستنساخ</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeAccounts} onChange={e => setOptions({...options, includeAccounts: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    دليل الحسابات
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeSettings} onChange={e => setOptions({...options, includeSettings: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    إعدادات وتوجيه القيود
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeWarehouses} onChange={e => setOptions({...options, includeWarehouses: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    المخازن
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeCostCenters} onChange={e => setOptions({...options, includeCostCenters: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    مراكز التكلفة
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeUoms} onChange={e => setOptions({...options, includeUoms: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    وحدات القياس
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeCategories} onChange={e => setOptions({...options, includeCategories: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    🏷️ تصنيفات الأصناف
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeProducts} onChange={e => setOptions({...options, includeProducts: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    الأصناف (بدون أرصدة)
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeCustomers} onChange={e => setOptions({...options, includeCustomers: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    العملاء (بدون ديون)
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeSuppliers} onChange={e => setOptions({...options, includeSuppliers: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    الموردين (بدون التزامات)
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer font-bold text-xs text-slate-700">
                    <input type="checkbox" checked={options.includeRestaurant} onChange={e => setOptions({...options, includeRestaurant: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                    🍽️ طاولات وإضافات المطعم
                  </label>
                </div>
              </div>
            </div>

            <div className="p-4 border-t flex gap-3 bg-slate-50 shrink-0">
              <button 
                type="submit" 
                disabled={loading || !sourceOrgId || !targetOrgId}
                className="flex-1 bg-purple-600 text-white font-black py-3 rounded-xl hover:bg-purple-700 disabled:opacity-50 shadow-lg shadow-purple-100 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : <GitFork size={18} />}
                تنفيذ الاستنساخ
              </button>
              <button type="button" onClick={onClose} className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">
                إلغاء
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CloneCompanyModal;
