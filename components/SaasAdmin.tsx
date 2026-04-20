import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { useAccounting } from '../context/AccountingContext';
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
  FileSpreadsheet,
  RotateCcw,
  Download,
  Database as DatabaseIcon,
  PlusCircle,
  Upload
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { secureStorage } from '../utils/securityMiddleware';

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
  logo_url?: string;
}

interface OrganizationBackup {
  id: string;
  organization_id: string;
  backup_date: string;
  backup_data: any; // jsonb
  file_size_kb: number;
  created_by: string; // auth.users.id
  profiles: { full_name: string } | null; // Joined from profiles table
  notes: string;
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
    setLoading(true);
    try {
      // 1. استدعاء دالة قاعدة البيانات لإنشاء الشركة وتأسيس الدليل المحاسبي
      // نمرر p_admin_id كـ null مؤقتاً لحين إنشاء المستخدم في الخطوة التالية
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

      // 2. تحديث بيانات الباقة والاشتراك (لأن الدالة الأساسية تستخدم القيم الافتراضية)
      await supabase.from('organizations').update({
          max_users: formData.maxUsers,
          allowed_modules: formData.modules,
          subscription_expiry: formData.subscriptionExpiry,
          logo_url: formData.logoUrl // 👈 تم إضافة حفظ رابط الشعار في قاعدة البيانات
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

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, organization, confirmName, setConfirmName, loading }: any) => {
  if (!isOpen || !organization) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 space-y-6 text-center">
          <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={48} className="text-rose-600" />
          </div>
          <h3 className="font-black text-2xl text-slate-800">حذف المنظمة نهائياً؟</h3>
          <p className="text-slate-500">
            أنت على وشك حذف شركة <span className="font-bold text-rose-600">"{organization.name}"</span>. 
            سيؤدي هذا الإجراء إلى مسح كافة البيانات، الفواتير، القيود، والمستخدمين المرتبطين بها للأبد.
          </p>
          
          <div className="space-y-2 text-right">
            <label className="text-sm font-bold text-slate-700">لتأكيد الحذف، يرجى كتابة اسم الشركة أدناه:</label>
            <input 
              type="text" 
              className="w-full border-2 border-rose-100 rounded-xl p-3 outline-none focus:ring-2 focus:ring-rose-500 font-bold"
              placeholder={organization.name}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={onConfirm}
              disabled={loading || confirmName.trim() !== organization.name.trim()}
              className="w-full bg-rose-600 text-white font-black py-4 rounded-2xl hover:bg-rose-700 flex items-center justify-center gap-2 shadow-lg shadow-rose-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Trash2 size={20} />} 
              تأكيد الحذف النهائي
            </button>
            <button onClick={onClose} className="w-full py-3 text-slate-500 font-bold hover:text-slate-700">تراجع وإلغاء</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const OrphanedFilesModal = ({ isOpen, onClose, files, onDelete, loading }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[80vh]">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
            <Trash2 className="text-rose-600" /> المرفقات اليتيمة (في الـ Storage فقط)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {files.length === 0 ? (
            <div className="text-center py-10 text-slate-500">لا توجد ملفات يتيمة حالياً ✅</div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-600 font-bold mb-4 bg-amber-50 p-3 rounded-lg border border-amber-100">تحذير: هذه الملفات موجودة في المخزن السحابي ولكن لا تملك أي سجل يشير لها في قاعدة البيانات.</p>
              {files.map((file: string) => (
                <div key={file} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-mono text-[10px] text-slate-600 truncate flex-1">{file}</span>
                  <button onClick={() => onDelete(file)} className="text-rose-600 hover:bg-rose-100 p-2 rounded-lg" title="حذف الملف نهائياً">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-slate-50 flex justify-between gap-3">
          <button onClick={onClose} className="px-6 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-600">إغلاق</button>
          {files.length > 0 && (
            <button onClick={() => onDelete('all')} disabled={loading} className="px-6 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 flex items-center gap-2">
              {loading ? <Loader2 className="animate-spin" /> : <Trash2 size={18} />} حذف كافة اليتامى
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const SaasAdmin: React.FC = () => {
  const { currentUser, isLoading } = useAccounting(); // جلب المستخدم الحالي وحالة التحميل
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isOrphanedModalOpen, setIsOrphanedModalOpen] = useState(false);
  const [orphanedFiles, setOrphanedFiles] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState('all'); // 👈 حالة جديدة لفلتر نوع النشاط
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const { showToast } = useToast();

  // --- Backup Management States ---
  const [activeAdminTab, setActiveAdminTab] = useState<'organizations' | 'backups'>('organizations');
  const [selectedBackupOrgId, setSelectedBackupOrgId] = useState<string | null>(null);
  const [backups, setBackups] = useState<OrganizationBackup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [orphanedBackupsCount, setOrphanedBackupsCount] = useState(0);


  // --- End Backup Management States ---

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
      // 🔍 فحص النسخ الاحتياطية اليتيمة لليوزر العالمي فقط
      if (currentUser?.role === 'super_admin') {
        const { data: allBackups } = await supabase
          .from('organization_backups')
          .select('organization_id');

        if (allBackups) {
          const orgIds = new Set(processedOrgs.map(o => o.id));
          const orphaned = allBackups.filter(b => !orgIds.has(b.organization_id));
          setOrphanedBackupsCount(orphaned.length);
          
          if (orphaned.length > 0) {
            showToast(`تنبيه: تم العثور على ${orphaned.length} نسخة احتياطية يتيمة لشركات محذوفة!`, 'warning');
          }
        }
      }      
    } catch (error: any) {
      showToast('خطأ في تحميل البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
      setLoadingOrgs(false);
    }
  };
  const handleCleanupOrphanedBackups = async () => {
    if (orphanedBackupsCount === 0) {
      showToast('لا توجد نسخ احتياطية يتيمة لتنظيفها حالياً ✅', 'info');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف ${orphanedBackupsCount} نسخة احتياطية يتيمة من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    
    setLoading(true);
    try {
      // استدعاء الدالة الجديدة من طرف الخادم لسرعة أكبر
      const { data, error } = await supabase.rpc('cleanup_orphaned_backups');
      if (error) throw error;
      showToast(`تم تنظيف ${data || 0} نسخة يتيمة بنجاح من قاعدة البيانات ✅`, 'success');

      setOrphanedBackupsCount(0);
      await loadData();
    } catch (error: any) {
      showToast('فشل عملية التنظيف: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- Backup Management Functions ---
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'super_admin') {
        setSelectedBackupOrgId(orgs.length > 0 ? orgs[0].id : null);
      } else if (currentUser.organization_id) {
        setSelectedBackupOrgId(currentUser.organization_id);
      }
    }
  }, [orgs, currentUser]);

  useEffect(() => {
    if (selectedBackupOrgId && activeAdminTab === 'backups') {
      fetchBackups(selectedBackupOrgId);
    }
  }, [selectedBackupOrgId, activeAdminTab]);

  const fetchBackups = async (orgId: string) => {
    setLoadingBackups(true);
    try {
      const { data, error } = await supabase
        .from('organization_backups')
        .select('*, profiles(full_name)')
        .eq('organization_id', orgId)
        .order('backup_date', { ascending: false });
      if (error) throw error;
      setBackups(data || []);
    } catch (err: any) {
      showToast('فشل جلب النسخ الاحتياطية', 'error');
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!selectedBackupOrgId) return;
    if (!window.confirm(`هل تريد إنشاء نسخة احتياطية جديدة لـ ${getOrgName(selectedBackupOrgId)}؟`)) return;
    setCreatingBackup(true);
    try {
      const { error } = await supabase.rpc('create_organization_backup', { p_org_id: selectedBackupOrgId });
      if (error) throw error;
      showToast('تم إنشاء نسخة احتياطية بنجاح ✅', 'success');
      fetchBackups(selectedBackupOrgId);
    } catch (err: any) {
      showToast('فشل إنشاء النسخة الاحتياطية', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDownloadBackup = (backup: OrganizationBackup) => {
    const blob = new Blob([JSON.stringify(backup.backup_data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${getOrgName(backup.organization_id)}_${new Date(backup.backup_date).toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreBackup = async (backup: OrganizationBackup) => {
    if (!window.confirm('⚠️ تحذير: سيتم مسح البيانات الحالية واستبدالها بالنسخة الاحتياطية. هل تريد الاستمرار؟')) return;
    if (window.prompt('لتأكيد الاستعادة النهائية، يرجى كتابة "استعادة" في المربع أدناه:') !== 'استعادة') return;
    setRestoringId(backup.id);
    try {
      const { data, error } = await supabase.rpc('restore_organization_backup', {
        p_org_id: backup.organization_id,
        p_backup_data: backup.backup_data
      });
      if (error) throw error;
      showToast(data || 'تمت استعادة البيانات بنجاح ✅', 'success');
    } catch (err: any) {
      showToast('فشل عملية الاستعادة', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handleExternalFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBackupOrgId) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const backupData = JSON.parse(evt.target?.result as string);
        await handleRestoreBackup({ id: 'temp', organization_id: selectedBackupOrgId, backup_data: backupData } as any);
      } catch (err: any) {
        showToast('ملف غير صالح', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه النسخة الاحتياطية؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      const { error } = await supabase
        .from('organization_backups')
        .delete()
        .eq('id', backupId);

      if (error) throw error;
      showToast('تم حذف النسخة الاحتياطية بنجاح ✅', 'success');
      if (selectedBackupOrgId) fetchBackups(selectedBackupOrgId);
    } catch (err: any) {
      showToast('فشل حذف النسخة الاحتياطية: ' + err.message, 'error');
      console.error('Error deleting backup:', err);
    }
  };

  const getOrgName = (orgId: string) => {
    return orgs.find(org => org.id === orgId)?.name || 'منظمة غير معروفة';
  };
  // --- End Backup Management Functions ---

  const handleDeleteOrg = async () => {
    if (!deletingOrg) return;
    if (deleteConfirmName.trim() !== deletingOrg.name.trim()) {
      showToast('اسم الشركة غير متطابق للتأكيد', 'error');
      return;
    }

    setLoading(true);
    try {
      // 1. حذف الشعار من مخزن Supabase Storage إذا وجد
      if (deletingOrg.logo_url) {
        try {
          // استخراج اسم الملف من الرابط (آخر جزء في الـ URL)
          const urlParts = deletingOrg.logo_url.split('/');
          const fileName = urlParts[urlParts.length - 1];
          
          if (fileName) {
            const { error: storageError } = await supabase.storage
              .from('logos')
              .remove([fileName]);
              
            if (storageError) console.warn('Storage deletion warning:', storageError);
          }
        } catch (err) {
          console.error('Failed to parse or delete logo from storage:', err);
        }
      }

      // 2. حذف كافة المرفقات (قيود، سندات، شيكات) من الـ Storage
      try {
        const [jAtt, rAtt, pAtt, cAtt] = await Promise.all([
          supabase.from('journal_attachments').select('file_path').eq('organization_id', deletingOrg.id),
          supabase.from('receipt_voucher_attachments').select('file_path').eq('organization_id', deletingOrg.id),
          supabase.from('payment_voucher_attachments').select('file_path').eq('organization_id', deletingOrg.id),
          supabase.from('cheque_attachments').select('file_path').eq('organization_id', deletingOrg.id)
        ]);

        const allPaths = [
          ...(jAtt.data?.map(a => a.file_path) || []),
          ...(rAtt.data?.map(a => a.file_path) || []),
          ...(pAtt.data?.map(a => a.file_path) || []),
          ...(cAtt.data?.map(a => a.file_path) || [])
        ];

        if (allPaths.length > 0) {
          const { error: attStorageError } = await supabase.storage
            .from('documents')
            .remove(allPaths);
          
          if (attStorageError) console.warn('Attachments storage deletion warning:', attStorageError);
        }
      } catch (err) {
        console.error('Failed to clean up attachments from storage:', err);
      }

      // 3. حذف سجل المنظمة من قاعدة البيانات
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', deletingOrg.id);

      if (error) throw error;

      showToast(`تم حذف الشركة ${deletingOrg.name} بنجاح ✅`, 'success');
      await loadData();
      setIsDeleteModalOpen(false);
      setDeletingOrg(null);
      setDeleteConfirmName('');
    } catch (error: any) {
      showToast('فشل حذف الشركة: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleScanOrphanedFiles = async () => {
    setLoading(true);
    try {
      const [jRes, rRes, pRes, cRes, orgRes] = await Promise.all([
        supabase.from('journal_attachments').select('file_path'),
        supabase.from('receipt_voucher_attachments').select('file_path'),
        supabase.from('payment_voucher_attachments').select('file_path'),
        supabase.from('cheque_attachments').select('file_path'),
        supabase.from('organizations').select('logo_url')
      ]);

      const dbPaths = new Set([
        ...(jRes.data?.map(a => a.file_path) || []),
        ...(rRes.data?.map(a => a.file_path) || []),
        ...(pRes.data?.map(a => a.file_path) || []),
        ...(cRes.data?.map(a => a.file_path) || []),
        ...(orgRes.data?.map(o => o.logo_url?.split('/').pop()).filter(Boolean) || [])
      ]);

      const { data: docFiles } = await supabase.storage.from('documents').list();
      const orphanedDocs = docFiles?.filter(f => f.name !== '.emptyKeep' && !dbPaths.has(f.name)).map(f => `documents/${f.name}`) || [];

      setOrphanedFiles(orphanedDocs);
      setIsOrphanedModalOpen(true);
      showToast(`تم اكتشاف ${orphanedDocs.length} ملف يتيم`, 'info');
    } catch (err: any) {
      showToast('فشل الفحص: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrphanedFile = async (path: string) => {
    setLoading(true);
    try {
      if (path === 'all') {
        for (const file of orphanedFiles) {
          const [bucket, name] = file.split('/');
          await supabase.storage.from(bucket).remove([name]);
        }
        setOrphanedFiles([]);
        setIsOrphanedModalOpen(false);
        showToast('تم تنظيف كافة الملفات اليتيمة ✅', 'success');
      } else {
        const [bucket, name] = path.split('/');
        await supabase.storage.from(bucket).remove([name]);
        setOrphanedFiles(prev => prev.filter(f => f !== path));
        showToast('تم حذف الملف بنجاح', 'success');
      }
    } catch (err: any) { showToast('فشل الحذف: ' + err.message, 'error'); } finally { setLoading(false); }
  };

  const handleImpersonate = async (orgId: string, orgName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('لم يتم العثور على المستخدم');

      // حفظ معرف المنظمة الأصلي (بيئة المدير) قبل التبديل للتمكن من العودة لاحقاً
      const currentOrgId = user.user_metadata?.org_id || 'main';
      if (!secureStorage.getItem('admin_original_org_id')) {
        secureStorage.setItem('admin_original_org_id', currentOrgId);
      }

      // 1. تحديث البروفايل في قاعدة البيانات
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ organization_id: orgId })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // 2. تحديث بيانات الـ Metadata في نظام Auth لضمان تحديث الـ Token (JWT)
      const { error: authError } = await supabase.auth.updateUser({
        data: { ...user.user_metadata, org_id: orgId }
      });

      if (authError) throw authError;

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

  // 🛡️ حماية الصفحة: التأكد من أن اليوزر هو super_admin فقط
  if (!isLoading && currentUser?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-red-600 bg-red-50 rounded-3xl border border-red-100 p-8">
        <Lock size={48} className="mb-4" />
        <h2 className="text-2xl font-bold">وصول غير مصرح به</h2>
        <p className="text-slate-600">هذه الصفحة مخصصة لمدير المنصة العالمي فقط.</p>
      </div>
    );
  }

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
            onClick={handleCleanupOrphanedBackups}
            className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl text-rose-600 font-bold hover:bg-rose-100 transition-colors shadow-sm"
            title="حذف سجلات النسخ الاحتياطية التي لا تملك شركة (Database Cleanup)"
          >
            <Trash2 size={18} />
            تنظيف المرفقات اليتيمة
          </button>
          <button 
            onClick={handleScanOrphanedFiles}
            className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors shadow-sm"
            title="فحص ملفات الـ Storage التي لا تملك سجلات (File Storage Cleanup)"
          >
            <DatabaseIcon size={18} />
            فحص ملفات التخزين
          </button>
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
                            onClick={() => { setDeletingOrg(org); setIsDeleteModalOpen(true); }}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all flex items-center gap-1 font-bold text-xs border border-transparent hover:border-rose-200"
                            title="حذف المنظمة نهائياً"
                          >
                            <Trash2 size={16} /> حذف
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

      {/* Tabs Navigation */}
      <div className="flex gap-4 border-b border-slate-200 mb-6">
        <button 
          onClick={() => setActiveAdminTab('organizations')}
          className={`pb-2 px-4 font-bold transition-all ${activeAdminTab === 'organizations' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-slate-400'}`}
        >
          إدارة المنظمات
        </button>
        <button 
          onClick={() => setActiveAdminTab('backups')}
          className={`pb-2 px-4 font-bold transition-all ${activeAdminTab === 'backups' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-slate-400'}`}
        >
          النسخ الاحتياطي والاستعادة
        </button>
      </div>

      {/* Tab Content: Backup & Restore Management */}
      {activeAdminTab === 'backups' && (
        <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200 space-y-8 animate-in fade-in">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6">
            <div className="flex-1 w-full">
              <label className="block text-sm font-black text-slate-700 mb-2">اختر المنظمة للإدارة:</label>
              <select 
                value={selectedBackupOrgId || ''} 
                onChange={(e) => setSelectedBackupOrgId(e.target.value)} 
                className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 bg-slate-50 focus:border-blue-500 outline-none"
              >
                <option value="">-- اختر المنظمة --</option>
                {orgs.map((org) => <option key={org.id} value={org.id}>{org.name} ({org.id.slice(0,8)})</option>)}
              </select>
            </div>
            <div className="flex gap-3 flex-wrap">
              <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={handleExternalFileRestore} />
              <button onClick={() => fileInputRef.current?.click()} className="bg-white border-2 border-slate-200 text-slate-600 px-6 py-3 rounded-2xl font-black hover:bg-slate-50 flex items-center gap-2 shadow-sm">
                <Upload size={18} /> استعادة ملف خارجي
              </button>
              <button 
                onClick={handleCreateBackup} 
                disabled={creatingBackup || !selectedBackupOrgId} 
                className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-100"
              >
                {creatingBackup ? <Loader2 className="animate-spin" size={20} /> : <PlusCircle size={20} />} إنشاء نسخة احتياطية
              </button>
            </div>
          </div>

          {selectedBackupOrgId && (
            <div className="border-2 border-slate-50 rounded-[32px] overflow-hidden">
              <div className="bg-slate-50/50 p-4 border-b border-slate-100 font-black text-slate-500 text-xs uppercase tracking-widest">سجل النسخ الاحتياطية</div>
              {loadingBackups ? (
                <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
              ) : backups.length === 0 ? (
                <div className="p-20 text-center text-slate-400 font-bold">لا توجد نسخ احتياطية مسجلة لهذه الشركة حالياً.</div>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase border-b">
                      <th className="p-4">تاريخ النسخة</th>
                      <th className="p-4">الحجم (KB)</th>
                      <th className="p-4">بواسطة</th>
                      <th className="p-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {backups.map((backup) => (
                      <tr key={backup.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold">{new Date(backup.backup_date).toLocaleString()}</td>
                        <td className="p-4 font-mono">{backup.file_size_kb ? backup.file_size_kb.toFixed(2) : '0'}</td>
                        <td className="p-4 text-slate-500 font-medium">{backup.profiles?.full_name || 'النظام'}</td>
                        <td className="p-4 flex justify-center gap-3">
                          <button onClick={() => handleRestoreBackup(backup)} disabled={restoringId !== null} className={`p-2 rounded-xl transition-all ${restoringId === backup.id ? 'bg-orange-100 text-orange-600' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`} title="استعادة"><RotateCcw size={18} /></button>
                          <button onClick={() => handleDownloadBackup(backup)} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100" title="تحميل"><Download size={18} /></button>
                          <button onClick={() => handleDeleteBackup(backup.id)} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100" title="حذف"><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

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
      <DeleteConfirmModal 
        isOpen={isDeleteModalOpen} 
        onClose={() => { 
          setIsDeleteModalOpen(false); 
          setDeletingOrg(null); 
          setDeleteConfirmName(''); 
        }} 
        onConfirm={handleDeleteOrg}
        organization={deletingOrg}
        confirmName={deleteConfirmName}
        setConfirmName={setDeleteConfirmName}
        loading={loading}
      />
      <OrphanedFilesModal 
        isOpen={isOrphanedModalOpen} 
        onClose={() => setIsOrphanedModalOpen(false)} 
        files={orphanedFiles} 
        onDelete={handleDeleteOrphanedFile}
        loading={loading}
      />
    </div>
  );
};

export default SaasAdmin;