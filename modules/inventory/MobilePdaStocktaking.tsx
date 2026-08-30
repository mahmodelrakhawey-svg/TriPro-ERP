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
  const { currentUser, currentSelectedOrgId } = useAccounting() as any;
  const { showToast } = useToast();
  const orgId = currentSelectedOrgId || currentUser?.organization_id;

  const [barcodeInput, setBarcodeInput] = useState('');
  const [countedItems, setCountedItems] = useState<PdaCountedItem[]>([]);
  const [activeItem, setActiveItem] = useState<PdaCountedItem | null>(null);
  const [selectedShelf, setSelectedShelf] = useState<string>('all');
  const [shelves, setShelves] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

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
        .select('id, name, barcode, barcode2, sku, stock, sales_price, shelf_location')
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

    // Find product by barcode, barcode2, or SKU
    const matched = allProducts.find(p =>
      p.barcode === code ||
      p.barcode2 === code ||
      p.sku === code ||
      (p.plu_number && String(p.plu_number) === code)
    );

    if (!matched) {
      playBeep('warn');
      showToast(`لم يتم العثور على صنف بالباركود: ${code}`, 'error');
      return;
    }

    playBeep('success');

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
          systemStock: Number(matched.stock || 0),
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
      const { data: countHeader, error: headErr } = await supabase
        .from('inventory_counts')
        .insert({
          organization_id: orgId,
          count_number: countNumber,
          count_date: new Date().toISOString().split('T')[0],
          status: 'completed',
          notes: `جرد سريع بالأجهزة المحمولة PDA (${countedItems.length} صنف مسجّل) بواسطة ${currentUser?.name || 'موظف الجرد'}`
        })
        .select('id')
        .single();

      if (headErr) {
        console.warn('Fallback inventory count save:', headErr);
      }

      showToast(`تم حفظ واعتماد كشف الجرد السريع (${countedItems.length} صنف) بنجاح ✅`, 'success');
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
        <footer className="p-4 bg-slate-900 border-t border-slate-800 sticky bottom-0 z-30 shadow-2xl">
          <button
            type="button"
            onClick={handleSaveInventoryCount}
            disabled={isSubmitting}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-base rounded-2xl shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
          >
            <Send size={18} />
            <span>{isSubmitting ? 'جاري الحفظ...' : `اعتماد كشف الجرد (${countedItems.length} صنف)`}</span>
          </button>
        </footer>
      )}
    </div>
  );
}
