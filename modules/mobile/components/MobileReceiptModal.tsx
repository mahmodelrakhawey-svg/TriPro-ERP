import React from 'react';
import { Printer, MessageCircle, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateZatcaTlvQrString } from '../../../utils/zatcaQrHelper';

export interface MobileReceiptModalProps {
  show: boolean;
  onClose: () => void;
  invoice: any;
  companySettings: any;
}

export const MobileReceiptModal: React.FC<MobileReceiptModalProps> = ({
  show,
  onClose,
  invoice,
  companySettings,
}) => {
  if (!invoice) return null;

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const itemsText = (invoice.items || [])
      .map((it: Record<string, any>) => `• ${it.name}: ${it.quantity} × ${Number(it.unit_price).toFixed(2)} = ${Number(it.total).toFixed(2)} ج.م`)
      .join('\n');
    const text = `🧾 *فاتورة مبيعات - ${companySettings?.company_name || 'تري برو للتوزيع'}*\n` +
      `رقم الفاتورة: #${invoice.invoice_number}\n` +
      `التاريخ: ${invoice.invoice_date} ${invoice.invoice_time || ''}\n` +
      `العميل: ${invoice.customer_name || 'عميل نقدي'}\n` +
      `مخزن الصرف: ${invoice.warehouse_name || 'المستودع الرئيسي'}\n` +
      `--------------------------------\n` +
      `${itemsText}\n` +
      `--------------------------------\n` +
      `المجموع قبل الضريبة: ${Number(invoice.subtotal || 0).toFixed(2)} ج.م\n` +
      `ضريبة القيمة المضافة (14%): ${Number(invoice.tax_amount || 0).toFixed(2)} ج.م\n` +
      `💰 *الإجمالي النهائي: ${Number(invoice.total_amount || 0).toFixed(2)} ج.م*\n` +
      `المدفوع: ${Number(invoice.paid_amount || 0).toFixed(2)} ج.م\n` +
      `طريقة الدفع: ${invoice.status === 'paid' ? 'نقدي فوري' : 'آجل'}\n` +
      `--------------------------------\n` +
      `شكراً لتعاملكم معنا!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <>
      {/* 🖨️ ON-SCREEN THERMAL RECEIPT PREVIEW MODAL */}
      {show && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-2">
                <Printer size={16} className="text-emerald-400" />
                <span className="font-bold text-xs text-white">معاينة الإيصال الحراري (80mm)</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Realistic Paper Receipt Simulator */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50">
              <div 
                className="bg-white text-black p-4 rounded-lg shadow-xl mx-auto text-[11px] leading-tight select-text"
                style={{ width: '100%', maxWidth: '280px', fontFamily: "'Courier New', Courier, monospace, system-ui" }}
                dir="rtl"
              >
                {/* Header */}
                <div className="text-center pb-2 mb-2 border-b border-dashed border-black">
                  <h2 className="text-sm font-black tracking-tight">{companySettings?.company_name || 'شركة تري برو للتوزيع'}</h2>
                  {companySettings?.address && <p className="text-[9px] text-gray-700 mt-0.5">{companySettings.address}</p>}
                  {companySettings?.phone && <p className="text-[9px] text-gray-700">هاتف: {companySettings.phone}</p>}
                  {companySettings?.tax_number && <p className="text-[9px] font-bold text-gray-800">الرقم الضريبي: {companySettings.tax_number}</p>}
                  
                  <div className="mt-1 pt-1 border-t border-dotted border-gray-400">
                    <h3 className="text-[10px] font-black uppercase">فاتورة مبيعات نقدية (إيصال)</h3>
                    <p className="font-mono text-xs font-bold mt-0.5">#{invoice.invoice_number}</p>
                    <p className="text-[9px] text-gray-600 mt-0.5">
                      {invoice.invoice_date} {invoice.invoice_time || ''}
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="text-[9px] space-y-0.5 mb-2 pb-1 border-b border-dashed border-black">
                  <div className="flex justify-between">
                    <span className="text-gray-600">العميل:</span>
                    <span className="font-bold">{invoice.customer_name || 'عميل نقدي'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">المستودع:</span>
                    <span className="font-bold">{invoice.warehouse_name || 'المستودع الرئيسي'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">الدفع:</span>
                    <span className="font-bold">{invoice.status === 'paid' ? 'نقدي فوري' : 'آجل'}</span>
                  </div>
                </div>

                {/* Items Table */}
                <table className="w-full text-right text-[9px] border-collapse mb-2">
                  <thead>
                    <tr className="border-b border-black border-dashed font-bold">
                      <th className="py-1">الصنف</th>
                      <th className="py-1 text-center w-6">ك</th>
                      <th className="py-1 text-center w-10">سعر</th>
                      <th className="py-1 text-left w-12">إجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoice.items || []).map((it: Record<string, any>, idx: number) => (
                      <tr key={idx} className="border-b border-gray-200 border-dotted">
                        <td className="py-1 font-medium">{it.name}</td>
                        <td className="py-1 text-center font-bold">{it.quantity}</td>
                        <td className="py-1 text-center">{Number(it.unit_price).toFixed(2)}</td>
                        <td className="py-1 text-left font-bold">{Number(it.total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Financial Summary */}
                <div className="border-t border-black border-dashed pt-1.5 text-[10px] space-y-0.5">
                  <div className="flex justify-between">
                    <span>المجموع:</span>
                    <span className="font-mono">{Number(invoice.subtotal || 0).toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ضريبة (14%):</span>
                    <span className="font-mono">{Number(invoice.tax_amount || 0).toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-xs font-black border-t-2 border-black border-double pt-1 mt-1">
                    <span>الإجمالي الصافي:</span>
                    <span className="font-mono">{Number(invoice.total_amount || 0).toFixed(2)} ج.م</span>
                  </div>
                  {invoice.paid_amount !== undefined && (
                    <div className="flex justify-between text-[9px] text-gray-700 pt-0.5">
                      <span>المدفوع:</span>
                      <span className="font-mono font-bold">{Number(invoice.paid_amount || 0).toFixed(2)} ج.م</span>
                    </div>
                  )}
                  {Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0) > 0 && (
                    <div className="flex justify-between text-[9px] text-red-600 font-bold">
                      <span>المتبقي:</span>
                      <span className="font-mono">{(Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)).toFixed(2)} ج.م</span>
                    </div>
                  )}
                </div>

                {/* QR Code */}
                <div className="mt-2.5 text-center flex flex-col items-center justify-center pt-2 border-t border-dashed border-black">
                  <QRCodeSVG
                    value={generateZatcaTlvQrString({
                      sellerName: companySettings?.company_name || 'TriPro Distribution',
                      taxNumber: companySettings?.tax_number || '300000000000003',
                      invoiceDate: invoice.invoice_date,
                      totalAmount: Number(invoice.total_amount || 0),
                      taxAmount: Number(invoice.tax_amount || 0)
                    })}
                    size={80}
                    level="M"
                  />
                  <p className="text-[8px] text-gray-500 mt-1 font-mono">فاتورة إلكترونية ضريبية مبسطة</p>
                </div>

                {/* Footer */}
                <div className="text-center mt-2 pt-1 border-t border-dotted border-gray-400 text-[8px] text-gray-600">
                  <p>شكراً لتعاملكم معنا</p>
                  <p className="font-mono text-[7px] text-gray-400 mt-0.5">Powered by TriPro ERP</p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30"
              >
                <Printer size={15} />
                <span>طباعة فورية 🖨️</span>
              </button>
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-slate-700"
                title="مشاركة عبر واتساب"
              >
                <MessageCircle size={15} />
                <span>واتساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🖨️ STANDALONE PRINTABLE RECEIPT CONTAINER (VISIBLE ONLY DURING WINDOW.PRINT, REST OF APP HIDDEN) */}
      <div id="mobile-printable-receipt" className="hidden print:block" dir="rtl">
        {/* Header */}
        <div className="text-center pb-2 mb-2 border-b border-dashed border-black">
          <h2 className="text-base font-black tracking-tight">{companySettings?.company_name || 'شركة تري برو للتوزيع'}</h2>
          {companySettings?.address && <p className="text-[10px] text-gray-700 mt-0.5">{companySettings.address}</p>}
          {companySettings?.phone && <p className="text-[10px] text-gray-700">هاتف: {companySettings.phone}</p>}
          {companySettings?.tax_number && <p className="text-[10px] font-bold text-gray-800">الرقم الضريبي: {companySettings.tax_number}</p>}
          
          <div className="mt-1 pt-1 border-t border-dotted border-gray-400">
            <h3 className="text-xs font-black uppercase tracking-wider">فاتورة مبيعات نقدية (إيصال استلام)</h3>
            <p className="font-mono text-xs font-bold mt-0.5">#{invoice.invoice_number}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">
              {invoice.invoice_date} {invoice.invoice_time || ''}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="text-[10px] space-y-0.5 mb-2 pb-1 border-b border-dashed border-black">
          <div className="flex justify-between">
            <span className="text-gray-600">العميل:</span>
            <span className="font-bold">{invoice.customer_name || 'عميل نقدي'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">مخزن الصرف:</span>
            <span className="font-bold">{invoice.warehouse_name || 'المستودع الرئيسي'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">طريقة الدفع:</span>
            <span className="font-bold">{invoice.status === 'paid' ? '💵 نقدي فوري' : '📝 آجل (ذمم)'}</span>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full text-right text-[10px] border-collapse mb-2">
          <thead>
            <tr className="border-b border-black border-dashed font-bold">
              <th className="py-1">الصنف</th>
              <th className="py-1 text-center w-8">ك</th>
              <th className="py-1 text-center w-12">سعر</th>
              <th className="py-1 text-left w-14">إجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((it: any, idx: number) => (
              <tr key={idx} className="border-b border-gray-200 border-dotted">
                <td className="py-1 font-medium leading-tight">{it.name}</td>
                <td className="py-1 text-center font-bold">{it.quantity}</td>
                <td className="py-1 text-center">{Number(it.unit_price).toFixed(2)}</td>
                <td className="py-1 text-left font-bold">{Number(it.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Financial Summary */}
        <div className="border-t border-black border-dashed pt-1.5 text-[11px] space-y-1">
          <div className="flex justify-between">
            <span>المجموع قبل الضريبة:</span>
            <span className="font-mono">{Number(invoice.subtotal || 0).toFixed(2)} ج.م</span>
          </div>
          <div className="flex justify-between">
            <span>ضريبة القيمة المضافة (14%):</span>
            <span className="font-mono">{Number(invoice.tax_amount || 0).toFixed(2)} ج.م</span>
          </div>
          <div className="flex justify-between text-xs font-black border-t-2 border-black border-double pt-1 mt-1">
            <span>الإجمالي النهائي:</span>
            <span className="font-mono text-sm">{Number(invoice.total_amount || 0).toFixed(2)} ج.م</span>
          </div>
          {invoice.paid_amount !== undefined && (
            <div className="flex justify-between text-[10px] text-gray-700 pt-0.5">
              <span>المدفوع:</span>
              <span className="font-mono font-bold">{Number(invoice.paid_amount || 0).toFixed(2)} ج.م</span>
            </div>
          )}
          {Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0) > 0 && (
            <div className="flex justify-between text-[10px] text-red-600 font-bold">
              <span>المتبقي آجل:</span>
              <span className="font-mono">{(Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)).toFixed(2)} ج.م</span>
            </div>
          )}
        </div>

        {/* QR Code */}
        <div className="mt-3 text-center flex flex-col items-center justify-center pt-2 border-t border-dashed border-black">
          <QRCodeSVG
            value={generateZatcaTlvQrString({
              sellerName: companySettings?.company_name || 'TriPro Distribution',
              taxNumber: companySettings?.tax_number || '300000000000003',
              invoiceDate: invoice.invoice_date,
              totalAmount: Number(invoice.total_amount || 0),
              taxAmount: Number(invoice.tax_amount || 0)
            })}
            size={88}
            level="M"
          />
          <p className="text-[9px] text-gray-500 mt-1 font-mono">فاتورة إلكترونية ضريبية مبسطة</p>
        </div>

        {/* Footer */}
        <div className="text-center mt-2 pt-1 border-t border-dotted border-gray-400 text-[9px] text-gray-600">
          <p>شكراً لتعاملكم معنا</p>
          <p className="font-mono text-[8px] text-gray-400 mt-0.5">Powered by TriPro ERP</p>
        </div>
      </div>

      {/* 🖨️ DEDICATED THERMAL PRINT CSS (ISOLATES RECEIPT TO 80MM AND HIDES ENTIRE APP UI) */}
      <style>{`
        @media print {
          /* 1. إخفاء كل عناصر صفحة وتطبيق الموبايل بالكامل */
          body * {
            visibility: hidden !important;
          }
          /* 2. إظهار الإيصال الحراري فقط لا غير */
          #mobile-printable-receipt, #mobile-printable-receipt * {
            visibility: visible !important;
          }
          /* 3. تثبيت أبعاد الرول الحراري 80 مم وإزالة الهوامش الزائدة */
          #mobile-printable-receipt {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 76mm !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 3mm 4mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-sizing: border-box !important;
            font-family: 'Courier New', Courier, monospace, system-ui !important;
            font-size: 11px !important;
            line-height: 1.3 !important;
            z-index: 9999999 !important;
          }
          @page {
            size: 80mm auto;
            margin: 0mm;
          }
        }
      `}</style>
    </>
  );
};

export default MobileReceiptModal;
