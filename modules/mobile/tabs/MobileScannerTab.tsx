import React from 'react';
import { 
  Camera, 
  Truck, 
  Search, 
  CheckCircle2, 
  ShoppingCart 
} from 'lucide-react';

interface MobileScannerTabProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraActive: boolean;
  cameraError: string | null;
  startCamera: () => void;
  stopCamera: () => void;
  warehousesList: any[];
  selectedWarehouseId: string;
  onSelectWarehouse: (id: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onLookupBarcode: (query: string) => void;
  selectedProduct: any;
  getProductStockInWarehouse: (product: any, warehouseId: string) => number;
  newStockCount: string;
  onNewStockCountChange: (count: string) => void;
  handleSaveStockAdjustment: () => void;
  adjustingStock: boolean;
  onAddToCart: (product: any) => void;
  onNavigateToSales: () => void;
}

export const MobileScannerTab: React.FC<MobileScannerTabProps> = ({
  videoRef,
  cameraActive,
  cameraError,
  startCamera,
  stopCamera,
  warehousesList,
  selectedWarehouseId,
  onSelectWarehouse,
  searchQuery,
  onSearchQueryChange,
  onLookupBarcode,
  selectedProduct,
  getProductStockInWarehouse,
  newStockCount,
  onNewStockCountChange,
  handleSaveStockAdjustment,
  adjustingStock,
  onAddToCart,
  onNavigateToSales,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Camera Viewport */}
      <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center relative overflow-hidden">
        <video
          ref={videoRef}
          className={`w-full h-48 object-cover rounded-lg bg-black ${cameraActive ? 'block' : 'hidden'}`}
          playsInline
          muted
        />

        {!cameraActive && (
          <div className="py-8 flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mb-3">
              <Camera size={26} />
            </div>
            <h3 className="font-bold text-sm text-white">ماسح باركود الكاميرا المباشر</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              وجّه كاميرا الهاتف نحو باركود الصنف لجرد الرصيد فورياً
            </p>
            <button
              onClick={startCamera}
              className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-600/30"
            >
              <Camera size={16} />
              <span>تشغيل كاميرا الجرد</span>
            </button>
          </div>
        )}

        {cameraActive && (
          <div className="mt-2 flex items-center justify-between px-2">
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              الكاميرا تقرأ الباركود تلقائياً...
            </span>
            <button
              onClick={stopCamera}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-2.5 py-1 rounded"
            >
              إيقاف
            </button>
          </div>
        )}

        {cameraError && (
          <div className="mt-2 text-xs text-red-400 bg-red-950/40 p-2 rounded border border-red-800/50">
            {cameraError}
          </div>
        )}
      </div>

      {/* Warehouse Selector for Stock Audit */}
      {warehousesList.length > 0 && (
        <div className="flex items-center gap-2 bg-slate-800 p-2.5 rounded-xl border border-slate-700">
          <Truck size={15} className="text-indigo-400 shrink-0" />
          <span className="text-xs text-slate-300 font-bold shrink-0">المستودع / السيارة للجرد:</span>
          <select
            value={selectedWarehouseId}
            onChange={e => onSelectWarehouse(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-white px-2 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            {warehousesList.map(w => (
              <option key={w.id} value={w.id}>
                🏢 {w.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Manual Search or Barcode Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchQueryChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onLookupBarcode(searchQuery)}
            placeholder="أو اكتب الباركود / اسم الصنف..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <button
          onClick={() => onLookupBarcode(searchQuery)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"
        >
          <Search size={14} />
          <span>بحث</span>
        </button>
      </div>

      {/* Selected Product Card & Quick Count Update */}
      {selectedProduct && (
        <div className="bg-slate-800/90 rounded-xl p-4 border border-indigo-500/30 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded">
                {selectedProduct.barcode || selectedProduct.sku || 'بدون باركود'}
              </span>
              <h4 className="font-bold text-sm text-white mt-1">{selectedProduct.name}</h4>
              <p className="text-xs text-emerald-400 font-black mt-0.5">
                سعر البيع: {Number(selectedProduct.sales_price || 0).toLocaleString()} ج.م
              </p>
            </div>
            <div className="text-left bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 block">رصيد المستودع المختار</span>
              <span className="text-lg font-black text-amber-400">
                {getProductStockInWarehouse(selectedProduct, selectedWarehouseId)}
              </span>
              <span className="text-[9px] text-slate-500 block">
                الإجمالي العام: {selectedProduct.stock || 0}
              </span>
            </div>
          </div>

          {/* Adjustment box */}
          <div className="pt-2 border-t border-slate-700/80">
            <label className="text-xs text-slate-300 font-bold block mb-1">
              تسجيل جرد فعلي وتعديل الرصيد:
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={newStockCount}
                onChange={e => onNewStockCountChange(e.target.value)}
                className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-center text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleSaveStockAdjustment}
                disabled={adjustingStock}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <CheckCircle2 size={14} />
                <span>{adjustingStock ? 'جاري الحفظ...' : 'تثبيت الجرد الفعلي'}</span>
              </button>
              <button
                onClick={() => {
                  onAddToCart(selectedProduct);
                  onNavigateToSales();
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-lg"
                title="إضافة للفاتورة"
              >
                <ShoppingCart size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileScannerTab;
