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
  Save,
  ChevronRight,
  ChevronLeft,
  Shield,
  AlertCircle,
  PackageCheck,
  Warehouse,
  CalendarCheck,
  KeyRound,
  ArrowRight,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface HealthChecks {
  suppliers_account:   'ok' | 'missing';
  customers_account:   'ok' | 'missing';
  inventory_account:   'ok' | 'missing';
  cash_account:        'ok' | 'missing';
  default_warehouse:   'ok' | 'missing';
  fiscal_year:         'ok' | 'missing';
  admin_role:          'ok' | 'missing';
  accounts_count:      number;
}

interface ProvisionResult {
  success:              boolean;
  org_id:               string;
  default_warehouse_id: string;
  fiscal_year_id:       string;
  fiscal_year:          number;
  plan:                 string;
  allowed_modules:      string[];
  health_checks:        HealthChecks;
  all_healthy:          boolean;
}

interface AddClientModalProps {
  isOpen:       boolean;
  onClose:      () => void;
  onSuccess:    () => void;
  existingOrgs?: Organization[];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const getTrialExpiryDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
};

const PLAN_COLORS: Record<string, string> = {
  basic:      'bg-slate-100 text-slate-700 border-slate-300',
  pro:        'bg-blue-50 text-blue-700 border-blue-300',
  sports:     'bg-emerald-50 text-emerald-700 border-emerald-300',
  premium:    'bg-amber-50 text-amber-700 border-amber-300',
  enterprise: 'bg-purple-50 text-purple-700 border-purple-300',
};

const PLAN_LABELS: Record<string, string> = {
  basic:      '🥉 الأساسية',
  pro:        '🥈 الاحترافية',
  sports:     '🏟️ الرياضة',
  premium:    '🥇 المتكاملة',
  enterprise: '🏢 Enterprise',
};

