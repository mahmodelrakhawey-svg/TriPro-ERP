import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAccounting } from '../context/AccountingContext';
import { LogIn, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

const Login = () => {
  const { login } = useAuth();
  const { settings } = useAccounting();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (!result.success) {
        // تحسين رسالة الخطأ لتكون مفهومة
        let msg = result.message || 'فشل تسجيل الدخول';
        if (msg.includes('Invalid login credentials')) msg = 'بيانات الدخول غير صحيحة (اسم المستخدم أو كلمة المرور خطأ)';
        if (msg.includes('Email not confirmed')) msg = 'البريد الإلكتروني غير مفعل';
        setError(msg);
      }
    } catch (err) {
      setError('حدث خطأ غير متوقع في النظام');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-32 h-32 object-contain mx-auto mb-4" />
          ) : (
            <img src="/logo.jpg" alt="Logo" className="w-32 h-32 object-contain mx-auto mb-4" />
          )}
          <h1 className="text-3xl font-black text-slate-800 mb-2">TriPro ERP</h1>
          <p className="text-slate-500 font-medium">نظام إدارة موارد المؤسسات المتكامل</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 flex items-center gap-3 border border-red-100 animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">اسم المستخدم / البريد الإلكتروني</label>
            <input 
              type="text" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-600 transition-colors font-bold text-slate-700 text-left"
              placeholder="admin"
              dir="ltr"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">كلمة المرور</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-600 transition-colors font-bold text-slate-700 text-left"
              placeholder="••••••"
              dir="ltr"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-[0.98]"
          >
            {loading ? <Loader2 className="animate-spin" /> : <LogIn size={20} />}
            تسجيل الدخول
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-slate-400 font-medium">
          <p>الإصدار 7.0.0 - TriPro ERP © {new Date().getFullYear()}. جميع الحقوق محفوظة</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
