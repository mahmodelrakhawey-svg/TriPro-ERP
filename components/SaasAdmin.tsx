import React, { useState } from 'react';
import { Building2, UserPlus, ShieldCheck, Loader2 } from 'lucide-react';
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
    modules: ['accounting'] as string[]
  });

  const availableModules = [
    { id: 'accounting', label: 'المحاسبة العامة' },
    { id: 'sales', label: 'المبيعات والعملاء' },
    { id: 'purchases', label: 'المشتريات والموردين' },
    { id: 'inventory', label: 'المخازن والأصناف' },
    { id: 'restaurant', label: 'مديول المطاعم' },
    { id: 'hr', label: 'الموارد البشرية' },
    { id: 'manufacturing', label: 'التصنيع والإنتاج' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        setFormData({ companyName: '', adminName: '', email: '', password: '', modules: ['accounting'] });
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

      <form onSubmit={handleSubmit} className="space-y-6">
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

        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-700">الموديولات المتاحة لهذا العميل:</label>
          <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            {availableModules.map(mod => (
              <label key={mod.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded transition-colors">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-indigo-600 rounded"
                  checked={formData.modules.includes(mod.id)}
                  onChange={e => {
                    const newModules = e.target.checked 
                      ? [...formData.modules, mod.id]
                      : formData.modules.filter(m => m !== mod.id);
                    setFormData({...formData, modules: newModules});
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
          {loading ? <Loader2 className="animate-spin" /> : 'تأسيس شركة وعميل جديد 🚀'}
        </button>
      </form>
    </div>
  );
}