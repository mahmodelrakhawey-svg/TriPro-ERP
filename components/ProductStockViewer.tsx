import React from 'react';
import { Warehouse, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';

interface ProductStockViewerProps {
  productId: string | null | undefined;
  currentWarehouseId?: string;
}

export const ProductStockViewer: React.FC<ProductStockViewerProps> = ({ productId, currentWarehouseId }) => {
  const { products, warehouses } = useAccounting();
  
  if (!productId) return null;

  const product = products.find(p => p.id === productId);
  if (!product) return null;

  const stockMap = product.warehouseStock || {};
  const totalStock = product.stock || 0;
  
  // تحديد اسم المستودع الحالي
  const currentWarehouseName = warehouses.find(w => w.id === currentWarehouseId)?.name || 'غير محدد';
  const currentStock = Number(stockMap[currentWarehouseId || ''] || 0);

  return (
    <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2">
      <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
        <h4 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
          <Warehouse size={16} className="text-blue-600" /> توزيع المخزون بالمستودعات
        </h4>
        <span className="bg-slate-200 text-slate-700 px-2 py-1 rounded-md text-xs font-bold">
          الإجمالي: {totalStock}
        </span>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
        {warehouses.map(wh => {
          const qty = Number(stockMap[wh.id] || 0);
          const isCurrent = wh.id === currentWarehouseId;
          
          return (
            <div 
              key={wh.id} 
              className={`flex justify-between items-center p-2 rounded-lg border transition-all ${
                isCurrent 
                  ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-300' 
                  : 'bg-white border-slate-100 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {isCurrent && <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0 animate-pulse" />}
                <span className={`truncate text-xs ${isCurrent ? 'font-bold text-blue-700' : 'text-slate-600'}`} title={wh.name}>
                  {wh.name}
                </span>
              </div>
              <span className={`font-mono text-sm font-bold ${qty > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                {qty}
              </span>
            </div>
          );
        })}
      </div>

      {currentWarehouseId && (
        <div className={`mt-3 pt-2 border-t border-slate-200 text-center text-xs font-bold rounded-lg p-2 ${currentStock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {currentStock > 0 ? (
                <p className="flex items-center justify-center gap-1">
                    <CheckCircle2 size={14} /> 
                    الرصيد متاح في {currentWarehouseName}: {currentStock}
                </p>
            ) : (
                <p className="flex items-center justify-center gap-1">
                    <AlertCircle size={14} /> 
                    الرصيد غير كافٍ في {currentWarehouseName}
                </p>
            )}
        </div>
      )}
    </div>
  );
};