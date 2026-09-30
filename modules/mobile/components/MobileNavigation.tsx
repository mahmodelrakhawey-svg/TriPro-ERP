import React from 'react';
import { LayoutDashboard, ScanLine, ShoppingCart, RefreshCw } from 'lucide-react';

export type MobileTab = 'dashboard' | 'scanner' | 'sales' | 'sync';

interface MobileNavigationProps {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
  isVanSalesUser: boolean;
  cartCount: number;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  activeTab,
  setActiveTab,
  isVanSalesUser,
  cartCount,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3 py-2 flex items-center justify-around z-40">
      {!isVanSalesUser && (
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === 'dashboard' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard size={20} />
          <span className="text-[10px] font-bold">لوحة المدير</span>
        </button>
      )}

      <button
        onClick={() => setActiveTab('scanner')}
        className={`flex flex-col items-center gap-1 transition-colors ${
          activeTab === 'scanner' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <ScanLine size={20} />
        <span className="text-[10px] font-bold">الجرد بالكاميرا</span>
      </button>

      <button
        onClick={() => setActiveTab('sales')}
        className={`flex flex-col items-center gap-1 transition-colors relative ${
          activeTab === 'sales' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <ShoppingCart size={20} />
        <span className="text-[10px] font-bold">فاتورة المندوب</span>
        {cartCount > 0 && (
          <span className="absolute -top-1 right-2 w-4 h-4 rounded-full bg-emerald-500 text-slate-900 font-black text-[9px] flex items-center justify-center">
            {cartCount}
          </span>
        )}
      </button>

      <button
        onClick={() => setActiveTab('sync')}
        className={`flex flex-col items-center gap-1 transition-colors ${
          activeTab === 'sync' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <RefreshCw size={20} />
        <span className="text-[10px] font-bold">المزامنة</span>
      </button>
    </nav>
  );
};

export default MobileNavigation;
