import React from 'react';
import { tafqeet } from '../../utils/tafqeet';

interface SalesInvoicePrintProps {
  invoice: any;
  companySettings?: any;
}

export const SalesInvoicePrint = ({ invoice, companySettings }: SalesInvoicePrintProps) => {
  if (!invoice) return null;

  return (
    <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-8 text-black font-sans" dir="rtl" id="printable-invoice">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-invoice, #printable-invoice * { visibility: visible; }
          #printable-invoice { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
        <div className="text-right">
            <h2 className="text-2xl font-bold text-slate-900">{companySettings?.company_name || 'اسم الشركة'}</h2>
            <p className="text-sm text-slate-600 mt-1">{companySettings?.address || 'العنوان'}</p>
            <p className="text-sm text-slate-600">{companySettings?.phone || 'الهاتف'}</p>
            {companySettings?.tax_number && <p className="text-sm text-slate-600">رقم ضريبي: {companySettings.tax_number}</p>}
        </div>
        <div className="text-center">
            <h1 className="text-3xl font-black text-slate-900 mb-2">فاتورة ضريبية</h1>
            <p className="text-lg font-bold text-slate-500 uppercase tracking-widest">Tax Invoice</p>
        </div>
        <div className="text-left">
             {companySettings?.logo_url ? (
                 <img src={companySettings.logo_url} alt="Logo" className="h-24 max-w-[150px] object-contain" />
             ) : (
                 <div className="w-24 h-24 bg-slate-100 flex items-center justify-center text-slate-400 font-bold border border-slate-300 rounded-lg">Logo</div>
             )}
        </div>
      </div>

      {/* Invoice Info */}
      <div className="flex justify-between mb-8">
        <div className="flex gap-8">
            <div>
                <span className="block text-xs text-slate-500 font-bold mb-1">رقم الفاتورة</span>
                <span className="text-xl font-black font-mono">{invoice.invoiceNumber}</span>
            </div>
            <div>
                <span className="block text-xs text-slate-500 font-bold mb-1">التاريخ</span>
                <span className="text-xl font-bold">{invoice.date}</span>
            </div>
            <div>
                <span className="block text-xs text-slate-500 font-bold mb-1">العميل</span>
                <span className="text-lg font-bold">{invoice.customerName}</span>
            </div>
        </div>
        <div className="text-left">
             <span className="block text-xs text-slate-500 font-bold mb-1">حالة الفاتورة</span>
             <span className="text-lg font-bold">{invoice.status === 'paid' ? 'مدفوعة' : invoice.status === 'posted' ? 'مرحلة' : 'مسودة'}</span>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-8 text-right">
        <thead className="bg-slate-100 border-y-2 border-slate-800">
            <tr>
                <th className="py-3 px-4 font-bold text-slate-800">#</th>
                <th className="py-3 px-4 font-bold text-slate-800">الصنف</th>
                <th className="py-3 px-4 font-bold text-slate-800 text-center">الكمية</th>
                <th className="py-3 px-4 font-bold text-slate-800 text-center">السعر</th>
                <th className="py-3 px-4 font-bold text-slate-800 text-center">الإجمالي</th>
            </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
            {invoice.items?.map((item: any, index: number) => (
                <tr key={index}>
                    <td className="py-3 px-4">{index + 1}</td>
                    <td className="py-3 px-4 font-bold">{item.productName || item.products?.name}</td>
                    <td className="py-3 px-4 text-center">{item.quantity}</td>
                    <td className="py-3 px-4 text-center">{Number(item.unitPrice || item.price).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center font-bold">{Number(item.total).toLocaleString()}</td>
                </tr>
            ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-1/3 space-y-2">
            <div className="flex justify-between text-slate-600">
                <span>الإجمالي قبل الضريبة:</span>
                <span className="font-bold">{Number(invoice.subtotal).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-600">
                <span>ضريبة القيمة المضافة (15%):</span>
                <span className="font-bold">{Number(invoice.taxAmount).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-900 text-xl font-black border-t-2 border-slate-800 pt-2">
                <span>الإجمالي النهائي:</span>
                <span>{Number(invoice.totalAmount).toLocaleString()} EGP</span>
            </div>
            <div className="text-center pt-2 border-t border-slate-200 mt-2">
                <p className="text-sm font-bold text-slate-600">{tafqeet(Number(invoice.totalAmount), 'EGP')}</p>
            </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-8 border-t border-slate-200 text-center text-xs text-slate-400">
        <p>شكراً لتعاملكم معنا</p>
        <p className="mt-1">{new Date().toLocaleString('ar-EG')}</p>
      </div>
    </div>
  );
};