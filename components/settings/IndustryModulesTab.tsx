import React, { useState, useEffect } from 'react';
import { 
  Boxes, 
  Utensils, 
  Factory, 
  Building2, 
  Activity, 
  Trophy, 
  ShoppingCart, 
  Check, 
  Save, 
  Sparkles, 
  ShieldCheck, 
  Layers, 
  RotateCcw,
  ChefHat,
  Stethoscope,
  HardHat,
  Store,
  Compass,
  LucideIcon
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { setPrefetchAllowedModules } from '../../utils/routePrefetcher';
import { secureStorage } from '../../utils/securityMiddleware';

// تعريف القطاعات المتخصصة
export interface IndustryModuleDef {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: LucideIcon;
  accentColor: string;
  badgeText: string;
  subModules: string[];
}

export const AVAILABLE_VERTICAL_MODULES: IndustryModuleDef[] = [
  {
    id: 'retail',
    name: 'التجزئة ونقاط البيع (Retail & POS)',
    category: 'التجارة والمبيعات المباشرة',
    description: 'كاشير الباركود السريع، دعم طابعات الإيصالات وشاشات العميل والموازين الذكية وإدارة نوبات الكاشيرات.',
    icon: Store,
    accentColor: 'indigo',
    badgeText: 'تجزئة وسوبرماركت',
    subModules: ['pos', 'retail', 'barcode', 'cashier_shifts', 'price_checker']
  },
  {
    id: 'restaurant',
    name: 'المطاعم والكافيهات (Restaurant & KDS)',
    category: 'الأغذية والضيافة',
    description: 'نقاط بيع الطاولات والتيك أواي والدليفري، شاشات المطبخ الرقمية KDS، وقوائم الـ QR كود الذكية.',
    icon: Utensils,
    accentColor: 'amber',
    badgeText: 'ضيافة ومطاعم',
    subModules: ['restaurant', 'pos', 'kds', 'tables', 'qr_menu']
  },
  {
    id: 'manufacturing',
    name: 'المصانع والتكاليف (Production & BOM)',
    category: 'الإنتاج والحلواني',
    description: 'شجرة المنتج (BOM)، أوامر التشغيل والإنتاج، تكاليف المواد الخام والهوالك، والتتبع التسلسلي للدفعات.',
    icon: Factory,
    accentColor: 'emerald',
    badgeText: 'تصنيع وحلواني',
    subModules: ['manufacturing', 'mfg', 'recipes', 'work_orders', 'batch_tracking']
  },
  {
    id: 'hims',
    name: 'المستشفيات والمراكز الطبية (HIMS Healthcare)',
    category: 'الرعاية الصحية المتكاملة',
    description: 'سجلات المرضى الرقمية، العيادات الخارجية، غرف العمليات والتنويم، الصيدلية السريرية، ومطالبات التأمين.',
    icon: Stethoscope,
    accentColor: 'rose',
    badgeText: 'قطاع صحي وطبي',
    subModules: ['hims', 'clinics', 'patients', 'pharmacy', 'insurance']
  },
  {
    id: 'stadium',
    name: 'الأندية والمنشآت الرياضية (Stadium & Club)',
    category: 'الرياضة والأنشطة الترفيهية',
    description: 'حجز الملاعب الذكي، عضويات واشتراكات النادي، جدول المدربين، وإدارة بوابات الدخول ومسح الباركود.',
    icon: Trophy,
    accentColor: 'sky',
    badgeText: 'ملاعب ورياضة',
    subModules: ['stadium', 'memberships', 'pitch_booking', 'coaches', 'gate_scanner']
  },
  {
    id: 'construction',
    name: 'المقاولات والتشييد (Construction & Contracting)',
    category: 'المشاريع والهندسة',
    description: 'مستخلصات المالك ومقاولي الباطن، جدول الكميات، بنود الأعمال، وتكاليف مشاريع المقاولات المباشرة.',
    icon: HardHat,
    accentColor: 'violet',
    badgeText: 'مقاولات وتشييد',
    subModules: ['construction', 'progress_billing', 'subcontractors', 'boq', 'project_costing']
  }
];

// قوالب الأنشطة الجاهزة بنقرة واحدة (Industry One-Click Presets)
export interface IndustryPreset {
  id: string;
  name: string;
  icon: LucideIcon;
  description: string;
  modules: string[];
  gradient: string;
}

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    id: 'bakery_confectionery',
    name: 'قالب الحلواني والمخابز',
    icon: ChefHat,
    description: 'محاسبة + مخازن + نقاط بيع + تكاليف وإنتاج ووصفات تصنيع وحساب هوالك',
    modules: ['accounting', 'inventory', 'sales', 'purchases', 'retail', 'pos', 'manufacturing'],
    gradient: 'from-amber-500 to-orange-600'
  },
  {
    id: 'restaurant_cafe',
    name: 'قالب المطاعم والكافيهات',
    icon: Utensils,
    description: 'محاسبة + نقاط بيع المطاعم + شاشة المطبخ KDS + المشتريات والمخزون',
    modules: ['accounting', 'inventory', 'purchases', 'restaurant', 'pos'],
    gradient: 'from-orange-500 to-red-600'
  },
  {
    id: 'retail_supermarket',
    name: 'قالب التجزئة والسوبرماركت',
    icon: Store,
    description: 'محاسبة + نقاط بيع بالباركود + إدارة المخزون والصلاحيات والعروض',
    modules: ['accounting', 'inventory', 'sales', 'purchases', 'retail', 'pos'],
    gradient: 'from-blue-600 to-indigo-600'
  },
  {
    id: 'healthcare_clinic',
    name: 'قالب المراكز الطبية والمستشفيات',
    icon: Stethoscope,
    description: 'محاسبة + موديول HIMS + العيادات + الصيدلية السريرية والتأمين',
    modules: ['accounting', 'inventory', 'purchases', 'hims'],
    gradient: 'from-rose-500 to-pink-600'
  },
  {
    id: 'sports_club',
    name: 'قالب الأندية والمنشآت الرياضية',
    icon: Trophy,
    description: 'محاسبة + الاستاد وحجز الملاعب + الاشتراكات والمدربين والبوابات',
    modules: ['accounting', 'inventory', 'sales', 'stadium'],
    gradient: 'from-emerald-500 to-teal-600'
  },
  {
    id: 'construction_projects',
    name: 'قالب المقاولات والتشييد',
    icon: HardHat,
    description: 'محاسبة + المشاريع والمستخلصات + العمالة ومقاولو الباطن والمستودعات',
    modules: ['accounting', 'inventory', 'purchases', 'construction', 'hr'],
    gradient: 'from-purple-600 to-indigo-700'
  }
];

