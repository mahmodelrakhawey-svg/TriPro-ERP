import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../context/AccountingContext';
import type { ActiveOrder } from './OrderSummary';
import { Utensils } from 'lucide-react';

const CustomerDisplay = () => {
  const { settings } = useAccounting();
  const [order, setOrder] = useState<ActiveOrder | null>(null);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'tripro-customer-display-order') {
        try {
          const newOrder = event.newValue ? JSON.parse(event.newValue) : null;
          setOrder(newOrder);
        } catch (e) {
          console.error("Failed to parse order from localStorage", e);
          setOrder(null);
        }
      }
    };

    // تحميل الطلب الأولي عند فتح الشاشة
    try {
        const initialOrder = localStorage.getItem('tripro-customer-display-order');
        if(initialOrder) setOrder(JSON.parse(initialOrder));
    } catch(e) {
        console.error("Failed to parse initial order", e);
    }

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const totals = useMemo(() => {
    if (!order) return { subtotal: 0, tax: 0, total: 0 };
    const subtotal = order.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const discountAmount = order.discount?.type === 'fixed' ? order.discount.value : subtotal * ((order.discount?.value || 0) / 100);
    const loyaltyDiscountAmount = order.loyaltyDiscount?.amount || 0;
    const subtotalAfterDiscount = subtotal - discountAmount - loyaltyDiscountAmount;
    const tax = subtotalAfterDiscount * ((settings.vatRate || 15) / 100);
    const total = subtotalAfterDiscount + tax + (order.deliveryFee || 0);
    return { subtotal, tax, total };
  }, [order, settings.vatRate]);

  return (
    <div className="bg-blue-900 text-white h-screen flex flex-col p-8 font-sans" dir="rtl">
      {/* Header */}
      <header className="flex justify-between items-center pb-4 border-b-2 border-blue-700">
        <div>
          <h1 className="text-4xl font-black">{settings.companyName || 'مرحباً بك'}</h1>
          <p className="text-blue-300 text-lg">{settings.footerText || 'شكراً لزيارتكم'}</p>
        </div>
        {settings.logoUrl && <img src={settings.logoUrl} alt="Logo" className="w-24 h-24 object-contain" />}
      </header>

      {/* Body */}
      {!order || order.items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-48 h-48 bg-blue-800 rounded-full flex items-center justify-center mb-6 animate-pulse">
            <Utensils size={80} className="text-blue-600" />
          </div>
          <h2 className="text-5xl font-bold">أهلاً وسهلاً</h2>
          <p className="text-2xl text-blue-300 mt-2">الكاشير سيقوم بإضافة طلباتك الآن</p>
        </div>
      ) : (
        <div className="flex-1 flex pt-6 overflow-hidden">
          {/* Items List */}
          <div className="w-2/3 pr-6 border-l-2 border-blue-700 overflow-y-auto">
            <table className="w-full text-2xl">
              <thead>
                <tr className="border-b border-blue-700">
                  <th className="text-right pb-4">الصنف</th>
                  <th className="text-center pb-4">الكمية</th>
                  <th className="text-left pb-4">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => (
                  <tr key={(item as any).localId || (item as any).id || index} className="animate-in fade-in slide-in-from-bottom-4">
                    <td className="py-4 font-bold">{item.name}</td>
                    <td className="text-center font-mono font-bold">{item.quantity}</td>
                    <td className="text-left font-mono font-bold">{(item.unitPrice * item.quantity).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="w-1/3 pl-6 flex flex-col justify-end">
            <div className="space-y-4 text-3xl">
              <div className="flex justify-between"><span className="text-blue-300">المجموع:</span><span className="font-bold">{totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-blue-300">الضريبة:</span><span className="font-bold">{totals.tax.toFixed(2)}</span></div>
              <div className="flex justify-between items-center text-7xl font-black pt-4 border-t-2 border-blue-500 mt-4"><span className="text-blue-200">الإجمالي:</span><span className="text-emerald-400">{totals.total.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDisplay;