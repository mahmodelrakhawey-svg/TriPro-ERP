import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  CheckCircle, 
  UserPlus, 
  Building2,
  ArrowUpRight,
  Copy,
  Loader2,
  RefreshCw,
  Settings,
  Upload,
  Trash2,
  X,
  Save,
  Lock,
  Eye,
  ShieldCheck,
  Wrench,
  XCircle,
  Search,
  Filter,
  FileSpreadsheet
} from 'lucide-react';
import { useToast } from '../context/ToastContext';

const AVAILABLE_MODULES = [
  { id: 'accounting', label: 'المحاسبة العامة' },
  { id: 'sales', label: 'المبيعات والعملاء' },
  { id: 'purchases', label: 'المشتريات والموردين' },
  { id: 'inventory', label: 'المخازن والأصناف' },
  { id: 'restaurant', label: 'مديول المطاعم' },
  { id: 'hr', label: 'الموارد البشرية' },
  { id: 'manufacturing', label: 'التصنيع والإنتاج' },
];

const PLAN_CONFIGS: Record<string, { name: string, maxUsers: number, modules: string[] }> = {
  basic: {
    name: 'الباقة الأساسية (مستخدمين: 2)',
    maxUsers: 2,
    modules: ['accounting', 'sales']
  },
  pro: {
    name: 'الباقة الاحترافية (مستخدمين: 5)',
    maxUsers: 5,
    modules: ['accounting', 'sales', 'purchases', 'inventory', 'hr']
  },
  premium: {
    name: 'الباقة المتكاملة (مستخدمين: 15)',
    maxUsers: 15,
    modules: ['accounting', 'sales', 'purchases', 'inventory', 'hr', 'restaurant', 'manufacturing']
  }
};

interface PlatformStats {
  total_platform_sales: number;
  total_organizations: number;
  active_subscriptions: number;
  growth_this_month_percent: number;
  new_registrations_today: number;
}

interface Organization {
  id: string;
  name: string;
  is_active: boolean;
  subscription_expiry: string;
  allowed_modules: string[];
  created_at: string;
  max_users: number;
  activity_type?: string; // 👈 إضافة الحقل للواجهة
  user_count?: number;
  suspension_reason?: string;
  total_sales?: number;
  total_collected?: number;
  next_payment_date?: string;
}

const StatCard = ({ title, value, icon: Icon, color, suffix = '', growth = null }: any) => (
  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4">
    <div className="flex justify-between items-start">
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10`}>
        <Icon size={24} className={color.split(' ')[1]} />
      </div>
      {growth !== null && (
        <div className={`flex items-center gap-1 text-xs font-bold ${growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {growth >= 0 ? '+' : ''}{growth}%
          <TrendingUp size={14} className={growth < 0 ? 'rotate-180' : ''} />
        </div>
      )}
    </div>
    <div>
      <p className="text-slate-500 text-sm font-medium">{title}</p>
      <h3 className="text-2xl font-black text-slate-800 mt-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
        <span className="text-sm font-bold mr-1">{suffix}</span>
      </h3>
    </div>
  </div>
);

