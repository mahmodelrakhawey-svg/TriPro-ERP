import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  PackageCheck, Plus, Search, Edit2, Trash2, X, Calendar, 
  Barcode, CheckCircle2, AlertTriangle, Printer, Layers, 
  TrendingUp, Clock, FileText, ArrowRight, ShieldAlert,
  Sliders, RefreshCw, Check, ArrowDownToLine, Scale
} from 'lucide-react';

export interface GRNItem {
  id?: string;
  product_id: string;
  product_name: string;
  barcode: string;
  uom_id?: string;
  uom_name?: string;
  ordered_quantity: number;
  received_quantity: number;
  rejected_quantity: number;
  unit_cost: number;
  barcode_scanned?: string;
  batch_number?: string;
  expiry_date?: string;
  rejection_reason?: string;
}

export interface GoodsReceiptNote {
  id: string;
  grn_number: string;
  purchase_order_id?: string;
  vendor_id: string;
  vendor_name?: string;
  warehouse_id: string;
  warehouse_name?: string;
  vendor_invoice_number?: string;
  receipt_date: string;
  status: 'DRAFT' | 'IN_INSPECTION' | 'APPROVED' | 'REJECTED';
  received_by?: string;
  notes?: string;
  created_at: string;
  items?: GRNItem[];
}

