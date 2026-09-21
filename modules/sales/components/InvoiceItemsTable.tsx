import React from 'react';
import { 
  Package, 
  Search, 
  X, 
  Box, 
  Gift, 
  ShoppingCart, 
  Sparkles, 
  Plus, 
  ArrowDown, 
  Trash2 
} from 'lucide-react';
import { ProductStockViewer } from '../../../components/ProductStockViewer';

export interface InvoiceItemsTableProps {
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  productSearchTerm: string;
  setProductSearchTerm: (term: string) => void;
  showProductResults: boolean;
  setShowProductResults: (show: boolean) => void;
  handleBarcodeSearch: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  filteredProducts: any[];
  addProductToInvoice: (product: any) => void;
  getProductStock: (productId: string) => number;
  isOfferActive: (product: any) => boolean;
  getProductHypermarketOffer: (product: any) => any;
  getProductPrice: (product: any) => number;
  formData: {
    currency?: string;
    warehouseId?: string;
    [key: string]: any;
  };
  items: any[];
  products: any[];
  appliedPromotions: any[];
  activeStockViewer: string | null;
  setActiveStockViewer: (id: string | null) => void;
  uoms: any[];
  handleItemChange: (index: number, field: string, value: any) => void;
  removeItem: (index: number) => void;
  settings: any;
  currentUserRole: string;
}