const AddClientModal = ({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [createdData, setCreatedData] = useState<any | null>(null);
  const { showToast } = useToast();

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
    if (!isOpen) setCreatedData(null);
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
      const fileExt = file.name.split('.').pop();
      const fileName = `new-org-logo-${Math.random()}.${fileExt}`;
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
    setLoading(true);
    try {
      // استدعاء دالة قاعدة البيانات مباشرة لضمان تأسيس الشركة والدليل المحاسبي في خطوة واحدة
      const { data: newOrgId, error: rpcError } = await supabase.rpc('create_new_client_v2', {
        p_name: formData.companyName,
        p_email: formData.email,
        p_activity_type: formData.coaTemplate || 'commercial',
        p_vat_number: null
      });

      if (rpcError) throw rpcError;

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
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
            <Building2 className="text-blue-600" /> تأسيس شركة جديدة
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
              <label className="block text-sm font-bold text-slate-700 mb-1">قالب دليل الحسابات</label>
              <select 
                required
                className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white font-bold" 
                value={formData.coaTemplate} 
                onChange={e => setFormData({...formData, coaTemplate: e.target.value})}
              >
                <option value="commercial">🏢 نشاط تجاري عام</option>
                <option value="restaurant">🍽️ مديول المطاعم والكافيهات</option>
                <option value="construction">🏗️ نشاط المقاولات والإنشاءات</option>
                <option value="clinic">⚕️ العيادات الطبية والخدمات الصحية</option>
                <option value="legal">⚖️ مكاتب المحاماة والاستشارات</option>
                <option value="transport">🚚 شركات النقل والخدمات اللوجستية</option>
                <option value="charity">🤝 الجمعيات الخيرية والمؤسسات غير الهادفة للربح</option>
              </select>
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
          
          <div className="pt-4 border-t flex gap-3">
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
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
            <Settings className="text-blue-600" /> تعديل إعدادات: {organization.name}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
                <option value="clinic">⚕️ العيادات الطبية</option>
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
          
          <div className="pt-4 border-t flex gap-3">
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

const SaasAdmin: React.FC = () => {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState('all'); // 👈 حالة جديدة لفلتر نوع النشاط
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const { showToast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadingOrgs(true);
      const { data, error } = await supabase.rpc('get_admin_platform_metrics');
      if (error) throw error;
      setStats(data);

      // جلب قائمة الشركات مع حساب عدد المستخدمين يدوياً لضمان الدقة
      const { data: orgsData, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (orgsError) throw orgsError;

      // جلب البيانات الإضافية (مستخدمين ومبيعات) لكل الشركات
      const [{ data: profiles }, { data: salesData }] = await Promise.all([
        supabase.from('profiles').select('organization_id'),
        supabase.from('invoices').select('organization_id, total_amount').eq('status', 'posted')
      ]);

      const userCounts: Record<string, number> = {};
      profiles?.forEach(p => {
        if (p.organization_id) userCounts[p.organization_id] = (userCounts[p.organization_id] || 0) + 1;
      });

      const salesMap: Record<string, number> = {};
      salesData?.forEach(inv => {
        if (inv.organization_id) salesMap[inv.organization_id] = (salesMap[inv.organization_id] || 0) + Number(inv.total_amount);
      });

      const processedOrgs = (orgsData || []).map(org => ({
        ...org,
        user_count: userCounts[org.id] || 0,
        total_sales: salesMap[org.id] || 0
      }));

      setOrgs(processedOrgs);
    } catch (error: any) {
      showToast('خطأ في تحميل البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
      setLoadingOrgs(false);
    }
  };

  const handleImpersonate = async (orgId: string, orgName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('لم يتم العثور على المستخدم');

      const { error } = await supabase
        .from('profiles')
        .update({ organization_id: orgId })
        .eq('id', user.id);

      if (error) throw error;

      showToast(`تم الانتقال لبيئة عمل: ${orgName} بنجاح. جاري تحديث النظام...`, 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      showToast('فشل في عملية المحاكاة: ' + error.message, 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFixSchema = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('refresh_saas_schema');
      if (error) throw error;
      showToast(data || 'تم إصلاح وتحديث قاعدة البيانات بنجاح ✅', 'success');
      // إعادة تحميل البيانات بعد الإصلاح
      await loadData();
    } catch (error: any) {
      if (error.code === 'PGRST202') {
        showToast('النظام يحتاج تنشيط يدوي أول مرة: يرجى تشغيل "NOTIFY pgrst, \'reload config\';" في Supabase SQL Editor', 'warning');
      } else {
        showToast('فشل الإصلاح التلقائي: ' + error.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportToExcel = () => {
    try {
      const exportData = filteredOrgs.map(org => {
        const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
        const statusText = org.is_active && !isExpired ? 'نشط' : (isExpired ? 'منتهي' : 'متوقف');
        
        return {
          'اسم الشركة': org.name,
          'الحالة': statusText,
          'إجمالي المبيعات': org.total_sales || 0,
          'إجمالي المحصل': org.total_collected || 0,
          'موعد الدفع القادم': org.next_payment_date || 'غير محدد',
          'تاريخ انتهاء الاشتراك': org.subscription_expiry ? new Date(org.subscription_expiry).toLocaleDateString('ar-EG') : 'بدون تاريخ',
          'الموديولات المسموحة': (org.allowed_modules || []).join(', '),
          'الحد الأقصى للمستخدمين': org.max_users,
          'تاريخ التأسيس': new Date(org.created_at).toLocaleDateString('ar-EG')
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الشركات المشتركة");
      
      XLSX.writeFile(wb, `TriPro_Organizations_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('تم تصدير ملف Excel بنجاح ✅', 'success');
    } catch (error: any) {
      showToast('فشل تصدير الملف: ' + error.message, 'error');
    }
  };

  const filteredOrgs = useMemo(() => {
    return orgs.filter(org => {
      const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase());
      const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
      const isActive = org.is_active && !isExpired;
      const matchesActivityType = activityTypeFilter === 'all' || org.activity_type === activityTypeFilter; // 👈 منطق فلترة جديد

      if (filterStatus === 'all') return matchesSearch && matchesActivityType;
      if (filterStatus === 'active') return matchesSearch && isActive && matchesActivityType;
      if (filterStatus === 'inactive') return matchesSearch && !isActive && matchesActivityType;
      
      return matchesSearch && matchesActivityType;
    });
  }, [orgs, searchTerm, filterStatus, activityTypeFilter]); // 👈 إضافة activityTypeFilter للتبعيات

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="text-slate-500 font-medium">جاري جلب إحصائيات المنصة...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800">إدارة المنصة (SaaS)</h1>
          <p className="text-slate-500 mt-1 font-medium">نظرة عامة على أداء كافة الشركات المشتركة</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleFixSchema}
            className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-4 py-2 rounded-xl text-amber-600 font-bold hover:bg-amber-100 transition-colors shadow-sm"
            title="إصلاح مشاكل مزامنة قاعدة البيانات (Schema Cache)"
          >
            <Wrench size={18} />
            إصلاح النظام
          </button>
          <button 
            onClick={handleExportToExcel}
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-xl text-emerald-600 font-bold hover:bg-emerald-100 transition-colors shadow-sm"
            title="تصدير القائمة المفلترة إلى Excel"
          >
            <FileSpreadsheet size={18} />
            تصدير Excel
          </button>
          <button 
            onClick={loadData}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            تحديث البيانات
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard 
          title="إجمالي مبيعات المنصة" 
          value={stats?.total_platform_sales || 0} 
          icon={DollarSign} 
          color="bg-blue-600 text-blue-600"
          suffix="ج.م"
        />
        <StatCard 
          title="إجمالي الشركات" 
          value={stats?.total_organizations || 0} 
          icon={Building2} 
          color="bg-purple-600 text-purple-600"
          growth={stats?.growth_this_month_percent}
        />
        <StatCard 
          title="الاشتراكات النشطة" 
          value={stats?.active_subscriptions || 0} 
          icon={CheckCircle} 
          color="bg-emerald-600 text-emerald-600"
        />
        <StatCard 
          title="شركات جديدة (اليوم)" 
          value={stats?.new_registrations_today || 0} 
          icon={UserPlus} 
          color="bg-orange-600 text-orange-600"
        />
        <StatCard 
          title="معدل النمو الشهري" 
          value={`${stats?.growth_this_month_percent || 0}%`} 
          icon={TrendingUp} 
          color="bg-indigo-600 text-indigo-600"
        />
      </div>

      {/* Main Content Area (Placeholder for Organizations Management) */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">إدارة الشركات والاشتراكات</h2>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
          >
            <UserPlus size={18} />
            إضافة شركة جديدة
          </button>
        </div>
        {/* Search and Filter */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
                <Search className="absolute right-3 top-2.5 text-slate-400" size={20} />
                <input 
                    type="text" 
                    placeholder="بحث باسم الشركة..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500"
                />
            </div>
            <div className="relative">
                <Filter className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={20} />
                <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
                    className="appearance-none pr-10 pl-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 bg-white text-slate-700 font-medium"
                >
                    <option value="all">كل الحالات</option>
                    <option value="active">نشط</option>
                    <option value="inactive">متوقف / منتهي</option>
                </select>
            </div>
            {/* 👈 فلتر نوع النشاط الجديد */}
            <div className="relative">
                <Filter className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={20} />
                <select 
                    value={activityTypeFilter}
                    onChange={(e) => setActivityTypeFilter(e.target.value)}
                    className="appearance-none pr-10 pl-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 bg-white text-slate-700 font-medium"
                >
                    <option value="all">كل الأنشطة</option>
                    <option value="commercial">تجاري</option>
                    <option value="restaurant">مطاعم</option>
                    <option value="construction">مقاولات</option>
                    <option value="clinic">عيادات</option>
                    <option value="legal">قانوني</option>
                    <option value="transport">نقل</option>
                    <option value="charity">خيري</option>
                </select>
            </div>
        </div>
        
        {loadingOrgs ? (
          <div className="p-20 text-center">
            <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={32} />
            <p className="text-slate-500 font-medium">جاري تحميل قائمة الشركات...</p>
          </div>
        ) : filteredOrgs.length === 0 ? (
            <div className="p-20 text-center text-slate-500">
                <Building2 size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium">لا توجد شركات مطابقة</p>
                <p className="text-sm">لم يتم العثور على أي شركة تطابق معايير البحث أو الفلترة.</p>
            </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-sm font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4 border-b border-slate-100">اسم الشركة</th>
                  <th className="p-4 border-b border-slate-100">الحالة</th>
                  <th className="p-4 border-b border-slate-100">نوع النشاط</th>
                  <th className="p-4 border-b border-slate-100">إجمالي المبيعات</th>
                  <th className="p-4 border-b border-slate-100">أيام التحصيل</th>
                  <th className="p-4 border-b border-slate-100">تاريخ الانتهاء</th>
                  <th className="p-4 border-b border-slate-100">الموديولات</th>
                  <th className="p-4 border-b border-slate-100 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50"> 
                {filteredOrgs.map((org) => {
                  const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
                  const isActive = org.is_active && !isExpired;
                  const isOverLimit = org.user_count && org.user_count >= org.max_users;
                  
                  const activityLabels: Record<string, string> = {
                    'commercial': 'تجاري',
                    'restaurant': 'مطاعم',
                    'construction': 'مقاولات',
                    'clinic': 'عيادات'
                  };

                  // حساب الأيام المتبقية لموعد الدفع القادم
                  const targetDate = org.next_payment_date ? new Date(org.next_payment_date) : null;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (targetDate) targetDate.setHours(0, 0, 0, 0);
                  const diffDays = targetDate ? Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <tr key={org.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4">
                        <div className="font-bold text-slate-700">{org.name}</div>
                        <div className={`text-[10px] font-black flex items-center gap-1 mt-1 ${isOverLimit ? 'text-rose-500' : 'text-slate-400'}`}>
                          <Users size={10} />
                          {org.user_count} / {org.max_users} مستخدم
                        </div>
                      </td>
                      <td className="p-4">
                        {isActive ? (
                          <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 w-fit">
                            <ShieldCheck size={14} /> نشط
                          </span>
                        ) : (
                          <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 w-fit">
                            <XCircle size={14} /> {isExpired ? 'منتهي' : 'متوقف'}
                          </span>
                        )}
                    </td>
                    <td className="p-4">
                      <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">
                        {activityLabels[org.activity_type || ''] || org.activity_type || 'تجاري'}
                      </span>
                      </td>
                      <td className="p-4 text-slate-500 font-medium">
                        <div className="flex items-center gap-1 text-emerald-600 font-black">
                          <DollarSign size={14} />
                          {(org.total_sales || 0).toLocaleString()}
                          <span className="text-[10px] font-bold mr-1">ج.م</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {diffDays !== null ? (
                          <div className={`font-black text-xs ${diffDays <= 1 ? 'text-rose-600 animate-pulse' : 'text-slate-600'}`}>
                            {diffDays === 0 ? 'اليوم' : diffDays === 1 ? 'غداً' : diffDays < 0 ? `متأخر ${Math.abs(diffDays)} يوم` : `باقي ${diffDays} يوم`}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">--</span>
                        )}
                      </td>
                      <td className="p-4 text-slate-500 font-medium">
                        {org.subscription_expiry ? new Date(org.subscription_expiry).toLocaleDateString('ar-EG') : 'بدون تاريخ'}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {org.allowed_modules?.slice(0, 2).map(m => (
                            <span key={m} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{m}</span>
                          ))}
                          {org.allowed_modules?.length > 2 && <span className="text-[10px] text-slate-400 font-bold">+{org.allowed_modules.length - 2}</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => { setEditingOrg(org); setIsEditModalOpen(true); }}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-slate-200"
                            title="تعديل الإعدادات والباقة"
                          >
                            <Settings size={16} /> تعديل
                          </button>
                          <button 
                            onClick={() => handleImpersonate(org.id, org.name)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-blue-200"
                            title="تصفح بيانات هذه الشركة"
                          >
                            <Eye size={16} />
                            تصفح
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Growth Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl text-white relative overflow-hidden shadow-xl shadow-blue-100">
          <div className="relative z-10">
            <h3 className="text-2xl font-black mb-2">تقرير النمو الذكي 📈</h3>
            <p className="opacity-90 font-medium mb-6 max-w-md">
              أداء المنصة هذا الشهر متميز! هناك زيادة بنسبة {stats?.growth_this_month_percent}% في عدد المشتركين الجدد مقارنة بالشهر الماضي.
            </p>
            <button className="bg-white text-blue-700 px-6 py-3 rounded-xl font-black hover:bg-blue-50 transition-all flex items-center gap-2 shadow-lg">
              عرض التحليلات المتقدمة
              <ArrowUpRight size={20} />
            </button>
          </div>
          <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        </div>
        
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-center">
           <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Users size={24} /></div>
              <h4 className="font-bold text-slate-800">الدعم الفني</h4>
           </div>
           <p className="text-slate-500 text-sm leading-relaxed mb-6">يمكنك التواصل مع الشركات المشتركة أو إرسال إشعارات جماعية لكافة المستخدمين بخصوص تحديثات النظام.</p>
           <button className="w-full py-3 border-2 border-slate-100 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-all">إرسال إشعار عام</button>
        </div>
      </div>

      <AddClientModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSuccess={loadData} 
      />
      <EditClientModal 
        isOpen={isEditModalOpen} 
        onClose={() => { setIsEditModalOpen(false); setEditingOrg(null); }} 
        onSuccess={loadData} 
        organization={editingOrg}
      />
    </div>
  );
};

export default SaasAdmin;