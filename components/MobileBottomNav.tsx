import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Wallet, 
  FileText, 
  Bell, 
  Menu,
  Users,
  Truck,
  X
} from 'lucide-react';
import { useNotifications } from '../utils/useNotifications';

interface MobileBottomNavProps {
  onToggleMobileSidebar: () => void;
  onOpenNotifications?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ 
  onToggleMobileSidebar,
  onOpenNotifications
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const [showStatementSheet, setShowStatementSheet] = useState(false);

  const isActive = (path: string) => {
    if (path === '/' || path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* 📄 نافذة سريعة للاختيار بين كشف حساب مورد أو عميل */}
      {showStatementSheet && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end justify-center lg:hidden animate-in fade-in"
          onClick={() => setShowStatementSheet(false)}
        >
          <div 
            className="w-full max-w-lg bg-white rounded-t-3xl p-5 border-t border-slate-200 shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <FileText size={18} className="text-blue-600" /> كشوف الحسابات
              </h3>
              <button 
                onClick={() => setShowStatementSheet(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-2">
              <button
                type="button"
                onClick={() => {
                  setShowStatementSheet(false);
                  navigate('/supplier-statement');
                }}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/70 text-emerald-900 transition-all active:scale-95"
              >
                <div className="p-3 bg-emerald-600 text-white rounded-xl mb-2 shadow-sm">
                  <Truck size={22} />
                </div>
                <span className="font-black text-xs">كشف حساب مورد</span>
                <span className="text-[10px] text-emerald-700/80 mt-0.5">مشتريات وسداد</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowStatementSheet(false);
                  navigate('/customer-statement');
                }}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 text-blue-900 transition-all active:scale-95"
              >
                <div className="p-3 bg-blue-600 text-white rounded-xl mb-2 shadow-sm">
                  <Users size={22} />
                </div>
                <span className="font-black text-xs">كشف حساب عميل</span>
                <span className="text-[10px] text-blue-700/80 mt-0.5">مبيعات وتحصيل</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🧭 الشريط السفلي المثبت في الموبايل */}
      <nav 
        className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 py-1.5 flex items-center justify-around lg:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.06)] print:hidden"
        dir="rtl"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
      >
        {/* 1. الرئيسية / لوحة القيادة */}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
            isActive('/dashboard') 
              ? 'text-blue-600 font-black' 
              : 'text-slate-500 hover:text-slate-800 font-semibold'
          }`}
        >
          <div className={`p-1 rounded-xl transition-all ${isActive('/dashboard') ? 'bg-blue-50 text-blue-600' : ''}`}>
            <LayoutDashboard size={20} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">الرئيسية</span>
        </button>

        {/* 2. السيولة والخزائن */}
        <button
          type="button"
          onClick={() => navigate('/accounts')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
            isActive('/accounts') || isActive('/cfo-dashboard')
              ? 'text-emerald-600 font-black' 
              : 'text-slate-500 hover:text-slate-800 font-semibold'
          }`}
        >
          <div className={`p-1 rounded-xl transition-all ${isActive('/accounts') ? 'bg-emerald-50 text-emerald-600' : ''}`}>
            <Wallet size={20} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">السيولة</span>
        </button>

        {/* 3. كشوف الحسابات (مورد / عميل) */}
        <button
          type="button"
          onClick={() => setShowStatementSheet(true)}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
            isActive('/supplier-statement') || isActive('/customer-statement')
              ? 'text-indigo-600 font-black' 
              : 'text-slate-500 hover:text-slate-800 font-semibold'
          }`}
        >
          <div className={`p-1 rounded-xl transition-all ${isActive('/supplier-statement') || isActive('/customer-statement') ? 'bg-indigo-50 text-indigo-600' : ''}`}>
            <FileText size={20} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">كشف حساب</span>
        </button>

        {/* 4. التنبيهات والإشعارات */}
        <button
          type="button"
          onClick={() => {
            if (onOpenNotifications) {
              onOpenNotifications();
            } else {
              window.dispatchEvent(new CustomEvent('open-notifications-center'));
            }
          }}
          className="flex flex-col items-center justify-center flex-1 py-1 text-slate-500 hover:text-slate-800 font-semibold transition-all active:scale-95 relative"
        >
          <div className="p-1 rounded-xl relative">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">التنبيهات</span>
        </button>

        {/* 5. القائمة الكاملة */}
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="flex flex-col items-center justify-center flex-1 py-1 text-slate-500 hover:text-slate-800 font-semibold transition-all active:scale-95"
        >
          <div className="p-1 rounded-xl">
            <Menu size={20} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">القائمة</span>
        </button>
      </nav>
    </>
  );
};

export default MobileBottomNav;
