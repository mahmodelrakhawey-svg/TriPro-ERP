import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User, Mail, Lock, Save, Loader2, Shield, Eye, EyeOff, Activity, Clock, Upload } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';
import { z } from 'zod';

const UserProfile = () => {
  const { activityLog } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    avatarUrl: ''
  });

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          
          setProfile(profileData);
          setFormData(prev => ({
            ...prev,
            email: user.email || '',
            fullName: profileData?.full_name || '',
            avatarUrl: profileData?.avatar_url || ''
          }));
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (profile?.role === 'demo' || user?.email === 'demo@demo.com') {
        showToast('تغيير الصورة غير متاح في النسخة التجريبية', 'warning');
        return;
    }

    if (!e.target.files || e.target.files.length === 0) return;
    
    try {
      setUploading(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      setFormData(prev => ({ ...prev, avatarUrl: data.publicUrl }));
      
    } catch (error: any) {
      showToast('فشل رفع الصورة: ' + error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const profileSchema = z.object({
        fullName: z.string().min(1, 'الاسم الكامل مطلوب'),
        password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل').optional().or(z.literal('')),
        confirmPassword: z.string().optional().or(z.literal(''))
    }).refine((data) => !data.password || data.password === data.confirmPassword, {
        message: "كلمة المرور غير متطابقة",
        path: ["confirmPassword"],
    });

    const validationResult = profileSchema.safeParse(formData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }
    
    if (profile?.role === 'demo' || user?.email === 'demo@demo.com') {
        showToast('تم تحديث الملف الشخصي بنجاح ✅ (محاكاة - لن يتم حفظ التغييرات)', 'success');
        return;
    }

    setSaving(true);
    try {
      // 1. تحديث بيانات الملف الشخصي (الاسم والصورة)
      if (profile && (formData.fullName !== profile.full_name || formData.avatarUrl !== profile.avatar_url)) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ 
            full_name: formData.fullName,
            avatar_url: formData.avatarUrl 
          })
          .eq('id', user.id);
        
        if (profileError) throw profileError;
      }

      // 2. تحديث كلمة المرور (إذا تم إدخالها)
      if (formData.password) {
        const { error: authError } = await supabase.auth.updateUser({
          password: formData.password
        });
        if (authError) throw authError;
      }

      showToast('تم تحديث الملف الشخصي بنجاح ✅', 'success');
      setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      
    } catch (error: any) {
      showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
            <User size={24} />
        </div>
        <div>
            <h2 className="text-2xl font-bold text-slate-800">ملفي الشخصي</h2>
            <p className="text-slate-500 text-sm">إدارة بيانات حسابك وكلمة المرور</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <form onSubmit={handleUpdateProfile} className="space-y-8">
          
          {/* Profile Header */}
          <div className="flex items-center gap-6 pb-8 border-b border-slate-100">
            <div className="relative group">
                <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 font-bold text-3xl border-4 border-white shadow-md overflow-hidden relative">
                    {formData.avatarUrl ? (
                        <img src={formData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        formData.fullName?.charAt(0).toUpperCase() || 'U'
                    )}
                    
                    {/* Upload Overlay */}
                    <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white rounded-full">
                        <Upload size={24} />
                        <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploading} />
                    </label>
                </div>
                {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-full">
                        <Loader2 className="animate-spin text-blue-600" />
                    </div>
                )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">{formData.fullName || 'مستخدم'}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold border border-blue-100 flex items-center gap-1">
                    <Shield size={10} /> {profile?.role === 'super_admin' ? 'مدير النظام' : profile?.role}
                </span>
                <span className="text-slate-400 text-sm">{formData.email}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">الاسم الكامل</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={formData.fullName}
                  onChange={e => setFormData({...formData, fullName: e.target.value})}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 pl-10 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="الاسم الظاهر في النظام"
                />
                <User className="absolute left-3 top-3.5 text-slate-400" size={18} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">البريد الإلكتروني</label>
              <div className="relative">
                <input 
                  type="email" 
                  value={formData.email}
                  disabled
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 pl-10 text-slate-500 cursor-not-allowed"
                />
                <Mail className="absolute left-3 top-3.5 text-slate-400" size={18} />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                <Lock size={10} /> لا يمكن تغيير البريد الإلكتروني لأسباب أمنية.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 space-y-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-200 pb-3">
                <Lock size={18} className="text-blue-600" /> تغيير كلمة المرور
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">كلمة المرور الجديدة</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 pr-10 focus:outline-none focus:border-blue-500 text-sm"
                      placeholder="••••••••"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-2.5 text-slate-400 hover:text-blue-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">تأكيد كلمة المرور</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={formData.confirmPassword}
                      onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 text-sm"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Activity Log Section */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Activity size={18} className="text-blue-600" />
                    <h3 className="font-bold text-slate-800">سجل النشاطات (الجلسة الحالية)</h3>
                </div>
                <div className="max-h-60 overflow-y-auto">
                    {activityLog.filter(log => log.user === formData.fullName).length > 0 ? (
                        <div className="divide-y divide-slate-50">
                            {activityLog.filter(log => log.user === formData.fullName).map(log => (
                                <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex gap-3">
                                    <div className="mt-1 text-slate-400"><Clock size={16} /></div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-700">{log.action}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{log.details}</p>
                                        <p className="text-[10px] text-slate-400 mt-1" dir="ltr">{new Date(log.date).toLocaleString('ar-EG')}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center text-slate-400 text-sm">لا توجد نشاطات مسجلة لهذا المستخدم في الجلسة الحالية.</div>
                    )}
                </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end border-t border-slate-100">
            <button 
              type="submit" 
              disabled={saving}
              className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-100 transition-all transform active:scale-95"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
              حفظ التغييرات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfile;