import React from 'react';
import { AlertTriangle, PackageX, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { useLowStockProducts } from '../modules/hooks/usePermissions';
import { useNavigate } from 'react-router-dom';

const SmartRiskAlerts = () => {
  const navigate = useNavigate();
  const { data: lowStockItems, isLoading, refetch } = useLowStockProducts(10); // سنقوم بتعيين حد التنبيه إلى 10 قطع

  if (isLoading) {
    return (
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex items-center justify-center gap-3">
        <Loader2 className="animate-spin text-amber-500" size={20} />
        <span className="text-sm font-bold text-amber-700">جاري فحص المخزون...</span>
      </div>
    );
  }

  if (!lowStockItems || lowStockItems.length === 0) {
    return null; // لا تعرض أي شيء إذا كان المخزون آمناً
  }

  return (
    <div className="bg-red-50 border border-red-100 rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
            <h3 className="font-bold text-red-800 flex items-center gap-2">
            <AlertTriangle className="text-red-600" size={20} />
            تنبيهات المخزون الحرج
            </h3>
            <button onClick={() => refetch()} className="p-1.5 hover:bg-red-100 rounded-full text-red-500 transition-colors" title="تحديث البيانات"><RefreshCw size={14} /></button>
        </div>
        <span className="bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded-full">
          {lowStockItems.length} صنف
        </span>
      </div>
      
      <div className="space-y-3">
        {lowStockItems.slice(0, 3).map((item: any) => (
          <div key={item.id} className="bg-white p-3 rounded-xl border border-red-100 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-red-50 p-2 rounded-lg text-red-500"><PackageX size={16} /></div>
              <div>
                <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                <p className="text-xs text-slate-500 font-mono">{item.sku || 'No SKU'}</p>
              </div>
            </div>
            <div className="text-center"><span className="block text-xs text-slate-400 font-bold">المتوفر</span><span className="font-black text-red-600">{item.stock}</span></div>
          </div>
        ))}
      </div>

      {lowStockItems.length > 3 && (<button onClick={() => navigate('/products')} className="w-full mt-4 text-xs font-bold text-red-600 hover:text-red-800 flex items-center justify-center gap-1 transition-colors">عرض كل الأصناف المنخفضة <ArrowRight size={12} /></button>)}
    </div>
  );
};

export default SmartRiskAlerts;