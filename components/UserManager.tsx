import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAccounting } from '../context/AccountingContext';
import { Shield, User, CheckCircle, XCircle, AlertTriangle, PenTool, Plus, X, Save, Loader2, KeyRound, Trash2, Clock } from 'lucide-react';

// تعريف أنواع البيانات
type UserProfile = {
  id: string;
  email?: string; // إضافة البريد الإلكتروني للنوع
  full_name: string | null;
  role: 'super_admin' | 'admin' | 'manager' | 'accountant' | 'viewer' | 'demo';
  is_active: boolean;
  created_at: string;
  last_activity?: string;
};

const UserManager = () => {
  const { currentUser } = useAccounting();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'viewer'
  });
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState({ userId: '', newPassword: '' });
  const [resetting, setResetting] = useState(false);

  const currentUserRole = currentUser?.role || '';

  // جلب البيانات
  const fetchUsers = async () => {
    try {
      if (currentUserRole === 'demo') {
          setUsers([
              { id: 'demo-u1', full_name: 'مستخدم تجريبي', email: 'demo@demo.com', role: 'demo', is_active: true, created_at: new Date().toISOString(), last_activity: new Date().toISOString() },
              { id: 'demo-u2', full_name: 'مدير النظام', email: 'admin@company.com', role: 'admin', is_active: true, created_at: new Date(Date.now() - 864000000).toISOString(), last_activity: new Date(Date.now() - 3600000).toISOString() },
              { id: 'demo-u3', full_name: 'محاسب المبيعات', email: 'sales@company.com', role: 'accountant', is_active: true, created_at: new Date(Date.now() - 1728000000).toISOString(), last_activity: new Date(Date.now() - 7200000).toISOString() }
          ]);
          setLoading(false);
          return;
      }

      setLoading(true);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // محاولة جلب البريد الإلكتروني من دالة RPC إذا كانت متوفرة، أو استخدام البيانات المتاحة
      // بما أننا لا نملك دالة RPC جاهزة لجلب الإيميلات، سنعتمد على تحسين العرض
      // ولكن يمكننا محاولة تحديث البيانات المحلية إذا كان المستخدم الحالي هو المدير
      
      // دمج البيانات مع البريد الإلكتروني إذا كان متاحاً في profile (بعض الأنظمة تضيفه)
      // أو عرضه كـ "مستخدم [ID]"
      const profilesWithEmail = profiles.map((p: any) => ({
          ...p,
          email: p.email || (p.id === 'f95ae857-91fb-4637-8c6a-7fe45e8fa005' ? 'demo@demo.com' : null) // حل مؤقت للديمو إذا لم يكن الإيميل في البروفايل
      }));

      // جلب آخر نشاط لكل مستخدم من سجلات الأمان
      const usersWithActivity = await Promise.all(profilesWithEmail.map(async (p: any) => {
          const { data: logs } = await supabase
              .from('security_logs')
              .select('created_at')
              .eq('performed_by', p.id)
              .order('created_at', { ascending: false })
              .limit(1);
          
          return {
              ...p,
              last_activity: logs && logs.length > 0 ? logs[0].created_at : null
          };
      }));

      setUsers(usersWithActivity as UserProfile[]);
    } catch (err: any) {
      setError('فشل تحميل بيانات المستخدمين: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // تحديث دور المستخدم
  const updateUserRole = async (userId: string, newRole: string) => {
    if (currentUserRole === 'demo') {
        alert('تم تحديث صلاحيات المستخدم بنجاح (محاكاة)');
        // تحديث الحالة محلياً فقط للعرض
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
        return;
    }
    if (currentUserRole !== 'super_admin') {
      alert('عذراً، هذه الصلاحية لمدير النظام المميز (Super Admin) فقط');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) alert('فشل التحديث: ' + error.message);
    else fetchUsers();
  };

  // تفعيل/تعطيل المستخدم
  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    if (currentUserRole === 'demo') {
        alert(`تم ${currentStatus ? 'تعطيل' : 'تفعيل'} المستخدم بنجاح (محاكاة)`);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentStatus } : u));
        return;
    }
    if (currentUserRole !== 'super_admin') {
      alert('عذراً، هذه الصلاحية لمدير النظام المميز (Super Admin) فقط');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !currentStatus })
      .eq('id', userId);

    if (error) alert('فشل التحديث: ' + error.message);
    else fetchUsers();
  };

  // تحديث اسم المستخدم
  const handleNameUpdate = async (userId: string) => {
    if (currentUserRole === 'demo') {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, full_name: editingName } : u));
        setEditingUserId(null);
        return;
    }
    if (!editingName.trim()) {
        setEditingUserId(null);
        return;
    }
    if (currentUserRole !== 'super_admin') {
        alert('عذراً، هذه الصلاحية لمدير النظام المميز (Super Admin) فقط');
        return;
    }

    const { error } = await supabase
        .from('profiles')
        .update({ full_name: editingName.trim() })
        .eq('id', userId);

    if (error) {
        alert('فشل تحديث الاسم: ' + error.message);
    }
    setEditingUserId(null);
    fetchUsers(); // أعد تحميل البيانات لإظهار الاسم الجديد
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    if (currentUserRole === 'demo') {
        setTimeout(() => {
            alert('تم إنشاء المستخدم بنجاح! ✅ (محاكاة)');
            const fakeUser: UserProfile = { id: `new-demo-${Date.now()}`, email: newUserData.email, full_name: newUserData.fullName, role: newUserData.role as any, is_active: true, created_at: new Date().toISOString() };
            setUsers(prev => [fakeUser, ...prev]);
            setIsAddModalOpen(false);
            setNewUserData({ email: '', password: '', fullName: '', role: 'viewer' });
            setCreating(false);
        }, 1000);
        return;
    }

    try {
      // 1. استخدام دالة التسجيل العامة لإنشاء المستخدم
      // ملاحظة: هذا يعتمد على إعدادات تأكيد البريد الإلكتروني في مشروع Supabase.
      // تم تغيير هذا من supabase.auth.admin.createUser لأنه لا يمكن استدعاؤه من طرف العميل (المتصفح).
      const { data: authData, error: authError } = await supabase.auth.signUp({

        email: newUserData.email,
        password: newUserData.password,
        options: {
          data: {
            full_name: newUserData.fullName,
            role: newUserData.role,
            app_role: newUserData.role,
          }
        }
      });



      if (authError) throw authError;
      if (!authData.user) throw new Error("لم يتم إرجاع بيانات المستخدم بعد الإنشاء.");

      // ملاحظة: لم نعد بحاجة لتحديث الملف الشخصي من هنا.
      // التريجر (handle_new_user) في قاعدة البيانات سيقوم بذلك تلقائياً
      // باستخدام الدور الذي تم تمريره أعلاه.

      alert('تم إنشاء المستخدم بنجاح! ✅\nسيتمكن المستخدم من تسجيل الدخول فوراً.');
      setIsAddModalOpen(false);
      setNewUserData({ email: '', password: '', fullName: '', role: 'viewer' });
      fetchUsers(); // تحديث القائمة
    } catch (err: any) {
      console.error('Error creating user:', err);
      alert('فشل إنشاء المستخدم: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (currentUserRole === 'demo') {
        if (window.confirm(`هل أنت متأكد من حذف المستخدم "${userName}"؟ (محاكاة)`)) {
            setUsers(prev => prev.filter(u => u.id !== userId));
            alert('تم حذف المستخدم بنجاح (محاكاة).');
        }
        return;
    }
    if (currentUserRole !== 'super_admin') {
      alert('عذراً، هذه الصلاحية لمدير النظام المميز (Super Admin) فقط');
      return;
    }
    if (window.confirm(`هل أنت متأكد من حذف المستخدم "${userName}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      try {
        const { error } = await supabase.functions.invoke('delete-user', {
          body: { userId: userId },
        });
        if (error) throw error;
        alert('تم حذف المستخدم بنجاح.');
        fetchUsers();
      } catch (err: any) {
        console.error('Error deleting user:', err);
        alert('فشل حذف المستخدم: ' + (err.data?.message || err.message));
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordData.newPassword || resetPasswordData.newPassword.length < 6) {
        alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
    }
    if (currentUserRole === 'demo') {
        alert('تم إعادة تعيين كلمة المرور بنجاح ✅ (محاكاة)');
        setIsResetPasswordModalOpen(false);
        setResetPasswordData({ userId: '', newPassword: '' });
        return;
    }
    setResetting(true);
    try {
        const { error } = await supabase.functions.invoke('reset-password', {
            body: {
                userId: resetPasswordData.userId,
                newPassword: resetPasswordData.newPassword
            }
        });

        if (error) throw error;

        // تسجيل الحدث في سجلات الأمان
        await supabase.from('security_logs').insert({
            event_type: 'password_reset',
            description: `تم إعادة تعيين كلمة المرور للمستخدم ${resetPasswordData.userId}`,
            target_user_id: resetPasswordData.userId,
            performed_by: (await supabase.auth.getUser()).data.user?.id
        });

        // إرسال تنبيه للمدراء (أو للمستخدم نفسه إذا كان النظام يدعم ذلك)
        await supabase.from('notifications').insert({
            title: 'تغيير كلمة مرور',
            message: `تم تغيير كلمة مرور المستخدم ${resetPasswordData.userId} بواسطة المدير.`,
            type: 'warning',
            // user_id: target_user_id // يمكن تحديد المستخدم المستهدف هنا
        });

        alert('تم إعادة تعيين كلمة المرور بنجاح ✅');
        setIsResetPasswordModalOpen(false);
        setResetPasswordData({ userId: '', newPassword: '' });
    } catch (err: any) {
        alert('فشل إعادة تعيين كلمة المرور: ' + (err.message || 'تأكد من إعداد Edge Function.'));
    } finally {
        setResetting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">جاري تحميل المستخدمين...</div>;
  
  // حماية الواجهة: إذا لم يكن مديراً، لا تعرض شيئاً أو اعرض رسالة
  if (((currentUserRole as string) !== 'super_admin' && (currentUserRole as string) !== 'admin' && (currentUserRole as string) !== 'demo')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <Shield size={48} className="mb-4 text-red-500" />
        <h2 className="text-xl font-bold">غير مصرح لك بالوصول</h2>
        <p>هذه الصفحة مخصصة للمدراء فقط.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <User className="text-indigo-600" /> إدارة المستخدمين والصلاحيات
          </h1>
          <p className="text-slate-500 mt-1">التحكم في أدوار الموظفين وحالة حساباتهم</p>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={() => setIsAddModalOpen(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
            >
                <Plus size={20} />
                <span>إضافة مستخدم</span>
            </button>
            <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center">
              أنت الآن: {currentUserRole === 'super_admin' ? 'مدير نظام مميز ⚡' : 'مدير 🛡️'}
            </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 flex items-center gap-2">
          <AlertTriangle size={20} /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-black">
            <tr>
              <th className="px-6 py-4">المستخدم</th>
              <th className="px-6 py-4">الدور الحالي</th>
              <th className="px-6 py-4 text-center">الحالة</th>
              <th className="px-6 py-4 text-center">آخر نشاط</th>
              <th className="px-6 py-4 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 w-1/3">
                  {editingUserId === user.id ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => handleNameUpdate(user.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleNameUpdate(user.id) }}
                            className="w-full border border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            autoFocus
                        />
                    </div>
                  ) : (
                    <div 
                        className="group flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                            if (currentUserRole === 'super_admin') {
                                setEditingUserId(user.id);
                                setEditingName(user.full_name || '');
                            }
                        }}
                    >
                        <div className="font-bold text-slate-800">{user.full_name || user.email || (user.role === 'viewer' && user.id.startsWith('f95') ? 'مستخدم ديمو' : `مستخدم (${user.id.slice(0, 8)})`)}</div>
                        {currentUserRole === 'super_admin' && <PenTool size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </div>
                  )}
                  <div className="font-mono text-xs text-slate-400 mt-1">{user.id.slice(0, 8)}...</div>
                </td>
                <td className="px-6 py-4">
                  <select 
                    value={user.role}
                    onChange={(e) => updateUserRole(user.id, e.target.value)}
                    disabled={currentUserRole !== 'super_admin'}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 outline-none cursor-pointer
                      ${user.role === 'super_admin' ? 'border-purple-200 bg-purple-50 text-purple-700' : 
                        user.role === 'admin' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' :
                        'border-slate-200 bg-white text-slate-700'}`}
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="accountant">Accountant</option>
                    <option value="viewer">Viewer</option>
                    <option value="demo">Demo (تجريبي)</option>
                  </select>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black
                    ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {user.is_active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {user.is_active ? 'نشط' : 'معطل'}
                  </span>
                </td>
                <td className="px-6 py-4 text-center text-xs text-slate-500">
                    {user.last_activity ? (
                        <div className="flex items-center justify-center gap-1" title={new Date(user.last_activity).toLocaleString('ar-EG')}>
                            <Clock size={14} className="text-slate-400" />
                            <span dir="ltr">{new Date(user.last_activity).toLocaleDateString('ar-EG')}</span>
                        </div>
                    ) : (
                        <span className="opacity-40">-</span>
                    )}
                </td>
                <td className="px-6 py-4 text-center">
                  {currentUserRole === 'super_admin' && (
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => toggleUserStatus(user.id, user.is_active)}
                        className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors
                          ${user.is_active 
                            ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                      >
                        {user.is_active ? 'تعطيل' : 'تفعيل'}
                      </button>
                      <button
                          onClick={() => {
                              setResetPasswordData({ userId: user.id, newPassword: '' });
                              setIsResetPasswordModalOpen(true);
                          }}
                          className="text-xs font-bold px-3 py-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors flex items-center gap-1"
                          title="إعادة تعيين كلمة المرور"
                      >
                          <KeyRound size={14} />
                      </button>
                      <button
                          onClick={() => handleDeleteUser(user.id, user.full_name || 'مستخدم')}
                          className="text-xs font-bold px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1"
                          title="حذف المستخدم نهائياً"
                      >
                          <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-xl text-slate-800">إضافة مستخدم جديد</h3>
                    <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>
                
                <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-xs text-blue-800 mb-4">
                        ملاحظة: سيتم إنشاء حساب جديد وإرسال بريد إلكتروني للتأكيد (إذا كان مفعلاً).
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">الاسم الكامل</label>
                        <input 
                            required 
                            type="text" 
                            value={newUserData.fullName}
                            onChange={(e) => setNewUserData({...newUserData, fullName: e.target.value})}
                            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500"
                            placeholder="اسم الموظف"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                        <input 
                            required 
                            type="email" 
                            value={newUserData.email}
                            onChange={(e) => setNewUserData({...newUserData, email: e.target.value})}
                            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500"
                            placeholder="email@company.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">كلمة المرور</label>
                        <input 
                            required 
                            type="password" 
                            value={newUserData.password}
                            onChange={(e) => setNewUserData({...newUserData, password: e.target.value})}
                            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500"
                            placeholder="••••••••"
                            minLength={6}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">الدور / الصلاحية</label>
                        <select 
                            value={newUserData.role}
                            onChange={(e) => setNewUserData({...newUserData, role: e.target.value})}
                            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 bg-white"
                        >
                            <option value="viewer">Viewer (مشاهدة فقط)</option>
                            <option value="accountant">Accountant (محاسب)</option>
                            <option value="manager">Manager (مدير)</option>
                            <option value="admin">Admin (مسؤول)</option>
                            <option value="super_admin">Super Admin (مدير النظام)</option>
                            <option value="demo">Demo (تجريبي)</option>
                        </select>
                    </div>

                    <div className="pt-4 flex gap-3 border-t border-slate-100 mt-4">
                        <button type="submit" disabled={creating} className="flex-1 bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 font-bold shadow-md flex justify-center items-center gap-2 disabled:opacity-50">
                            {creating ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            إنشاء المستخدم
                        </button>
                        <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-6 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors">إلغاء</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {isResetPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex justify-between items-center">
                    <h3 className="font-bold text-xl text-amber-800 flex items-center gap-2">
                        <KeyRound size={20} /> إعادة تعيين كلمة المرور
                    </h3>
                    <button onClick={() => setIsResetPasswordModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>
                
                <form onSubmit={handleResetPassword} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">كلمة المرور الجديدة</label>
                        <input 
                            required 
                            type="password" 
                            value={resetPasswordData.newPassword}
                            onChange={(e) => setResetPasswordData({...resetPasswordData, newPassword: e.target.value})}
                            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-amber-500"
                            placeholder="••••••••"
                            minLength={6}
                        />
                    </div>
                    <div className="pt-4 flex gap-3 border-t border-slate-100 mt-4">
                        <button type="submit" disabled={resetting} className="flex-1 bg-amber-600 text-white py-3 rounded-lg hover:bg-amber-700 font-bold shadow-md flex justify-center items-center gap-2 disabled:opacity-50">
                            {resetting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            حفظ كلمة المرور
                        </button>
                        <button type="button" onClick={() => setIsResetPasswordModalOpen(false)} className="px-6 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors">إلغاء</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default UserManager;
