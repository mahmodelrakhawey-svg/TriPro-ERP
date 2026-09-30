import React from 'react';
import { Wifi, WifiOff, LogOut, ArrowRight } from 'lucide-react';

interface MobileHeaderProps {
  isOnline: boolean;
  isVanSalesUser: boolean;
  onLogout: () => void;
  onReturnToDesk: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  isOnline,
  isVanSalesUser,
  onLogout,
  onReturnToDesk,
}) => {
  return (
    <header className="bg-slate-800/90 backdrop-blur-md px-4 py-3 border-b border-slate-700/80 sticky top-0 z-30 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-sm">
          TP
        </div>
        <div>
          <h1 className="font-extrabold text-sm text-white tracking-tight leading-none">تراي برو الميداني</h1>
          <p className="text-[10px] text-slate-400 mt-0.5">TriPro Mobile Companion</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Online/Offline pill */}
        <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
          isOnline 
            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30' 
            : 'bg-amber-950/60 text-amber-400 border-amber-500/30'
        }`}>
          {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span>{isOnline ? 'أونلاين' : 'أوفلاين'}</span>
        </div>

        {/* Switch to Full Desktop Mode (Admins) OR Logout (Van Sales) */}
        {isVanSalesUser ? (
          <button
            onClick={onLogout}
            className="p-1.5 bg-red-950/60 border border-red-800/60 hover:bg-red-900 rounded-lg text-red-300 hover:text-white transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut size={16} />
          </button>
        ) : (
          <button
            onClick={onReturnToDesk}
            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="العودة للنظام الكامل"
          >
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </header>
  );
};

export default MobileHeader;