// ─────────────────────────────────────────────
// Step Indicator
// ─────────────────────────────────────────────
const StepDot = ({ step, current, label }: { step: number; current: number; label: string }) => (
  <div className="flex flex-col items-center gap-1">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm transition-all
      ${current === step   ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-110'
      : current > step     ? 'bg-emerald-500 text-white'
      : 'bg-slate-200 text-slate-400'}`}>
      {current > step ? <CheckCircle size={16} /> : step}
    </div>
    <span className={`text-[10px] font-bold hidden sm:block ${current >= step ? 'text-slate-700' : 'text-slate-400'}`}>
      {label}
    </span>
  </div>
);

const StepLine = ({ active }: { active: boolean }) => (
  <div className={`flex-1 h-1 rounded-full mx-1 mb-4 transition-all ${active ? 'bg-emerald-400' : 'bg-slate-200'}`} />
);

// ─────────────────────────────────────────────
// Health Check Row
// ─────────────────────────────────────────────
const HealthRow = ({ label, status }: { label: string; status: 'ok' | 'missing' | number }) => {
  if (typeof status === 'number') {
    return (
      <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-sm font-black text-blue-700">{status} حساب</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      {status === 'ok'
        ? <CheckCircle size={18} className="text-emerald-500" />
        : <AlertCircle size={18} className="text-rose-500" />}
    </div>
  );
};

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
const AddClientModal: React.FC<AddClientModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingOrgs = [],
}) => {
  const [step, setStep]               = useState(1);
  const [loading, setLoading]         = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const { showToast } = useToast();

  // Setup mode: template or clone
  const [setupSource, setSetupSource] = useState<'template' | 'clone'>('template');
  const [sourceOrgId, setSourceOrgId] = useState('');
  const [cloneOptions, setCloneOptions] = useState({
    includeAccounts:    true,
    includeSettings:    true,
    includeWarehouses:  true,
    includeCostCenters: true,
    includeUoms:        true,
    includeCategories:  true,
    includeProducts:    true,
    includeCustomers:   true,
    includeSuppliers:   true,
    includeRestaurant:  true,
  });

  const [formData, setFormData] = useState({
    // Step 1
    companyName:        '',
    coaTemplate:        'commercial',
    currency:           'EGP',
    vatRate:            14,
    logoUrl:            '',
    // Step 2
    plan:               'pro',
    maxUsers:           5,
    modules:            PLAN_CONFIGS['pro'].modules,
    subscriptionExpiry: getTrialExpiryDate(),
    // Step 3
    adminName:          '',
    email:              '',
    password:           '',
  });

  // Reset on open/close
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setProvisionResult(null);
      setSetupSource('template');
      setSourceOrgId('');
      setFormData({
        companyName: '', coaTemplate: 'commercial', currency: 'EGP', vatRate: 14, logoUrl: '',
        plan: 'pro', maxUsers: 5, modules: PLAN_CONFIGS['pro'].modules,
        subscriptionExpiry: getTrialExpiryDate(),
        adminName: '', email: '', password: '',
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ─── Handlers ─────────────────────────────
  const handlePlanChange = (planKey: string) => {
    const cfg = PLAN_CONFIGS[planKey] || PLAN_CONFIGS['pro'];
    setFormData(prev => ({ ...prev, plan: planKey, maxUsers: cfg.maxUsers, modules: cfg.modules }));
  };

  const generatePassword = () => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let pass = 'A' + 'a' + '1' + '!';
    for (let i = 0; i < 8; i++) pass += charset[Math.floor(Math.random() * charset.length)];
    const shuffled = pass.split('').sort(() => 0.5 - Math.random()).join('');
    setFormData(prev => ({ ...prev, password: shuffled }));
    showToast('تم توليد كلمة مرور قوية 🔐', 'info');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setUploadingLogo(true);
    try {
      const file = e.target.files[0];
      const ext  = file.name.split('.').pop() || 'png';
      const path = `org-logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('logos').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('logos').getPublicUrl(path);
      setFormData(prev => ({ ...prev, logoUrl: data.publicUrl }));
      showToast('تم رفع الشعار ✅', 'success');
    } catch (err: any) {
      showToast('فشل رفع الشعار: ' + err.message, 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  // ─── Validation per step ──────────────────
  const canProceed = (): boolean => {
    if (step === 1) return formData.companyName.trim().length >= 2;
    if (step === 2) return formData.modules.length > 0;
    if (step === 3) return formData.adminName.trim().length >= 2
                        && formData.email.includes('@')
                        && formData.password.length >= 6;
    return true;
  };

  // ─── Final Submit ─────────────────────────
  const handleSubmit = async () => {
    if (!canProceed()) return;
    setLoading(true);
    try {
      // ── 1. استدعاء دالة التأسيس الشاملة ──
      const { data: provData, error: provError } = await supabase.rpc(
        'provision_new_org_complete',
        {
          p_company_name:        formData.companyName,
          p_email:               formData.email,
          p_activity_type:       formData.coaTemplate || 'commercial',
          p_plan:                formData.plan,
          p_currency:            formData.currency,
          p_vat_rate:            formData.vatRate,
          p_allowed_modules:     formData.modules,
          p_max_users:           formData.maxUsers,
          p_subscription_expiry: formData.subscriptionExpiry,
        }
      );

      if (provError) throw provError;
      if (!provData?.org_id) throw new Error('تعذّر الحصول على معرف المنظمة من الخادم');

      const result = provData as ProvisionResult;
      const newOrgId = result.org_id;

      // ── 2. رفع الشعار إذا وُجد ──
      if (formData.logoUrl) {
        await supabase.from('organizations').update({ logo_url: formData.logoUrl }).eq('id', newOrgId);
      }

      // ── 3. استنساخ من شركة مصدر إذا اختار المستخدم ذلك ──
      if (setupSource === 'clone' && sourceOrgId) {
        const { error: cloneError } = await supabase.rpc('clone_organization_template', {
          p_source_org_id: sourceOrgId,
          p_target_org_id: newOrgId,
          p_options: {
            include_accounts:    cloneOptions.includeAccounts,
            include_settings:    cloneOptions.includeSettings,
            include_warehouses:  cloneOptions.includeWarehouses,
            include_cost_centers:cloneOptions.includeCostCenters,
            include_uoms:        cloneOptions.includeUoms,
            include_categories:  cloneOptions.includeCategories,
            include_products:    cloneOptions.includeProducts,
            include_customers:   cloneOptions.includeCustomers,
            include_suppliers:   cloneOptions.includeSuppliers,
            include_restaurant:  cloneOptions.includeRestaurant,
          },
        });
        if (cloneError) showToast('تحذير أثناء الاستنساخ: ' + cloneError.message, 'warning');
      }

      // ── 4. إنشاء حساب المدير ──
      const { error: authError } = await supabase.auth.signUp({
        email:    formData.email,
        password: formData.password,
        options:  {
          data: {
            full_name: formData.adminName,
            role:      'admin',
            org_id:    newOrgId,
          },
        },
      });

      if (authError) {
        if (authError.message.includes('already registered') || authError.status === 422) {
          const { error: fpErr } = await supabase.rpc('force_provision_admin', {
            p_email:     formData.email,
            p_org_id:    newOrgId,
            p_full_name: formData.adminName,
          });
          if (fpErr) showToast('تحذير: الحساب موجود مسبقاً — تأكد من ربطه يدوياً', 'warning');
          else showToast('تم ربط الحساب الموجود بالشركة الجديدة ✅', 'success');
        } else {
          showToast('تم إنشاء الشركة، لكن فشل إنشاء حساب المدير: ' + authError.message, 'warning');
        }
      }

      setProvisionResult(result);
      onSuccess();
    } catch (err: any) {
      showToast('خطأ في التأسيس: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────
  // SUCCESS SCREEN
  // ─────────────────────────────────────────────────
  if (provisionResult) {
    const hc = provisionResult.health_checks;
    return (
      <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className={`p-6 text-center ${provisionResult.all_healthy ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-3
              ${provisionResult.all_healthy ? 'bg-emerald-100' : 'bg-amber-100'}`}>
              {provisionResult.all_healthy
                ? <CheckCircle size={44} className="text-emerald-600" />
                : <AlertCircle  size={44} className="text-amber-600" />}
            </div>
            <h3 className="font-black text-2xl text-slate-800">
              {provisionResult.all_healthy ? 'تم التأسيس بنجاح! 🎉' : 'تم التأسيس مع تحذيرات ⚠️'}
            </h3>
            <p className="text-slate-500 text-sm mt-1">{formData.companyName}</p>
          </div>

          <div className="p-5 space-y-4">
            {/* Health Checks */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <h4 className="font-black text-slate-700 text-sm mb-3 flex items-center gap-2">
                <Shield size={16} className="text-blue-600" /> فحص اكتمال التأسيس
              </h4>
              <HealthRow label="🏦 حساب الموردين"    status={hc.suppliers_account} />
              <HealthRow label="👥 حساب العملاء"     status={hc.customers_account} />
              <HealthRow label="📦 حساب المخزون"      status={hc.inventory_account} />
              <HealthRow label="💵 حساب النقدية"      status={hc.cash_account} />
              <HealthRow label="🏭 المستودع الرئيسي"  status={hc.default_warehouse} />
              <HealthRow label="📅 السنة المالية"      status={hc.fiscal_year} />
              <HealthRow label="🔑 دور المدير"         status={hc.admin_role} />
              <HealthRow label="📒 إجمالي الحسابات"   status={hc.accounts_count} />
            </div>

            {/* Login Data */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
              <h4 className="font-black text-slate-700 text-sm mb-2 flex items-center gap-2">
                <KeyRound size={16} className="text-blue-600" /> بيانات الدخول
              </h4>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">الرابط</span>
                  <span className="font-mono text-blue-600 text-[11px]">{window.location.origin}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">البريد</span>
                  <span className="font-bold text-slate-700">{formData.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">كلمة المرور</span>
                  <span className="font-mono font-bold text-slate-700">{formData.password}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الباقة</span>
                  <span className={`font-bold text-xs px-2 py-0.5 rounded-full border ${PLAN_COLORS[formData.plan]}`}>
                    {PLAN_LABELS[formData.plan]}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const text = `مرحباً ${formData.adminName}،\nتم تفعيل حسابكم في TriPro ERP لشركة ${formData.companyName}.\n\nرابط الدخول: ${window.location.origin}\nالبريد: ${formData.email}\nكلمة المرور: ${formData.password}\n\nنتمنى لكم تجربة مميزة! 🚀`;
                  navigator.clipboard.writeText(text);
                  showToast('تم نسخ بيانات الدخول ✅', 'success');
                }}
                className="w-full bg-blue-600 text-white font-black py-3.5 rounded-2xl hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
              >
                <Copy size={18} /> نسخ بيانات الدخول
              </button>
              <button onClick={onClose} className="w-full py-3 text-slate-500 font-bold hover:text-slate-700">
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────
  // WIZARD SCREENS
  // ─────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="p-4 border-b flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
            <Building2 className="text-blue-600" size={22} /> تأسيس شركة جديدة
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* ── Step Indicator ── */}
        <div className="px-6 pt-4 pb-1 shrink-0 flex items-center">
          <StepDot step={1} current={step} label="الشركة" />
          <StepLine active={step > 1} />
          <StepDot step={2} current={step} label="الباقة" />
          <StepLine active={step > 2} />
          <StepDot step={3} current={step} label="المدير" />
          <StepLine active={step > 3} />
          <StepDot step={4} current={step} label="مراجعة" />
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">

          {/* ═══════════════════════════════════════
              STEP 1 — معلومات الشركة
              ═══════════════════════════════════════ */}
          {step === 1 && (
            <>
              {/* Logo */}
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="relative">
                  <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center text-slate-300 border border-slate-200 overflow-hidden shadow-sm">
                    {formData.logoUrl
                      ? <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      : <Building2 size={28} />}
                    {uploadingLogo && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <Loader2 className="animate-spin text-blue-600" size={20} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-700 mb-2">شعار الشركة (اختياري)</p>
                  <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1">
                        <Upload size={13} /> {formData.logoUrl ? 'تغيير' : 'رفع شعار'}
                      </div>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
                    </label>
                    {formData.logoUrl && (
                      <button type="button" onClick={() => setFormData(p => ({ ...p, logoUrl: '' }))}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg border border-rose-100">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Company Name */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">اسم الشركة *</label>
                <input
                  autoFocus
                  type="text"
                  required
                  placeholder="مثال: شركة النجاح للتجارة"
                  className="w-full border-2 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 font-bold text-slate-800"
                  value={formData.companyName}
                  onChange={e => setFormData(p => ({ ...p, companyName: e.target.value }))}
                />
              </div>

              {/* Activity Type */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">نوع النشاط</label>
                <select
                  className="w-full border-2 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white font-bold text-slate-700"
                  value={formData.coaTemplate}
                  onChange={e => setFormData(p => ({ ...p, coaTemplate: e.target.value }))}
                >
                  <option value="commercial">🏢 نشاط تجاري عام</option>
                  <option value="restaurant">🍽️ مطاعم وكافيهات</option>
                  <option value="manufacturing">🏭 مصانع وتصنيع</option>
                  <option value="construction">🏗️ مقاولات وإنشاءات</option>
                  <option value="stadium">🏟️ أندية رياضية واستادات</option>
                  <option value="hospital">🏥 مستشفيات ومراكز طبية</option>
                  <option value="clinic">⚕️ عيادات وخدمات صحية</option>
                  <option value="transport">🚚 نقل ولوجستيات</option>
                  <option value="charity">🤝 جمعيات خيرية</option>
                  <option value="legal">⚖️ مكاتب محاماة واستشارات</option>
                </select>
              </div>

              {/* Currency & VAT */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">العملة</label>
                  <select
                    className="w-full border-2 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white font-bold text-slate-700"
                    value={formData.currency}
                    onChange={e => setFormData(p => ({ ...p, currency: e.target.value }))}
                  >
                    <option value="EGP">🇪🇬 جنيه مصري (EGP)</option>
                    <option value="SAR">🇸🇦 ريال سعودي (SAR)</option>
                    <option value="USD">🇺🇸 دولار (USD)</option>
                    <option value="AED">🇦🇪 درهم إماراتي (AED)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">نسبة الضريبة %</label>
                  <input
                    type="number" step="0.01" min="0" max="100"
                    className="w-full border-2 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                    value={formData.vatRate}
                    onChange={e => setFormData(p => ({ ...p, vatRate: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              {/* Setup Source */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">طريقة تأسيس الدليل المحاسبي</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl mb-3">
                  <button type="button" onClick={() => setSetupSource('template')}
                    className={`py-2 text-xs font-black rounded-lg flex items-center justify-center gap-1.5 transition-all
                      ${setupSource === 'template' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                    <Sparkles size={13} /> قالب قياسي
                  </button>
                  <button type="button" onClick={() => setSetupSource('clone')}
                    className={`py-2 text-xs font-black rounded-lg flex items-center justify-center gap-1.5 transition-all
                      ${setupSource === 'clone' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500'}`}>
                    <GitFork size={13} /> استنساخ من شركة ⚡
                  </button>
                </div>

                {setupSource === 'clone' && (
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 space-y-3">
                    <div>
                      <label className="block text-xs font-black text-purple-900 mb-1">الشركة المصدر:</label>
                      <select
                        value={sourceOrgId}
                        onChange={e => setSourceOrgId(e.target.value)}
                        className="w-full border-2 border-purple-200 rounded-xl p-2.5 text-xs font-bold bg-white focus:border-purple-500 outline-none"
                      >
                        <option value="">-- اختر شركة مصدر --</option>
                        {existingOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      {[
                        ['includeAccounts',    'شجرة الحسابات'],
                        ['includeSettings',    'إعدادات القيود'],
                        ['includeWarehouses',  'المخازن'],
                        ['includeCostCenters', 'مراكز التكلفة'],
                        ['includeUoms',        'وحدات القياس'],
                        ['includeCategories',  'التصنيفات'],
                        ['includeProducts',    'الأصناف'],
                        ['includeCustomers',   'العملاء'],
                        ['includeSuppliers',   'الموردين'],
                        ['includeRestaurant',  'طاولات المطعم'],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-purple-100 cursor-pointer font-bold text-slate-700">
                          <input type="checkbox"
                            checked={(cloneOptions as any)[key]}
                            onChange={e => setCloneOptions(p => ({ ...p, [key]: e.target.checked }))}
                            className="w-3.5 h-3.5 text-purple-600 rounded"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════
              STEP 2 — الباقة والموديولات
              ═══════════════════════════════════════ */}
          {step === 2 && (
            <>
              {/* Plan selector */}
              <div>
                <label className="block text-sm font-bold text-blue-700 mb-2">اختر باقة الاشتراك</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'basic',      emoji: '🥉', name: 'الأساسية',    sub: '2 مستخدمين' },
                    { key: 'pro',        emoji: '🥈', name: 'الاحترافية',  sub: '5 مستخدمين' },
                    { key: 'sports',     emoji: '🏟️', name: 'الرياضة',     sub: '10 مستخدمين' },
                    { key: 'premium',    emoji: '🥇', name: 'المتكاملة',   sub: '20 مستخدمين' },
                  ].map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handlePlanChange(p.key)}
                      className={`p-3 rounded-2xl border-2 text-right transition-all ${
                        formData.plan === p.key
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">{p.emoji}</div>
                      <div className="font-black text-slate-800 text-sm">{p.name}</div>
                      <div className="text-xs text-slate-500 font-bold">{p.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Users */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">الحد الأقصى للمستخدمين</label>
                <input
                  type="number" min="1" max="999"
                  className="w-full border-2 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  value={formData.maxUsers}
                  onChange={e => setFormData(p => ({ ...p, maxUsers: parseInt(e.target.value) || 1 }))}
                />
              </div>

              {/* Modules */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الموديولات المتاحة</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {AVAILABLE_MODULES.map(mod => (
                    <label
                      key={mod.id}
                      className={`flex items-center gap-2 p-2.5 border-2 rounded-xl cursor-pointer transition-all text-xs font-bold
                        ${formData.modules.includes(mod.id)
                          ? 'bg-blue-50 border-blue-300 text-blue-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.modules.includes(mod.id)}
                        onChange={() => {
                          const nm = formData.modules.includes(mod.id)
                            ? formData.modules.filter(m => m !== mod.id)
                            : [...formData.modules, mod.id];
                          setFormData(p => ({ ...p, modules: nm }));
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      {mod.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Subscription Expiry */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">تاريخ انتهاء الاشتراك</label>
                <input
                  type="date"
                  className="w-full border-2 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.subscriptionExpiry}
                  onChange={e => setFormData(p => ({ ...p, subscriptionExpiry: e.target.value }))}
                />
                <p className="text-[11px] text-blue-600 mt-1 font-bold">✨ تجربة مجانية 14 يوم</p>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════
              STEP 3 — بيانات المدير
              ═══════════════════════════════════════ */}
          {step === 3 && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800 font-bold flex items-start gap-2">
                <UserPlus size={18} className="shrink-0 mt-0.5" />
                <span>سيتم إنشاء حساب مدير النظام لشركة <strong>{formData.companyName}</strong> بالبيانات التالية.</span>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">اسم المدير *</label>
                <input
                  autoFocus
                  type="text"
                  required
                  placeholder="الاسم الكامل"
                  className="w-full border-2 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  value={formData.adminName}
                  onChange={e => setFormData(p => ({ ...p, adminName: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">البريد الإلكتروني *</label>
                <input
                  type="email"
                  required
                  placeholder="admin@company.com"
                  className="w-full border-2 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-sm font-bold text-slate-700">كلمة المرور المؤقتة *</label>
                  <button type="button" onClick={generatePassword}
                    className="text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 flex items-center gap-1 hover:bg-blue-100">
                    <RefreshCw size={11} /> توليد تلقائي
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    minLength={6}
                    className="w-full border-2 rounded-xl p-3 pr-10 outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                    value={formData.password}
                    onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  />
                  <Lock className="absolute right-3 top-3.5 text-slate-400" size={18} />
                </div>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════
              STEP 4 — مراجعة وتأسيس
              ═══════════════════════════════════════ */}
          {step === 4 && (
            <>
              <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
                {[
                  { label: 'اسم الشركة',     value: formData.companyName },
                  { label: 'نوع النشاط',      value: formData.coaTemplate },
                  { label: 'العملة',          value: formData.currency },
                  { label: 'نسبة الضريبة',   value: `${formData.vatRate}%` },
                  { label: 'الباقة',          value: PLAN_LABELS[formData.plan] },
                  { label: 'المستخدمين',      value: formData.maxUsers },
                  { label: 'انتهاء الاشتراك', value: formData.subscriptionExpiry },
                  { label: 'اسم المدير',      value: formData.adminName },
                  { label: 'البريد',          value: formData.email },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-sm text-slate-500 font-bold">{label}</span>
                    <span className="text-sm font-black text-slate-800">{value}</span>
                  </div>
                ))}
              </div>

              {/* Modules summary */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                <p className="text-xs font-black text-blue-800 mb-2">الموديولات المفعلة ({formData.modules.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {formData.modules.map(m => (
                    <span key={m} className="bg-blue-100 text-blue-800 text-[11px] font-black px-2 py-1 rounded-lg">
                      {AVAILABLE_MODULES.find(a => a.id === m)?.label || m}
                    </span>
                  ))}
                </div>
              </div>

              {/* What will be created */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-black text-emerald-800 mb-1">ما سيتم إنشاؤه تلقائياً:</p>
                {[
                  { icon: <PackageCheck size={14} />,  text: 'دليل حسابات مصري كامل (+180 حساب)' },
                  { icon: <Warehouse size={14} />,      text: 'مستودع رئيسي افتراضي' },
                  { icon: <CalendarCheck size={14} />,  text: `سنة مالية ${new Date().getFullYear()} (يناير – ديسمبر)` },
                  { icon: <Shield size={14} />,         text: 'دور مدير بصلاحيات كاملة' },
                  { icon: <ArrowRight size={14} />,     text: 'ربط حسابات النظام تلقائياً' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    {icon} {text}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="p-4 border-t bg-slate-50 flex gap-3 shrink-0">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              disabled={loading}
              className="px-5 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 flex items-center gap-1"
            >
              <ChevronRight size={18} /> السابق
            </button>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => canProceed() ? setStep(s => s + 1) : showToast('يرجى إكمال البيانات المطلوبة', 'error')}
              className={`flex-1 font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-all
                ${canProceed()
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              التالي <ChevronLeft size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-xl hover:bg-emerald-700 disabled:opacity-60 shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
            >
              {loading
                ? <><Loader2 className="animate-spin" size={20} /> جارٍ التأسيس...</>
                : <><Sparkles size={20} /> تأسيس الشركة الآن</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddClientModal;
