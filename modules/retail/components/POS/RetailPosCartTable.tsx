import React from 'react';
import { 
  Barcode, 
  Search, 
  ShoppingCart, 
  Scale, 
  Minus, 
  Plus, 
  Trash2, 
  Sparkles 
} from 'lucide-react';
import { PosCartItem, isItemOfferActive, getItemEffectivePrice } from '../../hooks/usePosCart';

export interface RetailPosCartTableProps {
  barcodeInput: string;
  setBarcodeInput: (val: string) => void;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  handleBarcodeSubmit: (e: React.FormEvent) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  searchResults: any[];
  addToCart: (product: any) => void;
  pricingTier: 'retail' | 'wholesale' | 'half';
  setPricingTier: (tier: 'retail' | 'wholesale' | 'half') => void;
  cart: PosCartItem[];
  currencySymbol: string;
  updateQuantity: (productId: string, delta: number) => void;
  onVoidItem: (item: PosCartItem) => void;
  appliedPromotions: any[];
  subtotal: number;
  totalPromoDiscount: number;
  isTaxEnabled: boolean;
  vatRate: number;
  tax: number;
  total: number;
}

export const RetailPosCartTable: React.FC<RetailPosCartTableProps> = ({
  barcodeInput,
  setBarcodeInput,
  barcodeInputRef,
  handleBarcodeSubmit,
  searchQuery,
  setSearchQuery,
  searchResults,
  addToCart,
  pricingTier,
  setPricingTier,
  cart,
  currencySymbol,
  updateQuantity,
  onVoidItem,
  appliedPromotions,
  subtotal,
  totalPromoDiscount,
  isTaxEnabled,
  vatRate,
  tax,
  total
}) => {
  return (
    <div className="w-[60%] flex flex-col border-l border-slate-800 bg-slate-900">
      
      {/* Barcode & Search Input Panel */}
      <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex gap-3">
        <form onSubmit={handleBarcodeSubmit} className="flex-1 relative">
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
            <Barcode size={20} />
          </div>
          <input 
            ref={barcodeInputRef}
            type="text" 
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            placeholder="امسح باركود المنتج هنا مباشرة..." 
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-10 pl-4 py-3.5 text-white font-mono text-lg font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-slate-600"
            autoFocus
          />
        </form>

        <div className="w-[40%] relative">
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث سريع بالاسم..." 
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-4 py-3.5 text-white text-sm focus:border-indigo-500 outline-none"
          />
          {/* Autocomplete Search Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 mt-2 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-50">
              {searchResults.map(p => {
                const isOffer = isItemOfferActive(p);
                const effectivePrice = getItemEffectivePrice(p);
                return (
                  <div 
                    key={p.id} 
                    onClick={() => {
                      addToCart(p);
                      setSearchQuery('');
                    }}
                    className="p-3 border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer flex justify-between items-center transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{p.name}</span>
                        {isOffer && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded font-black flex items-center gap-1">
                            🔥 عرض خاص
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">{p.barcode || p.sku}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-black text-indigo-400">{effectivePrice.toFixed(2)} {currencySymbol}</div>
                      {isOffer && (
                        <div className="text-xs text-slate-500 line-through font-mono">{Number(p.sales_price || 0).toFixed(2)} {currencySymbol}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pricing Tier Selector Bar */}
      <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">فئة السعر:</span>
          <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            {[
              { id: 'retail', label: 'قطاعي', activeBg: 'bg-indigo-600 text-white' },
              { id: 'wholesale', label: 'جملة', activeBg: 'bg-blue-600 text-white' },
              { id: 'half', label: 'نصف جملة', activeBg: 'bg-sky-600 text-white' },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPricingTier(t.id as any)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  pricingTier === t.id 
                    ? `${t.activeBg} shadow` 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-slate-500 font-medium">
          {pricingTier === 'wholesale' ? '⚡ أسعار بيع الجملة مفعلة' : pricingTier === 'half' ? '⚡ أسعار نصف الجملة مفعلة' : '🏷️ أسعار البيع بالتجزئة'}
        </div>
      </div>

      {/* Cart Table */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
            <ShoppingCart size={48} className="opacity-20" />
            <span className="text-sm font-bold opacity-60">السلة فارغة. ابدأ بمسح باركود المنتجات.</span>
          </div>
        ) : (
          <div className="bg-slate-950 border border-slate-850 rounded-xl overflow-hidden">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50 text-xs font-black text-slate-400">
                  <th className="p-3">المنتج</th>
                  <th className="p-3 text-center">النوع / الميزان</th>
                  <th className="p-3 text-center">الكمية</th>
                  <th className="p-3 text-left">السعر</th>
                  <th className="p-3 text-left">الإجمالي</th>
                  <th className="p-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, idx) => {
                  const isOffer = isItemOfferActive(item.product) && item.customPrice === undefined;
                  const price = getItemEffectivePrice(item.product, item.customPrice);
                  const isWeight = item.weight !== undefined;
                  const qty = isWeight ? item.weight! : item.quantity;
                  const rowTotal = price * qty;
                  return (
                    <tr key={idx} className="border-b border-slate-800/40 hover:bg-slate-900/30 text-sm transition-all">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white">{item.product.name}</span>
                          {isOffer && (
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded font-black flex items-center gap-1">
                              🔥 عرض خاص
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">{item.product.barcode || item.product.sku}</div>
                      </td>
                      <td className="p-3 text-center">
                        {isWeight ? (
                          <span className="bg-amber-950/80 text-amber-400 border border-amber-900 px-2 py-0.5 rounded text-[10px] font-black flex items-center justify-center gap-1 w-fit mx-auto">
                            <Scale size={10} /> ميزان ({item.weight} كجم)
                          </span>
                        ) : (
                          <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-black">
                            {item.uomName || 'حبة'}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {!isWeight ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 bg-slate-800 hover:bg-slate-700 rounded transition-all"><Minus size={12} /></button>
                            <span className="w-8 font-black font-mono text-center text-white">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 bg-slate-800 hover:bg-slate-700 rounded transition-all"><Plus size={12} /></button>
                          </div>
                        ) : (
                          <span className="font-black font-mono text-white">{item.weight} كجم</span>
                        )}
                      </td>
                      <td className="p-3 text-left font-bold font-mono">
                        {isOffer ? (
                          <div>
                            <span className="text-amber-400 font-black">{price.toFixed(2)}</span>
                            <span className="text-slate-500 line-through text-xs mr-1">{Number(item.product.sales_price || 0).toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">{price.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="p-3 text-left font-black font-mono text-indigo-400">{rowTotal.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => onVoidItem(item)}
                          className="text-red-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/30 transition-all"
                          title="حذف الصنف (يتطلب تصريح المشرف)"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cart Calculations Summary Footer */}
      <div className="p-6 bg-slate-950 border-t border-slate-800 space-y-3">
        {appliedPromotions.length > 0 && (
          <div className="space-y-1 bg-purple-950/40 border border-purple-900/50 p-2.5 rounded-xl text-xs">
            <span className="font-bold text-amber-300 flex items-center gap-1">
              <Sparkles size={13} /> العروض والخصومات المطبقة:
            </span>
            {appliedPromotions.map((p, i) => (
              <div key={i} className="flex justify-between text-purple-200">
                <span>{p.promoName}</span>
                <span className="font-bold font-mono text-emerald-400">-{p.discountAmount.toFixed(2)} {currencySymbol}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4 text-sm text-slate-400">
          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/40">
            <span className="block text-xs text-slate-500 mb-1">المجموع الفرعي</span>
            <span className="text-lg font-bold font-mono text-slate-300">{subtotal.toFixed(2)} {currencySymbol}</span>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/40">
            <span className="block text-xs text-amber-400 mb-1">العروض والخصم</span>
            <span className="text-lg font-bold font-mono text-amber-400">-{totalPromoDiscount.toFixed(2)} {currencySymbol}</span>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/40">
            <span className="block text-xs text-slate-500 mb-1">
              {isTaxEnabled ? `الضريبة (${(vatRate * 100).toFixed(0)}%)` : 'الضريبة (معطلة)'}
            </span>
            <span className="text-lg font-bold font-mono text-slate-300">
              {isTaxEnabled ? `${tax.toFixed(2)} ${currencySymbol}` : `0.00 ${currencySymbol}`}
            </span>
          </div>
          <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-900/20">
            <span className="block text-xs text-indigo-400/80 mb-1">الإجمالي النهائي</span>
            <span className="text-2xl font-black font-mono text-indigo-400">{total.toFixed(2)} {currencySymbol}</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default RetailPosCartTable;
