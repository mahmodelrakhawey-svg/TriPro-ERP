import React from 'react';
import { tafqeet } from '../../utils/tafqeet';

interface SalesOrderPrintProps {
  orderData: any;
  companySettings?: any;
}

export const SalesOrderPrint: React.FC<SalesOrderPrintProps> = ({ orderData, companySettings }) => {
  if (!orderData) return null;

  const items = orderData.items || orderData.sales_order_items || [];
  const taxAmount = Number(orderData.taxAmount ?? orderData.tax_amount ?? 0);
  const totalAmount = Number(orderData.totalAmount ?? orderData.total_amount ?? 0);
  const subtotal = totalAmount - taxAmount;

  return (
    <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-8 text-black font-sans" dir="rtl" id="printable-sales-order">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-sales-order, #printable-sales-order * { visibility: visible; }
          #printable-sales-order { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
        <div className="text-right">
            <h2 className="text-2xl font-bold text-slate-900">{companySettings?.company_name || 'اسم الشركة'}</h2>
            <p className="text-sm text-slate-600 mt-1">{companySettings?.address || 'العنوان'}</p>
            <p className="text-sm text-slate-600">{companySettings?.phone || 'الهاتف'}</p>
            {companySettings?.tax_number && <p className="text-sm text-slate-600">رقم ضريبي: {companySettings.tax_number}</p>}
        </div>
        <div className="text-center">
            <h1 className="text-3xl font-black text-slate-900 mb-1">أمر بيع وتعميد (Sales Order)</h1>
            <p className="text-base font-bold text-slate-500 uppercase tracking-widest">Confirmed Sales & Delivery Order</p>
        </div>
        <div className="text-left">
             {companySettings?.logo_url ? (
                 <img src={companySettings.logo_url} alt="Logo" className="h-20 max-w-[140px] object-contain" />
             ) : (
                 <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-slate-400 font-bold border border-slate-300 rounded-lg">شعار</div>
             )}
        </div>
      </div>

      {/* Order Info Box */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 mb-6">
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">رقم أمر البيع</span>
            <span className="text-lg font-black font-mono text-blue-700">{orderData.orderNumber || orderData.order_number}</span>
        </div>
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">تاريخ الأمر</span>
            <span className="text-base font-bold">{orderData.date || orderData.order_date}</span>
        </div>
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">العميل</span>
            <span className="text-base font-bold">{orderData.customerName || orderData.customers?.name || '-'}</span>
        </div>
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">تاريخ التسليم المتوقع</span>
            <span className="text-base font-bold text-blue-700">{orderData.deliveryDate || orderData.expected_delivery_date || 'غير محدد'}</span>
        </div>
        {orderData.notes && (
          <div className="col-span-4">
              <span className="block text-xs text-slate-500 font-bold mb-0.5">شروط التجهيز والتسليم والملاحظات</span>
              <span className="text-sm text-slate-700">{orderData.notes}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <table className="w-full mb-6 text-right border border-slate-200">
        <thead className="bg-slate-100 border-b-2 border-slate-800 text-slate-800 font-bold text-sm">
            <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">اسم الصنف المطلوب</th>
                <th className="py-2.5 px-3 text-center">الوحدة</th>
                <th className="py-2.5 px-3 text-center">الكمية</th>
                <th className="py-2.5 px-3 text-center">السعر المعتمد</th>
                <th className="py-2.5 px-3 text-center">إجمالي القيمة</th>
            </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 text-sm">
            {items.map((item: any, index: number) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="py-2 px-3 text-slate-500 font-bold">{index + 1}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{item.name || item.productName || item.products?.name || 'N/A'}</td>
                    <td className="py-2 px-3 text-center text-slate-600">{item.uomName || item.uoms?.name || '-'}</td>
                    <td className="py-2 px-3 text-center font-bold text-blue-700 font-mono">{Number(item.quantity || 0).toLocaleString()}</td>
                    <td className="py-2 px-3 text-center font-mono">{Number(item.unitPrice || item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-center font-bold text-slate-900 font-mono">{Number(item.total || ((item.quantity || 0) * (item.unitPrice || item.unit_price || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
            ))}
        </tbody>
      </table>

      {/* Totals Section */}
      <div className="flex justify-between items-start mb-8">
        <div className="w-1/2 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <span className="block text-xs text-slate-500 font-bold mb-1">المبلغ بالحروف:</span>
            <p className="text-sm font-bold text-slate-800 leading-relaxed">
              فقط {tafqeet(totalAmount)} لا غير.
            </p>
        </div>
        <div className="w-1/3 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
                <span>الإجمالي قبل الضريبة:</span>
                <span className="font-bold font-mono">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                  <span>ضريبة القيمة المضافة:</span>
                  <span className="font-bold font-mono">{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-black text-blue-800 border-t-2 border-slate-800 pt-2">
                <span>إجمالي أمر البيع:</span>
                <span className="font-mono">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
            </div>
        </div>
      </div>

      {/* Signatures & Confirmation */}
      <div className="grid grid-cols-3 gap-8 pt-10 border-t border-slate-200 text-center text-xs font-bold text-slate-600 mt-12">
          <div>
              <p className="mb-8">مسؤول المبيعات والتعميد</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
          </div>
          <div>
              <p className="mb-8">توجيه التخطيط والمستودعات</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
          </div>
          <div>
              <p className="mb-8">توقيع وختم العميل بالاستلام</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
          </div>
      </div>
    </div>
  );
};
