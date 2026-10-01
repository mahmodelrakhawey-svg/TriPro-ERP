import { ToastType } from '../../../context/ToastContext';
import React from 'react';
import { 
  Truck, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Search, 
  Package, 
  Camera, 
  ShoppingCart, 
  Trash2, 
  Minus, 
  DollarSign, 
  Printer, 
  Eye, 
  MessageCircle 
} from 'lucide-react';
import { secureStorage } from '../../../utils/securityMiddleware';

export interface MobileCartItem {
  product: any;
  qty: number;
  price: number;
}

interface MobileSalesTabProps {
  warehousesList: any[];
  selectedWarehouseId: string;
  onSelectWarehouse: (id: string) => void;
  paymentType: 'cash' | 'credit';
  setPaymentType: (type: 'cash' | 'credit') => void;
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  customersList: any[];
  customerSearchQuery: string;
  setCustomerSearchQuery: (query: string) => void;
  filteredCustomers: any[];
  onOpenAddCustomerModal: () => void;
  catalogProducts: any[];
  loadingCatalog: boolean;
  productSearch: string;
  setProductSearch: (query: string) => void;
  getProductStockInWarehouse: (product: Record<string, any>, warehouseId: string) => number;
  cart: MobileCartItem[];
  setCart: React.Dispatch<React.SetStateAction<MobileCartItem[]>>;
  addToCart: (product: Record<string, any>) => void;
  updateCartQty: (productId: string, delta: number) => void;
  cartSubtotal: number;
  cartTax: number;
  cartTotal: number;
  handleCreateFieldInvoice: () => void;
  savingInvoice: boolean;
  lastSavedInvoice: any;
  onPrintReceipt: () => void;
  onOpenReceiptModal: () => void;
  onShareWhatsApp: () => void;
  showSalesCamera: boolean;
  salesVideoRef: React.RefObject<HTMLVideoElement>;
  startSalesCamera: () => void;
  stopSalesCamera: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}

