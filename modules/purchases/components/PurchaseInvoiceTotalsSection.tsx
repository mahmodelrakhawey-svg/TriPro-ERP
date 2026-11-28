import React from 'react';
import { Percent } from 'lucide-react';
import type { PurchaseInvoiceCalculationResult } from '../purchaseInvoiceUtils';
import type { PurchaseLineItem } from './PurchaseInvoiceItemsTable';

export interface PurchaseInvoiceTotalsSectionProps {
  items: PurchaseLineItem[];
  discountType: 'fixed' | 'percentage';
  discountValue: number;
  paidAmount: number;
  currency: string;
  enableTax: boolean;
  vatRate: number;
  invoiceCalculation: PurchaseInvoiceCalculationResult;
  onDiscountTypeChange: (type: 'fixed' | 'percentage') => void;
  onDiscountValueChange: (val: number) => void;
}

/**
 * Renders overall invoice discount controls and the detailed tax/subtotal/remaining summary box.
 */
export const PurchaseInvoiceTotalsSection: React.FC<PurchaseInvoiceTotalsSectionProps> = ({
  items,
  discountType,
  discountValue,
  paidAmount,
  currency,
  enableTax,
  vatRate,
  invoiceCalculation,
  onDiscountTypeChange,
  onDiscountValueChange,
}) => {
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      {/* 🏷️ خانة الخصم الإجمالي على الفاتورة (لمطابقة فواتير الموردين والضرائب) */}
      <div className="bg-gradient-to-r from-rose-50/70 to-amber-50/50 p-4 rounded-2xl border border-rose-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
              <Percent size={18} />
            </span>
            <h4 className="text-sm font-black text-rose-950">
              الخصم الإجمالي على الفاتورة (Overall Invoice Discount)
            </h4>
          </div>
          <p className="text-xs text-rose-800 font-medium">
            الخصم التجاري الممنوح من المورد على كامل الفاتورة — يُخفض الوعاء الضريبي لمطابقة فواتير الموردين ومصلحة الضرائب (ETA)
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex bg-white rounded-xl p-1 border border-rose-200 shadow-xs">
            <button
              type="button"
              onClick={() => onDiscountTypeChange('fixed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                discountType === 'fixed'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              مبلغ ثابت ({currency})
            </button>
            <button
              type="button"
              onClick={() => onDiscountTypeChange('percentage')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                discountType === 'percentage'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              نسبة مئوية (%)
            </button>
          </div>

          <div className="relative w-36">
            <input
              type="number"
              min="0"
              step="any"
              value={discountValue || ''}
              onChange={(e) => onDiscountValueChange(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="0.00"
              className="w-full border-2 border-rose-200 rounded-xl p-2 text-center font-mono font-black text-rose-700 bg-white focus:border-rose-500 outline-none text-sm"
            />
            <span className="absolute left-2.5 top-2.5 text-xs font-bold text-rose-400">
              {discountType === 'percentage' ? '%' : currency}
            </span>
          </div>
        </div>
      </div>

      {/* Totals Section */}
      <div className="border-t border-slate-200 pt-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="text-xs text-slate-500 font-bold space-y-1">
          <div>
            عدد البنود: <span className="font-mono text-slate-800">{items.length}</span> صنف
          </div>
          {invoiceCalculation.totalDiscount > 0 && (
            <div className="text-rose-600 font-bold">
              إجمالي الخصم المكتسب:{' '}
              <span className="font-mono font-black">
                {fmt(invoiceCalculation.totalDiscount)} {currency}
              </span>
            </div>
          )}
        </div>

        <div className="w-full md:w-96 space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="flex justify-between text-xs font-bold text-slate-600">
            <span>إجمالي الأصناف قبل الخصم:</span>
            <span className="font-mono">
              {fmt(invoiceCalculation.grossTotal)} {currency}
            </span>
          </div>

          {invoiceCalculation.itemsDiscountTotal > 0 && (
            <div className="flex justify-between text-xs font-bold text-rose-600">
              <span>إجمالي خصومات الأصناف:</span>
              <span className="font-mono">
                -{fmt(invoiceCalculation.itemsDiscountTotal)} {currency}
              </span>
            </div>
          )}

          <div className="flex justify-between text-xs font-bold text-slate-700 border-t border-slate-200/60 pt-1">
            <span>الصافي قبل الخصم الإجمالي:</span>
            <span className="font-mono">
              {fmt(invoiceCalculation.subtotalBeforeInvoiceDiscount)} {currency}
            </span>
          </div>

          {invoiceCalculation.invoiceDiscountAmount > 0 && (
            <div className="flex justify-between text-xs font-bold text-rose-700">
              <span>
                خصم الفاتورة الإجمالي
                {discountType === 'percentage' ? ` (${discountValue}%):` : ':'}
              </span>
              <span className="font-mono font-black">
                -{fmt(invoiceCalculation.invoiceDiscountAmount)} {currency}
              </span>
            </div>
          )}

          {invoiceCalculation.totalDiscount > 0 && (
            <div className="flex justify-between text-[11px] font-bold text-slate-500 bg-rose-50/60 px-2 py-1 rounded-lg">
              <span>إجمالي الخصومات (أصناف + فاتورة):</span>
              <span className="font-mono text-rose-700 font-bold">
                -{fmt(invoiceCalculation.totalDiscount)} {currency}
              </span>
            </div>
          )}

          <div className="flex justify-between text-xs font-bold text-slate-800 bg-emerald-50/60 px-2 py-1 rounded-lg border border-emerald-100">
            <span title="وعاء احتساب ضريبة القيمة المضافة طبقاً لتعليمات مصلحة الضرائب">
              الوعاء الخاضع للضريبة (الصافي):
            </span>
            <span className="font-mono font-black text-emerald-800">
              {fmt(invoiceCalculation.taxableBase)} {currency}
            </span>
          </div>

          {(invoiceCalculation.taxAmount > 0 || enableTax) && (
            <div className="flex justify-between text-xs font-bold text-slate-600">
              <span>
                ضريبة القيمة المضافة
                {enableTax && !items.some((it) => it.taxRate !== undefined && it.taxRate !== vatRate)
                  ? ` (${vatRate || 14}%):`
                  : ':'}
              </span>
              <span className="font-mono text-emerald-700 font-bold">
                +{fmt(invoiceCalculation.taxAmount)} {currency}
              </span>
            </div>
          )}

          <div className="flex justify-between text-sm font-black text-emerald-800 border-t-2 border-slate-300 pt-2">
            <span>إجمالي الفاتورة النهائي المستحق:</span>
            <span className="font-mono text-lg" dir="ltr">
              {fmt(invoiceCalculation.totalAmount)} {currency}
            </span>
          </div>

          {paidAmount > 0 && (
            <>
              <div className="flex justify-between text-xs font-bold text-emerald-600 pt-1">
                <span>المبلغ المدفوع (سداد فوري):</span>
                <span className="font-mono">
                  -{fmt(Number(paidAmount))} {currency}
                </span>
              </div>
              <div className="flex justify-between text-xs font-bold text-red-600 border-t border-slate-200 pt-1">
                <span>المتبقي للمورد على الحساب:</span>
                <span className="font-mono">
                  {fmt(Math.max(0, invoiceCalculation.totalAmount - paidAmount))} {currency}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};
