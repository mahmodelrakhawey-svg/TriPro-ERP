import React, { useState } from 'react';
import { RotateCcw, Search, Barcode, CheckCircle, AlertCircle, X, Printer, PackageMinus } from 'lucide-react';
import { supabase } from '../../../../supabaseClient';
import { useToast } from '../../../../context/ToastContext';

interface PosReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (returnSummary: any) => void;
  orgId: string;
  cashierId: string;
  cashierName: string;
}

interface ReturnItem {
  product_id: string;
  name: string;
  sku?: string;
  barcode?: string;
  sold_qty: number;
  return_qty: number;
  unit_price: number;
  total_price: number;
}

export default function PosReturnModal({
  isOpen,
  onClose,
  onSuccess,
  orgId,
  cashierId,
  cashierName
}: PosReturnModalProps) {
  const { showToast } = useToast();
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [originalInvoice, setOriginalInvoice] = useState<any>(null);
  const [itemsToReturn, setItemsToReturn] = useState<ReturnItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'STORE_CREDIT'>('CASH');
  const [returnReason, setReturnReason] = useState('إرجاع بمعرفة العميل');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSearchInvoice = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = invoiceQuery.trim();
    if (!q) return;

    setIsLoading(true);
    setOriginalInvoice(null);
    setItemsToReturn([]);

    try {
      // 1. Search in orders table or invoices table
      let foundOrder: any = null;

      // Search by order_number, id, or reference
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .select('*, order_items(*, products(name, sku, barcode, sales_price))')
        .eq('organization_id', orgId)
        .or(`order_number.eq.${q},id.eq.${q}`)
        .maybeSingle();

      if (orderData) {
        foundOrder = orderData;
      } else {
        // Fallback search in sales invoices
        const { data: invData } = await supabase
          .from('invoices')
          .select('*, invoice_items(*, products(name, sku, barcode))')
          .eq('organization_id', orgId)
          .or(`invoice_number.eq.${q},id.eq.${q}`)
          .maybeSingle();
        if (invData) {
          foundOrder = {
            id: invData.id,
            order_number: invData.invoice_number,
            created_at: invData.issue_date || invData.created_at,
            total_amount: invData.total_amount,
            customer_id: invData.customer_id,
            order_items: (invData.invoice_items || []).map((it: any) => ({
              product_id: it.product_id,
              quantity: it.quantity,
              unit_price: it.unit_price,
              products: it.products
            }))
          };
        }
      }

      if (!foundOrder) {
        showToast('لم يتم العثور على فاتورة بهذا الرقم أو الباركود', 'error');
        return;
      }

      setOriginalInvoice(foundOrder);
      const items: ReturnItem[] = (foundOrder.order_items || []).map((it: any) => ({
        product_id: it.product_id,
        name: it.products?.name || 'صنف',
        sku: it.products?.sku || '',
        barcode: it.products?.barcode || '',
        sold_qty: Number(it.quantity || 1),
        return_qty: 0,
        unit_price: Number(it.unit_price || 0),
        total_price: 0
      }));
      setItemsToReturn(items);
    } catch (err: any) {
      showToast('خطأ أثناء البحث عن الفاتورة: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQtyChange = (index: number, qty: number) => {
    setItemsToReturn(prev => {
      const copy = [...prev];
      const maxQty = copy[index].sold_qty;
      const validQty = Math.max(0, Math.min(maxQty, qty));
      copy[index] = {
        ...copy[index],
        return_qty: validQty,
        total_price: validQty * copy[index].unit_price
      };
      return copy;
    });
  };

  const totalRefund = itemsToReturn.reduce((sum, it) => sum + (it.return_qty * it.unit_price), 0);
  const totalReturnUnits = itemsToReturn.reduce((sum, it) => sum + it.return_qty, 0);

  const handleConfirmReturn = async () => {
    if (totalReturnUnits === 0) {
      showToast('يرجى تحديد كمية صنف واحد على الأقل للإرجاع', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const activeReturns = itemsToReturn.filter(it => it.return_qty > 0);

      // Create return record in database
      const returnNumber = `RET-${Date.now().toString().slice(-6)}`;
      const { data: retRec, error: retErr } = await supabase
        .from('sales_returns')
        .insert({
          organization_id: orgId,
          return_number: returnNumber,
          original_invoice_id: originalInvoice.id,
          total_amount: totalRefund,
          return_reason: returnReason,
          status: 'approved',
          created_by: cashierId,
          notes: `مرتجع كاشير بواسطة ${cashierName} - طريقة الاسترداد: ${refundMethod === 'CASH' ? 'نقدي' : 'رصيد عميل'}`
        })
        .select()
        .single();

      if (retErr) {
        console.warn('Could not insert to sales_returns, continuing POS return:', retErr);
      }

      // Restock inventory for returned items
      for (const it of activeReturns) {
        try {
          await supabase.rpc('adjust_product_stock', {
            p_product_id: it.product_id,
            p_quantity: it.return_qty
          });
        } catch (e) {
          // Fallback direct stock increment if RPC does not exist
          const { data: curProd } = await supabase.from('products').select('stock').eq('id', it.product_id).single();
          if (curProd) {
            await supabase.from('products').update({ stock: (Number(curProd.stock) || 0) + it.return_qty }).eq('id', it.product_id);
          }
        }
      }

      showToast(`تم إتمام مرتجع المبيعات بمبلغ ${totalRefund.toFixed(2)} ج.م بنجاح ✅`, 'success');
      onSuccess({
        returnNumber,
        originalInvoiceNumber: originalInvoice.order_number,
        totalRefund,
        refundMethod,
        items: activeReturns
      });
      onClose();
    } catch (err: any) {
      showToast('فشل حفظ المرتجع: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <RotateCcw size={22} className="text-blue-200" />
            <span>مرتجع مبيعات الكاشير (POS Returns)</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Search bar */}
          <form onSubmit={handleSearchInvoice} className="flex gap-2">
            <div className="relative flex-1">
              <Barcode size={18} className="absolute right-3 top-3 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="امسح باركود الفاتورة أو أدخل رقم الفاتورة..."
                value={invoiceQuery}
                onChange={e => setInvoiceQuery(e.target.value)}
                className="w-full pr-10 pl-3 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
            >
              <Search size={16} />
              <span>{isLoading ? 'جاري البحث...' : 'بحث'}</span>
            </button>
          </form>

          {/* Original Invoice Info */}
          {originalInvoice && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-950">
                <div>
                  <span className="font-bold block text-sm">فاتورة رقم: {originalInvoice.order_number}</span>
                  <span className="text-blue-700">التاريخ: {new Date(originalInvoice.created_at).toLocaleString('ar-EG')}</span>
                </div>
                <div className="text-left font-bold text-sm text-blue-800">
                  إجمالي الفاتورة: {Number(originalInvoice.total_amount || 0).toFixed(2)} ج.م
                </div>
              </div>

              {/* Items list */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">الأصناف المباعة والكميات المراد إرجاعها:</label>
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {itemsToReturn.map((item, idx) => (
                    <div key={idx} className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          سعر البيع: {item.unit_price.toFixed(2)} ج.م | المباع: {item.sold_qty}
                        </div>
                      </div>

                      {/* Return Qty control */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600">المرتجع:</span>
                        <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(idx, item.return_qty - 1)}
                            className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={item.sold_qty}
                            value={item.return_qty}
                            onChange={e => handleQtyChange(idx, parseInt(e.target.value) || 0)}
                            className="w-12 text-center font-bold text-sm py-1 border-x border-slate-200 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleQtyChange(idx, item.return_qty + 1)}
                            className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 font-bold"
                          >
                            +
                          </button>
                        </div>
                        <span className="w-20 text-left font-bold text-blue-700 text-sm">
                          {item.total_price.toFixed(2)} ج.م
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">طريقة رد المبلغ للعميل</label>
                  <select
                    value={refundMethod}
                    onChange={e => setRefundMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none bg-white font-medium"
                  >
                    <option value="CASH">💵 استرداد نقدي من الدرج (Cash)</option>
                    <option value="STORE_CREDIT">🎟️ رصيد مشتريات للعميل (Store Credit)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سبب الإرجاع</label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none"
                  />
                </div>
              </div>

              {/* Total Refund Banner */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <PackageMinus size={20} className="text-emerald-600" />
                  <span>إجمالي المبلغ المسترد للعميل:</span>
                </div>
                <div className="text-xl font-black text-emerald-700 font-mono">
                  {totalRefund.toFixed(2)} ج.م
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold text-sm transition-colors"
          >
            إلغاء
          </button>
          {originalInvoice && (
            <button
              type="button"
              onClick={handleConfirmReturn}
              disabled={isSubmitting || totalReturnUnits === 0}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle size={18} />
              <span>{isSubmitting ? 'جاري التنفيذ...' : 'اعتماد المرتجع وطباعة الإيصال'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
