import React, { useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { AVAILABLE_MODULES, PLAN_CONFIGS, Organization } from '../types/saasTypes';
import {
  Save,
  Loader2,
  X,
  Settings,
  Lock,
  Building2,
  Users,
  DollarSign
} from 'lucide-react';

const EditClientModal = ({ isOpen, onClose, onSuccess, organization }: { isOpen: boolean, onClose: () => void, onSuccess: () => void, organization: Organization | null }) => {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    isActive: true,
    subscriptionExpiry: '',
    maxUsers: 5,
    modules: [] as string[],
    currency: 'EGP',
    vatRate: 14,
    suspensionReason: '',
    plan: '',
    activityType: '', // 👈 إضافة الحقل للنموذج
    totalCollected: 0,
    nextPaymentDate: ''
  });

  useEffect(() => {
    const fetchSettings = async () => {
      if (organization) {
        const { data: settings } = await supabase
          .from('company_settings')
          .select('currency, vat_rate')
          .eq('organization_id', organization.id)
          .maybeSingle();

        // محاولة استنتاج الباقة الحالية بناءً على عدد المستخدمين
        let inferredPlan = '';
        if (organization.max_users <= 2) inferredPlan = 'basic';
        else if (organization.max_users <= 5) inferredPlan = 'pro';
        else inferredPlan = 'premium';

        setFormData({
          name: organization.name,
          isActive: organization.is_active,
          subscriptionExpiry: organization.subscription_expiry ? organization.subscription_expiry.split('T')[0] : '',
          maxUsers: organization.max_users || 5,
          modules: organization.allowed_modules || [],
          currency: settings?.currency || 'EGP',
          vatRate: settings?.vat_rate ? (settings.vat_rate <= 1 ? settings.vat_rate * 100 : settings.vat_rate) : 14,
          suspensionReason: organization.suspension_reason || '',
          plan: inferredPlan,
          activityType: organization.activity_type || '', // 👈 جلب القيمة من قاعدة البيانات
          totalCollected: organization.total_collected || 0,
          nextPaymentDate: organization.next_payment_date ? organization.next_payment_date.split('T')[0] : ''
        });
      }
    };
    fetchSettings();
  }, [organization]);

  if (!isOpen || !organization) return null;

  const handlePlanUpgrade = (planKey: string) => {
    const config = PLAN_CONFIGS[planKey];
    setFormData({
      ...formData,
      plan: planKey,
      maxUsers: config.maxUsers,
      modules: config.modules
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: formData.name,
          is_active: formData.isActive,
          subscription_expiry: formData.subscriptionExpiry || null,
          max_users: formData.maxUsers,
          allowed_modules: formData.modules,
          activity_type: formData.activityType, // 👈 تحديث القيمة
          suspension_reason: formData.suspensionReason,
          total_collected: formData.totalCollected,
          next_payment_date: formData.nextPaymentDate || null
        })
        .eq('id', organization.id);

      if (error) throw error;

      // تحديث إعدادات الشركة (العملة والضريبة)
      const { error: settingsError } = await supabase
        .from('company_settings')
        .upsert({
          organization_id: organization.id,
          currency: formData.currency,
          vat_rate: formData.vatRate / 100,
          company_name: formData.name
        }, { onConflict: 'organization_id' });

      if (settingsError) throw settingsError;

      showToast('تم تحديث بيانات الشركة بنجاح ✅', 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="p-3 border-b flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
            <Settings className="text-blue-600" /> تعديل إعدادات: {organization.name}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
            <div className="space-y-4">
            {/* Quick Plan Upgrade Section */}
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
              <label className="block text-xs font-black text-blue-700 mb-3 uppercase tracking-tighter">ترقية باقة الاشتراك (تعديل تلقائي)</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(PLAN_CONFIGS).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePlanUpgrade(key)}
                    className={`py-2 px-1 rounded-xl text-[10px] font-black transition-all border-2 shadow-sm ${formData.plan === key 
                      ? 'bg-blue-600 text-white border-blue-600 scale-105' 
                      : 'bg-white text-slate-600 border-slate-100 hover:border-blue-300'}`}
                  >
                    {key === 'basic' ? '🥉 الأساسية' : key === 'pro' ? '🥈 الاحترافية' : '🥇 المتكاملة'}
                  </button>
                ))}
              </div>
            </div>

            {/* التحصيل والمتابعة المالية */}
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 space-y-4">
              <label className="block text-xs font-black text-emerald-700 mb-1 uppercase tracking-tighter">المتابعة المالية والتحصيل</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">إجمالي المبالغ المحصلة</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      className="w-full border border-emerald-200 rounded-xl p-2.5 pr-8 outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-bold text-emerald-700" 
                      value={formData.totalCollected} 
                      onChange={e => setFormData({...formData, totalCollected: parseFloat(e.target.value) || 0})} 
                    />
                    <DollarSign className="absolute right-2.5 top-3 text-emerald-400" size={16} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الدفع القادم</label>
                  <input 
                    type="date" 
                    className="w-full border border-emerald-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-bold" 
                    value={formData.nextPaymentDate} 
                    onChange={e => setFormData({...formData, nextPaymentDate: e.target.value})} 
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">نوع النشاط</label>
              <select 
                className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white font-bold" 
                value={formData.activityType} 
                onChange={e => setFormData({...formData, activityType: e.target.value})}
              >
                <option value="commercial">🏢 نشاط تجاري عام</option>
                <option value="restaurant">🍽️ مديول المطاعم</option>
                <option value="construction">🏗️ نشاط المقاولات</option>
                <option value="manufacturing">🏭 نشاط المصانع</option>
                <option value="clinic">⚕️ العيادات الطبية</option>
                <option value="legal">⚖️ مكاتب المحاماة</option>
                <option value="transport">🚚 شركات النقل</option>
                <option value="charity">🤝 العمل الخيري</option>
                <option value="hospital">🏥 المستشفيات والمراكز الطبية</option>
              </select>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">اسم الشركة</label>
                <input required type="text" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">الحد الأقصى للمستخدمين</label>
                  <div className="relative">
                    <input 
                      required 
                      type="number" 
                      min="1"
                      className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" 
                      value={formData.maxUsers} 
                      onChange={e => setFormData({...formData, maxUsers: parseInt(e.target.value)})} 
                    />
                    <Users className="absolute left-3 top-3 text-slate-300" size={16} />
                  </div>
                  {organization.user_count !== undefined && (
                    <p className="text-[10px] text-slate-500 mt-1 font-bold">المستخدمون الحاليون: {organization.user_count}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ انتهاء الاشتراك</label>
                  <input type="date" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.subscriptionExpiry} onChange={e => setFormData({...formData, subscriptionExpiry: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">العملة الافتراضية</label>
                <select 
                  required
                  className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white" 
                  value={formData.currency} 
                  onChange={e => setFormData({...formData, currency: e.target.value})}
                >
                  <option value="EGP">جنيه مصري (EGP)</option>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="USD">دولار أمريكي (USD)</option>
                  <option value="AED">درهم إماراتي (AED)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">نسبة الضريبة (%)</label>
                <div className="relative">
                  <input 
                    required 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    max="100" 
                    className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" 
                    value={formData.vatRate} 
                    onChange={e => setFormData({...formData, vatRate: parseFloat(e.target.value)})} 
                  />
                  <span className="absolute left-3 top-3 text-slate-400 font-bold">%</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm">
              <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="w-5 h-5 text-blue-600 rounded cursor-pointer" />
              <label htmlFor="isActive" className="text-sm font-bold text-slate-700 cursor-pointer">الحساب نشط (تمكين الدخول للنظام)</label>
            </div>

            {!formData.isActive && (
              <div className="animate-in slide-in-from-top-2">
                <label className="block text-sm font-bold text-rose-700 mb-1">رسالة التعطيل (تظهر للعميل)</label>
                <textarea 
                  className="w-full border border-rose-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-rose-500 bg-rose-50/30 h-20 text-sm"
                  placeholder="مثلاً: يرجى سداد فاتورة شهر مارس لاستعادة الخدمة..."
                  value={formData.suspensionReason}
                  onChange={e => setFormData({...formData, suspensionReason: e.target.value})}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">الموديولات المسموحة</label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_MODULES.map(mod => (
                  <label key={mod.id} className={`flex items-center gap-2 p-2 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors ${formData.modules.includes(mod.id) ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
                    <input type="checkbox" checked={formData.modules.includes(mod.id)} onChange={() => {
                      const newModules = formData.modules.includes(mod.id) ? formData.modules.filter(m => m !== mod.id) : [...formData.modules, mod.id];
                      setFormData({...formData, modules: newModules});
                    }} className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-sm font-medium">{mod.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          </div>
          
          <div className="p-3 border-t flex gap-3 bg-slate-50 shrink-0">
            <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-100 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />} حفظ التغييرات
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditClientModal;
