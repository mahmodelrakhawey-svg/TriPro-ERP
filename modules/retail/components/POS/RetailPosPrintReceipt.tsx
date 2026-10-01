import React from 'react';
import { generateCode128Svg } from '../../utils/barcodeSvg';

export interface RetailPosPrintReceiptProps {
  receiptOrder: any;
  printAreaRef: React.RefObject<HTMLDivElement>;
  organization: any;
  currentUser: any;
  selectedTerminal: any;
  currencySymbol: string;
  vatRate: number;
}

export const RetailPosPrintReceipt: React.FC<RetailPosPrintReceiptProps> = ({
  receiptOrder,
  printAreaRef,
  organization,
  currentUser,
  selectedTerminal,
  currencySymbol,
  vatRate
}) => {
  if (!receiptOrder) return null;

  return (
    <div className="hidden print:block">
      <div ref={printAreaRef} className="print-area p-8 text-black" dir="rtl" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <h2 className="font-black text-lg">{organization?.name || 'هايبر ماركت TriPro'}</h2>
            <p>فرع التجزئة الرئيسي</p>
            <p className="text-xs">تلفون: 0100000000</p>
          </div>
          <hr style={{ borderTop: '1px dashed black' }} />
          <div>
            <p className="font-bold text-sm">رقم الفاتورة: {receiptOrder.orderNumber}</p>
            <p>التاريخ: {receiptOrder.date} | الوقت: {receiptOrder.time}</p>
            <p>الكاشير: {currentUser?.full_name}</p>
            <p>الجهاز: {selectedTerminal?.name}</p>
          </div>
          <div 
            className="my-1.5 flex justify-center overflow-hidden" 
            dangerouslySetInnerHTML={{ 
              __html: generateCode128Svg(receiptOrder.orderNumber, { height: 36, barWidth: 1.5, showText: false }) 
            }} 
          />
          <hr style={{ borderTop: '1px dashed black' }} />
          <table className="w-full text-right" style={{ fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid black' }}>
                <th className="pb-1">الصنف</th>
                <th className="pb-1 text-center">الكمية</th>
                <th className="pb-1 text-left">السعر</th>
                <th className="pb-1 text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {receiptOrder.items.map((item: Record<string, any>, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px dashed #eee' }}>
                  <td className="py-1">{item.name}</td>
                  <td className="py-1 text-center">{item.quantity}</td>
                  <td className="py-1 text-left">{item.price.toFixed(2)}</td>
                  <td className="py-1 text-left">{(item.quantity * item.price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr style={{ borderTop: '1px dashed black' }} />
          <div className="space-y-1 text-left" style={{ fontSize: '12px', fontWeight: 'bold' }}>
            <div className="flex justify-between">
              <span>المجموع الفرعي:</span>
              <span>{receiptOrder.subtotal.toFixed(2)} {currencySymbol}</span>
            </div>

            {receiptOrder.promoDiscount > 0 && (
              <div className="flex justify-between text-xs" style={{ color: '#000' }}>
                <span>خصم العروض الترويجية:</span>
                <span>-{receiptOrder.promoDiscount.toFixed(2)} {currencySymbol}</span>
              </div>
            )}

            {receiptOrder.appliedPromotions && receiptOrder.appliedPromotions.length > 0 && (
              <div className="space-y-0.5 pr-2 my-0.5">
                {receiptOrder.appliedPromotions.map((p: Record<string, any>, idx: number) => (
                  <div key={idx} className="flex justify-between text-[10px]" style={{ color: '#333' }}>
                    <span>• {p.promoName || 'عرض خاص'}:</span>
                    <span>-{Number(p.discountAmount).toFixed(2)} {currencySymbol}</span>
                  </div>
                ))}
              </div>
            )}

            {receiptOrder.couponDiscount > 0 && (
              <div className="flex justify-between text-xs" style={{ color: '#000' }}>
                <span>خصم الكوبون ({receiptOrder.appliedCoupon || 'كوبون'}):</span>
                <span>-{receiptOrder.couponDiscount.toFixed(2)} {currencySymbol}</span>
              </div>
            )}

            {receiptOrder.totalSavings > 0 && (
              <div className="flex justify-between text-xs font-black py-1 border-y border-dashed border-black my-1" style={{ backgroundColor: '#f5f5f5' }}>
                <span>🎉 إجمالي ما وفرته:</span>
                <span>{receiptOrder.totalSavings.toFixed(2)} {currencySymbol}</span>
              </div>
            )}

            {receiptOrder.tax > 0 && (
              <div className="flex justify-between">
                <span>الضريبة ({(vatRate * 100).toFixed(0)}%):</span>
                <span>{receiptOrder.tax.toFixed(2)} {currencySymbol}</span>
              </div>
            )}

            <div className="flex justify-between" style={{ fontSize: '14px', borderTop: '1px solid black', paddingTop: '4px' }}>
              <span>الإجمالي الكلي:</span>
              <span>{receiptOrder.total.toFixed(2)} {currencySymbol}</span>
            </div>
            <hr style={{ borderTop: '1px dashed black' }} />
            
            {receiptOrder.splitDetails ? (
              <div className="space-y-0.5 text-xs">
                <p style={{ fontWeight: 'bold' }}>تفاصيل الدفع المجزأ:</p>
                {receiptOrder.splitDetails.cash > 0 && (
                  <div className="flex justify-between"><span>- كاش:</span><span>{receiptOrder.splitDetails.cash.toFixed(2)} {currencySymbol}</span></div>
                )}
                {receiptOrder.splitDetails.card > 0 && (
                  <div className="flex justify-between"><span>- بطاقة فيزا:</span><span>{receiptOrder.splitDetails.card.toFixed(2)} {currencySymbol}</span></div>
                )}
                {receiptOrder.splitDetails.credit > 0 && (
                  <div className="flex justify-between"><span>- آجل / ذمة:</span><span>{receiptOrder.splitDetails.credit.toFixed(2)} {currencySymbol}</span></div>
                )}
                {receiptOrder.splitDetails.loyalty > 0 && (
                  <div className="flex justify-between"><span>- نقاط ولاء:</span><span>{receiptOrder.splitDetails.loyalty.toFixed(2)} {currencySymbol}</span></div>
                )}
              </div>
            ) : (
              <div className="flex justify-between text-xs"><span>المدفوع:</span><span>{receiptOrder.amountPaid.toFixed(2)} {currencySymbol}</span></div>
            )}

            <div className="flex justify-between text-xs"><span>الفكة (المتبقي):</span><span>{receiptOrder.change.toFixed(2)} {currencySymbol}</span></div>
          </div>

          {receiptOrder.totalSavings > 0 && (
            <div className="text-center my-2 p-1.5 border border-dashed border-black rounded" style={{ fontSize: '11px', backgroundColor: '#fafafa' }}>
              <p className="font-black text-xs">
                🎉 لقد وفرت في هذه الفاتورة: {receiptOrder.totalSavings.toFixed(2)} {currencySymbol} 🎉
              </p>
              <p className="text-[10px] text-gray-700">شكراً لتسوقكم معنا واستفادتكم من عروضنا!</p>
            </div>
          )}

          <hr style={{ borderTop: '1px dashed black' }} />
          <div className="text-center text-xs space-y-1 pt-4">
            <p>شكراً لزيارتكم</p>
            <p>الفاتورة خاضعة لضريبة القيمة المضافة</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RetailPosPrintReceipt;
