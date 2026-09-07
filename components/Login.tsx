import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAccounting } from '../context/AccountingContext';
import { supabaseUrl } from '../supabaseClient';
import { LogIn, AlertCircle, Loader2, ShieldCheck, PlayCircle } from 'lucide-react';

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
        console.log('Login Error Detail:', result.message);
        if (msg.includes('Invalid login credentials')) {
          msg = 'بيانات الدخول غير صحيحة (تأكد من كتابة البريد وكلمة المرور كما تم إنشاؤهما في Supabase)';
        } else if (msg.includes('Email not confirmed')) {
          msg = 'البريد الإلكتروني غير مفعّل بعد في Supabase (اضغط على Confirm User بجانب المستخدم في Supabase)';
        } else if (msg.includes('Invalid path specified in request URL')) {
          msg = `رابط Supabase غير صحيح. يرجى التأكد في Vercel أن VITE_SUPABASE_URL هو: https://your-id.supabase.co فقط بدون /rest/v1 وبدون أي مسار إضافي.`;
        } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          msg = 'تعذر الاتصال بقاعدة البيانات (تحقق من صحة رابط VITE_SUPABASE_URL في Vercel)';
        }
        setError(msg);
      }
    } catch (err) {
      setError('حدث خطأ غير متوقع في النظام');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      // استخدام بيانات الديمو الافتراضية
      const result = await login('demo@demo.com', '123456');
      if (!result.success) {
        setError('فشل الدخول للنسخة التجريبية');
      }
    } catch (err) {
      setError('فشل الدخول للنسخة التجريبية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b132b] via-[#111e38] to-[#070d1e] flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      {/* 🌟 هالات ضوئية خلفية تضفي عمقاً وفخامة بصرية */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>

      <div className="bg-white/98 backdrop-blur-xl p-8 sm:p-10 rounded-3xl shadow-2xl w-full max-w-md border border-white/20 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 mb-4 shadow-inner">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="w-20 h-20 object-contain mx-auto" />
            ) : (
              <img src="/logo.jpg" alt="Logo" className="w-20 h-20 object-contain mx-auto rounded-xl" />
            )}
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-1.5">
            TriPro <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">ERP</span>
          </h1>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">نظام إدارة موارد المؤسسات • Enterprise Edition</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 flex items-center gap-3 border border-red-100 animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
              اسم المستخدم / البريد الإلكتروني
            </label>
            <input 
              type="text" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-slate-800 text-left bg-slate-50/50 focus:bg-white"
              placeholder="admin"
              dir="ltr"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
              كلمة المرور
            </label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-slate-800 text-left bg-slate-50/50 focus:bg-white"
              placeholder="••••••"
              dir="ltr"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white py-3.5 rounded-xl font-black text-base transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-[0.98] mt-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : <LogIn size={18} />}
            تسجيل الدخول
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold">أو</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full bg-slate-50 text-slate-700 border-2 border-slate-200 py-3 rounded-xl font-bold hover:bg-slate-100 hover:border-slate-300 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <PlayCircle size={18} className="text-emerald-600" />
            تجربة النظام (نسخة ديمو)
          </button>
        </form>

        <div className="mt-8 text-center text-[11px] text-slate-400 font-bold space-y-1">
          <p>TriPro ERP © {new Date().getFullYear()} • الإصدار المؤسسي 7.0.0</p>
          <p className="text-[10px] text-slate-400 opacity-60 font-mono" dir="ltr">
            Host: {supabaseUrl || 'Not Configured'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
