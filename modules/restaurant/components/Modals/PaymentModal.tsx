import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { X, CreditCard, Banknote, Wallet, CheckCircle2, Loader2, Receipt, Minus, Plus } from 'lucide-react';

interface Props {
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const PaymentModal: React.FC<Props> = ({ orderId, onClose, onSuccess }) => {
  const { completeRestaurantOrder, processSplitPayment, getSystemAccount, settings } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'WALLET'>('CASH');
  
  const [splitMode, setSplitMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, products(name))')
        .eq('id', orderId)
        .single();

      if (error) {
        showToast('خطأ في جلب بيانات الطلب', 'error');
        onClose();
      } else {
        setOrder(data);
      }
      setLoading(false);
    };

    fetchOrderDetails();
  }, [orderId]);

  useEffect(() => {
    if (order) {
      setSelectedItems(order.order_items.map((item: any) => ({ ...item, payQuantity: item.quantity })));
    }
  }, [order]);

  const calculateTotals = (itemsToCalculate: any[]) => {
    const subtotal = itemsToCalculate.reduce((sum, item) => sum + (Number(item.unit_price) * item.payQuantity), 0);
    const tax = subtotal * ((settings?.vatRate || settings?.vat_rate || 15) / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const currentTotals = useMemo(() => {
    if (!order) return { subtotal: 0, tax: 0, total: 0 };
    if (splitMode) {
      const itemsToCalculate = selectedItems.filter(item => item.payQuantity > 0);
      return calculateTotals(itemsToCalculate);
    } else {
      return {
        subtotal: Number(order.subtotal),
        tax: Number(order.total_tax),
        total: Number(order.grand_total)
      };
    }
  }, [splitMode, selectedItems, order, settings]);

  const handleItemQuantityChange = (itemId: string, change: number) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const maxAvailable = item.quantity;
        const newQty = Math.max(0, Math.min(maxAvailable, item.payQuantity + change));
        return { ...item, payQuantity: newQty };
      }
      return item;
    }));
  };

  const handleSelectAll = () => {
    if (!order) return;
    setSelectedItems(order.order_items.map((item: any) => ({ ...item, payQuantity: item.quantity })));
  };

  const handleClearAll = () => {
    setSelectedItems(prev => prev.map(item => ({ ...item, payQuantity: 0 })));
  };

  const handleProcessPayment = async () => {
    setSubmitting(true);
    try {
      // 1. تحديد حساب التحصيل (خزينة أو بنك)
      const paymentAccount = paymentMethod === 'CASH'
        ? getSystemAccount('CASH') 
        : getSystemAccount('BANK_ACCOUNTS');

      if (!paymentAccount) {
        throw new Error('يرجى التأكد من إعداد حسابات التحصيل (CASH, BANK_ACCOUNTS) في الإعدادات');
      }

      if (splitMode) {
        const itemsToPay = selectedItems.filter(item => item.payQuantity > 0);
        if (itemsToPay.length === 0) {
          throw new Error('الرجاء اختيار صنف واحد على الأقل للدفع.');
        }

        const splitItemsPayload = itemsToPay.map(i => ({ id: i.id, quantity: i.payQuantity }));
        const success = await processSplitPayment(
          orderId,
          splitItemsPayload,
          paymentMethod,
          currentTotals.total,
          paymentAccount.id
        );

        if (success) {
          showToast('تم الدفع الجزئي بنجاح', 'success');
          onSuccess();
          onClose();
        }
      } else {
        // 2. استخدام الدالة السيادية الموحدة (RPC) لإتمام العملية بالكامل في قاعدة البيانات
        await completeRestaurantOrder(
          orderId,
          paymentMethod,
          order.grand_total,
          paymentAccount.id,
          order.warehouse_id
        );

        showToast('تمت عملية الدفع وترحيل القيد بنجاح', 'success');
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      showToast(error.message || 'حدث خطأ أثناء المعالجة', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <Receipt size={24} />
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-800">إتمام الدفع</h3>
              <p className="text-sm text-slate-500 font-mono">{order.order_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {/* Split Toggle */}
          <div className="flex justify-center gap-2 mb-6">
            <button 
              onClick={() => setSplitMode(false)} 
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${!splitMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              دفع كامل
            </button>
            <button 
              onClick={() => setSplitMode(true)} 
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${splitMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              تقسيم الفاتورة
            </button>
          </div>

          {/* Items Selector for Split Mode */}
          {splitMode && (
            <div className="max-h-60 overflow-y-auto space-y-2 border p-3 rounded-2xl bg-slate-50 mb-6" dir="rtl">
              <div className="flex justify-between items-center px-1 mb-2 sticky top-0 bg-slate-50 z-10 py-1 border-b border-slate-200">
                <button type="button" onClick={handleSelectAll} className="text-xs font-black text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1">
                  <Plus size={12} /> اختيار الكل
                </button>
                <button type="button" onClick={handleClearAll} className="text-xs font-black text-red-600 hover:text-red-800 transition-colors flex items-center gap-1">
                  <X size={12} /> إلغاء الكل
                </button>
              </div>
              {order.order_items.map((originalItem: any) => {
                const item = selectedItems.find(si => si.id === originalItem.id) || originalItem;
                return (
                  <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-slate-800">{item.products?.name || item.name}</div>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="text-[10px] text-blue-600 font-medium">
                          {Array.isArray(item.modifiers) ? item.modifiers.map((m: any) => m.name).join(', ') : ''}
                        </div>
                      )}
                      <div className="text-xs text-slate-500">{(Number(item.unit_price) || 0).toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleItemQuantityChange(item.id, -1)} className="p-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"><Minus size={12} /></button>
                      <span className="font-bold w-6 text-center text-slate-800">{item.payQuantity || 0}</span>
                      <button onClick={() => handleItemQuantityChange(item.id, 1)} className="p-1 bg-emerald-100 text-emerald-600 rounded-full hover:bg-emerald-200 transition-colors"><Plus size={12} /></button>
                    </div>
                    <div className="font-bold w-20 text-left text-slate-800">{(Number(item.unit_price) * (item.payQuantity || 0)).toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Amount Display */}
          <div className="text-center mb-8">
            <span className="text-slate-500 text-sm font-bold block mb-1">
              {splitMode ? 'مجموع الأصناف المحددة للتحصيل' : 'المبلغ الإجمالي المطلوب'}
            </span>
            <div className="text-5xl font-black text-slate-900 tracking-tight">
              {Number(currentTotals.total).toFixed(2)} <span className="text-lg">ر.س</span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { id: 'CASH', label: 'نقدي', icon: Banknote, color: 'emerald' },
              { id: 'CARD', label: 'شبكة', icon: CreditCard, color: 'blue' },
              { id: 'WALLET', label: 'محفظة', icon: Wallet, color: 'purple' }
            ].map((method) => (
              <button
                key={method.id}
                onClick={() => setPaymentMethod(method.id as any)}
                className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                  paymentMethod === method.id 
                  ? `border-${method.color}-500 bg-${method.color}-50 text-${method.color}-700 shadow-inner` 
                  : 'border-slate-100 hover:border-slate-300 text-slate-500'
                }`}
              >
                <method.icon size={28} />
                <span className="font-bold text-sm">{method.label}</span>
              </button>
            ))}
          </div>

          {/* Submit Button */}
          <button
            disabled={submitting || (splitMode && currentTotals.total <= 0)}
            onClick={handleProcessPayment}
            className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 hover:bg-slate-800 active:scale-95 transition-all shadow-xl disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <CheckCircle2 />
                <span>تأكيد وتحصيل المبلغ</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
