import React from 'react';
import type { ActiveOrder } from './OrderSummary';
import type { SystemSettings } from '../types';

interface PrintableInvoiceProps {
  order: ActiveOrder | null;
  settings: SystemSettings;
  isProforma?: boolean;
}

export const PrintableInvoice = React.forwardRef<HTMLDivElement, PrintableInvoiceProps>(({ order, settings, isProforma }, ref) => {
  if (!order) return <div ref={ref} className="hidden" />;

  const subtotal = order.items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
  const modifiersTotal = order.items.reduce((sum, item) => sum + (((Number(item.unitPrice) || 0) - (Number(item.price) || 0)) * (Number(item.quantity) || 0)), 0);
  const subtotalWithModifiers = subtotal + modifiersTotal;
  const discountAmount = order.discount?.type === 'fixed' ? (Number(order.discount.value) || 0) : subtotalWithModifiers * ((Number(order.discount?.value) || 0) / 100);
  const loyaltyDiscountAmount = order.loyaltyDiscount?.amount || 0;
  const subtotalAfterDiscount = subtotalWithModifiers - discountAmount - loyaltyDiscountAmount;
  const taxRate = (settings as any).vatRate || 15;
  const tax = subtotalAfterDiscount * (taxRate / 100);
  const total = subtotalAfterDiscount + tax + (order.deliveryFee || 0);
  const date = new Date().toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div ref={ref} className="p-4 text-black bg-white w-[80mm] font-sans text-xs leading-tight" dir="rtl">
      {isProforma && (
        <div className="text-center border-2 border-black p-1 mb-2 font-black text-sm uppercase">
          ** شيك مراجعة (CHECK) **
        </div>
      )}
      
      {/* Header */}
      <div className="text-center border-b-2 border-black pb-2 mb-2">
        {(settings as any).logoUrl && <img src={(settings as any).logoUrl} alt="Logo" className="w-24 h-auto mx-auto mb-2 object-contain" />}
        <h2 className="text-xl font-black mb-1">{(settings as any).companyName}</h2>
        <p className="text-[10px] mb-1">{(settings as any).address}</p>
        <p className="font-bold border border-black inline-block px-2 rounded-md">الرقم الضريبي: <span dir="ltr" className="font-mono">{(settings as any).taxNumber}</span></p>
      </div>
      
      {/* Invoice Info */}
      <div className="flex justify-between mb-2">
        <div>
          <p>رقم الفاتورة: <span className="font-bold font-mono">#{order.orderId ? order.orderId.slice(0, 8) : 'NEW'}</span></p>
          <p>التاريخ: <span dir="ltr" className="font-mono">{date}</span></p>
        </div>
        <div className="text-left">
          <p>الطاولة: <span className="font-bold text-sm border border-black px-1 rounded">{order.tableName}</span></p>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-2">
        <thead>
          <tr className="border-t border-b border-black">
            <th className="py-1 text-right w-[45%]">الصنف</th>
            <th className="py-1 text-center w-[15%]">الكمية</th>
            <th className="py-1 text-center w-[20%]">سعر</th>
            <th className="py-1 text-left w-[20%]">مجموع</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <React.Fragment key={`${item.productId}-${index}`}>
              <tr>
                <td className="py-1 font-bold">{item.name}</td>
                <td className="text-center font-mono">{Number(item.quantity || 0)}</td>
                <td className="text-center font-mono">{(Number(item.unitPrice) || 0).toFixed(2)}</td>
                <td className="text-left font-bold font-mono">{((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)).toFixed(2)}</td>
              </tr>
              {/* Modifiers & Notes */}
              {(item.selectedModifiers?.length || item.notes) && (
                <tr>
                  <td colSpan={4} className="pb-1 pr-2 text-[10px] text-gray-600">
                    {item.selectedModifiers?.map((m, i) => <span key={i} className="ml-1">+ {m.name}</span>)}
                    {item.notes && <div className="italic">*{item.notes}</div>}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="border-t border-black pt-2 space-y-1">
        <div className="flex justify-between font-semibold">
          <span>المجموع (غير شامل الضريبة):</span>
          <span className="font-mono">{subtotalWithModifiers.toFixed(2)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>الخصم:</span>
            <span className="font-mono">-{discountAmount.toFixed(2)}</span>
          </div>
        )}
        {loyaltyDiscountAmount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>خصم ولاء ({order.loyaltyDiscount?.points} نقطة):</span>
            <span className="font-mono">-{loyaltyDiscountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>ضريبة القيمة المضافة ({taxRate}%):</span>
          <span className="font-mono">{tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base font-bold border-t border-dashed border-gray-400 pt-1 mt-1">
          <span>الإجمالي النهائي:</span>
          <span className="font-mono">{total.toFixed(2)} {(settings as any).currency || 'SAR'}</span>
        </div>
      </div>

      {/* Footer / QR Placeholder */}
      <div className="text-center mt-4 pt-2 border-t border-black">
        <div className="mx-auto w-24 h-24 border-2 border-black flex items-center justify-center mb-2">
          <span className="text-[8px] text-center">QR Code Area<br/>(ZATCA Compatible)</span>
        </div>
        <p className="font-bold text-sm">{(settings as any).footerText || 'شكراً لزيارتكم!'}</p>
        <p className="text-[8px] mt-1">يرجى الاحتفاظ بالفاتورة للاستبدال أو الاسترجاع</p>
      </div>
    </div>
  );
});