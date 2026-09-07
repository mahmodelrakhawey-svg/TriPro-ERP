import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { generateZatcaTlvQrString } from '../utils/zatcaQrHelper';
import type { ActiveOrder } from '../modules/restaurant/components/POS/OrderSummary';
import type { SystemSettings } from '../types';

interface PrintableInvoiceProps {
  order: ActiveOrder | null;
  settings: SystemSettings;
  isProforma?: boolean;
}

export const PrintableInvoice = React.forwardRef<HTMLDivElement, PrintableInvoiceProps>(({ order, settings, isProforma }, ref) => {
  if (!order) return <div ref={ref} className="hidden" />;

  const subtotal = order.items.reduce((sum, item) => sum + (Number(item.price ?? item.unitPrice ?? 0) * (Number(item.quantity) || 0)), 0);
  const modifiersTotal = order.items.reduce((sum, item) => sum + ((Number(item.unitPrice || 0) - Number(item.price ?? item.unitPrice ?? 0)) * (Number(item.quantity) || 0)), 0);
  const subtotalWithModifiers = subtotal + modifiersTotal;
  const discountAmount = order.discount?.type === 'fixed' ? (Number(order.discount.value) || 0) : subtotalWithModifiers * ((Number(order.discount?.value) || 0) / 100);
  const loyaltyDiscountAmount = order.loyaltyDiscount?.amount || 0;
  const subtotalAfterDiscount = subtotalWithModifiers - discountAmount - loyaltyDiscountAmount;

  // Service Charge
  const globalServiceEnabled = (settings as any).enableServiceCharge !== false && (settings as any).enable_service_charge !== false && (Boolean((settings as any).enableServiceCharge) || Boolean((settings as any).enable_service_charge));
  const isServiceEnabled = order.serviceChargeEnabled !== undefined ? order.serviceChargeEnabled : globalServiceEnabled;
  const serviceRate = isServiceEnabled ? ((settings as any).serviceChargeRate ?? (settings as any).service_charge_rate ?? 12) : 0;
  const serviceCharge = isServiceEnabled ? subtotalAfterDiscount * (serviceRate / 100) : 0;

  // Tax
  const isTaxEnabled = order.taxEnabled !== undefined ? order.taxEnabled : ((settings as any).enableTax !== false && (settings as any).enable_tax !== false);
  const taxRate = isTaxEnabled ? ((settings as any).vatRate ?? 14) : 0;
  const tax = isTaxEnabled ? (subtotalAfterDiscount + serviceCharge) * (taxRate / 100) : 0;
  const total = subtotalAfterDiscount + serviceCharge + tax + (order.deliveryFee || 0);

  const zatcaQrPayload = generateZatcaTlvQrString({
    sellerName: (settings as any).company_name || (settings as any).companyName || 'المطعم',
    taxNumber: (settings as any).tax_number || (settings as any).taxNumber || '300000000000003',
    invoiceDate: new Date().toISOString(),
    totalAmount: total,
    taxAmount: tax
  });

  return (
    <div ref={ref} className="p-4 bg-white text-black font-sans text-xs w-[80mm] mx-auto select-none print:w-[80mm] print:p-2" dir="rtl">
      {/* Header */}
      <div className="text-center border-b border-black pb-2 mb-2">
        <h1 className="font-bold text-base">{(settings as any).company_name || (settings as any).companyName || 'اسم المطعم'}</h1>
        <p className="text-[10px]">{(settings as any).address || ''}</p>
        <p className="text-[10px]">{(settings as any).phone || ''}</p>
        {((settings as any).tax_number || (settings as any).taxNumber) && (
          <p className="text-[10px] font-mono">الرقم الضريبي: {(settings as any).tax_number || (settings as any).taxNumber}</p>
        )}
        <h2 className="font-bold text-sm mt-1 border-t border-dashed border-gray-400 pt-1">
          {isProforma ? 'بون فحص حساب (غير خاضع للضريبة)' : 'فاتورة ضريبية مبسطة (Simplified Tax Invoice)'}
        </h2>
      </div>

      {/* Meta Info */}
      <div className="flex justify-between text-[10px] mb-2 border-b border-dashed border-gray-400 pb-1">
        <div>
          <span>رقم الطلب: </span>
          <span className="font-bold">{order.orderNumber || order.orderId?.slice(0, 8) || 'جديد'}</span>
        </div>
        <div>
          <span>التاريخ: </span>
          <span>{new Date().toLocaleDateString('ar-EG')}</span>
        </div>
      </div>

      {order.tableName && (
        <div className="text-[10px] mb-2">
          <span>الطاولة: </span>
          <span className="font-bold">{order.tableName}</span>
        </div>
      )}

      {/* Items Table */}
      <table className="w-full text-right mb-2 text-[10px]">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1">الصنف</th>
            <th className="py-1 text-center">الكمية</th>
            <th className="py-1 text-left">السعر</th>
            <th className="py-1 text-left">الإجمالي</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {order.items.map((item, idx) => {
            const itemTotal = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0);
            return (
              <tr key={idx}>
                <td className="py-1">
                  <span className="font-bold">{item.name}</span>
                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                    <div className="text-[8px] text-gray-500">
                      {item.selectedModifiers.map(m => m.name).join(', ')}
                    </div>
                  )}
                  {item.notes && (
                    <div className="text-[8px] text-red-500 italic">
                      ملاحظة: {item.notes}
                    </div>
                  )}
                </td>
                <td className="py-1 text-center font-bold">{item.quantity}</td>
                <td className="py-1 text-left font-mono">{(Number(item.unitPrice) || 0).toFixed(2)}</td>
                <td className="py-1 text-left font-mono">{itemTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="border-t border-black pt-2 space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span>المجموع الفرعي:</span>
          <span className="font-mono">{subtotalWithModifiers.toFixed(2)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>الخصم:</span>
            <span className="font-mono">-{discountAmount.toFixed(2)}</span>
          </div>
        )}
        {loyaltyDiscountAmount > 0 && (
          <div className="flex justify-between text-indigo-600">
            <span>خصم نقاط الولاء:</span>
            <span className="font-mono">-{loyaltyDiscountAmount.toFixed(2)}</span>
          </div>
        )}
        {isServiceEnabled && (
          <div className="flex justify-between">
            <span>خدمة الصالة ({serviceRate}%):</span>
            <span className="font-mono">{serviceCharge.toFixed(2)}</span>
          </div>
        )}
        {isTaxEnabled && (
          <div className="flex justify-between">
            <span>ضريبة القيمة المضافة ({taxRate}%):</span>
            <span className="font-mono">{tax.toFixed(2)}</span>
          </div>
        )}
        {order.deliveryFee ? (
          <div className="flex justify-between">
            <span>رسوم التوصيل:</span>
            <span className="font-mono">{order.deliveryFee.toFixed(2)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-sm font-bold border-t border-dashed border-gray-400 pt-1 mt-1">
          <span>الإجمالي النهائي:</span>
          <span className="font-mono">{total.toFixed(2)} {(settings as any).currency || 'EGP'}</span>
        </div>
      </div>

      {/* Footer / QR Code */}
      <div className="text-center mt-4 pt-2 border-t border-black">
        <div className="mx-auto w-24 h-24 flex items-center justify-center mb-2 p-1 bg-white">
          <QRCodeSVG value={zatcaQrPayload} size={88} level="M" />
        </div>
        <p className="font-bold text-sm">{(settings as any).footerText || 'شكراً لزيارتكم!'}</p>
        <p className="text-[8px] mt-1">يرجى الاحتفاظ بالفاتورة للاستبدال أو الاسترجاع</p>
      </div>
    </div>
  );
});

PrintableInvoice.displayName = 'PrintableInvoice';