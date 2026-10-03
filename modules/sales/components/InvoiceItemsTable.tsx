type ProductParam = any;
import React, { useState, useMemo } from 'react';
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
  Trash2,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight
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
  addProductToInvoice: (product: ProductParam, ...args: ProductParam[]) => void;
  getProductStock: (productId: string) => number;
  isOfferActive: (product: Record<string, any>) => boolean;
  getProductHypermarketOffer: (product: Record<string, any>) => any;
  getProductPrice: (product: ProductParam) => number;
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
  handleItemChange: (index: number, field: string, value: unknown) => void;
  removeItem: (index: number) => void;
  settings: any;
  currentUserRole: string;
  onOpenExcelImporter?: () => void;
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
  onOpenExcelImporter,
}) => {
  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  // ربط العناصر بفهرسها الأصلي في المصفوفة لضمان صحة التعديل والحذف عند التصفح
  const indexedItems = useMemo(() => {
    return items.map((it, idx) => ({ ...it, originalIndex: idx }));
  }, [items]);

  // تصفية سريعة داخل بنود الفاتورة للبحث عند وجود مئات الأصناف
  const filteredInvoiceItems = useMemo(() => {
    if (!itemSearchTerm.trim()) return indexedItems;
    const term = itemSearchTerm.trim().toLowerCase();
    return indexedItems.filter(it => 
      (it.productName && it.productName.toLowerCase().includes(term)) ||
      (it.productSku && it.productSku.toLowerCase().includes(term))
    );
  }, [indexedItems, itemSearchTerm]);

  // إجمالي الصفحات
  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(filteredInvoiceItems.length / pageSize));
  }, [filteredInvoiceItems.length, pageSize]);

  // البنود المعروضة في الصفحة الحالية
  const displayedItems = useMemo(() => {
    if (pageSize === 'all') return filteredInvoiceItems;
    const start = (currentPage - 1) * pageSize;
    return filteredInvoiceItems.slice(start, start + pageSize);
  }, [filteredInvoiceItems, currentPage, pageSize]);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-black text-slate-700 flex items-center gap-2">
            <Package className="text-blue-600" size={18} /> البحث وإضافة الأصناف
            {items.length > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">
                {items.length} صنف بالفاتورة
              </span>
            )}
          </label>
          {onOpenExcelImporter && (
            <button
              type="button"
              onClick={onOpenExcelImporter}
              className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm"
              title="استيراد حتى 500+ صنف من ملف إكسيل دفعة واحدة"
            >
              <FileSpreadsheet size={16} className="text-emerald-600" />
              <span>استيراد من Excel</span>
            </button>
          )}
        </div>

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
            <p className="font-bold">الفاتورة فارغة. ابحث عن أصناف لإضافتها أو استوردها من ملف Excel.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Quick Filter & Counter for Large Invoices */}
            {items.length > 10 && (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                <div className="relative flex-1 max-w-sm">
                  <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="تصفية سريعة داخل بنود الفاتورة..."
                    value={itemSearchTerm}
                    onChange={(e) => {
                      setItemSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-blue-400"
                  />
                  {itemSearchTerm && (
                    <button type="button" onClick={() => setItemSearchTerm('')} className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600">
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <span>إجمالي البنود:</span>
                  <span className="font-black text-slate-800">{items.length} صنف</span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
                    <th className="pb-3 text-center w-10">#</th>
                    <th className="pb-3 pr-4">الصنف</th>
                    <th className="pb-3 text-center">الوحدة</th>
                    <th className="pb-3 text-center">الكمية</th>
                    <th className="pb-3 text-center">سعر الوحدة</th>
                    <th className="pb-3 text-center">الإجمالي</th>
                    <th className="pb-3 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayedItems.map((item) => {
                    const originalIndex = item.originalIndex;
                    const product = products.find(p => p.id === (item.productId || item.product_id));
                    const isOffer = product ? isOfferActive(product) : false;
                    const appliedItemPromo = appliedPromotions.find(ap => ap.affectedProductId === (item.productId || item.product_id));
                    const stock = getProductStock(item.productId);
                    const isLowStock = stock < item.quantity;

                    return (
                      <tr key={item.id || originalIndex} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 text-center text-xs font-mono font-bold text-slate-400">
                          {originalIndex + 1}
                        </td>
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
                            onChange={e => handleItemChange(originalIndex, 'uomId', e.target.value)}
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
                                onClick={() => handleItemChange(originalIndex, 'quantity', item.quantity + 1)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg"
                              >
                                <Plus size={16} />
                              </button>
                              <input 
                                type="number"
                                step="any"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(originalIndex, 'quantity', e.target.value)}
                                className="w-14 text-center font-black text-slate-800 outline-none bg-transparent"
                              />
                              <button 
                                type="button" 
                                onClick={() => handleItemChange(originalIndex, 'quantity', Math.max(0.01, item.quantity - 1))}
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
                              onChange={(e) => handleItemChange(originalIndex, 'unitPrice', e.target.value)}
                              className="w-full min-w-[100px] text-center font-bold text-slate-700 bg-slate-50 rounded-lg py-1.5 px-2 focus:bg-white border border-transparent focus:border-blue-200 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              style={{ width: `${Math.max(100, String(item.unitPrice || '').length * 11 + 25)}px` }}
                              title={`سعر الوحدة: ${item.unitPrice}`}
                            />
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <span className="font-black text-slate-900">{Number(item.total || 0).toLocaleString()}</span>
                        </td>
                        <td className="py-4 text-center">
                          <button 
                            type="button" 
                            onClick={() => removeItem(originalIndex)}
                            className="text-slate-300 hover:text-red-500 p-2 transition-colors"
                            title="حذف هذا البند"
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

            {/* Pagination for invoices with many items (e.g. 500 items) */}
            {items.length > 25 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs font-bold text-slate-500">
                <div className="flex items-center gap-2">
                  <span>عرض:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                      setPageSize(val);
                      setCurrentPage(1);
                    }}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-700 focus:outline-none focus:border-blue-400"
                  >
                    <option value={25}>25 صنف</option>
                    <option value={50}>50 صنف</option>
                    <option value={100}>100 صنف</option>
                    <option value="all">عرض الكل ({filteredInvoiceItems.length})</option>
                  </select>
                  <span>
                    (معروض {displayedItems.length} من {filteredInvoiceItems.length} صنف)
                  </span>
                </div>

                {pageSize !== 'all' && totalPages > 1 && (
                  <div className="flex items-center gap-1.5" dir="ltr">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <ChevronLeft size={14} />
                      <span>السابق</span>
                    </button>
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-black font-mono">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <span>التالي</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default InvoiceItemsTable;
