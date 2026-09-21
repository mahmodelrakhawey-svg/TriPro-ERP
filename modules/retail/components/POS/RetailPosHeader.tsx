import React from 'react';
import { 
  ShoppingCart, 
  Scale, 
  Wifi, 
  WifiOff, 
  User, 
  Banknote, 
  RotateCcw, 
  ShieldCheck, 
  Monitor, 
  Pause, 
  RefreshCw, 
  Lock 
} from 'lucide-react';

export interface RetailPosHeaderProps {
  scaleReading: { connected: boolean; weight: number };
  onOpenScaleModal: () => void;
  isOnline: boolean;
  activeShift: any;
  currentUser: any;
  selectedTerminal: any;
  shiftFinancials: { drawerCash: number };
  currencySymbol: string;
  onOpenReturnModal: () => void;
  onOpenBadgePrint: () => void;
  onOpenCashDrop: () => void;
  onOpenHeldModal: () => void;
  heldOrdersCount: number;
  onSyncProducts: () => void;
  isSyncingProducts: boolean;
  onOpenCloseShiftModal: () => void;
}

export const RetailPosHeader: React.FC<RetailPosHeaderProps> = ({
  scaleReading,
  onOpenScaleModal,
  isOnline,
  activeShift,
  currentUser,
  selectedTerminal,
  shiftFinancials,
  currencySymbol,
  onOpenReturnModal,
  onOpenBadgePrint,
  onOpenCashDrop,
  onOpenHeldModal,
  heldOrdersCount,
  onSyncProducts,
  isSyncingProducts,
  onOpenCloseShiftModal
}) => {
  return (
    <header className="bg-slate-950/80 backdrop-blur border-b border-slate-800 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <ShoppingCart className="text-white" size={22} />
        </div>
        <div>
          <h1 className="font-black text-lg tracking-tight text-white">نقطة بيع التجزئة السريعة</h1>
          <span className="text-xs text-indigo-400 font-bold">TriPro ERP V52.0 (هايبرماركت)</span>
        </div>
      </div>

      {/* Network & Active Shift Indicators */}
      <div className="flex items-center gap-4">
        {/* ⚖️ Live Scale Connection Badge */}
        <button
          onClick={onOpenScaleModal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
            scaleReading.connected
              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800 animate-pulse'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
          }`}
          title="ربط الميزان الإلكتروني المباشر (Direct Serial Scale)"
        >
          <Scale size={14} className={scaleReading.connected ? 'text-emerald-400' : 'text-slate-500'} />
          <span>
            {scaleReading.connected ? `${scaleReading.weight.toFixed(3)} كجم` : 'ربط الميزان'}
          </span>
        </button>

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
          isOnline ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-amber-950/80 text-amber-400 border border-amber-800'
        }`}>
          {isOnline ? (
            <>
              <Wifi size={14} className="animate-pulse" /> متصل بالإنترنت
            </>
          ) : (
            <>
              <WifiOff size={14} /> وضع أوفلاين
            </>
          )}
        </div>

        {activeShift && (
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-sm">
            <span className="flex items-center gap-1.5 font-bold text-slate-300">
              <User size={14} className="text-slate-400" />
              {currentUser?.full_name || 'الكاشير'}
            </span>
            <span className="text-indigo-400 font-black">{selectedTerminal?.name}</span>
            <span className="h-4 w-px bg-slate-800" />

            {/* 💵 Live Cash Drawer Balance Badge */}
            <div 
              className="flex items-center gap-1.5 bg-emerald-950/90 border border-emerald-800/80 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-400 shadow-sm"
              title={`الرصيد التقديري في الدرج: ${shiftFinancials.drawerCash.toFixed(2)} ${currencySymbol}`}
            >
              <Banknote size={14} className="text-emerald-400" />
              <span>الدرج: <span className="font-mono">{shiftFinancials.drawerCash.toFixed(2)}</span> {currencySymbol}</span>
            </div>

            {/* 🔄 POS Returns */}
            <button 
              onClick={onOpenReturnModal}
              className="text-xs bg-blue-950/80 border border-blue-900/50 hover:bg-blue-900 text-blue-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
              title="مرتجع مبيعات (يتطلب تمرير كارت باركود المشرف أو إدخال الرمز)"
            >
              <RotateCcw size={12} />
              <span>مرتجع (F3)</span>
            </button>

            {/* 🪪 Supervisor Badge Print Button */}
            {['admin', 'manager', 'owner', 'super_admin', 'pos_supervisor', 'retail_supervisor'].includes(currentUser?.role || '') && (
              <button 
                onClick={onOpenBadgePrint}
                className="text-xs bg-indigo-950/80 border border-indigo-900/50 hover:bg-indigo-900 text-indigo-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
                title="طباعة شارة باركود المشرف / الهيد كاشير"
              >
                <ShieldCheck size={12} />
                <span>كارت المشرف</span>
              </button>
            )}

            {/* 💵 Cash Drop */}
            <button 
              onClick={onOpenCashDrop}
              className="text-xs bg-amber-950/80 border border-amber-900/50 hover:bg-amber-900 text-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
              title="سحب وتفريغ نقدية من الدرج إلى الإدارة"
            >
              <Banknote size={12} />
              <span>سحب نقدية</span>
            </button>

            {/* 📺 Dual-Screen Customer Display */}
            <button 
              onClick={() => window.open('#/retail/customer-display', 'TriProCustomerDisplay', 'width=1200,height=800')}
              className="text-xs bg-purple-950/80 border border-purple-900/50 hover:bg-purple-900 text-purple-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
              title="فتح شاشة العميل الخلفية (Dual Screen)"
            >
              <Monitor size={12} />
              <span>شاشة العميل</span>
            </button>

            <button 
              onClick={onOpenHeldModal}
              className="text-xs bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
            >
              <Pause size={12} /> 
              <span>المعلقة (F7)</span>
              {heldOrdersCount > 0 && (
                <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-black">
                  {heldOrdersCount}
                </span>
              )}
            </button>

            <button 
              onClick={onSyncProducts} 
              disabled={isSyncingProducts}
              className="text-xs bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50 text-slate-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
            >
              <RefreshCw size={12} className={isSyncingProducts ? 'animate-spin' : ''} /> 
              {isSyncingProducts ? 'جاري التحديث...' : 'تحديث'}
            </button>

            <button 
              onClick={onOpenCloseShiftModal} 
              className="text-xs bg-red-950/80 border border-red-900/50 hover:bg-red-900 text-red-400 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
            >
              <Lock size={12} /> إغلاق
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default RetailPosHeader;
