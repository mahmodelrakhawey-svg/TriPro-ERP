import React, { useState, useEffect } from 'react';
import { Building2, UserPlus, ShieldCheck, Loader2, Power, PowerOff, Calendar, Eye, Users, AlertTriangle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { supabase } from '../supabaseClient';

export default function SaasAdmin() {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    companyName: '',
    adminName: '',
    email: '',
    password: '',
    modules: ['accounting'] as string[],
    isActive: true,
    subscriptionExpiry: '',
    maxUsers: 5,
    userCount: 0
  });
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('new');

  // جلب قائمة الشركات الموجودة
  useEffect(() => {
    const fetchClients = async () => {
      const { data: orgs, error: orgError } = await supabase.from('organizations').select('id, name, allowed_modules, is_active, subscription_expiry, max_users').order('name');
      
      if (orgError) {
        if (process.env.NODE_ENV === 'development') console.error("SaasAdmin Error: Failed to fetch clients:", orgError);
        return;
      }

      // جلب عدد المستخدمين لكل شركة (باستثناء السوبر أدمن) لغرض التنبيهات
      const { data: profiles } = await supabase.from('profiles').select('organization_id').neq('role', 'super_admin');
      
      const counts = (profiles || []).reduce((acc: any, p: any) => {
        if (p.organization_id) acc[p.organization_id] = (acc[p.organization_id] || 0) + 1;
        return acc;
      }, {});

      if (orgs) {
        setClients(orgs.map(org => ({
          ...org,
          user_count: counts[org.id] || 0
        })));
      }
    };
    fetchClients();
  }, []);

  // معالجة تغيير العميل المختار
  const handleClientChange = (id: string) => {
    setSelectedClientId(id);
    if (id === 'new') {
      setFormData({ companyName: '', adminName: '', email: '', password: '', modules: ['accounting'], isActive: true, subscriptionExpiry: '', maxUsers: 5, userCount: 0 });
    } else {
      const client = clients.find(c => c.id === id);
      if (client) {
        setFormData({
          ...formData,
          companyName: client.name,
          modules: client.allowed_modules || ['accounting'],
          isActive: client.is_active ?? true,
          subscriptionExpiry: client.subscription_expiry || '',
          maxUsers: client.max_users || 5,
          userCount: client.user_count || 0
        });
      }
    }
  };

  // دالة التبديل بين الشركات للسوبر أدمن
  const handleSwitchOrg = async (orgId: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("لم يتم العثور على جلسة مستخدم نشطة");

      // تحديث معرف المنظمة في ملف السوبر أدمن الشخصي
      const { error } = await supabase
        .from('profiles')
        .update({ organization_id: orgId })
        .eq('id', user.id);

      if (error) throw error;

      showToast('تم الانتقال لبيئة الشركة بنجاح، جاري تحديث البيانات...', 'success');
      
      // إعادة تحميل الصفحة لتطبيق RLS الجديد على كافة مكونات النظام
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const availableModules = [
    { id: 'accounting', label: 'المحاسبة العامة' },
    { id: 'sales', label: 'المبيعات والعملاء' },
    { id: 'purchases', label: 'المشتريات والموردين' },
    { id: 'inventory', label: 'المخازن والأصناف' },
    { id: 'restaurant', label: 'مديول المطاعم' },
    { id: 'hr', label: 'الموارد البشرية' },
    { id: 'manufacturing', label: 'التصنيع والإنتاج' },
  ];

  // دالة تحديث الموديولات لعميل موجود
  const handleUpdateModules = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ allowed_modules: formData.modules, is_active: formData.isActive, subscription_expiry: formData.subscriptionExpiry || null, max_users: formData.maxUsers })
        .eq('id', selectedClientId);

      if (error) throw error;
      showToast(formData.isActive ? 'تم تحديث البيانات بنجاح ✅' : 'تم إيقاف حساب العميل بنجاح 🔒', 'success');
      setClients(clients.map(c => c.id === selectedClientId ? { ...c, allowed_modules: formData.modules, is_active: formData.isActive, subscription_expiry: formData.subscriptionExpiry, max_users: formData.maxUsers } : c));
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClientId !== 'new') {
      return handleUpdateModules();
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/create-client', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(formData)
      });

      // التحقق أولاً مما إذا كان الرد ناجحاً وبصيغة بيانات
      const contentType = response.headers.get("content-type");
      if (response.ok && contentType && contentType.indexOf("application/json") !== -1) {
        showToast('تم إنشاء العميل الجديد بنجاح!', 'success');
        setFormData({ companyName: '', adminName: '', email: '', password: '', modules: ['accounting'], isActive: true, subscriptionExpiry: '', maxUsers: 5, userCount: 0 });
      } else {
        // في حال كان هناك خطأ (مثل 404 على الجهاز المحلي)
        const errorText = await response.text();
        const errorData = contentType?.includes("application/json") ? JSON.parse(errorText) : null;
        throw new Error(errorData?.error || `خطأ في الاتصال بالخادم (رمز: ${response.status}). إذا كنت تجرب من جهازك المحلي، يرجى التجربة من رابط الموقع المباشر على فيرسل.`);
      }

    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 p-8 bg-white rounded-2xl shadow-xl border border-gray-100">
      <div className="flex items-center gap-3 mb-8 border-b pb-4">
        <ShieldCheck className="w-8 h-8 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">إدارة المنصة (SaaS Admin)</h1>
          <p className="text-sm text-gray-500">إنشاء قاعدة بيانات وعميل جديد بضغطة زر</p>
        </div>
      </div>

      {/* قسم التنبيهات للعملاء الذين وصلوا للحد الأقصى */}
      {clients.some(c => c.user_count >= c.max_users) && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
            <AlertTriangle size={18} />
            تنبيه: عملاء وصلوا للحد الأقصى للمستخدمين
          </div>
          <div className="flex flex-wrap gap-2">
            {clients.filter(c => c.user_count >= c.max_users).map(c => (
              <span key={c.id} className="px-3 py-1 bg-white border border-rose-100 text-rose-600 rounded-full text-xs font-bold shadow-sm">
                {c.name} ({c.user_count}/{c.max_users})
              </span>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700">اختر العميل لإدارته:</label>
          <select 
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-bold text-indigo-700 shadow-sm"
            value={selectedClientId}
            onChange={e => handleClientChange(e.target.value)}
          >
            <option value="new">✨ إنشاء عميل وشركة جديدة</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>🏢 {client.name}</option>
            ))}
          </select>
        </div>

        {selectedClientId === 'new' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> اسم الشركة الجديدة
                </label>
                <input
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={formData.companyName}
                  onChange={e => setFormData({...formData, companyName: e.target.value})}
                  placeholder="مثلاً: شركة النور للتجارة"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> اسم المدير المسؤول
                </label>
                <input
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.adminName}
                  onChange={e => setFormData({...formData, adminName: e.target.value})}
                  placeholder="الاسم الكامل"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">البريد الإلكتروني للعميل</label>
              <input
                required
                type="email"
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">كلمة المرور المؤقتة</label>
              <input
                required
                type="password"
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>
          </>
        ) : (
          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-800 text-sm font-bold flex items-center gap-3">
            <Building2 className="w-5 h-5" /> أنت الآن بصدد تعديل صلاحيات موديولات شركة: {formData.companyName}
          </div>
        )}

        {selectedClientId !== 'new' && (
          <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${formData.isActive ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${formData.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                {formData.isActive ? <Power size={20} /> : <PowerOff size={20} />}
              </div>
              <div>
                <p className={`font-bold text-sm ${formData.isActive ? 'text-emerald-800' : 'text-rose-800'}`}>
                  حالة الحساب: {formData.isActive ? 'نشط' : 'موقف (Suspended)'}
                </p>
                <p className="text-xs text-gray-500">إيقاف الحساب يمنع جميع موظفي الشركة من الدخول للنظام</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
              className={`px-4 py-2 rounded-lg font-bold text-xs shadow-sm transition-all ${formData.isActive ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
            >
              {formData.isActive ? 'إيقاف الحساب الآن' : 'تفعيل الحساب'}
            </button>
          </div>
        )}

        {selectedClientId !== 'new' && (
          <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${formData.userCount >= formData.maxUsers ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${formData.userCount >= formData.maxUsers ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-600'}`}>
                <Users size={20} />
              </div>
              <div>
                <p className={`font-bold text-sm ${formData.userCount >= formData.maxUsers ? 'text-orange-800' : 'text-slate-800'}`}>
                  استهلاك المستخدمين: {formData.userCount} من أصل {formData.maxUsers}
                </p>
                <p className="text-xs text-gray-500">
                  {formData.userCount >= formData.maxUsers ? '⚠️ تم استهلاك كامل العدد المسموح' : 'يمكنك إضافة مستخدمين جدد لهذا العميل'}
                </p>
              </div>
            </div>
          </div>
        )}

        {selectedClientId !== 'new' && (
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between">
            <div className="text-amber-800 text-xs font-bold">
              تبديل الرؤية (Impersonation Mode)
            </div>
            <button
              type="button"
              onClick={() => handleSwitchOrg(selectedClientId)}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-all shadow-sm"
            >
              <Eye size={16} /> تصفح بيانات هذه الشركة 👁️
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> تاريخ انتهاء الاشتراك
            </label>
            <input
              type="date"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.subscriptionExpiry}
              onChange={e => setFormData({...formData, subscriptionExpiry: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4" /> الحد الأقصى للمستخدمين
            </label>
            <input
              type="number"
              min="1"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.maxUsers}
              onChange={e => setFormData({...formData, maxUsers: parseInt(e.target.value)})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> تاريخ انتهاء الاشتراك
          </label>
          <input
            type="date"
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            value={formData.subscriptionExpiry}
            onChange={e => setFormData({...formData, subscriptionExpiry: e.target.value})}
          />
          <p className="text-[10px] text-gray-400 font-medium">اتركه فارغاً للاشتراك غير المحدود</p>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-700">الموديولات المتاحة لهذا العميل:</label>
          <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            {availableModules.map(mod => (
              <label key={mod.id} className={`flex items-center gap-2 p-2 rounded-lg transition-all border ${formData.modules.includes(mod.id) ? 'bg-indigo-50 border-indigo-100 shadow-sm' : 'bg-white border-transparent hover:border-slate-200'} cursor-pointer`}>
                <input
                  type="checkbox"
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-50"
                  checked={formData.modules.includes(mod.id)}
                  disabled={mod.id === 'accounting'} // مديول المحاسبة إلزامي ولا يمكن إلغاؤه
                  onChange={e => {
                    if (mod.id === 'accounting') return;
                    const newModules = e.target.checked 
                      ? [...formData.modules, mod.id]
                      : formData.modules.filter(m => m !== mod.id);
                    setFormData(prev => ({...prev, modules: newModules}));
                  }}
                />
                <span className="text-sm text-gray-600">{mod.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:bg-indigo-300"
        >
          {loading ? <Loader2 className="animate-spin" /> : selectedClientId === 'new' ? 'تأسيس شركة وعميل جديد 🚀' : 'تحديث موديولات العميل الحالي 💾'}
        </button>
      </form>
    </div>
  );
}