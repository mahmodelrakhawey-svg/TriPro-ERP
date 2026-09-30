import React from 'react';
import { 
  TrendingUp, 
  Clock, 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  ScanLine, 
  ShoppingCart 
} from 'lucide-react';

interface MobileDashboardTabProps {
  stats: {
    todaySales: number;
    salesCount: number;
    treasuryBalance: number;
    pendingPOsCount: number;
  };
  pendingOrders: any[];
  loadingStats: boolean;
  processingId: string | null;
  onRefreshData: () => void;
  onApprovePO: (id: string) => void;
  onRejectPO: (id: string) => void;
  onNavigateToTab: (tab: 'scanner' | 'sales') => void;
}

export const MobileDashboardTab: React.FC<MobileDashboardTabProps> = ({
  stats,
  pendingOrders,
  loadingStats,
  processingId,
  onRefreshData,
  onApprovePO,
  onRejectPO,
  onNavigateToTab,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-emerald-900/40 to-slate-800 p-3.5 rounded-xl border border-emerald-500/20">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-xs font-bold">مبيعات اليوم</span>
            <TrendingUp size={16} />
          </div>
          <div className="text-xl font-black text-white">
            {stats.todaySales.toLocaleString()} <span className="text-xs font-normal text-emerald-300">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            عدد الفواتير: <span className="font-bold text-white">{stats.salesCount}</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-900/40 to-slate-800 p-3.5 rounded-xl border border-indigo-500/20">
          <div className="flex items-center justify-between text-indigo-400 mb-1">
            <span className="text-xs font-bold">أوامر الشراء المعلقة</span>
            <Clock size={16} />
          </div>
          <div className="text-xl font-black text-white">
            {stats.pendingPOsCount} <span className="text-xs font-normal text-indigo-300">طلب</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            تحتاج مراجعة واعتماد
          </div>
        </div>
      </div>

      {/* Quick Approvals Section */}
      <div className="bg-slate-800/80 rounded-xl p-3.5 border border-slate-700/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-amber-400" />
            <h3 className="font-bold text-sm text-white">طلبات الاعتماد الفوري (Approvals)</h3>
          </div>
          <button
            onClick={onRefreshData}
            disabled={loadingStats}
            className="p-1 text-slate-400 hover:text-white"
            title="تحديث البيانات"
          >
            <RefreshCw size={14} className={loadingStats ? 'animate-spin' : ''} />
          </button>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <CheckCircle2 size={32} className="mx-auto text-emerald-500/60 mb-2" />
            <p className="text-xs">رائع! لا توجد طلبات شراء معلقة بانتظار الاعتماد.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pendingOrders.map(po => (
              <div key={po.id} className="bg-slate-900/70 p-3 rounded-lg border border-slate-700 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white">PO #{po.po_number || po.id.slice(0, 6)}</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">معلق</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5 font-medium">المورد: {po.suppliers?.name || 'مورد عام'}</p>
                  <p className="text-xs font-bold text-emerald-400 mt-1">
                    {Number(po.total_amount || 0).toLocaleString()} ج.م
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onApprovePO(po.id)}
                    disabled={processingId === po.id}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                    title="اعتماد"
                  >
                    <CheckCircle2 size={16} />
                  </button>
                  <button
                    onClick={() => onRejectPO(po.id)}
                    disabled={processingId === po.id}
                    className="bg-red-600/80 hover:bg-red-500 text-white p-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                    title="رفض"
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions Bar */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onNavigateToTab('scanner')}
          className="bg-indigo-600/30 border border-indigo-500/40 hover:bg-indigo-600/50 p-3 rounded-xl flex items-center gap-2.5 text-right transition-colors"
        >
          <ScanLine className="text-indigo-400 shrink-0" size={20} />
          <div>
            <div className="font-bold text-xs text-white">جرد بالكاميرا</div>
            <div className="text-[10px] text-slate-400">فحص باركود ورصيد</div>
          </div>
        </button>

        <button
          onClick={() => onNavigateToTab('sales')}
          className="bg-emerald-600/30 border border-emerald-500/40 hover:bg-emerald-600/50 p-3 rounded-xl flex items-center gap-2.5 text-right transition-colors"
        >
          <ShoppingCart className="text-emerald-400 shrink-0" size={20} />
          <div>
            <div className="font-bold text-xs text-white">فاتورة ميدانية</div>
            <div className="text-[10px] text-slate-400">بيع سريع للمندوب</div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default MobileDashboardTab;