export const MobileSalesTab: React.FC<MobileSalesTabProps> = ({
  warehousesList,
  selectedWarehouseId,
  onSelectWarehouse,
  paymentType,
  setPaymentType,
  selectedCustomerId,
  setSelectedCustomerId,
  customerName,
  setCustomerName,
  customersList,
  customerSearchQuery,
  setCustomerSearchQuery,
  filteredCustomers,
  onOpenAddCustomerModal,
  catalogProducts,
  loadingCatalog,
  productSearch,
  setProductSearch,
  getProductStockInWarehouse,
  cart,
  setCart,
  addToCart,
  updateCartQty,
  cartSubtotal,
  cartTax,
  cartTotal,
  handleCreateFieldInvoice,
  savingInvoice,
  lastSavedInvoice,
  onPrintReceipt,
  onOpenReceiptModal,
  onShareWhatsApp,
  showSalesCamera,
  salesVideoRef,
  startSalesCamera,
  stopSalesCamera,
  showToast,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 🚚 Warehouse / Van Selector Card */}
      <div className="bg-gradient-to-r from-slate-800 to-indigo-950/40 p-3.5 rounded-xl border border-indigo-500/30 space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-xs text-indigo-300 font-bold flex items-center gap-1.5">
            <Truck size={16} className="text-indigo-400" />
            <span>مخزن الصرف / سيارة المندوب:</span>
          </label>
          {selectedWarehouseId && (
            <button
              type="button"
              onClick={() => {
                secureStorage.setItem('tripro_mobile_preferred_warehouse', selectedWarehouseId);
                showToast('تم حفظ هذا المخزن كافتراضي لجهازك بنجاح ★', 'success');
              }}
              className="text-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded font-bold transition-colors flex items-center gap-1"
              title="حفظ هذا المستودع كافتراضي في كل مرة تفتح فيها التطبيق"
            >
              <span>★ حفظ كسيارتي الافتراضية</span>
            </button>
          )}
        </div>

        {warehousesList.length > 0 ? (
          <div className="space-y-1">
            <select
              value={selectedWarehouseId}
              onChange={e => onSelectWarehouse(e.target.value)}
              className="w-full bg-slate-900 border border-indigo-500/40 rounded-lg px-2.5 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-400"
            >
              {warehousesList.map(w => (
                <option key={w.id} value={w.id}>
                  🚚 {w.name}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-0.5">
              <span>يتم خصم الفاتورة وتوليد القيد من هذا المخزن مباشرة</span>
              <span className="text-indigo-400 font-bold">
                {warehousesList.find(w => w.id === selectedWarehouseId)?.name || ''}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-amber-400 py-1">جاري تحميل المستودعات...</div>
        )}
      </div>

      {/* 💳 طريقة الدفع واختيار العميل */}
      <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 space-y-3">
        <div>
          <label className="text-xs text-slate-300 font-bold block mb-1.5">
            💳 طريقة سداد الفاتورة:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setPaymentType('cash');
                if (!selectedCustomerId) setCustomerName('عميل نقدي');
              }}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                paymentType === 'cash'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/40'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <span>💵 نقدي فوري (خزينة)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentType('credit');
                if (customerName === 'عميل نقدي') setCustomerName('');
              }}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                paymentType === 'credit'
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400/40'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <span>📝 آجل (ذمم عملاء)</span>
            </button>
          </div>
        </div>

        {/* إذا كانت نقدي */}
        {paymentType === 'cash' && (
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-bold">
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              <span>سداد نقدي: القيد يسجل مباشرة في النقدية بالصندوق (1231) دون مديونية</span>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] text-slate-300 block font-medium">العميل (اختياري للنقدي):</label>
              <div className="flex gap-2">
                <select
                  value={selectedCustomerId}
                  onChange={e => {
                    setSelectedCustomerId(e.target.value);
                    const found = customersList.find(c => c.id === e.target.value);
                    if (found) setCustomerName(found.name);
                    else setCustomerName('عميل نقدي');
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- عميل نقدي عام (افتراضي) --</option>
                  {customersList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onOpenAddCustomerModal}
                  className="bg-emerald-700/50 hover:bg-emerald-700 border border-emerald-500/40 text-emerald-200 text-xs px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 shrink-0"
                  title="إضافة عميل جديد"
                >
                  <Plus size={13} />
                  <span>عميل جديد</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* إذا كانت آجل */}
        {paymentType === 'credit' && (
          <div className="bg-indigo-950/50 border-2 border-indigo-500/60 rounded-xl p-3 space-y-2.5 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-bold">
                <AlertCircle size={15} className="text-indigo-400 shrink-0" />
                <span>تحديد حساب العميل (إلزامي للبيع الآجل):</span>
              </div>
              <button
                type="button"
                onClick={onOpenAddCustomerModal}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow transition-colors shrink-0"
              >
                <Plus size={13} />
                <span>+ عميل جديد</span>
              </button>
            </div>

            {/* بحث في العملاء */}
            <div className="relative">
              <Search size={14} className="absolute right-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={customerSearchQuery}
                onChange={e => setCustomerSearchQuery(e.target.value)}
                placeholder="بحث سريع بالاسم أو الهاتف..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-8 pl-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
              />
            </div>

            {/* قائمة العملاء */}
            <select
              value={selectedCustomerId}
              onChange={e => {
                setSelectedCustomerId(e.target.value);
                const found = customersList.find(c => c.id === e.target.value);
                if (found) setCustomerName(found.name);
              }}
              className={`w-full bg-slate-900 rounded-lg px-2.5 py-2 text-xs font-bold text-white focus:outline-none transition-all ${
                !selectedCustomerId 
                  ? 'border-2 border-amber-500/70 animate-pulse text-amber-200' 
                  : 'border border-indigo-500 text-emerald-300'
              }`}
            >
              <option value="">-- اضغط هنا لاختيار العميل المسجل --</option>
              {filteredCustomers.map(c => (
                <option key={c.id} value={c.id}>
                  👤 {c.name} {c.phone ? `(${c.phone})` : ''} | الرصيد: {Number(c.balance || 0).toLocaleString()} ج.م
                </option>
              ))}
            </select>

            {/* بطاقة العميل المختار */}
            {selectedCustomerId ? (
              <div className="bg-slate-900/90 rounded-lg p-2 border border-indigo-500/40 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">العميل المحدد للفاتورة:</span>
                  <span className="text-white font-bold">{customerName}</span>
                </div>
                <div className="text-left">
                  <span className="text-slate-400 block text-[10px]">الرصيد الحالي:</span>
                  <span className="text-amber-400 font-bold">
                    {Number(customersList.find(c => c.id === selectedCustomerId)?.balance || 0).toLocaleString()} ج.م
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-amber-400 font-semibold bg-amber-950/40 border border-amber-500/30 rounded p-1.5">
                ⚠️ يرجى اختيار عميل مسجل لترحيل الفاتورة لحسابه (1221). إن لم يكن مسجلاً، اضغط "+ عميل جديد".
              </p>
            )}
          </div>
        )}
      </div>

      {/* 📦 مباشرة: إضافة أصناف للفاتورة (بحث واختيار فوري) */}
      <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs text-white flex items-center gap-1.5">
            <Package size={15} className="text-emerald-400" />
            <span>دليل الأصناف المتاحة ({catalogProducts.length} صنف)</span>
          </h3>
          <button
            type="button"
            onClick={showSalesCamera ? stopSalesCamera : startSalesCamera}
            className="bg-indigo-600/40 hover:bg-indigo-600/60 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
          >
            <Camera size={13} />
            <span>{showSalesCamera ? 'إغلاق الكاميرا' : 'مسح بالكاميرا'}</span>
          </button>
        </div>

        {/* Inline Camera View if active */}
        {showSalesCamera && (
          <div className="bg-black rounded-lg overflow-hidden relative">
            <video ref={salesVideoRef} className="w-full h-36 object-cover" playsInline muted />
            <div className="absolute inset-0 border-2 border-emerald-500/40 pointer-events-none flex items-center justify-center">
              <span className="text-[10px] bg-black/70 text-emerald-300 px-2 py-0.5 rounded font-bold">وجّه الكاميرا للباركود للإضافة التلقائية</span>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            placeholder="ابحث باسم الصنف، الباركود، أو الكود..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-9 pl-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {productSearch && (
            <button
              type="button"
              onClick={() => setProductSearch('')}
              className="absolute left-2.5 top-2 text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Products Quick Pick List */}
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
          {catalogProducts
            .filter(p => {
              if (!productSearch.trim()) return true;
              const term = productSearch.toLowerCase();
              return (
                p.name?.toLowerCase().includes(term) ||
                p.barcode?.toLowerCase().includes(term) ||
                p.sku?.toLowerCase().includes(term)
              );
            })
            .slice(0, 20)
            .map(p => {
              const inCartItem = cart.find(c => c.product.id === p.id);
              const whStock = getProductStockInWarehouse(p, selectedWarehouseId);
              const hasStockInWh = whStock > 0;

              return (
                <div
                  key={p.id}
                  className="bg-slate-900/80 hover:bg-slate-900 p-2.5 rounded-lg border border-slate-700/80 flex items-center justify-between transition-colors gap-2"
                >
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="font-bold text-xs text-white truncate">{p.name}</div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] flex-wrap">
                      <span className="text-emerald-400 font-bold">{Number(p.sales_price || 0).toLocaleString()} ج.م</span>
                      <span className="text-slate-600">|</span>
                      {hasStockInWh ? (
                        <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded text-[10px]">
                          متوفر بالسيارة: {whStock}
                        </span>
                      ) : (
                        <span className="text-rose-400 font-bold bg-rose-950/60 border border-rose-800/60 px-1.5 py-0.5 rounded text-[10px]">
                          غير متوفر بالسيارة (0)
                        </span>
                      )}
                      {Number(p.stock || 0) > 0 && !hasStockInWh && (
                        <span className="text-slate-400 text-[10px]">(متوفر بالفروع: {p.stock})</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => addToCart(p)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 shrink-0 ${
                      inCartItem 
                        ? 'bg-emerald-500 text-slate-900 font-black' 
                        : hasStockInWh
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    <Plus size={13} />
                    <span>{inCartItem ? `في السلة (${inCartItem.qty})` : 'إضافة +'}</span>
                  </button>
                </div>
              );
            })}

          {catalogProducts.length === 0 && (
            <div className="py-4 text-center text-slate-400 text-xs">
              {loadingCatalog ? 'جاري تحميل قائمة الأصناف...' : 'لا توجد أصناف مسجلة في النظام.'}
            </div>
          )}
        </div>
      </div>

      {/* Cart Items */}
      <div className="bg-slate-800 rounded-xl p-3.5 border border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
            <ShoppingCart size={15} className="text-emerald-400" />
            <span>بنود الفاتورة الحالية ({cart.length})</span>
          </h3>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-[11px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1"
            >
              <Trash2 size={12} />
              <span>إفراغ السلة</span>
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="py-5 text-center text-slate-400 text-xs bg-slate-900/50 rounded-lg border border-dashed border-slate-700">
            السلة فارغة. اضغط على زر <b className="text-emerald-400 font-bold">"إضافة +"</b> بجانب أي صنف أعلاه لإدراجه فورياً في الفاتورة.
          </div>
        ) : (
          <div className="space-y-2">
            {cart.map(item => (
              <div key={item.product.id} className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 flex items-center justify-between">
                <div className="flex-1 pr-1">
                  <div className="font-bold text-xs text-white">{item.product.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {item.price} ج.م × {item.qty} = <span className="text-emerald-400 font-bold">{item.price * item.qty} ج.م</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateCartQty(item.product.id, -1)}
                    className="w-6 h-6 bg-slate-800 text-slate-300 rounded flex items-center justify-center hover:bg-slate-700"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-5 text-center text-xs font-bold text-white">{item.qty}</span>
                  <button
                    onClick={() => updateCartQty(item.product.id, 1)}
                    className="w-6 h-6 bg-slate-800 text-slate-300 rounded flex items-center justify-center hover:bg-slate-700"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            ))}

            {/* Summary */}
            <div className="pt-2 border-t border-slate-700 space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>المجموع قبل الضريبة:</span>
                <span>{cartSubtotal.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>ضريبة القيمة المضافة (14%):</span>
                <span>{cartTax.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-base font-black text-emerald-400 pt-1 border-t border-slate-700/60">
                <span>الإجمالي النهائي:</span>
                <span>{cartTotal.toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {cart.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={handleCreateFieldInvoice}
            disabled={savingInvoice}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all"
          >
            <DollarSign size={18} />
            <span>{savingInvoice ? 'جاري الحفظ...' : 'إصدار وحفظ الفاتورة'}</span>
          </button>
        </div>
      )}

      {/* Receipt Print Section (When invoice saved) */}
      {lastSavedInvoice && (
        <div className="bg-slate-800/80 p-3.5 rounded-xl border border-emerald-500/40 text-center space-y-2.5 shadow-lg">
          <div className="text-xs text-emerald-400 font-bold flex items-center justify-center gap-1.5">
            <CheckCircle2 size={16} />
            <span>تم حفظ الفاتورة بنجاح #{lastSavedInvoice.invoice_number}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onPrintReceipt}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all active:scale-95"
            >
              <Printer size={15} />
              <span>طباعة حرارية (80mm)</span>
            </button>
            <button
              type="button"
              onClick={onOpenReceiptModal}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all active:scale-95"
            >
              <Eye size={15} />
              <span>معاينة الإيصال</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onShareWhatsApp}
            className="w-full bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/60 text-emerald-300 text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <MessageCircle size={14} className="text-emerald-400" />
            <span>إرسال تفاصيل الفاتورة عبر واتساب</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default MobileSalesTab;
