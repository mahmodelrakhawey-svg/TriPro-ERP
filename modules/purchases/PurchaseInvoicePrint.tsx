import React from 'react';
import { tafqeet } from '../../utils/tafqeet';

interface PurchaseInvoicePrintProps {
  invoiceData: any;
  companySettings?: any;
}

export const PurchaseInvoicePrint: React.FC<PurchaseInvoicePrintProps> = ({ invoiceData, companySettings }) => {
  if (!invoiceData) return null;

  const items = invoiceData.items || invoiceData.purchase_invoice_items || [];
  const taxAmount = Number(invoiceData.taxAmount ?? invoiceData.tax_amount ?? 0);
  const totalAmount = Number(invoiceData.totalAmount ?? invoiceData.total_amount ?? 0);
  const paidAmount = Number(invoiceData.paidAmount ?? invoiceData.paid_amount ?? 0);
  const remainingAmount = Math.max(0, totalAmount - paidAmount);

  const hasItemDiscount = items.some((i: any) => Number(i.discount || i.discount_amount || 0) > 0);
  const itemsDiscountTotal = Number(invoiceData.itemsDiscountTotal ?? invoiceData.items_discount_amount ?? items.reduce((sum: number, it: any) => sum + (Number(it.discount || it.discount_amount || 0)), 0));
  const invoiceDiscount = Number(invoiceData.discountAmount ?? invoiceData.discount_amount ?? 0);
  const totalDiscount = Number(invoiceData.totalDiscount ?? (itemsDiscountTotal + invoiceDiscount));
  const grossTotal = Number(invoiceData.grossTotal ?? items.reduce((sum: number, it: any) => sum + ((Number(it.quantity) || 0) * (Number(it.unitPrice || it.unit_price) || 0)), 0));
  const taxableBase = Number(invoiceData.taxableBase ?? Math.max(0, grossTotal - totalDiscount));
  const subtotal = Number(invoiceData.subtotal ?? (grossTotal - itemsDiscountTotal));

  return (
    <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-8 text-black font-sans" dir="rtl" id="printable-purchase-invoice">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-purchase-invoice, #printable-purchase-invoice * { visibility: visible; }
          #printable-purchase-invoice { position: absolute; left: 0; top: 0; width: 100%; }
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
            <h1 className="text-3xl font-black text-slate-900 mb-1">فاتورة مشتريات</h1>
            <p className="text-base font-bold text-slate-500 uppercase tracking-widest">Purchase Invoice</p>
        </div>
        <div className="text-left">
             {companySettings?.logo_url ? (
                 <img src={companySettings.logo_url} alt="Logo" className="h-20 max-w-[140px] object-contain" />
             ) : (
                 <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-slate-400 font-bold border border-slate-300 rounded-lg">شعار</div>
             )}
        </div>
      </div>

      {/* Invoice Info Box */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 mb-6">
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">رقم الفاتورة</span>
            <span className="text-lg font-black font-mono text-emerald-700">{invoiceData.invoiceNumber || invoiceData.invoice_number}</span>
        </div>
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">تاريخ الفاتورة</span>
            <span className="text-base font-bold">{invoiceData.date || invoiceData.invoice_date}</span>
        </div>
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">المورد</span>
            <span className="text-base font-bold">{invoiceData.supplierName || invoiceData.suppliers?.name || '-'}</span>
        </div>
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">المستودع</span>
            <span className="text-base font-bold">{invoiceData.warehouseName || invoiceData.warehouses?.name || '-'}</span>
        </div>
        {invoiceData.notes && (
          <div className="col-span-4">
              <span className="block text-xs text-slate-500 font-bold mb-0.5">البيان / ملاحظات</span>
              <span className="text-sm text-slate-700">{invoiceData.notes}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <table className="w-full mb-6 text-right border border-slate-200">
        <thead className="bg-slate-100 border-b-2 border-slate-800 text-slate-800 font-bold text-sm">
            <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">اسم الصنف</th>
                <th className="py-2.5 px-3 text-center">الوحدة</th>
                <th className="py-2.5 px-3 text-center">الكمية</th>
                <th className="py-2.5 px-3 text-center">سعر الوحدة</th>
                {hasItemDiscount && <th className="py-2.5 px-3 text-center">خصم الصنف</th>}
                <th className="py-2.5 px-3 text-center">صافي القيمة</th>
            </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 text-sm">
            {items.map((item: any, index: number) => {
              const qty = Number(item.quantity || 0);
              const uPrice = Number(item.unitPrice || item.unit_price || 0);
              const disc = Number(item.discount || item.discount_amount || 0);
              const lineNet = Number(item.total || Math.max(0, (qty * uPrice) - disc));

              return (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="py-2 px-3 text-slate-500 font-bold">{index + 1}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">
                      {item.productName || item.name || item.products?.name || 'N/A'}
                      {Number(item.taxRate || item.tax_rate) > 0 && (
                        <span className="mr-1.5 text-[10px] text-emerald-700 font-bold border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 rounded">
                          (ضريبة {item.taxRate || item.tax_rate}%)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center text-slate-600">{item.uomName || item.uoms?.name || '-'}</td>
                    <td className="py-2 px-3 text-center font-bold text-emerald-700 font-mono">{qty.toLocaleString()}</td>
                    <td className="py-2 px-3 text-center font-mono">{uPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    {hasItemDiscount && (
                      <td className="py-2 px-3 text-center font-mono text-rose-700">
                        {disc > 0 ? `-${disc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                      </td>
                    )}
                    <td className="py-2 px-3 text-center font-bold text-slate-900 font-mono">{lineNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
        </tbody>
      </table>

      {/* Totals Section */}
      <div className="flex justify-between items-start mb-8">
        <div className="w-1/2 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div>
              <span className="block text-xs text-slate-500 font-bold mb-1">المبلغ بالحروف:</span>
              <p className="text-sm font-bold text-slate-800 leading-relaxed">
                فقط {tafqeet(totalAmount)} لا غير.
              </p>
            </div>
            {totalDiscount > 0 && (
              <div className="pt-2 border-t border-slate-200 text-xs text-rose-700 font-bold">
                إجمالي الخصم التجاري المكتسب: {totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}
              </div>
            )}
        </div>
        <div className="w-1/3 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
                <span>إجمالي الأصناف:</span>
                <span className="font-bold font-mono">{grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
            </div>
            {itemsDiscountTotal > 0 && (
              <div className="flex justify-between text-rose-600">
                  <span>إجمالي خصومات الأصناف:</span>
                  <span className="font-bold font-mono">-{itemsDiscountTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
              </div>
            )}
            {invoiceDiscount > 0 && (
              <div className="flex justify-between text-rose-700">
                  <span>خصم الفاتورة الإجمالي:</span>
                  <span className="font-bold font-mono">-{invoiceDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-700 border-t border-slate-200 pt-1">
                <span>الوعاء الخاضع للضريبة:</span>
                <span className="font-bold font-mono text-emerald-800">{taxableBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                  <span>ضريبة القيمة المضافة:</span>
                  <span className="font-bold font-mono text-emerald-700">+{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-black text-emerald-800 border-t-2 border-slate-800 pt-2">
                <span>إجمالي الفاتورة النهائي:</span>
                <span className="font-mono text-lg">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
            </div>
            {paidAmount > 0 && (
              <>
                <div className="flex justify-between text-slate-600">
                    <span>المدفوع (سداد فوري):</span>
                    <span className="font-bold font-mono text-emerald-700">-{paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
                </div>
                <div className="flex justify-between text-red-600 font-bold border-t border-slate-200 pt-1">
                    <span>المتبقي على الحساب:</span>
                    <span className="font-mono">{remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
                </div>
              </>
            )}
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-8 pt-10 border-t border-slate-200 text-center text-xs font-bold text-slate-600 mt-12">
          <div>
              <p className="mb-8">مسؤول الاستلام بالمستودع</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
          </div>
          <div>
              <p className="mb-8">الحسابات والمراجعة</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
          </div>
          <div>
              <p className="mb-8">المدير المالي / الاعتماد</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
          </div>
      </div>
    </div>
  );
};
