import React, { useMemo } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import type { OrderItem } from '../../../../types';
import { Utensils, User, Star, Percent, CreditCard, GitMerge, ArrowRightLeft, Printer, Minus, Plus } from 'lucide-react';

// This interface was in PosScreen.tsx, it's better to move it to a shared types file,
// but for this refactoring, we'll place it here.
export interface ActiveOrder {
  tableId: string;
  sessionId: string | null;
  orderId?: string;
  warehouseId?: string;
  tableName: string;
  items: OrderItem[];
  type: 'dine-in' | 'takeaway' | 'delivery';
  customer?: { id: string; name: string; phone?: string; address?: string };
  deliveryFee?: number;
  discount?: { type: 'percentage' | 'fixed'; value: number };
  loyaltyDiscount?: { points: number; amount: number };
  serviceChargeEnabled?: boolean;
  taxEnabled?: boolean;
}

interface OrderSummaryProps {
  order: ActiveOrder | null;
  onUpdateItem: (itemId: string, change: number) => void;
  onClearOrder: () => void;
  onAcceptOrder: () => void;
  onPayment: () => void;
  onPrintProforma: () => void;
  onTransfer: () => void;
  onMerge: () => void;
  isSubmitting: boolean;
  onSelectCustomer: () => void;
  onAddDiscount: () => void;
  onPayLater: () => void;
  onRedeemPoints: () => void;
  onToggleServiceCharge?: () => void;
  onToggleTax?: () => void;
}

