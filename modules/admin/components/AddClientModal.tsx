import React, { useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { AVAILABLE_MODULES, PLAN_CONFIGS, Organization } from '../types/saasTypes';
import {
  Users,
  CheckCircle,
  UserPlus,
  Building2,
  Copy,
  Loader2,
  X,
  Sparkles,
  Wrench,
  UploadCloud,
  Upload,
  Trash2,
  GitFork,
  RefreshCw,
  Lock,
  Save
} from 'lucide-react';

const AddClientModal = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  existingOrgs = []
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSuccess: () => void,
  existingOrgs?: Organization[]
}) => {
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [createdData, setCreatedData] = useState<any | null>(null);
  const { showToast } = useToast();

  // خيارات وضع التأسيس
  const [setupSource, setSetupSource] = useState<'template' | 'clone'>('template');
  const [sourceOrgId, setSourceOrgId] = useState<string>('');
  const [cloneOptions, setCloneOptions] = useState({
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

  // دالة مساعدة لحساب تاريخ انتهاء الفترة التجريبية (14 يوم)
  const getTrialExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState({
    plan: 'pro',
    companyName: '',
    adminName: '',
    email: '',
    password: '',
    subscriptionExpiry: getTrialExpiryDate(),
    modules: PLAN_CONFIGS['pro'].modules,
    maxUsers: PLAN_CONFIGS['pro'].maxUsers,
    currency: 'EGP',
    vatRate: 14,
    coaTemplate: 'commercial',
    logoUrl: ''
  });

  // إعادة تعيين البيانات عند فتح/إغلاق المودال
  useEffect(() => {
    if (!isOpen) {
      setCreatedData(null);
      setSetupSource('template');
      setSourceOrgId('');
    }
  }, [isOpen]);

  const handlePlanChange = (planKey: string) => {
    const config = PLAN_CONFIGS[planKey];
    setFormData({
      ...formData,
      plan: planKey,
      maxUsers: config.maxUsers,
      modules: config.modules,
      subscriptionExpiry: getTrialExpiryDate()
    });
  };

  const generateStrongPassword = () => {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let retVal = "";
    
    retVal += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    retVal += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    retVal += "0123456789"[Math.floor(Math.random() * 10)];
    retVal += "!@#$%"[Math.floor(Math.random() * 5)];

    for (let i = 0, n = charset.length; i < length - 4; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    
    const shuffled = retVal.split('').sort(() => 0.5 - Math.random()).join('');
    setFormData(prev => ({ ...prev, password: shuffled }));
    showToast('تم توليد كلمة مرور قوية بنجاح 🔐', 'info');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    try {
      setUploadingLogo(true);
      const file = e.target.files[0];
      if (!file) return;
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `org-logo-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, logoUrl: data.publicUrl }));
      showToast('تم رفع الشعار بنجاح', 'success');
    } catch (error: any) {
      showToast('فشل رفع الشعار: ' + error.message, 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupSource === 'clone' && !sourceOrgId) {
      return showToast('يرجى اختيار الشركة المصدر المراد الاستنساخ منها', 'error');
    }

    setLoading(true);
    try {
      // 1. استدعاء دالة قاعدة البيانات لإنشاء الشركة وتأسيس الدليل المحاسبي
      const { data: newOrgId, error: rpcError } = await supabase.rpc('create_new_client_v2', {
        p_name: formData.companyName,
        p_email: formData.email,
        p_activity_type: formData.coaTemplate || 'commercial',
        p_vat_number: null,
        p_admin_id: null 
      });

      if (rpcError) throw rpcError;

      // 🛡️ صمام أمان: التحقق من صحة معرف المنظمة قبل المتابعة
      if (!newOrgId) {
          throw new Error('فشل استلام معرف المنظمة من الخادم');
      }

      // 1.5 إذا تم اختيار استنساخ من شركة سابقة، نقوم بتشغيل محرك الاستنساخ الذكي
      if (setupSource === 'clone' && sourceOrgId) {
        const { data: cloneRes, error: cloneError } = await supabase.rpc('clone_organization_template', {
          p_source_org_id: sourceOrgId,
          p_target_org_id: newOrgId,
          p_options: {
            include_accounts: cloneOptions.includeAccounts,
            include_settings: cloneOptions.includeSettings,
            include_warehouses: cloneOptions.includeWarehouses,
            include_cost_centers: cloneOptions.includeCostCenters,
            include_uoms: cloneOptions.includeUoms,
            include_categories: cloneOptions.includeCategories,
            include_products: cloneOptions.includeProducts,
            include_customers: cloneOptions.includeCustomers,
            include_suppliers: cloneOptions.includeSuppliers,
            include_restaurant: cloneOptions.includeRestaurant
          }
        });

        if (cloneError) {
          console.error('Cloning warning:', cloneError);
          showToast('تحذير أثناء الاستنساخ: ' + cloneError.message, 'warning');
        }
      }

      // 2. تحديث بيانات الباقة والاشتراك
      await supabase.from('organizations').update({
          max_users: formData.maxUsers,
          allowed_modules: formData.modules,
          subscription_expiry: formData.subscriptionExpiry,
          logo_url: formData.logoUrl
      }).eq('id', newOrgId);

      // 3. إنشاء حساب المستخدم في نظام Auth وربطه بالمنظمة الجديدة عبر الـ Metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.adminName,
            role: 'admin',
            org_id: newOrgId, // 👈 التريجر في SQL سيلتقط هذا المعرف وينشئ البروفايل فوراً
          }
        }
      });

      if (authError) {
          // 🛡️ صمام أمان: إذا كان المستخدم مسجلاً مسبقاً، نقوم بربطه بالشركة الجديدة تلقائياً
          if (authError.message.includes('already registered') || authError.status === 422) {
              const { error: provisionError } = await supabase.rpc('force_provision_admin', {
                  p_email: formData.email,
                  p_org_id: newOrgId,
                  p_full_name: formData.adminName
              });
              
              if (!provisionError) {
                  showToast('تم ربط الحساب الموجود مسبقاً بالشركة الجديدة بنجاح ✅', 'success');
                  onSuccess();
                  setCreatedData({ success: true, orgId: newOrgId });
                  return;
              }
          }
          showToast('تم إنشاء الشركة، ولكن فشل ربط حساب المدير: ' + authError.message, 'warning');
          return;
      }

      showToast('تم إنشاء الشركة وحساب المدير بنجاح ✅', 'success');
      onSuccess();
      setCreatedData({ success: true, orgId: newOrgId });
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (createdData) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={48} className="text-emerald-600" />
            </div>
            <h3 className="font-black text-2xl text-slate-800">تم التأسيس بنجاح! 🎉</h3>
            <p className="text-slate-500">تم إنشاء بيئة العمل وحساب المدير بنجاح. يمكنك الآن نسخ البيانات وإرسالها للعميل.</p>
            
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4 text-right">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">رابط الدخول</label>
                <div className="font-mono text-sm text-blue-600 break-all">{window.location.origin}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">البريد الإلكتروني</label>
                <div className="font-bold text-slate-700">{formData.email}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">كلمة المرور</label>
                <div className="font-mono font-bold text-slate-700">{formData.password}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  const text = `مرحباً ${formData.adminName}،\nتم تفعيل حسابكم في TriPro ERP لشركة ${formData.companyName}.\n\nرابط الدخول: ${window.location.origin}\nالبريد: ${formData.email}\nكلمة المرور: ${formData.password}\n\nنتمنى لكم تجربة مميزة!`;
                  navigator.clipboard.writeText(text);
                  showToast('تم نسخ بيانات الدخول بنجاح ✅', 'success');
                }}
                className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
              >
                <Copy size={20} /> نسخ بيانات الدخول
              </button>
              <button onClick={onClose} className="w-full py-3 text-slate-500 font-bold hover:text-slate-700">إغلاق النافذة</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="p-3 border-b flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
            <Building2 className="text-blue-600" /> تأسيس شركة جديدة
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {/* Logo Section */}
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="relative group">
              <div className="w-20 h-20 bg-white rounded-lg flex items-center justify-center text-slate-300 border border-slate-200 overflow-hidden shadow-sm">
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Building2 size={32} />
                )}
                {uploadingLogo && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                    <Loader2 className="animate-spin text-blue-600" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-1">شعار الشركة (اختياري)</label>
              <div className="flex items-center gap-2">
                <label className="flex-1">
                  <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50 flex items-center justify-center gap-2">
                    <Upload size={14} />
                    {formData.logoUrl ? 'تحديث الشعار' : 'رفع شعار'}
                  </div>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
                </label>
                {formData.logoUrl && (
                  <button type="button" onClick={() => setFormData({...formData, logoUrl: ''})} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="حذف الشعار">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-bold text-blue-700 mb-1">اختر باقة الاشتراك</label>
              <select 
                className="w-full border-2 border-blue-100 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50/30 font-black" 
                value={formData.plan} 
                onChange={e => handlePlanChange(e.target.value)}
              >
                <option value="basic">🥉 الباقة الأساسية (Basic)</option>
                <option value="pro">🥈 الباقة الاحترافية (Pro)</option>
                <option value="sports">🏟️ باقة الأندية والاستادات الرياضية (Sports)</option>
                <option value="premium">🥇 الباقة المتكاملة (Premium)</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-1">اسم الشركة</label>
              <input required type="text" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">اسم المدير</label>
              <input required type="text" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.adminName} onChange={e => setFormData({...formData, adminName: e.target.value})} />
            </div>
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
            </div>
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
                <input required type="number" step="0.01" min="0" max="100" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.vatRate} onChange={e => setFormData({...formData, vatRate: parseFloat(e.target.value)})} />
                <span className="absolute left-3 top-3 text-slate-400 font-bold">%</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-1.5">طريقة تأسيس الدليل المحاسبي والإعدادات</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl mb-3">
                <button
                  type="button"
                  onClick={() => setSetupSource('template')}
                  className={`py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${setupSource === 'template' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Building2 size={14} /> قالب نشاط قياسي
                </button>
                <button
                  type="button"
                  onClick={() => setSetupSource('clone')}
                  className={`py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${setupSource === 'clone' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <GitFork size={14} /> استنساخ من شركة سابقة ⚡
                </button>
              </div>

              {setupSource === 'template' ? (
                <div>
                  <select 
                    required
                    className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white font-bold" 
                    value={formData.coaTemplate} 
                    onChange={e => setFormData({...formData, coaTemplate: e.target.value})}
                  >
                    <option value="commercial">🏢 نشاط تجاري عام</option>
                    <option value="stadium">🏟️ الأندية الرياضية والاستادات والمراكز الشبابية</option>
                    <option value="restaurant">🍽️ مديول المطاعم والكافيهات</option>
                    <option value="construction">🏗️ نشاط المقاولات والإنشاءات</option>
                    <option value="manufacturing">🏭 نشاط المصانع والتصنيع</option>
                    <option value="clinic">⚕️ العيادات الطبية والخدمات الصحية</option>
                    <option value="legal">⚖️ مكاتب المحاماة والاستشارات</option>
                    <option value="transport">🚚 شركات النقل والخدمات اللوجستية</option>
                    <option value="charity">🤝 الجمعيات الخيرية والمؤسسات غير الهادفة للربح</option>
                    <option value="hospital">🏥 المستشفيات والمراكز الطبية</option>
                  </select>
                </div>
              ) : (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 space-y-3">
                  <div>
                    <label className="block text-xs font-black text-purple-900 mb-1">اختر الشركة المصدر للنسخ منها:</label>
                    <select 
                      required
                      value={sourceOrgId}
                      onChange={e => setSourceOrgId(e.target.value)}
                      className="w-full border-2 border-purple-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white focus:border-purple-500 outline-none"
                    >
                      <option value="">-- اختر شركة مصدر --</option>
                      {existingOrgs.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-purple-900 mb-1.5">عناصر الاستنساخ المحددة:</label>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeAccounts} onChange={e => setCloneOptions({...cloneOptions, includeAccounts: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        شجرة الحسابات
                      </label>
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeSettings} onChange={e => setCloneOptions({...cloneOptions, includeSettings: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        إعدادات وربط القيود
                      </label>
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeWarehouses} onChange={e => setCloneOptions({...cloneOptions, includeWarehouses: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        المخازن
                      </label>
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeCostCenters} onChange={e => setCloneOptions({...cloneOptions, includeCostCenters: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        مراكز التكلفة
                      </label>
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeUoms} onChange={e => setCloneOptions({...cloneOptions, includeUoms: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        وحدات القياس
                      </label>
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeCategories} onChange={e => setCloneOptions({...cloneOptions, includeCategories: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        🏷️ تصنيفات الأصناف
                      </label>
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeProducts} onChange={e => setCloneOptions({...cloneOptions, includeProducts: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        الأصناف (بدون أرصدة)
                      </label>
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeCustomers} onChange={e => setCloneOptions({...cloneOptions, includeCustomers: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        العملاء (بدون ديون)
                      </label>
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeSuppliers} onChange={e => setCloneOptions({...cloneOptions, includeSuppliers: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        الموردين (بدون التزامات)
                      </label>
                      <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                        <input type="checkbox" checked={cloneOptions.includeRestaurant} onChange={e => setCloneOptions({...cloneOptions, includeRestaurant: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                        🍽️ طاولات وإضافات المطعم
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">تخصيص الموديولات المتاحة للشركة</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                {AVAILABLE_MODULES.map(mod => (
                  <label key={mod.id} className={`flex items-center gap-2 p-2 border rounded-lg hover:bg-white cursor-pointer transition-colors ${formData.modules.includes(mod.id) ? 'bg-blue-50/80 border-blue-300 font-bold text-blue-900' : 'bg-white text-slate-600 border-slate-200'}`}>
                    <input 
                      type="checkbox" 
                      checked={formData.modules.includes(mod.id)} 
                      onChange={() => {
                        const newModules = formData.modules.includes(mod.id) 
                          ? formData.modules.filter(m => m !== mod.id) 
                          : [...formData.modules, mod.id];
                        setFormData({...formData, modules: newModules});
                      }} 
                      className="w-4 h-4 text-blue-600 rounded" 
                    />
                    <span className="text-xs">{mod.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ انتهاء الاشتراك</label>
              <input required type="date" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.subscriptionExpiry} onChange={e => setFormData({...formData, subscriptionExpiry: e.target.value})} />
              <p className="text-[10px] text-blue-600 mt-1 font-bold">✨ تم تعيين 14 يوماً كفترة تجريبية تلقائياً</p>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-1">البريد الإلكتروني للمدير</label>
              <input required type="email" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div className="col-span-2">
              <div className="flex justify-between items-end mb-1">
                <label className="block text-sm font-bold text-slate-700">كلمة المرور المؤقتة</label>
                <button 
                  type="button"
                  onClick={generateStrongPassword}
                  className="text-[10px] font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg transition-colors border border-blue-100"
                >
                  <RefreshCw size={12} />
                  توليد كلمة سر
                </button>
              </div>
              <div className="relative">
                <input required type="text" minLength={6} className="w-full border rounded-xl p-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-500" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                <Lock className="absolute right-3 top-3 text-slate-400" size={18} />
              </div>
            </div>
          </div>
          </div>
          
          <div className="p-3 border-t flex gap-3 bg-slate-50 shrink-0">
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
              تأسيس الشركة والعميل
            </button>
            <button 
              type="button" 
              onClick={onClose}
              className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddClientModal;