// النواة الأساسية الإلزامية التي تعمل دائماً لحماية سلامة النظام المحاسبي
const CORE_ERP_MODULES = ['accounting', 'inventory', 'sales', 'purchases', 'reports', 'settings'];

interface IndustryModulesTabProps {
  organization: any;
  refreshData?: () => Promise<void>;
  currentUser?: any;
}

export const IndustryModulesTab: React.FC<IndustryModulesTabProps> = ({
  organization,
  refreshData,
  currentUser
}) => {
  const { showToast } = useToast();
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // تحميل الموديولات الحالية للمنشأة
  useEffect(() => {
    const rawModules = organization?.allowed_modules;
    if (Array.isArray(rawModules) && rawModules.length > 0) {
      setSelectedModules(rawModules);
    } else {
      // إذا لم تكن محددة بعد، نعتمد النواة المحاسبية الافتراضية
      setSelectedModules([...CORE_ERP_MODULES]);
    }
    setHasChanges(false);
  }, [organization?.allowed_modules]);

  // تبديل حالة موديول معين
  const toggleModule = (moduleId: string) => {
    setSelectedModules(prev => {
      let next: string[];
      if (prev.includes(moduleId)) {
        // إزالة الموديول ومترادفاته
        next = prev.filter(m => m !== moduleId && m !== (moduleId === 'retail' ? 'pos' : ''));
      } else {
        // إضافة الموديول
        next = [...prev, moduleId];
        if (moduleId === 'retail' && !next.includes('pos')) {
          next.push('pos');
        }
      }
      setHasChanges(true);
      return next;
    });
  };

  // تطبيق قالب جاهز بنقرة واحدة
  const applyPreset = (preset: IndustryPreset) => {
    // دمج النواة مع موديولات القالب
    const merged = Array.from(new Set([...CORE_ERP_MODULES, ...preset.modules]));
    setSelectedModules(merged);
    setHasChanges(true);
    showToast(`تم تطبيق "${preset.name}". انقر على حفظ التعديلات لاعتماده فوراً 🚀`, 'info');
  };

  // حفظ التخصيص في قاعدة البيانات وتحديث النظام لحظياً
  const handleSaveModules = async () => {
    if (!organization?.id) {
      showToast('لم يتم العثور على منشأة صالحة للحفظ', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // التأكد من شمول النواة الأساسية دائماً
      const finalModules = Array.from(new Set([...CORE_ERP_MODULES, ...selectedModules]));

      const { error } = await supabase
        .from('organizations')
        .update({ allowed_modules: finalModules })
        .eq('id', organization.id);

      if (error) throw error;

      // تحديث محرك الجلب المسبق فوراً
      setPrefetchAllowedModules(finalModules);

      // تحديث بيانات التخزين المؤقت
      try {
        const storedOrg = secureStorage.getItem<any>('tripro_current_organization');
        if (storedOrg) {
          storedOrg.allowed_modules = finalModules;
          secureStorage.setItem('tripro_current_organization', storedOrg);
        }
      } catch (_) {}

      // إشعار التطبيق بتغير الموديولات لحظياً لتحديث الـ Sidebar
      window.dispatchEvent(new CustomEvent('tripro:organization_changed', {
        detail: { orgId: organization.id, allowed_modules: finalModules }
      }));

      if (refreshData) {
        await refreshData();
      }

      setHasChanges(false);
      showToast('تم حفظ وتحديث باقة موديولات المنشأة بنجاح! تم تحديث الشاشات والقوائم فوراً ✅', 'success');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'خطأ غير متوقع';
      showToast(`فشل في حفظ الموديولات: ${errMsg}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // إعادة ضبط إلى النواة فقط
  const handleResetToCore = () => {
    setSelectedModules([...CORE_ERP_MODULES]);
    setHasChanges(true);
    showToast('تمت إعادة الضبط للنواة الأساسية للنظام (Core ERP)', 'info');
  };

  const isModuleActive = (moduleId: string) => {
    return selectedModules.includes(moduleId) || (moduleId === 'retail' && selectedModules.includes('pos'));
  };

  return (
    <div className="space-y-8 text-right" dir="rtl">
      {/* Introduction Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 text-indigo-400">
            <Boxes size={22} />
            <span className="text-xs font-bold uppercase tracking-wider">Modular Industry Packaging</span>
          </div>
          <h2 className="text-xl font-black">تجزئة الموديولات وقوالب الأنشطة المتخصصة</h2>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
            خصص واجهة المنشأة بدقة لنشاط عملك، تفعيل الموديولات بنقرة زر واحدة يُظهر الشاشات في القائمة الجانبية، بينما تُحجب الموديولات غير المفعلة لتوفير الإنترنت وسرعة فتح الشاشات بنسبة 100%.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={handleSaveModules}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-sm shadow-lg transition-all animate-bounce disabled:opacity-50"
            >
              <Save size={18} />
              {isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات الآن'}
            </button>
          )}

          <button
            onClick={handleResetToCore}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs border border-slate-700 transition-colors"
            title="إبقاء النواة المحاسبية فقط"
          >
            <RotateCcw size={14} />
            النواة فقط
          </button>
        </div>
      </div>

      {/* Section 1: One-Click Industry Presets */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="text-amber-500" size={20} />
          <h3 className="text-lg font-black text-slate-800">
            قوالب الأنشطة الجاهزة بنقرة واحدة (Industry One-Click Presets)
          </h3>
          <span className="text-xs font-bold text-slate-400 mr-2">اختر النشاط لتجهيز الموديولات آلياً</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {INDUSTRY_PRESETS.map((preset) => {
            const Icon = preset.icon;
            return (
              <div
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="group relative bg-white hover:bg-slate-50/80 p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 overflow-hidden"
              >
                <div className="flex items-start gap-3.5 mb-3">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${preset.gradient} text-white shadow-sm group-hover:scale-105 transition-transform`}>
                    <Icon size={22} />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">
                      {preset.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {preset.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-bold text-indigo-600">
                  <span>تطبيق القالب آلياً</span>
                  <span className="group-hover:translate-x-1 transition-transform">←</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Specific Vertical Modules Selection */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="text-indigo-600" size={20} />
            <h3 className="text-lg font-black text-slate-800">
              بطاقات الموديولات التخصصية (Vertical Modules Packaging)
            </h3>
          </div>

          <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>النواة المحاسبية (Core ERP) مفعلة دائماً وأساسية لكافة الأنشطة</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {AVAILABLE_VERTICAL_MODULES.map((module) => {
            const Icon = module.icon;
            const active = isModuleActive(module.id);

            return (
              <div
                key={module.id}
                className={`relative rounded-2xl p-5 border transition-all duration-200 flex flex-col justify-between ${
                  active 
                    ? 'bg-white border-indigo-300 shadow-md ring-2 ring-indigo-500/10' 
                    : 'bg-slate-50/70 border-slate-200 opacity-80 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${active ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                        <Icon size={22} />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">{module.category}</span>
                        <h4 className="font-black text-slate-800 text-sm">{module.name}</h4>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleModule(module.id)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        active ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      role="switch"
                      aria-checked={active}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          active ? '-translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    {module.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className={`px-2.5 py-1 rounded-md font-bold text-[11px] ${
                    active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {active ? '✓ مفعل في باقة المنشأة' : 'معطل ومحجوب'}
                  </span>

                  <span className="text-[11px] font-semibold text-slate-400">
                    {module.badgeText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Save Actions Bar when changes are pending */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-6 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-bold">لديك تغييرات معلقة في باقة موديولات المنشأة</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedModules(organization?.allowed_modules || [...CORE_ERP_MODULES]);
                setHasChanges(false);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300 transition-colors"
            >
              تراجع
            </button>

            <button
              onClick={handleSaveModules}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black shadow-lg transition-all disabled:opacity-50"
            >
              <Save size={16} />
              {isSaving ? 'جاري الحفظ...' : 'حفظ واعتماد التعديلات'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndustryModulesTab;
