/**
 * ==============================================================================
 * TriPro ERP — Application System Guards & Layout Components
 * components/AppGuardsAndLayout.tsx
 * ==============================================================================
 * مكونات حماية النظام وتخطيط الطباعة والوضع التجريبي المستخرجة من App.tsx
 * لتقليل حجم App.tsx وتحسين التنظيم المعماري دون كسر أي مسار أو سلوك.
 * ==============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Landmark, X, Info } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { supabase } from '../supabaseClient';

export const PrintHeader = () => {
    const { settings } = useAccounting();
    return (
        <div className="hidden print:block fixed top-0 left-0 right-0 p-4 bg-white z-[100]">
            <div className="flex justify-between items-center border-b-2 border-blue-900 pb-2">
                <div className="text-right">
                    <h1 className="text-lg font-bold">{settings.companyName}</h1>
                    <p className="text-xs text-slate-500">تقرير مطبوع بتاريخ: {new Date().toLocaleDateString('ar-EG')}</p>
                </div>
                {settings.logoUrl ? (
                    <img src={settings.logoUrl} alt="Company Logo" className="w-24 h-24 object-contain" />
                ) : (
                    <img src="/logo.jpg" alt="Company Logo" className="w-24 h-24 object-contain" />
                )}
            </div>
        </div>
    );
};

export const PrintFooter = () => (
    <div className="hidden print:block fixed bottom-0 left-0 right-0 p-4 bg-white text-center text-xs text-slate-400 border-t border-slate-200">
        <p>هذا المستند تم إنشاؤه بواسطة نظام TriPro ERP | الصفحة <span className="page-number"></span> من <span className="total-pages"></span></p>
    </div>
);

export const DemoBanner = () => {
    const { currentUser } = useAccounting();
    if (currentUser?.role !== 'demo') return null;
    return (
        <div className="bg-amber-500 text-white text-center py-1 px-4 text-sm font-bold fixed top-0 left-0 right-0 z-[110] print:hidden">
            🚧 نسخة تجريبية – البيانات غير حقيقية – يمنع استخدامها محاسبيًا 🚧
        </div>
    );
};

export const DemoWelcomeModal = () => {
    const { currentUser } = useAccounting();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (currentUser?.role === 'demo') {
            const hasSeen = sessionStorage.getItem('demo_welcome_seen');
            if (!hasSeen) {
                setIsOpen(true);
                sessionStorage.setItem('demo_welcome_seen', 'true');
            }
        }
    }, [currentUser]);

    const startTour = () => {
        setIsOpen(false);
        window.dispatchEvent(new Event('start-demo-tour'));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-white/10 opacity-30 transform -skew-y-12 scale-150"></div>
                    <Landmark size={48} className="mx-auto mb-4 relative z-10 opacity-90" />
                    <h2 className="text-2xl font-black mb-2 relative z-10">مرحباً بك في النسخة التجريبية 👋</h2>
                    <p className="opacity-90 text-sm font-medium relative z-10">استكشف نظام TriPro ERP بكل حرية</p>
                </div>
                <div className="p-8 space-y-6">
                    <p className="text-slate-600 font-medium leading-relaxed text-center text-sm">
                        هذه نسخة مخصصة للتجربة. يمكنك إضافة فواتير، قيود، وعملاء، ولكن يرجى الانتباه للقيود التالية:
                    </p>
                    <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-start gap-3 text-sm text-slate-700">
                            <div className="bg-red-100 text-red-600 p-1 rounded-full mt-0.5 shrink-0"><X size={12} /></div>
                            <span className="font-bold text-xs">حذف البيانات الأساسية معطل.</span>
                        </div>
                        <div className="flex items-start gap-3 text-sm text-slate-700">
                            <div className="bg-red-100 text-red-600 p-1 rounded-full mt-0.5 shrink-0"><X size={12} /></div>
                            <span className="font-bold text-xs">تغيير إعدادات النظام معطل.</span>
                        </div>
                        <div className="flex items-start gap-3 text-sm text-slate-700">
                            <div className="bg-blue-100 text-blue-600 p-1 rounded-full mt-0.5 shrink-0"><Info size={12} /></div>
                            <span className="font-bold text-xs">يتم إعادة ضبط البيانات كل 24 ساعة.</span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={startTour}
                            className="flex-1 bg-blue-600 text-white py-3.5 rounded-xl font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
                        >
                            ابدأ جولة تعريفية 🌟
                        </button>
                        <button 
                            onClick={() => setIsOpen(false)}
                            className="flex-1 bg-slate-100 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                        >
                            تخطي
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const DemoWatermark = () => {
    const { currentUser } = useAccounting();
    if (currentUser?.role !== 'demo') return null;

    return (
        <div className="hidden print:flex fixed inset-0 z-[50] items-center justify-center pointer-events-none h-screen w-screen">
            <div className="transform -rotate-45 text-slate-500 text-[8rem] font-black opacity-10 border-8 border-slate-500 p-12 rounded-3xl select-none whitespace-nowrap">
                نسخة تجريبية
            </div>
        </div>
    );
};

export const SuspendedScreen = ({ message }: { message?: string }) => (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center" dir="rtl">
        <div className="bg-white p-10 rounded-3xl shadow-xl border border-rose-100 max-w-md w-full">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6"><X className="text-rose-600" size={40} /></div>
            <h1 className="text-2xl font-black text-slate-800 mb-2">عذراً، هذا الحساب متوقف</h1>
            <p className="text-slate-500 mb-6 font-medium">
                {message || "يرجى التواصل مع إدارة TriPro ERP لتفعيل اشتراككم والعودة للعمل."}
            </p>
            <button onClick={() => supabase.auth.signOut()} className="w-full bg-slate-100 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">تسجيل الخروج</button>
        </div>
    </div>
);

export const ModuleGuard = ({ module, children }: { module: string, children: React.ReactNode }) => {
    const { organization, currentUser, isLoading, can } = useAccounting();
    
    if (isLoading && !currentUser) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-bold text-slate-500">جاري تحميل البيانات...</span>
                </div>
            </div>
        );
    }

    const role = currentUser?.role || '';
    const isSuperAdminUser = role === 'super_admin' || role === 'demo';
    const isPrivileged = role === 'super_admin' || role === 'admin' || role === 'owner' || role === 'manager' || role === 'demo';
    const allowedModules = (organization as any)?.allowed_modules || [];
    
    const expiryDate = (organization as any)?.subscription_expiry;
    const isExpired = expiryDate && expiryDate < new Date().toISOString().split('T')[0];

    if (organization && ((organization as any).is_active === false || isExpired) && !isPrivileged) {
        const message = (organization as any).suspension_reason || (isExpired ? "لقد انتهت فترة اشتراككم. يرجى التجديد للمتابعة." : undefined);
        return <SuspendedScreen message={message} />;
    }

    const normalizedModule = module === 'mfg' ? 'manufacturing' : module;
    
    let isAllowedByOrg = true;
    if (Array.isArray(allowedModules) && allowedModules.length > 0) {
      if (module === 'restaurant' || module === 'pos' || module === 'kitchen') {
        isAllowedByOrg = allowedModules.includes('restaurant') || allowedModules.includes('pos');
      } else if (module === 'retail') {
        isAllowedByOrg = allowedModules.includes('retail');
      } else if (module === 'construction') {
        isAllowedByOrg = allowedModules.includes('construction');
      } else if (module === 'hims') {
        isAllowedByOrg = allowedModules.includes('hims');
      } else if (module === 'stadium') {
        isAllowedByOrg = allowedModules.includes('stadium');
      } else if (module === 'manufacturing' || module === 'mfg') {
        isAllowedByOrg = allowedModules.includes('manufacturing') || allowedModules.includes('mfg');
      } else {
        isAllowedByOrg = allowedModules.includes(module) || allowedModules.includes(normalizedModule);
      }
    }

    const hasPermission = can ? (
      can(module, 'view') || 
      can(normalizedModule, 'view') || 
      can(module, 'manage') || 
      can(module, '*') || 
      can(normalizedModule, '*') ||
      can(module, 'pos') ||
      can(module, 'kitchen') ||
      can('accounting', 'view')
    ) : true;

    const isAllowed = isPrivileged || (isAllowedByOrg && hasPermission);

    if (!isAllowed) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

export const LazyLoadingFallback = () => (
    <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-bold text-slate-500">جاري تحميل الشاشة...</span>
        </div>
    </div>
);