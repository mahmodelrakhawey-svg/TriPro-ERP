import { tafqeet } from '../../utils/tafqeet';
import { QRCodeSVG } from 'qrcode.react';
import { generateZatcaTlvQrString } from '../../utils/zatcaQrHelper';

interface SalesInvoicePrintProps {
  invoice: any;
  companySettings?: any;
}

export const SalesInvoicePrint = ({ invoice, companySettings }: SalesInvoicePrintProps) => {
  if (!invoice) return null;

  // استخراج وتوحيد بنود الأصناف من أي صيغة تأتي بها الفاتورة
  const rawItems = invoice.items || invoice.invoice_items || [];
  const itemsList = rawItems.map((item: any) => {
    const pName = item.productName || item.product_name || item.products?.name || item.name || 'صنف';
    const uName = item.uomName || item.uom_name || item.uoms?.name || item.products?.uoms?.name || '-';
    const qty = Number(item.quantity || 0);
    const price = Number(item.unitPrice ?? item.unit_price ?? item.price ?? 0);
    const tot = Number(item.total ?? (qty * price));

    return {
      productName: pName,
      uomName: uName,
      quantity: qty,
      unitPrice: price,
      total: tot
    };
  });

  const isThermal = Boolean(invoice.isThermal);
  const currency = invoice.currency || 'EGP';
  const totalAmount = Number(invoice.totalAmount || invoice.total_amount || 0);
  const subtotal = Number(invoice.subtotal || (totalAmount - Number(invoice.taxAmount || invoice.tax_amount || 0)));
  const taxAmount = Number(invoice.taxAmount || invoice.tax_amount || 0);

  return (
    <div 
      className={`hidden print:block fixed inset-0 bg-white z-[9999] p-8 text-black font-sans ${isThermal ? 'max-w-[80mm] p-2 text-xs' : 'max-w-4xl mx-auto'}`} 
      dir="rtl" 
      id="printable-invoice"
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-invoice, #printable-invoice * { visibility: visible; }
          #printable-invoice { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      
      {/* Header */}
      <div className={`flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-6 ${isThermal ? 'flex-col items-center text-center gap-2' : ''}`}>
        <div className={isThermal ? 'text-center' : 'text-right'}>
            <h2 className="text-2xl font-black text-slate-900">{companySettings?.company_name || 'اسم الشركة'}</h2>
            <p className="text-xs text-slate-600 mt-1">{companySettings?.address || 'العنوان'}</p>
            <p className="text-xs text-slate-600">{companySettings?.phone || 'الهاتف'}</p>
            {companySettings?.tax_number && <p className="text-xs text-slate-600 font-bold">الرقم الضريبي: {companySettings.tax_number}</p>}
        </div>
        <div className="text-center">
            <h1 className="text-2xl font-black text-slate-900 mb-1">فاتورة ضريبية</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tax Invoice</p>
        </div>
        {!isThermal && (
          <div className="text-left">
               {companySettings?.logo_url ? (
                   <img src={companySettings.logo_url} alt="Logo" className="h-20 max-w-[140px] object-contain" />
               ) : (
                   <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-slate-400 font-bold border border-slate-300 rounded-lg">Logo</div>
               )}
          </div>
        )}
      </div>

      {/* Invoice Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 mb-6 text-xs">
        <div>
            <span className="block text-slate-500 font-bold mb-0.5">رقم الفاتورة:</span>
            <span className="text-sm font-black font-mono text-slate-900">{invoice.invoiceNumber || invoice.invoice_number || 'مسودة'}</span>
        </div>
        <div>
            <span className="block text-slate-500 font-bold mb-0.5">التاريخ:</span>
            <span className="text-sm font-bold text-slate-900">{invoice.date || invoice.invoice_date || new Date().toISOString().split('T')[0]}</span>
        </div>
        <div>
            <span className="block text-slate-500 font-bold mb-0.5">العميل:</span>
            <span className="text-sm font-bold text-slate-900">{invoice.customerName || invoice.customers?.name || invoice.customer_name || 'عميل نقدي'}</span>
        </div>
        <div>
             <span className="block text-slate-500 font-bold mb-0.5">حالة الفاتورة:</span>
             <span className="text-sm font-black text-slate-900">
                {invoice.status === 'paid' ? 'مدفوعة' : invoice.status === 'posted' ? 'مرحلة' : 'مسودة'}
             </span>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-6 text-right text-xs border-collapse">
        <thead className="bg-slate-100 border-y-2 border-slate-800">
            <tr>
                <th className="py-2.5 px-3 font-black text-slate-800 w-10 text-center">#</th>
                <th className="py-2.5 px-3 font-black text-slate-800">الصنف / البيان</th>
                <th className="py-2.5 px-3 font-black text-slate-800 text-center">الوحدة</th>
                <th className="py-2.5 px-3 font-black text-slate-800 text-center">الكمية</th>
                <th className="py-2.5 px-3 font-black text-slate-800 text-center">السعر</th>
                <th className="py-2.5 px-3 font-black text-slate-800 text-center">الإجمالي</th>
            </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
            {itemsList.map((item: any, index: number) => (
                <tr key={index} className="border-b border-slate-100">
                    <td className="py-2.5 px-3 text-center text-slate-500">{index + 1}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{item.productName}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{item.uomName}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-900">{item.quantity.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-center font-mono">{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-center font-bold font-mono text-slate-900">{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
            ))}
            {itemsList.length === 0 && (
                <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 font-bold">لا توجد بنود مسجلة في الفاتورة</td>
                </tr>
            )}
        </tbody>
      </table>

      {/* Totals Summary */}
      <div className="flex justify-end mb-6">
        <div className={`space-y-1.5 border border-slate-200 p-4 rounded-xl bg-slate-50 ${isThermal ? 'w-full text-xs' : 'w-2/5 text-sm'}`}>
            <div className="flex justify-between text-slate-600">
                <span className="font-bold">الإجمالي قبل الضريبة:</span>
                <span className="font-bold font-mono">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                  <span className="font-bold">ضريبة القيمة المضافة ({((companySettings?.vat_rate || 0.14) * 100).toFixed(0)}%):</span>
                  <span className="font-bold font-mono text-blue-700">{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-900 text-base font-black border-t-2 border-slate-800 pt-2">
                <span>الإجمالي النهائي:</span>
                <span className="font-mono text-emerald-700">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
            </div>
            <div className="text-center pt-2 border-t border-slate-200 mt-2">
                <p className="text-xs font-bold text-slate-700">{tafqeet(totalAmount, currency)}</p>
            </div>
        </div>
      </div>

      {/* Footer & Tax QR Code */}
      <div className="mt-auto pt-4 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
        <div className="text-right">
          <p className="font-bold text-slate-800 mb-0.5">{companySettings?.footer_text || 'شكراً لتعاملكم معنا'}</p>
          <p className="text-[10px] text-slate-400">{new Date().toLocaleString('ar-EG')}</p>
          <p className="text-[10px] text-slate-400">فاتورة ضريبية متوافقة مع متطلبات الفاتورة الإلكترونية</p>
        </div>
        <div className="p-1.5 bg-white border border-slate-300 rounded-lg flex flex-col items-center">
          <QRCodeSVG 
            value={generateZatcaTlvQrString({
              sellerName: companySettings?.company_name || 'المنشأة',
              taxNumber: companySettings?.tax_number || '300000000000003',
              invoiceDate: invoice.date || invoice.invoice_date || new Date().toISOString(),
              totalAmount: totalAmount,
              taxAmount: taxAmount
            })} 
            size={76} 
            level="M" 
          />
          <span className="text-[8px] text-slate-400 mt-1 font-bold">ZATCA / ETA QR</span>
        </div>
      </div>
    </div>
  );
};