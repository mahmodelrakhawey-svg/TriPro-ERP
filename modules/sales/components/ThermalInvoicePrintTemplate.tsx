import React from 'react';

export interface ThermalInvoicePrintTemplateProps {
  settings: any;
  invoiceNumber?: string;
  customerName?: string;
  salespersonName?: string;
  items: any[];
  uoms: any[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
}

export const ThermalInvoicePrintTemplate: React.FC<ThermalInvoicePrintTemplateProps> = ({
  settings,
  invoiceNumber,
  customerName,
  salespersonName,
  items,
  uoms,
  subtotal,
  discountAmount,
  taxRate,
  taxAmount,
  totalAmount
}) => {
  return (
    <>
      <div className="hidden thermal-only print:block">
        <div className="text-center mb-4 border-b border-black pb-2 border-dashed">
          {settings?.logoUrl && (
            <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 mx-auto mb-2 object-contain grayscale" />
          )}
          <h2 className="text-xl font-bold">{settings?.companyName}</h2>
          <p className="text-xs">{settings?.address}</p>
          <p className="text-xs">هاتف: {settings?.phone}</p>
          <p className="text-xs">رقم ضريبي: {settings?.taxNumber}</p>
          <h3 className="text-lg font-bold mt-2 border-t border-black border-dashed pt-2">فاتورة مبيعات</h3>
          <p className="text-sm font-mono">#{invoiceNumber || 'NEW'}</p>
          <p className="text-xs">{new Date().toLocaleString('ar-EG')}</p>
        </div>

        <div className="mb-2 text-xs">
          <p><strong>العميل:</strong> {customerName || 'عميل نقدي'}</p>
          {salespersonName && <p><strong>البائع:</strong> {salespersonName}</p>}
        </div>

        <table className="w-full text-right text-xs mb-4 border-collapse">
          <thead>
            <tr className="border-b border-black border-dashed">
              <th className="py-1">الصنف</th>
              <th className="py-1 text-center">الوحدة</th>
              <th className="py-1 w-8 text-center">ك</th>
              <th className="py-1 w-12 text-center">سعر</th>
              <th className="py-1 w-12 text-center">إجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-200 border-dashed">
                <td className="py-1">{item.productName}</td>
                <td className="py-1 text-center">{uoms.find(u => u.id === item.uomId)?.name || '-'}</td>
                <td className="py-1 text-center">{item.quantity}</td>
                <td className="py-1 text-center">{item.unitPrice}</td>
                <td className="py-1 text-center font-bold">{item.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-black border-dashed pt-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span>المجموع:</span>
            <span>{subtotal.toLocaleString()}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between">
              <span>الخصم:</span>
              <span>{discountAmount.toLocaleString()}</span>
            </div>
          )}
          {settings?.enableTax && (
            <div className="flex justify-between">
              <span>الضريبة ({(taxRate * 100).toFixed(0)}%):</span>
              <span>{taxAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold border-t border-black border-dashed pt-1 mt-1">
            <span>الإجمالي:</span>
            <span>{totalAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className="text-center mt-4 pt-2 border-t border-black border-dashed text-xs">
          <p>{settings?.footerText}</p>
          <p className="mt-1">شكراً لزيارتكم</p>
        </div>
      </div>

      <style>{`
        @media print {
            body.thermal-print * {
                visibility: hidden;
            }
            body.thermal-print .thermal-only, body.thermal-print .thermal-only * {
                visibility: visible;
            }
            body.thermal-print .thermal-only {
                position: absolute;
                left: 0;
                top: 0;
                width: 80mm;
                padding: 5px;
                font-family: 'Courier New', Courier, monospace;
                color: black;
                background: white;
            }
            body:not(.thermal-print) .thermal-only {
                display: none !important;
            }
        }
      `}</style>
    </>
  );
};

export default ThermalInvoicePrintTemplate;