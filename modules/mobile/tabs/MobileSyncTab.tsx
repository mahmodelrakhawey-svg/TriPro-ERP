import React from 'react';
import { RefreshCw } from 'lucide-react';

interface MobileSyncTabProps {
  cachedProductsCount: number;
  queuedOrdersCount: number;
  handleManualSync: () => void;
  syncingNow: boolean;
  isOnline: boolean;
}

export const MobileSyncTab: React.FC<MobileSyncTabProps> = ({
  cachedProductsCount,
  queuedOrdersCount,
  handleManualSync,
  syncingNow,
  isOnline,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <RefreshCw size={18} className="text-indigo-400" />
          <span>مركز المزامنة وقاعدة البيانات المحلية</span>
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          يحتفظ التطبيق بنسخة سريعة من دليل الأصناف على ذاكرة الهاتف (IndexedDB) ليعمل بسلاسة حتى في المناطق التي لا توجد بها تغطية إنترنت.
        </p>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 text-center">
            <span className="text-[10px] text-slate-400 block">الأصناف المحفوظة محلياً</span>
            <span className="text-lg font-black text-indigo-400">{cachedProductsCount || 0}</span>
          </div>
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 text-center">
            <span className="text-[10px] text-slate-400 block">العمليات بانتظار الرفع</span>
            <span className="text-lg font-black text-amber-400">{queuedOrdersCount || 0}</span>
          </div>
        </div>

        <button
          onClick={handleManualSync}
          disabled={syncingNow || !isOnline}
          className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <RefreshCw size={14} className={syncingNow ? 'animate-spin' : ''} />
          <span>{syncingNow ? 'جاري تحديث الدليل...' : 'تحديث وتنزيل دليل الأصناف الآن'}</span>
        </button>
      </div>
    </div>
  );
};

export default MobileSyncTab;
