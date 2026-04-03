import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  CheckCircle, 
  UserPlus, 
  Building2,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Settings,
  X,
  Save,
  Lock,
  Eye,
  ShieldCheck,
  XCircle,
  Search,
  Filter
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
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    companyName: '',
    adminName: '',
    email: '',
    password: '',
    subscriptionExpiry: '',
    modules: ['accounting']
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'فشل إنشاء العميل');

      showToast('تم إنشاء الشركة وحساب المدير بنجاح ✅', 'success');
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
            <Building2 className="text-blue-600" /> تأسيس شركة جديدة
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-1">اسم الشركة</label>
              <input required type="text" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">اسم المدير</label>
              <input required type="text" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.adminName} onChange={e => setFormData({...formData, adminName: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ انتهاء الاشتراك</label>
              <input required type="date" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.subscriptionExpiry} onChange={e => setFormData({...formData, subscriptionExpiry: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-1">البريد الإلكتروني للمدير</label>
              <input required type="email" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-1">كلمة المرور المؤقتة</label>
              <div className="relative">
                <input required type="password" minLength={6} className="w-full border rounded-xl p-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-500" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
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
    modules: [] as string[]
  });

  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name,
        isActive: organization.is_active,
        subscriptionExpiry: organization.subscription_expiry ? organization.subscription_expiry.split('T')[0] : '',
        modules: organization.allowed_modules || []
      });
    }
  }, [organization]);

  if (!isOpen || !organization) return null;

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
          allowed_modules: formData.modules
        })
        .eq('id', organization.id);

      if (error) throw error;

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
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">اسم الشركة</label>
              <input required type="text" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ انتهاء الاشتراك</label>
              <input type="date" className="w-full border rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500" value={formData.subscriptionExpiry} onChange={e => setFormData({...formData, subscriptionExpiry: e.target.value})} />
            </div>
            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm">
              <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="w-5 h-5 text-blue-600 rounded cursor-pointer" />
              <label htmlFor="isActive" className="text-sm font-bold text-slate-700 cursor-pointer">الحساب نشط (تمكين الدخول للنظام)</label>
            </div>
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const { showToast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadingOrgs(true);
      const { data, error } = await supabase.rpc('get_admin_platform_metrics');
      if (error) throw error;
      setStats(data);
    } catch (error: any) {
      showToast('خطأ في جلب إحصائيات المنصة: ' + error.message, 'error');
    } finally {
      setLoading(false);
      setLoadingOrgs(false);
    }

    // جلب قائمة الشركات
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrgs(data || []);
    } catch (error: any) {
      showToast('خطأ في جلب الشركات: ' + error.message, 'error');
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

  const filteredOrgs = useMemo(() => {
    return orgs.filter(org => {
      const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase());
      const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
      const isActive = org.is_active && !isExpired;

      if (filterStatus === 'all') return matchesSearch;
      if (filterStatus === 'active') return matchesSearch && isActive;
      if (filterStatus === 'inactive') return matchesSearch && !isActive;
      
      return matchesSearch;
    });
  }, [orgs, searchTerm, filterStatus]);

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
        <button 
          onClick={loadData}
          className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors shadow-sm"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          تحديث البيانات
        </button>
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
                  <th className="p-4 border-b border-slate-100">تاريخ الانتهاء</th>
                  <th className="p-4 border-b border-slate-100">الموديولات</th>
                  <th className="p-4 border-b border-slate-100 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50"> 
                {filteredOrgs.map((org) => {
                  const isExpired = org.subscription_expiry && new Date(org.subscription_expiry) < new Date();
                  const isActive = org.is_active && !isExpired;

                  return (
                    <tr key={org.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4 font-bold text-slate-700">{org.name}</td>
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