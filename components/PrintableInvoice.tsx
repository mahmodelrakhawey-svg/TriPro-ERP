import React from 'react';
import type { ActiveOrder } from './PosScreen';
import type { SystemSettings } from '../types';

interface PrintableInvoiceProps {
  order: ActiveOrder | null;
  settings: SystemSettings;
  isProforma?: boolean;
}

export const PrintableInvoice = React.forwardRef<HTMLDivElement, PrintableInvoiceProps>(({ order, settings, isProforma }, ref) => {
  if (!order) return null;

  const subtotal = order.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  const tax = subtotal * (((settings as any).vatRate || 15) / 100);
  const total = subtotal + tax;

  return (
    <div ref={ref} className="p-4 text-black bg-white w-[300px]" dir="rtl">
      {isProforma && (
        <div className="text-center border-2 border-dashed border-slate-400 p-1 mb-4 font-black bg-slate-100">
          فاتورة تجريبية - مراجعة طلب
        </div>
      )}
      <div className="text-center mb-4">
        {(settings as any).logoUrl && <img src={(settings as any).logoUrl} alt="Logo" className="w-24 h-auto mx-auto mb-2" />}
        <h2 className="text-xl font-bold">{isProforma ? 'مسودة طلب' : (settings as any).companyName}</h2>
        <p className="text-xs">{(settings as any).address}</p>
        <p className="text-xs">الرقم الضريبي: {(settings as any).taxNumber}</p>
      </div>
      
      <div className="mb-4 text-xs">
        <p><strong>الطاولة:</strong> {order.tableName}</p>
        <p><strong>التاريخ:</strong> {new Date().toLocaleString('ar-EG')}</p>
        {/* In a real scenario, we'd have an order number here from the DB */}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b-2 border-dashed border-black">
            <th className="text-right pb-1">الصنف</th>
            <th className="text-center pb-1">الكمية</th>
            <th className="text-center pb-1">السعر</th>
            <th className="text-left pb-1">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <React.Fragment key={`${item.productId}-${index}`}>
              <tr className={(item.selectedModifiers?.length || item.notes) ? "" : "border-b border-dashed border-gray-400"}>
                <td className="py-1 font-semibold">{item.name}</td>
                <td className="text-center py-1">{item.quantity}</td>
                <td className="text-center py-1">{item.unitPrice.toFixed(2)}</td>
                <td className="text-left py-1">{(item.unitPrice * item.quantity).toFixed(2)}</td>
              </tr>
              {(item.selectedModifiers?.length || item.notes) && (
                <tr className="border-b border-dashed border-gray-400">
                  <td colSpan={4} className="pb-1 pr-2 text-[10px] text-gray-600 leading-tight">
                    {item.selectedModifiers?.map((m, i) => <div key={i}>+ {m.name}</div>)}
                    {item.notes && <div className="text-red-700 italic">ملاحظة: {item.notes}</div>}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <div className="mt-4 text-xs">
        <div className="flex justify-between">
          <span>المجموع الفرعي:</span>
          <span>{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>الضريبة ({(settings as any).vatRate || 15}%):</span>
          <span>{tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-sm mt-2 border-t-2 border-dashed border-black pt-1">
          <span>الإجمالي:</span>
          <span>{total.toFixed(2)} {(settings as any).currency}</span>
        </div>
      </div>

      <div className="text-center text-xs mt-4">
        <p>{(settings as any).footerText || 'شكراً لزيارتكم!'}</p>
      </div>
    </div>
  );
});