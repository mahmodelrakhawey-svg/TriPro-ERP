import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAccounting } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';
import { X, CreditCard, Banknote, Wallet, CheckCircle2, Loader2, Receipt } from 'lucide-react';

interface Props {
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const PaymentModal: React.FC<Props> = ({ orderId, onClose, onSuccess }) => {
  const { completeRestaurantOrder, getSystemAccount, currentSelectedOrgId } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'WALLET'>('CASH');

  useEffect(() => {
    const fetchOrderDetails = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
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

      // 2. استخدام الدالة السيادية الموحدة (RPC) لإتمام العملية بالكامل في قاعدة البيانات
      // هذا يضمن (تحديث الطلب + تسجيل الدفع + إنشاء القيد + إغلاق الطاولة) في خطوة واحدة آمنة
      await completeRestaurantOrder(
        orderId,
        paymentMethod,
        order.grand_total,
        paymentAccount.id
      );

      showToast('تمت عملية الدفع وترحيل القيد بنجاح', 'success');
      onSuccess();
      onClose();
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
          {/* Amount Display */}
          <div className="text-center mb-8">
            <span className="text-slate-500 text-sm font-bold block mb-1">المبلغ الإجمالي المطلوب</span>
            <div className="text-5xl font-black text-slate-900 tracking-tight">
              {Number(order.grand_total).toFixed(2)} <span className="text-lg">ر.س</span>
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
            disabled={submitting}
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
