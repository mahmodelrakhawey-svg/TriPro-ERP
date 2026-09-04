import React, { useState, useEffect } from 'react';
import { RotateCcw, Search, Barcode, CheckCircle, AlertCircle, X, Printer, PackageMinus, Clock, Loader2 } from 'lucide-react';
import { supabase } from '../../../../supabaseClient';
import { useToast } from '../../../../context/ToastContext';

interface PosReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (returnSummary: any) => void;
  orgId: string;
  cashierId: string;
  cashierName: string;
  shiftId?: string;
  warehouseId?: string;
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
  cashierName,
  shiftId,
  warehouseId
}: PosReturnModalProps) {
  const { showToast } = useToast();
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [originalInvoice, setOriginalInvoice] = useState<any>(null);
  const [itemsToReturn, setItemsToReturn] = useState<ReturnItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'STORE_CREDIT'>('CASH');
  const [returnReason, setReturnReason] = useState('إرجاع بمعرفة العميل');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  // Helper: check if string is a valid standard UUID
  const isUUID = (str: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load recent completed POS orders when modal opens
  useEffect(() => {
    if (isOpen && orgId) {
      loadRecentOrders();
    } else {
      setOriginalInvoice(null);
      setItemsToReturn([]);
      setInvoiceQuery('');
    }
  }, [isOpen, orgId]);

  const loadRecentOrders = async () => {
    setIsLoadingRecent(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, grand_total, created_at, status')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(6);

      if (!error && data && data.length > 0) {
        setRecentOrders(data);
      } else {
        setRecentOrders([]);
      }
    } catch (e) {
      console.error('Error fetching recent orders for POS return:', e);
      setRecentOrders([]);
    } finally {
      setIsLoadingRecent(false);
    }
  };

  const setupOrderForReturn = (order: any) => {
    setOriginalInvoice(order);
    const items: ReturnItem[] = (order.order_items || []).map((it: any) => ({
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
  };

  const handleSearchInvoice = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = (customQuery || invoiceQuery).trim();
    if (!q) return;

    setIsLoading(true);
    setOriginalInvoice(null);
    setItemsToReturn([]);

    try {
      let foundOrder: any = null;

      // 1. Search in POS orders table
      // A. Exact match by order_number
      const { data: exactOrder } = await supabase
        .from('orders')
        .select('*, order_items(*, products(name, sku, barcode, sales_price))')
        .eq('organization_id', orgId)
        .eq('order_number', q)
        .maybeSingle();

      if (exactOrder) {
        foundOrder = {
          ...exactOrder,
          is_pos_order: true,
          total_amount: exactOrder.grand_total ?? exactOrder.total_amount ?? 0
        };
      }

      // B. If not found and input is a valid UUID, search by id
      if (!foundOrder && isUUID(q)) {
        const { data: uuidOrder } = await supabase
          .from('orders')
          .select('*, order_items(*, products(name, sku, barcode, sales_price))')
          .eq('organization_id', orgId)
          .eq('id', q)
          .maybeSingle();

        if (uuidOrder) {
          foundOrder = {
            ...uuidOrder,
            is_pos_order: true,
            total_amount: uuidOrder.grand_total ?? uuidOrder.total_amount ?? 0
          };
        }
      }

      // C. Flexible partial search in order_number or notes (WITHOUT invalid UUID casting)
      if (!foundOrder) {
        const cleanNum = q.replace(/[^a-zA-Z0-9]/g, '');
        const { data: fuzzyOrders } = await supabase
          .from('orders')
          .select('*, order_items(*, products(name, sku, barcode, sales_price))')
          .eq('organization_id', orgId)
          .or(`order_number.ilike.%${q}%,order_number.ilike.%${cleanNum}%,notes.ilike.%${q}%`)
          .order('created_at', { ascending: false })
          .limit(1);

        if (fuzzyOrders && fuzzyOrders.length > 0) {
          foundOrder = {
            ...fuzzyOrders[0],
            is_pos_order: true,
            total_amount: fuzzyOrders[0].grand_total ?? fuzzyOrders[0].total_amount ?? 0
          };
        }
      }

      // 2. Fallback search in regular sales invoices table
      if (!foundOrder) {
        const { data: exactInv } = await supabase
          .from('invoices')
          .select('*, invoice_items(*, products(name, sku, barcode))')
          .eq('organization_id', orgId)
          .eq('invoice_number', q)
          .maybeSingle();

        if (exactInv) {
          foundOrder = {
            id: exactInv.id,
            order_number: exactInv.invoice_number,
            created_at: exactInv.issue_date || exactInv.created_at,
            total_amount: exactInv.total_amount,
            customer_id: exactInv.customer_id,
            is_pos_order: false,
            order_items: (exactInv.invoice_items || []).map((it: any) => ({
              product_id: it.product_id,
              quantity: it.quantity,
              unit_price: it.unit_price,
              products: it.products
            }))
          };
        } else if (isUUID(q)) {
          const { data: uuidInv } = await supabase
            .from('invoices')
            .select('*, invoice_items(*, products(name, sku, barcode))')
            .eq('organization_id', orgId)
            .eq('id', q)
            .maybeSingle();

          if (uuidInv) {
            foundOrder = {
              id: uuidInv.id,
              order_number: uuidInv.invoice_number,
              created_at: uuidInv.issue_date || uuidInv.created_at,
              total_amount: uuidInv.total_amount,
              customer_id: uuidInv.customer_id,
              is_pos_order: false,
              order_items: (uuidInv.invoice_items || []).map((it: any) => ({
                product_id: it.product_id,
                quantity: it.quantity,
                unit_price: it.unit_price,
                products: it.products
              }))
            };
          }
        } else {
          const { data: fuzzyInvs } = await supabase
            .from('invoices')
            .select('*, invoice_items(*, products(name, sku, barcode))')
            .eq('organization_id', orgId)
            .ilike('invoice_number', `%${q}%`)
            .order('created_at', { ascending: false })
            .limit(1);

          if (fuzzyInvs && fuzzyInvs.length > 0) {
            const inv = fuzzyInvs[0];
            foundOrder = {
              id: inv.id,
              order_number: inv.invoice_number,
              created_at: inv.issue_date || inv.created_at,
              total_amount: inv.total_amount,
              customer_id: inv.customer_id,
              is_pos_order: false,
              order_items: (inv.invoice_items || []).map((it: any) => ({
                product_id: it.product_id,
                quantity: it.quantity,
                unit_price: it.unit_price,
                products: it.products
              }))
            };
          }
        }
      }

      if (!foundOrder) {
        showToast('لم يتم العثور على فاتورة بهذا الرقم. يمكنك الاختيار من قائمة (آخر الفواتير) أدناه.', 'error');
        return;
      }

      setupOrderForReturn(foundOrder);
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
      const effectiveWarehouseId = warehouseId || originalInvoice?.warehouse_id || null;
      const returnPayload: any = {
        organization_id: orgId,
        return_number: returnNumber,
        original_invoice_id: originalInvoice.is_pos_order ? null : originalInvoice.id,
        total_amount: totalRefund,
        status: 'approved',
        user_id: cashierId || null,
        warehouse_id: effectiveWarehouseId,
        notes: `مرتجع كاشير ${originalInvoice.is_pos_order ? 'لطلب' : 'لفاتورة'} ${originalInvoice.order_number} بواسطة ${cashierName} [السبب: ${returnReason}] - طريقة الاسترداد: ${refundMethod === 'CASH' ? 'نقدي' : 'رصيد عميل'}${shiftId ? ` [الوردية: ${shiftId}]` : ''}`
      };

      let retRec: any = null;
      const { data: insertData, error: retErr } = await supabase
        .from('sales_returns')
        .insert(returnPayload)
        .select()
        .maybeSingle();

      if (!retErr && insertData) {
        retRec = insertData;
      } else {
        console.warn('Initial insert to sales_returns failed, trying minimal payload:', retErr);
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('sales_returns')
          .insert({
            organization_id: orgId,
            return_number: returnNumber,
            total_amount: totalRefund,
            user_id: cashierId || null,
            notes: returnPayload.notes
          })
          .select()
          .maybeSingle();

        if (fallbackData) {
          retRec = fallbackData;
        } else if (fallbackErr) {
          console.warn('Fallback insert also had an error:', fallbackErr);
        }
      }

      if (retRec?.id) {
        try {
          // Attempt 1: matching standard schema (sales_return_id, product_id, quantity, unit_price, total, organization_id)
          const payload1 = activeReturns.map(it => ({
            organization_id: orgId,
            sales_return_id: retRec.id,
            product_id: it.product_id,
            quantity: it.return_qty,
            unit_price: it.unit_price,
            total: it.total_price
          }));
          const { error: err1 } = await supabase.from('sales_return_items').insert(payload1);

          if (err1) {
            console.warn('First insert to sales_return_items failed, trying payload with price/total:', err1);
            // Attempt 2: schema with price column instead of unit_price
            const payload2 = activeReturns.map(it => ({
              sales_return_id: retRec.id,
              product_id: it.product_id,
              quantity: it.return_qty,
              price: it.unit_price,
              total: it.total_price
            }));
            const { error: err2 } = await supabase.from('sales_return_items').insert(payload2);

            if (err2) {
              console.warn('Second insert to sales_return_items failed, trying minimal payload:', err2);
              // Attempt 3: minimal (sales_return_id, product_id, quantity, total)
              const payload3 = activeReturns.map(it => ({
                sales_return_id: retRec.id,
                product_id: it.product_id,
                quantity: it.return_qty,
                total: it.total_price
              }));
              await supabase.from('sales_return_items').insert(payload3);
            }
          }
        } catch (e) {
          console.warn('Could not insert sales_return_items:', e);
        }
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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-150"
        onClick={e => e.stopPropagation()}
      >
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

          {/* Quick Select from Recent Orders */}
          {!originalInvoice && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Clock size={15} className="text-blue-600" />
                  <span>آخر فواتير المبيعات المسجلة (اضغط للاختيار السريع):</span>
                </span>
                {isLoadingRecent && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Loader2 size={13} className="animate-spin" /> جاري التحديث...
                  </span>
                )}
              </div>

              {recentOrders.length === 0 && !isLoadingRecent ? (
                <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  لا توجد فواتير مبيعات سابقة مسجلة مؤخراً في هذا الفرع
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {recentOrders.map((ord) => {
                    const orderTotal = Number(ord.grand_total ?? ord.total_amount ?? 0);
                    const itemCount = ord.order_items?.length || 0;
                    const dateObj = new Date(ord.created_at);
                    const timeStr = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                    const dateStr = dateObj.toLocaleDateString('ar-EG');

                    return (
                      <div
                        key={ord.id}
                        onClick={() => {
                          setInvoiceQuery(ord.order_number);
                          handleSearchInvoice(undefined, ord.order_number);
                        }}
                        className="p-3 bg-slate-50 hover:bg-blue-50/80 border border-slate-200 hover:border-blue-400 rounded-xl cursor-pointer transition-all flex items-center justify-between group shadow-sm hover:shadow"
                      >
                        <div className="space-y-1">
                          <div className="font-mono font-bold text-xs text-blue-700 flex items-center gap-1.5">
                            <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">طلب</span>
                            <span>{ord.order_number}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span>{timeStr}</span>
                            <span>•</span>
                            <span>{itemCount} أصناف</span>
                          </div>
                        </div>

                        <div className="text-left">
                          <span className="font-mono font-black text-sm text-slate-900 block">
                            {orderTotal.toFixed(2)} ج.م
                          </span>
                          <span className="text-[10px] text-blue-600 group-hover:underline font-bold">
                            تحديد للإرجاع ←
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Original Invoice Info */}
          {originalInvoice && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-950">
                <div className="space-y-0.5">
                  <span className="font-bold block text-sm">فاتورة رقم: {originalInvoice.order_number}</span>
                  <span className="text-blue-700">التاريخ: {new Date(originalInvoice.created_at).toLocaleString('ar-EG')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-left font-bold text-sm text-blue-900">
                    إجمالي الفاتورة: {Number(originalInvoice.total_amount || 0).toFixed(2)} ج.م
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOriginalInvoice(null);
                      setItemsToReturn([]);
                    }}
                    className="bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                  >
                    تغيير الفاتورة
                  </button>
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
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">طريقة رد المبلغ للعميل</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundMethod('CASH')}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        refundMethod === 'CASH'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-400/30'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      <span className="text-base">💵</span>
                      <span>استرداد نقدي من الدرج (Cash)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundMethod('STORE_CREDIT')}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        refundMethod === 'STORE_CREDIT'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-400/30'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      <span className="text-base">🎟️</span>
                      <span>رصيد مشتريات للعميل (Credit)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سبب الإرجاع</label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    placeholder="مثال: إرجاع بمعرفة العميل، صنف به عيب، إلخ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-500"
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
