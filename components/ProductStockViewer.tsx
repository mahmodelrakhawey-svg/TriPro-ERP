import React from 'react';
import { Warehouse, AlertCircle, CheckCircle2, X, Calculator } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAccounting } from '../context/AccountingContext';

interface ProductStockViewerProps {
  productId: string | null | undefined;
  currentWarehouseId?: string;
  onClose?: () => void;
}

export const ProductStockViewer: React.FC<ProductStockViewerProps> = ({ productId, currentWarehouseId, onClose }) => {
  const { products, warehouses, currentUser } = useAccounting();
  const [uoms, setUoms] = React.useState<any[]>([]);

  React.useEffect(() => {
    const fetchUoms = async () => {
      const { data } = await supabase.from('uoms').select('*').eq('organization_id', (currentUser as any)?.organization_id);
      if (data) setUoms(data);
    };
    fetchUoms();
  }, [currentUser]);
  
  if (!productId) return null;

  const product = products.find(p => p.id === productId);
  if (!product) return null;

  const stockMap = (product as any)?.warehouse_stock || (product as any)?.warehouseStock || {};
  const totalStock = product.stock || 0;
  const baseUom = uoms.find(u => u.id === product.base_uom_id);

  return (
    <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2">
      <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
        <h4 className="font-black text-slate-700 flex items-center gap-2 text-sm">
          <Warehouse size={16} className="text-blue-600" /> توزيع المخزون بالمستودعات
        </h4>
        <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase">
           {totalStock} {baseUom?.name || 'وحدة'}
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
              <span className={`truncate text-[11px] ${isCurrent ? 'font-black text-blue-800' : 'text-slate-600'}`} title={wh.name}>
                  {wh.name}
                </span>
              </div>
              <span className={`font-mono text-sm font-black ${qty > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                {qty}
              </span>
            </div>
          );
        })}
      </div>

      {currentWarehouseId && (products.length > 0) && (() => {
        const currentStock = Number(stockMap[currentWarehouseId] || 0);
        const currentWarehouseName = warehouses.find(w => w.id === currentWarehouseId)?.name || 'المستودع';
        return (
          <div className={`mt-3 pt-2 border-t border-slate-200 text-center text-[10px] font-black rounded-lg p-2 ${currentStock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {currentStock > 0 ? (
                <p className="flex items-center justify-center gap-1">
                    <CheckCircle2 size={14} /> 
                    الرصيد متاح في {currentWarehouseName}: {currentStock} {baseUom?.name}
                </p>
            ) : (
                <p className="flex items-center justify-center gap-1">
                    <AlertCircle size={14} /> 
                    الرصيد غير كافٍ في {currentWarehouseName}
                </p>
            )}
          </div>
        );
      })()}
    </div>
  );
};