export const InvoiceItemsTable: React.FC<InvoiceItemsTableProps> = ({
  barcodeInputRef,
  productSearchTerm,
  setProductSearchTerm,
  showProductResults,
  setShowProductResults,
  handleBarcodeSearch,
  filteredProducts,
  addProductToInvoice,
  getProductStock,
  isOfferActive,
  getProductHypermarketOffer,
  getProductPrice,
  formData,
  items,
  products,
  appliedPromotions,
  activeStockViewer,
  setActiveStockViewer,
  uoms,
  handleItemChange,
  removeItem,
  settings,
  currentUserRole,
}) => {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-black text-slate-700 flex items-center gap-2">
          <Package className="text-blue-600" size={18} /> البحث وإضافة الأصناف
        </label>
        <div className="relative">
          <div className={`flex items-center gap-3 p-4 bg-slate-50 border-2 transition-all rounded-2xl ${showProductResults ? 'border-blue-400 ring-4 ring-blue-50' : 'border-slate-100 hover:border-slate-200'}`}>
            <Search className="text-slate-400" size={22} />
            <input 
              ref={barcodeInputRef}
              type="text"
              placeholder="ابحث باسم الصنف أو الباركود أو الـ SKU للإضافة السريعة..."
              value={productSearchTerm}
              onChange={(e) => {
                setProductSearchTerm(e.target.value);
                setShowProductResults(true);
              }}
              onKeyDown={handleBarcodeSearch}
              onFocus={() => setShowProductResults(true)}
              className="flex-1 bg-transparent text-lg font-bold outline-none placeholder-slate-300"
            />
            {productSearchTerm && (
              <button type="button" onClick={() => setProductSearchTerm('')} className="text-slate-400 hover:text-red-500">
                <X size={20} />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showProductResults && filteredProducts.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in slide-in-from-top-2">
              <div className="p-2 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase pr-2">نتائج البحث</span>
                <button type="button" onClick={() => setShowProductResults(false)} className="p-1 hover:bg-slate-200 rounded-lg"><X size={14}/></button>
              </div>
              <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                {filteredProducts.map(p => {
                  const stock = getProductStock(p.id);
                  const isOffer = isOfferActive(p);
                  const hyperOffer = getProductHypermarketOffer(p);
                  const price = getProductPrice(p);
                  const regularPrice = Number(p.sales_price || p.price || 0);

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProductToInvoice(p)}
                      className="w-full p-4 flex items-center justify-between hover:bg-blue-50 transition-colors text-right group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                          <Box size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-800">{p.name}</p>
                            {isOffer && (
                              <span className="bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-red-200 flex items-center gap-1">
                                🔥 عرض خاص
                              </span>
                            )}
                            {hyperOffer && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                                <Gift size={10} className="text-amber-600" /> عرض هايبر: {hyperOffer.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-mono">{p.sku || 'بدون كود'}</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-1.5 justify-end">
                          {isOffer && regularPrice > price && (
                            <span className="text-xs text-slate-400 line-through font-bold">
                              {regularPrice.toLocaleString()}
                            </span>
                          )}
                          <p className="font-black text-blue-600">
                            {(price || 0).toLocaleString()} <span className="text-[10px] font-normal">{formData.currency || 'EGP'}</span>
                          </p>
                        </div>
                        <p className={`text-[10px] font-bold ${stock > 5 ? 'text-emerald-500' : (stock > 0 ? 'text-amber-500' : 'text-red-500')}`}>
                          المخزون: {stock}
                          {stock === 0 && Number(p.stock || 0) > 0 && (
                            <span className="block text-[9px] text-blue-600 font-bold">
                              (متوفر {p.stock} في مستودع آخر)
                            </span>
                          )}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {showProductResults && productSearchTerm && filteredProducts.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center z-50">
              <Package size={40} className="mx-auto text-slate-200 mb-2" />
              <p className="text-slate-400 font-bold">عذراً، لم نجد أصنافاً مطابقة للبحث</p>
            </div>
          )}
        </div>
      </div>

      {/* Items List Table */}
      <div className="space-y-4">
        {items.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl text-slate-300">
            <ShoppingCart size={48} className="mb-4 opacity-20" />
            <p className="font-bold">الفاتورة فارغة. ابحث عن أصناف لإضافتها.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
                  <th className="pb-3 pr-4">الصنف</th>
                  <th className="pb-3 text-center">الوحدة</th>
                  <th className="pb-3 text-center">الكمية</th>
                  <th className="pb-3 text-center">سعر الوحدة</th>
                  <th className="pb-3 text-center">الإجمالي</th>
                  <th className="pb-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, index) => {
                  const product = products.find(p => p.id === (item.productId || item.product_id));
                  const isOffer = product ? isOfferActive(product) : false;
                  const appliedItemPromo = appliedPromotions.find(ap => ap.affectedProductId === (item.productId || item.product_id));
                  const stock = getProductStock(item.productId);
                  const isLowStock = stock < item.quantity;
                  return (
                    <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <button 
                            type="button" 
                            onClick={() => setActiveStockViewer(activeStockViewer === item.id ? null : item.id)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isLowStock ? 'bg-red-50 text-red-500 border border-red-200' : 'bg-blue-50 text-blue-500 border border-blue-100 shadow-sm'} hover:scale-110 active:scale-95`}
                            title="عرض تفاصيل المخزون"
                          >
                            <Box size={16} />
                          </button>
                          <div className="relative">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-slate-800 text-sm">{item.productName}</p>
                              {isOffer && (
                                <span className="bg-red-100 text-red-700 text-[10px] font-black px-1.5 py-0.5 rounded border border-red-200 flex items-center gap-1">
                                  🔥 عرض خاص
                                </span>
                              )}
                              {appliedItemPromo && (
                                <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1" title={appliedItemPromo.promoName}>
                                  <Sparkles size={10} className="text-amber-600" /> عرض هايبر: -{appliedItemPromo.discountAmount.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-slate-400">{item.productSku || 'بدون كود'}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLowStock ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                مخزون: {stock}
                              </span>
                              {stock === 0 && Number(products.find(p => p.id === item.productId)?.stock || 0) > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200" title="المخزون موجود في مستودع آخر، اضغط أيقونة الصندوق لمعرفة المستودع">
                                  (متوفر {products.find(p => p.id === item.productId)?.stock} بمستودع آخر)
                                </span>
                              )}
                            </div>
                            {activeStockViewer === item.id && (
                              <ProductStockViewer 
                                productId={item.productId} 
                                currentWarehouseId={formData.warehouseId}
                                onClose={() => setActiveStockViewer(null)}
                              />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <select 
                          value={item.uomId || ''} 
                          onChange={e => handleItemChange(index, 'uomId', e.target.value)}
                          className="w-full border-2 border-slate-50 rounded-xl p-1.5 text-xs font-bold bg-white focus:border-blue-300 outline-none"
                        >
                          {uoms.filter(u => {
                            const prod = products.find(p => p.id === item.productId);
                            const baseUom = uoms.find(ux => ux.id === prod?.base_uom_id);
                            return u.category_id === baseUom?.category_id;
                          }).map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center justify-center">
                          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm group-hover:border-blue-300 transition-colors">
                            <button 
                              type="button" 
                              onClick={() => handleItemChange(index, 'quantity', item.quantity + 1)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg"
                            >
                              <Plus size={16} />
                            </button>
                            <input 
                              type="number"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                              className="w-12 text-center font-black text-slate-800 outline-none bg-transparent"
                            />
                            <button 
                              type="button" 
                              onClick={() => handleItemChange(index, 'quantity', Math.max(0.01, item.quantity - 1))}
                              className="p-1 text-red-400 hover:bg-red-50 rounded-lg"
                            >
                              <ArrowDown size={16} />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center justify-center">
                          <input 
                            type="number"
                            step="any"
                            value={item.unitPrice}
                            disabled={settings.preventPriceModification && currentUserRole !== 'super_admin' && currentUserRole !== 'admin'}
                            onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                            className="w-24 text-center font-bold text-slate-700 bg-slate-50 rounded-lg py-1.5 focus:bg-white border border-transparent focus:border-blue-200 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          />
                        </div>
                      </td>
                      <td className="py-4 text-center">
                        <span className="font-black text-slate-900">{item.total.toLocaleString()}</span>
                      </td>
                      <td className="py-4 text-center">
                        <button 
                          type="button" 
                          onClick={() => removeItem(index)}
                          className="text-slate-300 hover:text-red-500 p-2 transition-colors"
                        >
                          <Trash2 size={18} />
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
    </div>
  );
};
export default InvoiceItemsTable;