const OrderSummaryComponent: React.FC<OrderSummaryProps> = ({ 
  order, onUpdateItem, onClearOrder, onAcceptOrder, onPayment, 
  onPrintProforma, onTransfer, onMerge, isSubmitting, onSelectCustomer, 
  onAddDiscount, onPayLater, onRedeemPoints, onToggleServiceCharge, onToggleTax 
}) => {
  const { settings, customers } = useAccounting();

  const customerDetails = useMemo(() => {
      if (!order?.customer) return null;
      return customers.find(c => c.id === order.customer.id);
  }, [order, customers]);

  const finalTotals = useMemo(() => {
    if (!order) return { subtotal: 0, serviceCharge: 0, tax: 0, total: 0, discountAmount: 0, isTaxEnabled: false, isServiceEnabled: false, vatPercent: 0, servicePercent: 0 };
    const subtotal = order.items.reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)), 0);
    const discountAmount = order.discount?.type === 'fixed' ? order.discount.value : subtotal * ((order.discount?.value || 0) / 100);
    const subtotalAfterDiscount = subtotal - discountAmount;
    const loyaltyDiscountAmount = order.loyaltyDiscount?.amount || 0;
    const subtotalAfterLoyalty = subtotalAfterDiscount - loyaltyDiscountAmount;

    // رسوم الخدمة
    const globalServiceEnabled = settings?.enableServiceCharge !== false && settings?.enable_service_charge !== false && (Boolean(settings?.enableServiceCharge) || Boolean(settings?.enable_service_charge));
    const isServiceEnabled = order.serviceChargeEnabled !== undefined ? order.serviceChargeEnabled : globalServiceEnabled;
    const servicePercent = isServiceEnabled ? (Number(settings?.serviceChargeRate) || 12) : 0;
    const serviceCharge = isServiceEnabled ? subtotalAfterLoyalty * (servicePercent / 100) : 0;

    // ضريبة القيمة المضافة
    const globalTaxEnabled = settings?.enableTax !== false && settings?.enable_tax !== false;
    const isTaxEnabled = order.taxEnabled !== undefined ? order.taxEnabled : globalTaxEnabled;
    const vatPercent = isTaxEnabled ? (Number(settings?.vatRate) || 14) : 0;
    const tax = isTaxEnabled ? (subtotalAfterLoyalty + serviceCharge) * (vatPercent / 100) : 0;

    const total = subtotalAfterLoyalty + serviceCharge + tax + (order.deliveryFee || 0);
    return { subtotal, serviceCharge, tax, total, discountAmount, isTaxEnabled, isServiceEnabled, vatPercent, servicePercent };
  }, [order, settings.vatRate, settings.enableTax, settings.enable_tax, settings.enableServiceCharge, settings.enable_service_charge, settings.serviceChargeRate]);

  const newItemsTotal = useMemo(() => {
    if (!order || !order.items) return 0;
    return order.items.reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * ((Number(item.quantity) || 0) - (Number(item.savedQuantity) || 0))), 0);
  }, [order]);
  const hasNewItems = newItemsTotal > 0;

  if (!order) {
    return (
      <div className="bg-white rounded-lg shadow-sm h-full flex flex-col items-center justify-center text-center p-4">
        <Utensils size={48} className="text-slate-300 mb-4" />
        <h3 className="font-bold text-slate-600">لم يتم تحديد طلب</h3>
        <p className="text-sm text-slate-400">الرجاء اختيار طاولة لبدء الطلب</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">
            {order.type === 'dine-in' && `فاتورة طاولة: ${order.tableName}`}
            {order.type === 'takeaway' && `طلب سفري #${(order.sessionId || order.orderId || '').slice(-4)}`}
            {order.type === 'delivery' && `طلب توصيل`}
          </h3>
        <button onClick={onClearOrder} className="text-xs text-red-500 hover:text-red-700 font-bold">إلغاء الطلب</button>
      </div>
        {order.customer ? (
          <div className="text-xs mt-2 bg-blue-50 text-blue-700 p-2 rounded-lg flex justify-between items-center">
            <span className="font-bold">العميل: {order.customer.name}</span>
            <div className="flex items-center gap-3">
              {customerDetails && (
                <>
                  <span className="font-bold flex items-center gap-1"><Star size={12} className="text-amber-500"/> {(customerDetails as any).loyalty_points || 0} نقطة</span>
                  <button onClick={onRedeemPoints} className="text-xs font-bold text-amber-600 hover:underline">استبدال</button>
                </>
              )}
              <button onClick={onSelectCustomer} className="font-bold">تغيير</button>
            </div>
          </div>
        ) : (
          <button onClick={onSelectCustomer} className="text-xs mt-2 text-blue-600 hover:underline flex items-center gap-1">
            <User size={12} /> ربط الطلب بعميل
          </button>
        )}
      </div>

      <div className="flex-1 p-2 overflow-y-auto space-y-2 min-h-0">
        {order.items?.map(item => (
          <div key={(item as any).localId || (item as any).id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
            <div className="flex-1">
              <div className="font-semibold text-sm">{item.name}</div>
              {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                <div className="text-[10px] text-blue-600 font-medium">
                  {item.selectedModifiers.map(m => m.name).join(', ')}
                </div>
              )}
              {item.notes && <div className="text-[10px] text-red-500 italic">{item.notes}</div>}
              <div className="text-xs text-slate-500">{(Number(item.unitPrice) || 0).toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdateItem((item as any).localId || (item as any).id, -1)} className={`p-1 rounded-full ${item.savedQuantity && item.quantity <= item.savedQuantity ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-red-100 text-red-600'}`} disabled={item.savedQuantity ? item.quantity <= item.savedQuantity : false}><Minus size={12} /></button>
              <span className="font-bold w-6 text-center">{item.quantity}</span>
              {item.savedQuantity && item.savedQuantity > 0 && <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded" title="تم طلبه مسبقاً">+{item.savedQuantity}</span>}
              <button onClick={() => onUpdateItem((item as any).localId || (item as any).id, 1)} className="p-1 bg-emerald-100 text-emerald-600 rounded-full hover:bg-emerald-200"><Plus size={12} /></button>
            </div>
            <div className="font-bold w-20 text-left">{((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)).toFixed(2)}</div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t space-y-2">
        <div className="flex justify-between text-sm"><span className="text-slate-500">المجموع الفرعي</span><span className="font-semibold">{finalTotals.subtotal.toFixed(2)}</span></div>
        {finalTotals.discountAmount > 0 && (
          <div className="flex justify-between text-sm text-red-600"><span>الخصم</span><span className="font-semibold">-{finalTotals.discountAmount.toFixed(2)}</span></div>
        )}
        {order.loyaltyDiscount && order.loyaltyDiscount.amount > 0 && (
          <div className="flex justify-between text-sm text-red-600"><span>خصم ولاء ({order.loyaltyDiscount.points} نقطة)</span><span className="font-semibold">-{order.loyaltyDiscount.amount.toFixed(2)}</span></div>
        )}
        {order.deliveryFee && (
          <div className="flex justify-between text-sm"><span className="text-slate-500">رسوم التوصيل</span><span className="font-semibold">{order.deliveryFee.toFixed(2)}</span></div>
        )}

        {/* سطر رسوم الخدمة مع زر إلغاء/تفعيل سريع */}
        {(settings?.enableServiceCharge || settings?.enable_service_charge || finalTotals.isServiceEnabled || order.serviceChargeEnabled !== undefined) && (
          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">رسوم الخدمة ({finalTotals.servicePercent}%)</span>
              <button 
                type="button"
                onClick={onToggleServiceCharge}
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border transition-colors ${
                  finalTotals.isServiceEnabled 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' 
                    : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                }`}
                title={finalTotals.isServiceEnabled ? 'اضغط لإلغاء الخدمة من هذا الطلب' : 'اضغط لتفعيل الخدمة'}
              >
                {finalTotals.isServiceEnabled ? 'مفعلة ✓' : 'ملغاة ✕'}
              </button>
            </div>
            <span className={`font-semibold ${!finalTotals.isServiceEnabled ? 'text-slate-400 line-through' : ''}`}>
              {finalTotals.serviceCharge.toFixed(2)}
            </span>
          </div>
        )}

        {/* سطر ضريبة القيمة المضافة مع زر إلغاء/تفعيل سريع */}
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">الضريبة ({finalTotals.vatPercent}%)</span>
            <button 
              type="button"
              onClick={onToggleTax}
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border transition-colors ${
                finalTotals.isTaxEnabled 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' 
                  : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
              }`}
              title={finalTotals.isTaxEnabled ? 'اضغط لإلغاء الضريبة من هذا الطلب' : 'اضغط لتفعيل الضريبة'}
            >
              {finalTotals.isTaxEnabled ? 'مفعلة ✓' : 'ملغاة ✕'}
            </button>
          </div>
          <span className={`font-semibold ${!finalTotals.isTaxEnabled ? 'text-slate-400 line-through' : ''}`}>
            {finalTotals.tax.toFixed(2)}
          </span>
        </div>

        <div className="flex justify-between text-lg font-bold text-slate-800 border-t pt-2 mt-1"><span>الإجمالي النهائي</span><span>{(Number(finalTotals.total) || 0).toFixed(2)} {settings?.currency || 'EGP'}</span></div>
      </div>
      <div className="p-2 border-t flex gap-2">
        <button onClick={onAddDiscount} className="flex-1 text-xs bg-slate-100 text-slate-600 font-bold py-2 rounded-lg hover:bg-slate-200 flex items-center justify-center gap-1"><Percent size={14}/> خصم</button>
        <button onClick={onPayLater} disabled={!order.customer} className="flex-1 text-xs bg-slate-100 text-slate-600 font-bold py-2 rounded-lg hover:bg-slate-200 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"><CreditCard size={14}/> آجل</button>
      </div>

      <div className="p-3 grid grid-cols-2 gap-2">
        <button 
            onClick={onMerge}
            className="col-span-1 bg-amber-50 text-amber-700 font-bold py-2 rounded-lg hover:bg-amber-100 transition-colors text-xs flex items-center justify-center gap-1 border border-amber-100 mb-1 disabled:opacity-50 disabled:cursor-not-allowed" 
            disabled={!order || !order.sessionId}>
          <GitMerge size={14} /> دمج الطاولات
        </button>
        <button 
            onClick={onTransfer}
            className="col-span-1 bg-indigo-50 text-indigo-700 font-bold py-2 rounded-lg hover:bg-indigo-100 transition-colors text-xs flex items-center justify-center gap-1 border border-indigo-100 mb-1 disabled:opacity-50 disabled:cursor-not-allowed" 
            disabled={!order || !order.sessionId}>
          <ArrowRightLeft size={14} /> تحويل
        </button>
        <button 
            onClick={onPrintProforma}
            className="col-span-2 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-200 transition-colors text-sm flex items-center justify-center gap-2 border border-slate-200 mb-1" 
            disabled={!order.items || order.items.length === 0}>
          <Printer size={16} /> طباعة شيك (Check)
        </button>
        <button 
            onClick={onAcceptOrder}
            className="col-span-2 bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors text-base disabled:opacity-50" 
            disabled={!hasNewItems || isSubmitting}>
          {isSubmitting ? 'جاري...' : `إرسال (${newItemsTotal.toFixed(0)})`}
        </button>
        
        <button 
            onClick={onPayment}
            className="col-span-2 bg-emerald-600 text-white font-bold py-3 rounded-lg hover:bg-emerald-700 transition-colors text-base disabled:opacity-50" 
            disabled={!order.orderId || hasNewItems || isSubmitting}>
          دفع وإغلاق (F9)
        </button>
      </div>
    </div>
  );
};

export const OrderSummary = React.memo(OrderSummaryComponent);