export default function GoodsReceiptManager() {
  const { currentUser, suppliers, warehouses, products, settings, recalculateStock } = useAccounting();
  const { showToast } = useToast();
  const currencySymbol = settings?.currency || 'ج.م';

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [grnList, setGrnList] = useState<GoodsReceiptNote[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Scanner & Live Input
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);

  // New / Edit GRN State
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [headerForm, setHeaderForm] = useState({
    grn_number: `GRN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    vendor_id: '',
    warehouse_id: '',
    vendor_invoice_number: '',
    receipt_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const [items, setItems] = useState<GRNItem[]>([]);
  const [selectedGrnForView, setSelectedGrnForView] = useState<GoodsReceiptNote | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const orgId = currentUser?.organization_id;

  // 🔊 Audio Beep on Scan
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6 Note
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {}
  };

  // 📥 Fetch GRNs and Purchase Orders
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Fetch GRNs
      const { data: grns, error: grnErr } = await supabase
        .from('goods_receipt_notes')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (grnErr) throw grnErr;

      const formattedGrns = (grns || []).map(g => ({
        ...g,
        vendor_name: suppliers.find(s => s.id === g.vendor_id)?.name || 'مورد غير معروف',
        warehouse_name: warehouses.find(w => w.id === g.warehouse_id)?.name || 'مستودع غير معروف'
      }));
      setGrnList(formattedGrns);

      // 2. Fetch Purchase Orders
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('organization_id', orgId)
        .in('status', ['posted', 'sent', 'partial_received', 'approved', 'OPEN'])
        .order('created_at', { ascending: false });

      setPurchaseOrders(pos || []);
    } catch (err: any) {
      console.error(err);
      showToast('خطأ أثناء جلب أذون الاستلام', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId, suppliers, warehouses]);

  // Set default warehouse & vendor
  useEffect(() => {
    if (warehouses.length > 0 && !headerForm.warehouse_id) {
      setHeaderForm(prev => ({ ...prev, warehouse_id: warehouses[0].id }));
    }
    if (suppliers.length > 0 && !headerForm.vendor_id) {
      setHeaderForm(prev => ({ ...prev, vendor_id: suppliers[0].id }));
    }
  }, [warehouses, suppliers]);

  // 📦 When PO is selected, auto-populate items
  const handlePoChange = async (poId: string) => {
    setSelectedPoId(poId);
    if (!poId) {
      setItems([]);
      return;
    }

    const po = purchaseOrders.find(p => p.id === poId);
    if (po) {
      setHeaderForm(prev => ({
        ...prev,
        vendor_id: po.supplier_id || po.vendor_id || prev.vendor_id,
        warehouse_id: po.warehouse_id || prev.warehouse_id
      }));

      // Fetch PO Items
      try {
        const { data: poItems, error } = await supabase
          .from('purchase_order_items')
          .select('*')
          .eq('purchase_order_id', poId);

        if (error) throw error;

        const mappedItems: GRNItem[] = (poItems || []).map(pi => {
          const prod = products.find(p => p.id === pi.product_id);
          return {
            product_id: pi.product_id,
            product_name: prod?.name || pi.item_name || 'صنف',
            barcode: prod?.barcode || prod?.sku || '',
            uom_id: pi.uom_id || prod?.base_uom_id || undefined,
            uom_name: prod?.unit || 'قطعة',
            ordered_quantity: Number(pi.quantity || 0),
            received_quantity: Number(pi.quantity || 0), // Default to full matching
            rejected_quantity: 0,
            unit_cost: Number(pi.unit_price || prod?.purchase_price || 0),
            batch_number: `BATCH-${Date.now().toString().slice(-4)}`,
            expiry_date: prod?.expiry_date || undefined
          };
        });

        setItems(mappedItems);
        showToast(`تم تحميل بنود أمر الشراء (${mappedItems.length} صنف)`, 'info');
      } catch (e) {
        console.error(e);
      }
    }
  };

  // 🎯 Handle Barcode Scanning in Receiving Area
  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const scannedCode = barcodeInput.trim().toLowerCase();
    playBeep();

    // Check if product matches in existing items
    const itemIndex = items.findIndex(it => 
      it.barcode.toLowerCase() === scannedCode ||
      (it.barcode_scanned && it.barcode_scanned.toLowerCase() === scannedCode) ||
      it.product_name.toLowerCase().includes(scannedCode)
    );

    if (itemIndex >= 0) {
      const updated = [...items];
      updated[itemIndex].received_quantity += 1;
      updated[itemIndex].barcode_scanned = scannedCode;
      setItems(updated);
      showToast(`+1 ${updated[itemIndex].product_name} (المستلم: ${updated[itemIndex].received_quantity})`, 'success');
    } else {
      // Find product in catalog
      let matchedUomName: string | undefined;
      let matchedProd = products.find(p => 
        p.barcode?.toLowerCase() === scannedCode || 
        p.sku?.toLowerCase() === scannedCode ||
        (p as any).barcode2?.toLowerCase() === scannedCode
      );

      if (!matchedProd) {
        for (const p of products) {
          if (Array.isArray((p as any).unit_barcodes)) {
            const foundUom = (p as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === scannedCode);
            if (foundUom) {
              matchedProd = p;
              matchedUomName = foundUom.uom_name;
              break;
            }
          }
        }
      }

      if (matchedProd) {
        setItems(prev => [
          ...prev,
          {
            product_id: matchedProd.id,
            product_name: matchedProd.name,
            barcode: matchedProd.barcode || matchedProd.sku || '',
            uom_name: matchedUomName || matchedProd.unit || 'قطعة',
            ordered_quantity: 0, // Unlisted in PO
            received_quantity: 1,
            rejected_quantity: 0,
            unit_cost: matchedProd.purchase_price || 0,
            barcode_scanned: scannedCode,
            batch_number: `BATCH-${Date.now().toString().slice(-4)}`
          }
        ]);
        showToast(`تمت إضافة صنف جديد للاستلام: ${matchedProd.name}`, 'info');
      } else {
        showToast(`باركود غير مسجل بالنظام: ${scannedCode}`, 'error');
      }
    }

    setBarcodeInput('');
    if (barcodeRef.current) barcodeRef.current.focus();
  };

  // 💾 Save & Approve GRN
  const handleSaveGrn = async (status: 'APPROVED' | 'DRAFT') => {
    if (!headerForm.warehouse_id) {
      showToast('يرجى اختيار المستودع', 'error');
      return;
    }
    if (!headerForm.vendor_id) {
      showToast('يرجى اختيار المورد', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('يرجى إدراج أصناف الاستلام أولاً', 'error');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Insert GRN Header
      const { data: grnHeader, error: hErr } = await supabase
        .from('goods_receipt_notes')
        .insert([{
          organization_id: orgId,
          grn_number: headerForm.grn_number,
          purchase_order_id: selectedPoId || null,
          vendor_id: headerForm.vendor_id,
          warehouse_id: headerForm.warehouse_id,
          vendor_invoice_number: headerForm.vendor_invoice_number || null,
          receipt_date: headerForm.receipt_date,
          status,
          received_by: currentUser?.id || null,
          notes: headerForm.notes || null
        }])
        .select()
        .single();

      if (hErr) throw hErr;

      // 2. Insert GRN Items
      const itemsPayload = items.map(it => ({
        grn_id: grnHeader.id,
        product_id: it.product_id,
        uom_id: it.uom_id || null,
        ordered_quantity: it.ordered_quantity,
        received_quantity: it.received_quantity,
        rejected_quantity: it.rejected_quantity,
        unit_cost: it.unit_cost,
        barcode_scanned: it.barcode_scanned || it.barcode || null,
        batch_number: it.batch_number || null,
        expiry_date: it.expiry_date || null,
        rejection_reason: it.rejection_reason || null
      }));

      const { error: itemsErr } = await supabase
        .from('goods_receipt_items')
        .insert(itemsPayload);

      if (itemsErr) throw itemsErr;

      // 3. If Approved, recalculate stock for received products
      if (status === 'APPROVED') {
        for (const it of items) {
          try {
            await recalculateStock(it.product_id);
          } catch (e) {}
        }

        // Update PO Status
        if (selectedPoId) {
          await supabase
            .from('purchase_orders')
            .update({ status: 'received' })
            .eq('id', selectedPoId);
        }
      }

      showToast(`تم حفظ واعتماد إذن الاستلام (${headerForm.grn_number}) بنجاح ✅`, 'success');
      
      // Reset
      setActiveTab('list');
      fetchData();
      setItems([]);
      setSelectedPoId('');
      setHeaderForm({
        grn_number: `GRN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        vendor_id: suppliers[0]?.id || '',
        warehouse_id: warehouses[0]?.id || '',
        vendor_invoice_number: '',
        receipt_date: new Date().toISOString().split('T')[0],
        notes: ''
      });

    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'فشل حفظ إذن الاستلام', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 🔍 View GRN Details
  const handleViewGrn = async (grn: GoodsReceiptNote) => {
    try {
      const { data: grnItems } = await supabase
        .from('goods_receipt_items')
        .select('*')
        .eq('grn_id', grn.id);

      const mapped: GRNItem[] = (grnItems || []).map(gi => {
        const prod = products.find(p => p.id === gi.product_id);
        return {
          ...gi,
          product_name: prod?.name || 'صنف',
          barcode: prod?.barcode || prod?.sku || '',
          uom_name: prod?.unit || 'قطعة'
        };
      });

      setSelectedGrnForView({ ...grn, items: mapped });
      setIsViewModalOpen(true);
    } catch (e) {
      showToast('فشل جلب تفاصيل الإذن', 'error');
    }
  };

  // Filtered List
  const filteredGrnList = useMemo(() => {
    return grnList.filter(g => {
      const matchSearch = 
        g.grn_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (g.vendor_name && g.vendor_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (g.vendor_invoice_number && g.vendor_invoice_number.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStatus = statusFilter === 'ALL' || g.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [grnList, searchTerm, statusFilter]);

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100 font-sans" dir="rtl">
      
      {/* 🏷️ Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <PackageCheck className="text-purple-400" size={28} />
            أذون الاستلام المخزني ومطابقة الباركود (Goods Receipt Notes - GRN)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            استلام البضائع وفحص المطابقة الثلاثية (3-Way Match) مع أوامر الشراء، مسح الباركود، توثيق تواريخ الصلاحية وعزل المرتجعات.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'list' ? (
            <button
              onClick={() => setActiveTab('create')}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-black px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all"
            >
              <Plus size={16} /> إنشاء إذن استلام وفحص جديد
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('list')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all"
            >
              <ArrowRight size={16} /> العودة لسجل أذون الاستلام
            </button>
          )}
        </div>
      </div>

      {/* 🧭 TAB 1: GRN List */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute right-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="بحث برقم الإذن، اسم المورد، فاتورة المورد..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-xs text-white placeholder:text-slate-600 focus:border-purple-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none"
              >
                <option value="ALL">جميع الحالات</option>
                <option value="APPROVED">معتمد ومستلم (Approved)</option>
                <option value="IN_INSPECTION">قيد الفحص (In Inspection)</option>
                <option value="DRAFT">مسودة (Draft)</option>
                <option value="REJECTED">مرفوض (Rejected)</option>
              </select>

              <button
                onClick={fetchData}
                className="p-2 bg-slate-900 hover:bg-slate-850 rounded-xl border border-slate-800 text-slate-400 hover:text-white transition-all"
                title="تحديث البيانات"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 font-black text-slate-400">
                  <th className="p-3.5">رقم إذن الاستلام</th>
                  <th className="p-3.5">المورد</th>
                  <th className="p-3.5">المستودع المستلم</th>
                  <th className="p-3.5">فاتورة المورد</th>
                  <th className="p-3.5">تاريخ الاستلام</th>
                  <th className="p-3.5 text-center">الحالة</th>
                  <th className="p-3.5 text-center">معاينة / طباعة</th>
                </tr>
              </thead>
              <tbody>
                {filteredGrnList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      لا توجد أذون استلام مخزني مسجلة حتى الآن
                    </td>
                  </tr>
                ) : (
                  filteredGrnList.map(g => (
                    <tr key={g.id} className="border-b border-slate-850 hover:bg-slate-900/40 transition-all">
                      <td className="p-3.5 font-mono font-black text-purple-400">{g.grn_number}</td>
                      <td className="p-3.5 font-bold text-white">{g.vendor_name}</td>
                      <td className="p-3.5 text-slate-300 font-bold">{g.warehouse_name}</td>
                      <td className="p-3.5 font-mono text-slate-400">{g.vendor_invoice_number || '---'}</td>
                      <td className="p-3.5 font-mono text-slate-400">{g.receipt_date}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                          g.status === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' :
                          g.status === 'IN_INSPECTION' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {g.status === 'APPROVED' ? 'معتمد ومستلم' : g.status === 'IN_INSPECTION' ? 'قيد الفحص' : g.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => handleViewGrn(g)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-purple-300 rounded-lg font-bold border border-slate-800 transition-all"
                        >
                          معاينة البنود
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ➕ TAB 2: Create New GRN with Scanner */}
      {activeTab === 'create' && (
        <div className="space-y-6">
          
          {/* Header Info */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="font-black text-sm text-purple-400 flex items-center gap-2">
              <FileText size={16} /> بيانات إذن الاستلام والتوريد
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">رقم إذن الاستلام (GRN)</label>
                <input
                  type="text"
                  value={headerForm.grn_number}
                  onChange={e => setHeaderForm({ ...headerForm, grn_number: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 font-mono text-purple-300 font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">ربط بأمر شراء (اختياري)</label>
                <select
                  value={selectedPoId}
                  onChange={e => handlePoChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-500"
                >
                  <option value="">-- استلام حر مباشر (بدون أمر شراء) --</option>
                  {purchaseOrders.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.order_number || p.po_number} ({Number(p.total_amount || 0).toFixed(0)} {currencySymbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">المورد *</label>
                <select
                  value={headerForm.vendor_id}
                  onChange={e => setHeaderForm({ ...headerForm, vendor_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-500"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">المستودع المستلم *</label>
                <select
                  value={headerForm.warehouse_id}
                  onChange={e => setHeaderForm({ ...headerForm, warehouse_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-500"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">رقم فاتورة / بوليصة المورد</label>
                <input
                  type="text"
                  value={headerForm.vendor_invoice_number}
                  onChange={e => setHeaderForm({ ...headerForm, vendor_invoice_number: e.target.value })}
                  placeholder="مثال: INV-98421"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">تاريخ الاستلام الفعلي</label>
                <input
                  type="date"
                  value={headerForm.receipt_date}
                  onChange={e => setHeaderForm({ ...headerForm, receipt_date: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">ملاحظات الاستلام</label>
                <input
                  type="text"
                  value={headerForm.notes}
                  onChange={e => setHeaderForm({ ...headerForm, notes: e.target.value })}
                  placeholder="مثال: تم فحص درجة الحرارة 4 درجات مئوية"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* 🎯 Live Barcode Receiving Scanner */}
          <div className="bg-gradient-to-r from-purple-950/40 via-slate-950 to-indigo-950/40 border border-purple-900/40 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-black text-sm text-purple-300 flex items-center gap-2">
                <Barcode size={18} className="text-purple-400" />
                ماسح الباركود للاستلام الفوري ومطابقة الكميات
              </span>
              <span className="text-xs text-slate-400 font-bold">
                إجمالي الأصناف: <span className="font-mono text-purple-400 font-black">{items.length}</span>
              </span>
            </div>

            <form onSubmit={handleBarcodeScan} className="flex gap-2">
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="امسح باركود الصنف المستلم هنا لزيادة الكمية ومطابقتها مباشرة..."
                className="flex-1 bg-slate-900 border border-purple-800/60 rounded-xl px-4 py-3 text-sm text-white font-mono font-bold placeholder:text-slate-600 focus:border-purple-400 outline-none shadow-inner"
                autoFocus
              />
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 text-white font-black px-6 py-3 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-purple-600/20 transition-all"
              >
                <ArrowDownToLine size={16} /> مسح
              </button>
            </form>
          </div>

          {/* 📋 Received Items Table (3-Way Matching) */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/70 border-b border-slate-800 font-black text-slate-400">
                  <th className="p-3.5">الصنف والباركود</th>
                  <th className="p-3.5 text-center">المطلوب بأمر الشراء</th>
                  <th className="p-3.5 text-center">المستلم الفعلي</th>
                  <th className="p-3.5 text-center">المرفوض (تالف/خطأ)</th>
                  <th className="p-3.5">سعر التكلفة</th>
                  <th className="p-3.5">رقم التشغيلة والصلاحية</th>
                  <th className="p-3.5 text-center">حالة المطابقة</th>
                  <th className="p-3.5 text-center">حذف</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500">
                      لم يتم إدراج أي أصناف بعد. اختر أمر شراء أو امسح الباركود لبدء الاستلام.
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const isMatched = it.ordered_quantity > 0 && it.received_quantity === it.ordered_quantity && it.rejected_quantity === 0;
                    const isPartial = it.ordered_quantity > 0 && it.received_quantity < it.ordered_quantity;
                    const isOver = it.ordered_quantity > 0 && it.received_quantity > it.ordered_quantity;
                    const hasRejection = it.rejected_quantity > 0;

                    return (
                      <tr key={idx} className="border-b border-slate-850 hover:bg-slate-900/40 transition-all">
                        <td className="p-3.5">
                          <div className="font-bold text-white">{it.product_name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{it.barcode}</div>
                        </td>

                        <td className="p-3.5 text-center font-mono font-bold text-slate-400">
                          {it.ordered_quantity} {it.uom_name}
                        </td>

                        {/* Received Quantity Input */}
                        <td className="p-3.5 text-center">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={it.received_quantity}
                            onChange={e => {
                              const updated = [...items];
                              updated[idx].received_quantity = parseFloat(e.target.value) || 0;
                              setItems(updated);
                            }}
                            className="w-20 bg-slate-900 border border-slate-750 text-center font-mono font-black text-emerald-400 rounded-lg p-1.5 outline-none focus:border-emerald-500"
                          />
                        </td>

                        {/* Rejected Quantity Input */}
                        <td className="p-3.5 text-center">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={it.rejected_quantity}
                            onChange={e => {
                              const updated = [...items];
                              updated[idx].rejected_quantity = parseFloat(e.target.value) || 0;
                              setItems(updated);
                            }}
                            className="w-20 bg-slate-900 border border-slate-750 text-center font-mono font-black text-red-400 rounded-lg p-1.5 outline-none focus:border-red-500"
                          />
                        </td>

                        <td className="p-3.5 font-mono text-slate-300">
                          {it.unit_cost.toFixed(2)} {currencySymbol}
                        </td>

                        <td className="p-3.5 space-y-1">
                          <input
                            type="text"
                            value={it.batch_number || ''}
                            onChange={e => {
                              const updated = [...items];
                              updated[idx].batch_number = e.target.value;
                              setItems(updated);
                            }}
                            placeholder="رقم التشغيلة (Batch)"
                            className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-[11px] font-mono text-slate-300"
                          />
                          <input
                            type="date"
                            value={it.expiry_date || ''}
                            onChange={e => {
                              const updated = [...items];
                              updated[idx].expiry_date = e.target.value;
                              setItems(updated);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-[11px] text-slate-300"
                          />
                        </td>

                        {/* Matching Badge */}
                        <td className="p-3.5 text-center">
                          {hasRejection ? (
                            <span className="bg-red-950 text-red-400 border border-red-900 px-2 py-0.5 rounded text-[10px] font-black">
                              ⚠️ مرفوض ({it.rejected_quantity})
                            </span>
                          ) : isMatched ? (
                            <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 px-2 py-0.5 rounded text-[10px] font-black">
                              ✅ مطابق 100%
                            </span>
                          ) : isPartial ? (
                            <span className="bg-amber-950 text-amber-400 border border-amber-900 px-2 py-0.5 rounded text-[10px] font-black">
                              ⏳ استلام جزئي
                            </span>
                          ) : isOver ? (
                            <span className="bg-blue-950 text-blue-400 border border-blue-900 px-2 py-0.5 rounded text-[10px] font-black">
                              🔵 استلام زائد (+{it.received_quantity - it.ordered_quantity})
                            </span>
                          ) : (
                            <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px] font-black">
                              استلام مباشر
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-400 p-1"
                            title="حذف البند"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400">
              إجمالي القيمة التقديرية للبضاعة المستلمة:{' '}
              <span className="font-mono font-black text-emerald-400 text-sm">
                {items.reduce((sum, i) => sum + (i.received_quantity * i.unit_cost), 0).toFixed(2)} {currencySymbol}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                disabled={isLoading || items.length === 0}
                onClick={() => handleSaveGrn('DRAFT')}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all"
              >
                حفظ كمسودة
              </button>
              <button
                disabled={isLoading || items.length === 0}
                onClick={() => handleSaveGrn('APPROVED')}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                <Check size={16} /> اعتماد إذن الاستلام وتحديث المخزون
              </button>
            </div>
          </div>

        </div>
      )}

      {/* 🔍 View GRN Modal */}
      {isViewModalOpen && selectedGrnForView && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <div>
                <h2 className="font-black text-base text-white flex items-center gap-2">
                  <PackageCheck size={20} className="text-purple-400" />
                  إذن استلام مخزني: {selectedGrnForView.grn_number}
                </h2>
                <div className="text-xs text-slate-400 mt-1">
                  المورد: <span className="text-white font-bold">{selectedGrnForView.vendor_name}</span> | المستودع: <span className="text-white font-bold">{selectedGrnForView.warehouse_name}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1"
                >
                  <Printer size={14} /> طباعة
                </button>
                <button onClick={() => setIsViewModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 font-bold text-slate-400">
                    <th className="p-3">الصنف</th>
                    <th className="p-3 text-center">المطلوب</th>
                    <th className="p-3 text-center">المستلم الفعلي</th>
                    <th className="p-3 text-center">المرفوض</th>
                    <th className="p-3">التكلفة</th>
                    <th className="p-3">التشغيلة / الصلاحية</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedGrnForView.items || []).map((it, i) => (
                    <tr key={i} className="border-b border-slate-850">
                      <td className="p-3 font-bold text-white">{it.product_name}</td>
                      <td className="p-3 text-center font-mono">{it.ordered_quantity}</td>
                      <td className="p-3 text-center font-mono font-black text-emerald-400">{it.received_quantity}</td>
                      <td className="p-3 text-center font-mono text-red-400">{it.rejected_quantity}</td>
                      <td className="p-3 font-mono">{it.unit_cost.toFixed(2)} {currencySymbol}</td>
                      <td className="p-3 font-mono text-slate-400">
                        {it.batch_number || '---'} {it.expiry_date ? `| ${it.expiry_date}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
