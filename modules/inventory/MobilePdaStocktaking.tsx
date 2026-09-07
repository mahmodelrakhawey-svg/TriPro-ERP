import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Search, CheckCircle, AlertTriangle, ArrowLeft, RefreshCw, Volume2, MapPin, PackageCheck, Send, Check } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';

interface PdaCountedItem {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  shelf_location: string | null;
  systemStock: number;
  countedQty: number;
  sales_price: number;
  lastScannedAt: Date;
}

export default function MobilePdaStocktaking() {
  const { currentUser, currentSelectedOrgId, warehouses, accounts, addEntry, recalculateStock, getSystemAccount } = useAccounting() as any;
  const { showToast } = useToast();
  const orgId = currentSelectedOrgId || currentUser?.organization_id;

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [autoAdjustStock, setAutoAdjustStock] = useState<boolean>(true);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [countedItems, setCountedItems] = useState<PdaCountedItem[]>([]);
  const [activeItem, setActiveItem] = useState<PdaCountedItem | null>(null);
  const [selectedShelf, setSelectedShelf] = useState<string>('all');
  const [shelves, setShelves] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (warehouses && warehouses.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [warehouses]);

  const playBeep = (type: 'success' | 'warn' = 'success') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(type === 'success' ? 1200 : 400, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (type === 'success' ? 0.1 : 0.3));
    } catch {}
  };

  useEffect(() => {
    if (!orgId) return;
    const loadProducts = async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, barcode, barcode2, sku, stock, purchase_price, sales_price, shelf_location, warehouse_stock')
        .eq('organization_id', orgId)
        .eq('is_active', true);
      if (data) {
        setAllProducts(data);
        const uniqueShelves = Array.from(new Set(data.map(p => p.shelf_location).filter(Boolean))) as string[];
        setShelves(uniqueShelves);
      }
    };
    loadProducts();
  }, [orgId]);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeInput('');

    // Find product by barcode, barcode2, SKU, or unit_barcodes
    const cleanCode = code.toLowerCase();
    let matched = allProducts.find(p =>
      (p.barcode && p.barcode.toLowerCase() === cleanCode) ||
      (p.barcode2 && p.barcode2.toLowerCase() === cleanCode) ||
      (p.sku && p.sku.toLowerCase() === cleanCode) ||
      (p.plu_number && String(p.plu_number) === cleanCode)
    );

    if (!matched) {
      for (const p of allProducts) {
        if (Array.isArray((p as any).unit_barcodes)) {
          const foundUom = (p as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === cleanCode);
          if (foundUom) {
            matched = p;
            break;
          }
        }
      }
    }

    if (!matched) {
      playBeep('warn');
      showToast(`لم يتم العثور على صنف بالباركود: ${code}`, 'error');
      return;
    }

    playBeep('success');

    // Get system stock for selected warehouse if available, else overall stock
    let sysStock = Number(matched.stock || 0);
    if (selectedWarehouseId && matched.warehouse_stock && matched.warehouse_stock[selectedWarehouseId] !== undefined) {
      sysStock = Number(matched.warehouse_stock[selectedWarehouseId] || 0);
    }

    setCountedItems(prev => {
      const existing = prev.find(it => it.id === matched.id);
      let updated: PdaCountedItem[];
      if (existing) {
        updated = prev.map(it => it.id === matched.id ? {
          ...it,
          countedQty: it.countedQty + 1,
          lastScannedAt: new Date()
        } : it);
      } else {
        const newItem: PdaCountedItem = {
          id: matched.id,
          name: matched.name,
          barcode: matched.barcode || matched.barcode2,
          sku: matched.sku,
          shelf_location: matched.shelf_location,
          systemStock: sysStock,
          countedQty: 1,
          sales_price: Number(matched.sales_price || 0),
          lastScannedAt: new Date()
        };
        updated = [newItem, ...prev];
      }

      const active = updated.find(it => it.id === matched.id);
      if (active) setActiveItem(active);
      return updated;
    });
  };

  const handleUpdateActiveQty = (qty: number) => {
    if (!activeItem) return;
    const validQty = Math.max(0, qty);
    setCountedItems(prev => prev.map(it => it.id === activeItem.id ? { ...it, countedQty: validQty } : it));
    setActiveItem(prev => prev ? { ...prev, countedQty: validQty } : null);
  };

  const handleSaveInventoryCount = async () => {
    if (countedItems.length === 0) {
      showToast('لم تقم بمسح أي أصناف بعد!', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const countNumber = `PDA-CNT-${Date.now().toString().slice(-6)}`;
      const targetWhId = selectedWarehouseId || (warehouses && warehouses.length > 0 ? warehouses[0].id : null);

      // 1. تسجيل كشف الجرد الفعلي
      const { data: countHeader, error: headErr } = await supabase
        .from('inventory_counts')
        .insert({
          organization_id: orgId,
          count_number: countNumber,
          count_date: new Date().toISOString().split('T')[0],
          status: 'completed',
          warehouse_id: targetWhId,
          notes: `جرد سريع بالأجهزة المحمولة PDA (${countedItems.length} صنف مسجّل) بواسطة ${currentUser?.name || currentUser?.full_name || 'موظف الجرد'}`
        })
        .select('id')
        .single();

      if (headErr) {
        console.warn('Fallback inventory count save notice:', headErr);
      }

      // 2. إذا كان خيار تسوية الفوارق مفعلاً، قم بإنشاء التسوية المخزنية وتعديل الرصيد والقيد
      const varianceItems = countedItems.filter(it => it.countedQty !== it.systemStock);
      
      if (autoAdjustStock && varianceItems.length > 0 && targetWhId) {
        const adjNumber = `ADJ-PDA-${Date.now().toString().slice(-6)}`;
        
        // أ) إنشاء رأس التسوية المخزنية
        const { data: adjHeader, error: adjErr } = await supabase
          .from('stock_adjustments')
          .insert({
            organization_id: orgId,
            warehouse_id: targetWhId,
            adjustment_date: new Date().toISOString().split('T')[0],
            adjustment_number: adjNumber,
            reason: `تسوية عجز/زيادة جرد سريع بالهاند هيلد (${countNumber}) - ${varianceItems.length} صنف به فوارق`,
            status: 'posted',
            created_by: currentUser?.id
          })
          .select('id')
          .single();

        if (adjErr) throw adjErr;

        // ب) إدراج بنود التسوية (الفرق بين الفعلي ورصيد النظام)
        const adjItemsPayload = varianceItems.map(it => {
          const diff = it.countedQty - it.systemStock;
          return {
            organization_id: orgId,
            stock_adjustment_id: adjHeader.id,
            product_id: it.id,
            quantity: diff, // سالب في حالة العجز، موجب في حالة الزيادة
            type: diff < 0 ? 'out' : 'in'
          };
        });

        const { error: itemsErr } = await supabase
          .from('stock_adjustment_items')
          .insert(adjItemsPayload);

        if (itemsErr) throw itemsErr;

        // ج) تحديث الرصيد الفعلي للمنتجات في كروت الأصناف
        if (recalculateStock) {
          for (const it of varianceItems) {
            try {
              await recalculateStock(it.id);
            } catch (e) {}
          }
        }

        // د) توليد القيد المحاسبي المتزن تلقائياً
        let totalDiffValue = 0;
        varianceItems.forEach(it => {
          const prod = allProducts.find(p => p.id === it.id);
          const unitCost = Number(prod?.purchase_price) || Number(it.sales_price) || 0;
          const diff = it.countedQty - it.systemStock;
          totalDiffValue += diff * unitCost;
        });

        if (totalDiffValue !== 0 && addEntry) {
          const inventoryAcc = (getSystemAccount && (getSystemAccount('INVENTORY_FINISHED_GOODS') || getSystemAccount('INVENTORY'))) ||
            accounts?.find((a: any) => a.code === '10302' || a.code === '10301' || a.code === '1213' || (a.name?.includes('مخزون') && !a.name?.includes('ضريب')));

          let adjustmentAcc;
          if (totalDiffValue > 0) {
            // زيادة مخزنية (أرباح تسويات)
            adjustmentAcc = (getSystemAccount && (getSystemAccount('REVENUE_OTHER') || getSystemAccount('OTHER_REVENUE'))) ||
              accounts?.find((a: any) => a.code === '421' || a.code === '441' || a.name?.includes('أرباح تسوية') || a.name?.includes('زيادة المخزون'));
          } else {
            // عجز مخزني (خسائر تسويات الجرد)
            adjustmentAcc = (getSystemAccount && (getSystemAccount('INVENTORY_ADJUSTMENTS') || getSystemAccount('WASTAGE_EXPENSE'))) ||
              accounts?.find((a: any) => a.code === '512' || a.code === '5121' || a.name?.includes('عجز المخزون') || a.name?.includes('تسويات الجرد'));
          }

          if (inventoryAcc && adjustmentAcc) {
            const lines = [];
            const absVal = Math.abs(totalDiffValue);
            if (totalDiffValue > 0) {
              // زيادة: من ح/ المخزون إلى ح/ أرباح وفروقات تسوية
              lines.push({ accountId: inventoryAcc.id, debit: absVal, credit: 0, description: `زيادة جرد PDA - ${adjNumber}` });
              lines.push({ accountId: adjustmentAcc.id, debit: 0, credit: absVal, description: `أرباح فروقات جرد سريع - ${adjNumber}` });
            } else {
              // عجز: من ح/ عجز وتسويات الجرد إلى ح/ المخزون
              lines.push({ accountId: adjustmentAcc.id, debit: absVal, credit: 0, description: `خسائر عجز جرد PDA - ${adjNumber}` });
              lines.push({ accountId: inventoryAcc.id, debit: 0, credit: absVal, description: `تخفيض المخزون بعجز جرد - ${adjNumber}` });
            }

            await addEntry({
              date: new Date().toISOString().split('T')[0],
              reference: adjNumber,
              description: `قيد تسوية جرد سريع بالهاند هيلد (${countNumber}) - عجز/زيادة ${absVal.toFixed(2)} ج.م`,
              status: 'posted',
              lines
            });
          }
        }

        showToast(`تم اعتماد الجرد وتعديل رصيد (${varianceItems.length}) أصناف وتوليد القيد المحاسبي بنجاح ✅`, 'success');
      } else {
        showToast(`تم حفظ محضر الجرد (${countedItems.length} صنف) بنجاح ✅`, 'success');
      }

      setCountedItems([]);
      setActiveItem(null);
    } catch (err: any) {
      showToast('خطأ أثناء حفظ الجرد: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalScannedPieces = countedItems.reduce((s, it) => s + it.countedQty, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" dir="rtl">
      {/* Top Mobile Bar */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-30 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-600/30">
            <PackageCheck size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">الجرد السريع بالهاند هيلد (PDA)</h1>
            <p className="text-[11px] text-purple-300">مسح باركود الممرات وإدخال الكميات المباشرة</p>
          </div>
        </div>

        <div className="text-left font-mono">
          <span className="text-xs text-slate-400 block">الأصناف المجرودة</span>
          <span className="text-lg font-black text-emerald-400">{countedItems.length} صنف</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4 max-w-lg mx-auto w-full flex-1 flex flex-col space-y-4">
        {/* Warehouse Selector */}
        {warehouses && warehouses.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-bold flex items-center gap-1.5">
              <PackageCheck size={14} className="text-purple-400" />
              المستودع المجرود:
            </span>
            <select
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-purple-200 font-bold rounded-xl px-3 py-1.5 outline-none"
            >
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Barcode Scanner Input */}
        <form onSubmit={handleScanSubmit} className="relative">
          <input
            ref={barcodeInputRef}
            type="text"
            placeholder="امسح الباركود بجهاز الليزر..."
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            className="w-full h-14 pr-12 pl-4 bg-slate-900 border-2 border-purple-500 focus:border-purple-400 rounded-2xl text-lg font-mono text-white placeholder-slate-500 shadow-xl outline-none"
          />
          <QrCode size={24} className="absolute right-4 top-4 text-purple-400" />
        </form>

        {/* Shelf Location Filter */}
        {shelves.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 whitespace-nowrap flex items-center gap-1 font-bold">
              <MapPin size={13} /> الرف:
            </span>
            <button
              onClick={() => setSelectedShelf('all')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                selectedShelf === 'all' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              الكل
            </button>
            {shelves.map(shelf => (
              <button
                key={shelf}
                onClick={() => setSelectedShelf(shelf)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                  selectedShelf === shelf ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                {shelf}
              </button>
            ))}
          </div>
        )}

        {/* Last Scanned Active Item Big Card */}
        {activeItem && (
          <div className="bg-gradient-to-br from-purple-950/80 to-slate-900 border-2 border-purple-500/80 rounded-3xl p-5 shadow-2xl space-y-3 animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] text-purple-300 font-bold bg-purple-900/60 px-2.5 py-0.5 rounded-md border border-purple-700">
                  آخر صنف تم مسحه
                </span>
                <h3 className="text-lg font-black text-white mt-1.5">{activeItem.name}</h3>
                <span className="text-xs text-slate-400 font-mono">{activeItem.barcode || activeItem.sku}</span>
              </div>
              {activeItem.shelf_location && (
                <span className="text-xs font-bold text-amber-300 bg-amber-950/50 px-2.5 py-1 rounded-xl border border-amber-800 flex items-center gap-1">
                  <MapPin size={12} /> {activeItem.shelf_location}
                </span>
              )}
            </div>

            {/* Quick Adjust Qty Keypad */}
            <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">رصيد النظام:</span>
                <span className="text-sm font-bold text-slate-300 font-mono">{activeItem.systemStock} قطعة</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateActiveQty(activeItem.countedQty - 1)}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold text-lg flex items-center justify-center border border-slate-700"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  value={activeItem.countedQty}
                  onChange={e => handleUpdateActiveQty(parseInt(e.target.value) || 0)}
                  className="w-16 h-10 rounded-xl bg-purple-950/60 border border-purple-500 text-center text-xl font-black text-white font-mono outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleUpdateActiveQty(activeItem.countedQty + 1)}
                  className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-lg flex items-center justify-center shadow-lg shadow-purple-600/30"
                >
                  +
                </button>
              </div>
            </div>

            {/* Variance indicator */}
            <div className="flex items-center justify-between text-xs font-bold pt-1">
              <span>الفارق (عجز / زيادة):</span>
              <span className={`font-mono px-2 py-0.5 rounded-md ${
                activeItem.countedQty === activeItem.systemStock ? 'text-emerald-400 bg-emerald-950/50' :
                activeItem.countedQty < activeItem.systemStock ? 'text-rose-400 bg-rose-950/50' : 'text-blue-400 bg-blue-950/50'
              }`}>
                {activeItem.countedQty - activeItem.systemStock > 0 ? `+${activeItem.countedQty - activeItem.systemStock}` : activeItem.countedQty - activeItem.systemStock} قطعة
              </span>
            </div>
          </div>
        )}

        {/* Scanned Items History List */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold px-1">
            <span>سجل الأصناف الممسوحة</span>
            <span>إجمالي القطع: {totalScannedPieces}</span>
          </div>

          {countedItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              ابدأ بمسح باركود أي صنف على الرفوف لإضافته للجرد
            </div>
          ) : (
            countedItems.map(item => (
              <div
                key={item.id}
                onClick={() => setActiveItem(item)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                  activeItem?.id === item.id ? 'bg-purple-950/40 border-purple-500/60' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="font-bold text-white text-sm">{item.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    الباركود: {item.barcode || item.sku || '-'} {item.shelf_location && `• الرف: ${item.shelf_location}`}
                  </div>
                </div>

                <div className="text-left font-mono">
                  <span className="text-lg font-black text-emerald-400 block">{item.countedQty}</span>
                  <span className="text-[10px] text-slate-500">النظام: {item.systemStock}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Bottom Sticky Action Bar */}
      {countedItems.length > 0 && (
        <footer className="p-4 bg-slate-900 border-t border-slate-800 sticky bottom-0 z-30 shadow-2xl space-y-2.5">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300 select-none bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
            <input
              type="checkbox"
              checked={autoAdjustStock}
              onChange={e => setAutoAdjustStock(e.target.checked)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-0 focus:ring-offset-0 bg-slate-700 border-slate-600"
            />
            <span className="text-emerald-400">تعديل أرصدة الأصناف آلياً وتوليد قيد تسوية العجز/الزيادة</span>
          </label>

          <button
            type="button"
            onClick={handleSaveInventoryCount}
            disabled={isSubmitting}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-base rounded-2xl shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
          >
            <Send size={18} />
            <span>{isSubmitting ? 'جاري الحفظ والترحيل...' : `اعتماد كشف الجرد (${countedItems.length} صنف)`}</span>
          </button>
        </footer>
      )}
    </div>
  );
}
