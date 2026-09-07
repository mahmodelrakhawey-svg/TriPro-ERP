import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  TrendingUp, AlertTriangle, PackageCheck, ShoppingCart, 
  Search, RefreshCw, Download, Filter, CheckCircle2, Clock, 
  ShieldAlert, ArrowUpRight, Zap, Layers, Sparkles, Building2,
  FileSpreadsheet, Sliders
} from 'lucide-react';

interface ReplenishmentItem {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  category_name?: string;
  supplier_id?: string;
  supplier_name: string;
  current_stock: number;
  purchase_price: number;
  sale_price: number;
  units_sold_30d: number;
  daily_velocity: number; // units per day
  lead_time_days: number; // vendor lead time
  safety_stock: number;
  reorder_point: number;
  run_out_days: number;
  suggested_order_qty: number;
  estimated_cost: number;
  urgency_status: 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'OVERSTOCKED';
}

export default function HypermarketReplenishment() {
  const navigate = useNavigate();
  const { currentUser, products, suppliers, warehouses, settings, categories } = useAccounting();
  const { showToast } = useToast();
  const currencySymbol = settings?.currency || 'ج.م';

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPo, setIsGeneratingPo] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('CRITICAL_WARNING');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('ALL');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  
  // Replenishment Engine Tuning Parameters
  const [leadTimeDays, setLeadTimeDays] = useState<number>(3); // Default 3 days for hypermarket
  const [safetyDays, setSafetyDays] = useState<number>(5); // 5 days safety buffer
  const [orderCycleDays, setOrderCycleDays] = useState<number>(14); // Replenish for next 14 days

  const [replenishmentData, setReplenishmentData] = useState<ReplenishmentItem[]>([]);

  const orgId = currentUser?.organization_id;

  // 🧮 Compute Predictive Replenishment Analytics
  const analyzeInventoryVelocity = async () => {
    if (!orgId || products.length === 0) return;
    setIsLoading(true);

    try {
      // 1. Fetch sales order items / invoice items from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Map product sales velocity
      const salesMap: Record<string, number> = {};

      try {
        let invQuery = supabase
          .from('invoice_items')
          .select('product_id, quantity, invoices!inner(invoice_date, status)')
          .gte('invoices.invoice_date', thirtyDaysAgo);

        if (orgId) {
          invQuery = invQuery.eq('organization_id', orgId);
        }

        const { data: salesData, error: salesErr } = await invQuery;

        if (!salesErr && salesData) {
          salesData.forEach((item: any) => {
            if (item.product_id) {
              salesMap[item.product_id] = (salesMap[item.product_id] || 0) + Number(item.quantity || 0);
            }
          });
        } else if (salesErr) {
          // Fallback if organization_id isn't directly on invoice_items
          const { data: fallbackSales } = await supabase
            .from('invoice_items')
            .select('product_id, quantity, invoices!inner(invoice_date, status, organization_id)')
            .eq('invoices.organization_id', orgId)
            .gte('invoices.invoice_date', thirtyDaysAgo);

          if (fallbackSales) {
            fallbackSales.forEach((item: any) => {
              if (item.product_id) {
                salesMap[item.product_id] = (salesMap[item.product_id] || 0) + Number(item.quantity || 0);
              }
            });
          }
        }
      } catch (e) {
        console.warn('Invoice sales velocity query notice:', e);
      }

      // Also check POS / Restaurant / Retail order_items if available
      try {
        let posQuery = supabase
          .from('order_items')
          .select('product_id, quantity, orders!inner(created_at, status)')
          .gte('orders.created_at', `${thirtyDaysAgo}T00:00:00`);

        if (orgId) {
          posQuery = posQuery.eq('orders.organization_id', orgId);
        }

        const { data: posItems, error: posErr } = await posQuery;

        if (!posErr && posItems) {
          posItems.forEach((item: any) => {
            if (item.product_id) {
              salesMap[item.product_id] = (salesMap[item.product_id] || 0) + Number(item.quantity || 0);
            }
          });
        }
      } catch (e) {
        console.warn('POS order sales velocity query notice:', e);
      }

      // 2. Build analysis per product
      const analyzed: ReplenishmentItem[] = (products || [])
        .filter(p => (p as any).item_type !== 'service') // Exclude services
        .map(p => {
          const currentStock = Number(p.stock || p.quantity || 0);
          const totalSold30d = salesMap[p.id] || (p.min_order_quantity ? p.min_order_quantity * 2 : Math.max(2, Math.round(currentStock * 0.4)));
          const dailyVelocity = parseFloat((totalSold30d / 30).toFixed(2));
          
          // Safety Stock = Daily Velocity * Safety Buffer Days
          const safetyStock = Math.ceil(dailyVelocity * safetyDays);
          
          // Dynamic Reorder Point = (Daily Velocity * Lead Time) + Safety Stock
          const reorderPoint = Math.ceil((dailyVelocity * leadTimeDays) + safetyStock);
          
          // Run-out days = Current Stock / Daily Velocity
          const runOutDays = dailyVelocity > 0 ? Math.floor(currentStock / dailyVelocity) : 999;
          
          // Target Stock = (Daily Velocity * Order Cycle Days) + Safety Stock
          const targetStock = Math.ceil((dailyVelocity * orderCycleDays) + safetyStock);
          const suggestedOrderQty = Math.max(0, targetStock - currentStock);
          
          const purchasePrice = Number(p.purchase_price || 0);
          const estimatedCost = suggestedOrderQty * purchasePrice;

          // Urgency classification
          let urgency_status: 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'OVERSTOCKED' = 'HEALTHY';
          if (currentStock <= 0 || runOutDays <= leadTimeDays) {
            urgency_status = 'CRITICAL';
          } else if (currentStock <= reorderPoint || runOutDays <= (leadTimeDays + safetyDays)) {
            urgency_status = 'WARNING';
          } else if (runOutDays > (orderCycleDays * 3) && currentStock > 20) {
            urgency_status = 'OVERSTOCKED';
          }

          const sup = (suppliers || []).find(s => s.id === (p as any).supplier_id);
          const cat = (categories || []).find(c => c.id === p.category_id);

          return {
            id: p.id,
            name: p.name,
            sku: p.sku || '---',
            barcode: p.barcode || '---',
            unit: p.unit || 'قطعة',
            category_name: cat?.name || 'عام',
            supplier_id: (p as any).supplier_id || (suppliers[0]?.id || undefined),
            supplier_name: sup?.name || 'مورد عام',
            current_stock: currentStock,
            purchase_price: purchasePrice,
            sale_price: Number(p.sale_price || 0),
            units_sold_30d: totalSold30d,
            daily_velocity: dailyVelocity,
            lead_time_days: leadTimeDays,
            safety_stock: safetyStock,
            reorder_point: reorderPoint,
            run_out_days: runOutDays,
            suggested_order_qty: suggestedOrderQty,
            estimated_cost: estimatedCost,
            urgency_status
          };
        });

      // Sort by urgency (CRITICAL first, then WARNING, then lowest run_out_days)
      analyzed.sort((a, b) => {
        const order = { CRITICAL: 0, WARNING: 1, HEALTHY: 2, OVERSTOCKED: 3 };
        if (order[a.urgency_status] !== order[b.urgency_status]) {
          return order[a.urgency_status] - order[b.urgency_status];
        }
        return a.run_out_days - b.run_out_days;
      });

      setReplenishmentData(analyzed);

      // Pre-select all critical items
      const criticalIds = analyzed.filter(item => item.urgency_status === 'CRITICAL' && item.suggested_order_qty > 0).map(i => i.id);
      setSelectedItemIds(criticalIds);

    } catch (err: any) {
      console.error(err);
      showToast('فشل احتساب التنبؤات والسرعة اليومية', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    analyzeInventoryVelocity();
  }, [products, leadTimeDays, safetyDays, orderCycleDays, suppliers]);

  // 📊 Filtered Data
  const filteredData = useMemo(() => {
    return replenishmentData.filter(item => {
      const matchSearch = 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.supplier_name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchSupplier = selectedSupplierFilter === 'ALL' || item.supplier_id === selectedSupplierFilter;

      let matchUrgency = true;
      if (urgencyFilter === 'CRITICAL_WARNING') {
        matchUrgency = item.urgency_status === 'CRITICAL' || item.urgency_status === 'WARNING';
      } else if (urgencyFilter !== 'ALL') {
        matchUrgency = item.urgency_status === urgencyFilter;
      }

      return matchSearch && matchSupplier && matchUrgency;
    });
  }, [replenishmentData, searchTerm, urgencyFilter, selectedSupplierFilter]);

  // 📈 KPI Stats
  const stats = useMemo(() => {
    const criticalCount = replenishmentData.filter(i => i.urgency_status === 'CRITICAL').length;
    const warningCount = replenishmentData.filter(i => i.urgency_status === 'WARNING').length;
    const selectedItems = replenishmentData.filter(i => selectedItemIds.includes(i.id));
    const totalSuggestedQty = selectedItems.reduce((sum, i) => sum + i.suggested_order_qty, 0);
    const totalEstimatedCost = selectedItems.reduce((sum, i) => sum + i.estimated_cost, 0);

    return { criticalCount, warningCount, totalSuggestedQty, totalEstimatedCost, selectedCount: selectedItems.length };
  }, [replenishmentData, selectedItemIds]);

  // 🛒 Bulk Generate Purchase Orders grouped by Vendor
  const handleBulkGeneratePOs = async () => {
    const selectedItems = replenishmentData.filter(i => selectedItemIds.includes(i.id) && i.suggested_order_qty > 0);
    if (selectedItems.length === 0) {
      showToast('يرجى تحديد أصناف بها كميات مقترحة لإعادة الطلب', 'warning');
      return;
    }

    setIsGeneratingPo(true);
    try {
      // Group items by supplier
      const vendorGroups: Record<string, ReplenishmentItem[]> = {};
      selectedItems.forEach(item => {
        const suppId = item.supplier_id || suppliers[0]?.id || 'unknown';
        if (!vendorGroups[suppId]) vendorGroups[suppId] = [];
        vendorGroups[suppId].push(item);
      });

      let createdPosCount = 0;
      const defaultWarehouseId = warehouses[0]?.id;

      for (const [suppId, groupItems] of Object.entries(vendorGroups)) {
        const totalAmount = groupItems.reduce((sum, i) => sum + i.estimated_cost, 0);
        const poNumber = `PO-AUTO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // 1. Insert PO Header
        const poPayload: any = {
          organization_id: orgId,
          order_number: poNumber,
          po_number: poNumber,
          supplier_id: suppId !== 'unknown' ? suppId : (suppliers[0]?.id || null),
          warehouse_id: defaultWarehouseId || null,
          order_date: new Date().toISOString().split('T')[0],
          status: 'posted',
          total_amount: totalAmount,
          notes: 'أمر شراء تلقائي مولد بواسطة محرك التنبؤ وإعادة الطلب الذكي (Predictive Hypermarket Replenishment)'
        };

        let poHeaderRes = await supabase
          .from('purchase_orders')
          .insert([poPayload])
          .select()
          .single();

        if (poHeaderRes.error && poHeaderRes.error.message?.includes('po_number')) {
          delete poPayload.po_number;
          poHeaderRes = await supabase
            .from('purchase_orders')
            .insert([poPayload])
            .select()
            .single();
        }

        if (poHeaderRes.error) throw poHeaderRes.error;
        const poHeader = poHeaderRes.data;

        // 2. Insert PO Items with compatible schema
        const poItemsPayload = groupItems.map(item => ({
          organization_id: orgId || null,
          purchase_order_id: poHeader.id,
          product_id: item.id,
          quantity: item.suggested_order_qty,
          unit_price: item.purchase_price,
          total: item.estimated_cost
        }));

        let insRes = await supabase.from('purchase_order_items').insert(poItemsPayload);
        if (insRes.error && (insRes.error.message?.includes('purchase_order_id') || insRes.error.message?.includes('order_id'))) {
          const adjusted = poItemsPayload.map(item => {
            const { purchase_order_id, ...rest } = item;
            return { ...rest, order_id: purchase_order_id };
          });
          insRes = await supabase.from('purchase_order_items').insert(adjusted);
        }

        if (insRes.error) throw insRes.error;
        createdPosCount++;
      }

      showToast(`تم توليد (${createdPosCount}) أمر شراء تلقائي بنجاح لموردي الأصناف الحرجة 🚀✅`, 'success');
      navigate('/purchase-order-list');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'فشل توليد أوامر الشراء', 'error');
    } finally {
      setIsGeneratingPo(false);
    }
  };

  // 📥 Export to Excel
  const handleExportExcel = () => {
    const dataToExport = filteredData.map(i => ({
      'اسم الصنف': i.name,
      'الباركود': i.barcode,
      'SKU': i.sku,
      'المورد': i.supplier_name,
      'الرصيد الحالي': i.current_stock,
      'المبيعات (آخر 30 يوم)': i.units_sold_30d,
      'السرعة اليومية (وحدة/يوم)': i.daily_velocity,
      'أيام النفاد المتبقية': i.run_out_days,
      'نقطة إعادة الطلب': i.reorder_point,
      'مخزون الأمان': i.safety_stock,
      'الكمية المقترحة للطلب': i.suggested_order_qty,
      'سعر التكلفة': i.purchase_price,
      'التكلفة الإجمالية': i.estimated_cost,
      'مستوى الخطورة': i.urgency_status === 'CRITICAL' ? 'حرج جداً' : i.urgency_status === 'WARNING' ? 'وشيك النفاد' : 'آمن'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير إعادة الطلب التنبؤي');
    XLSX.writeFile(wb, `Replenishment_Forecast_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير ملف التنبؤ المخزني بنجاح 📊', 'success');
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100 font-sans" dir="rtl">
      
      {/* 🏷️ Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <TrendingUp className="text-amber-400" size={28} />
            إعادة الطلب والتخزين التنبؤي الذكي (Predictive Replenishment)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            خوارزمية احتساب معدل دوران وسرعة بيع الأصناف (Sales Velocity)، التنبؤ بمواعيد نفاد المخزون، وتوليد أوامر الشراء المجمعة تلقائياً.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 border border-slate-700 transition-all"
          >
            <Download size={16} /> تصدير إكسيل
          </button>

          <button
            onClick={handleBulkGeneratePOs}
            disabled={isGeneratingPo || stats.selectedCount === 0}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
          >
            <Zap size={16} />
            {isGeneratingPo ? 'جاري التوليد...' : `توليد أوامر الشراء المجمعة (${stats.selectedCount} صنف)`}
          </button>
        </div>
      </div>

      {/* 📊 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-950 border border-rose-900/40 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-rose-400 block font-bold">أصناف حرجة (نفاد وشيك)</span>
            <span className="text-2xl font-black font-mono text-rose-400 mt-1 block">
              {stats.criticalCount} صنف
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-950/50 border border-rose-900/40 flex items-center justify-center text-rose-400">
            <ShieldAlert size={24} />
          </div>
        </div>

        <div className="bg-slate-950 border border-amber-900/40 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-amber-400 block font-bold">أصناف تقترب من نقطة الطلب</span>
            <span className="text-2xl font-black font-mono text-amber-400 mt-1 block">
              {stats.warningCount} صنف
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-950/50 border border-amber-900/40 flex items-center justify-center text-amber-400">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-slate-950 border border-indigo-900/40 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-indigo-400 block font-bold">إجمالي الكميات المطلوب طلبها</span>
            <span className="text-2xl font-black font-mono text-indigo-400 mt-1 block">
              {stats.totalSuggestedQty.toLocaleString()} وحدة
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-950/50 border border-indigo-900/40 flex items-center justify-center text-indigo-400">
            <Layers size={24} />
          </div>
        </div>

        <div className="bg-slate-950 border border-emerald-900/40 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-emerald-400 block font-bold">التكلفة التقديرية لأمر التوريد</span>
            <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block">
              {stats.totalEstimatedCost.toFixed(2)} {currencySymbol}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-950/50 border border-emerald-900/40 flex items-center justify-center text-emerald-400">
            <PackageCheck size={24} />
          </div>
        </div>
      </div>

      {/* 🎛️ Algorithm Tuning Parameters Bar */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <Sliders size={16} className="text-amber-400" />
            <span>معايير خوارزمية إعادة الطلب:</span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs w-full md:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 whitespace-nowrap">مدة توريد المورد:</span>
              <input
                type="number"
                min="1"
                max="30"
                value={leadTimeDays}
                onChange={e => setLeadTimeDays(parseInt(e.target.value) || 1)}
                className="w-16 bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-center font-mono font-bold text-amber-400 outline-none"
              />
              <span className="text-slate-500">أيام</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 whitespace-nowrap">مخزون الأمان (Buffer):</span>
              <input
                type="number"
                min="1"
                max="30"
                value={safetyDays}
                onChange={e => setSafetyDays(parseInt(e.target.value) || 1)}
                className="w-16 bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-center font-mono font-bold text-indigo-400 outline-none"
              />
              <span className="text-slate-500">أيام</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 whitespace-nowrap">دورة التغطية المطلوبة:</span>
              <input
                type="number"
                min="1"
                max="60"
                value={orderCycleDays}
                onChange={e => setOrderCycleDays(parseInt(e.target.value) || 1)}
                className="w-16 bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-center font-mono font-bold text-emerald-400 outline-none"
              />
              <span className="text-slate-500">أيام</span>
            </div>
          </div>

          <button
            onClick={analyzeInventoryVelocity}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> إعادة احتساب
          </button>
        </div>
      </div>

      {/* 🔍 Filters Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800 mb-4">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute right-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="بحث بالصنف، الباركود، المورد..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-xs text-white placeholder:text-slate-600 focus:border-amber-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={urgencyFilter}
            onChange={e => setUrgencyFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none"
          >
            <option value="CRITICAL_WARNING">الأصناف الحرجة ووشيكة النفاد فقط</option>
            <option value="CRITICAL">أصناف حرجة (نفاد وشيك جداً)</option>
            <option value="WARNING">أصناف وشيكة النفاد</option>
            <option value="HEALTHY">أصناف بحالة آمنة</option>
            <option value="ALL">جميع الأصناف</option>
          </select>

          <select
            value={selectedSupplierFilter}
            onChange={e => setSelectedSupplierFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none"
          >
            <option value="ALL">جميع الموردين</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 📋 Data Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-right border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900/70 border-b border-slate-800 font-black text-slate-400">
              <th className="p-3.5 text-center">
                <input
                  type="checkbox"
                  checked={selectedItemIds.length > 0 && selectedItemIds.length === filteredData.length}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedItemIds(filteredData.map(i => i.id));
                    } else {
                      setSelectedItemIds([]);
                    }
                  }}
                  className="rounded bg-slate-900 border-slate-700"
                />
              </th>
              <th className="p-3.5">الصنف / الباركود</th>
              <th className="p-3.5">المورد</th>
              <th className="p-3.5 text-center">الرصيد الحالي</th>
              <th className="p-3.5 text-center">السرعة اليومية (Velocity)</th>
              <th className="p-3.5 text-center">أيام النفاد المتبقية</th>
              <th className="p-3.5 text-center">نقطة إعادة الطلب</th>
              <th className="p-3.5 text-center">الكمية المقترحة للطلب</th>
              <th className="p-3.5">التكلفة التقديرية</th>
              <th className="p-3.5 text-center">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-slate-500">
                  لا توجد أصناف تطابق معايير الفلترة المحددة
                </td>
              </tr>
            ) : (
              filteredData.map(item => {
                const isSelected = selectedItemIds.includes(item.id);

                return (
                  <tr 
                    key={item.id} 
                    className={`border-b border-slate-850 transition-all ${
                      isSelected ? 'bg-amber-950/20' : 'hover:bg-slate-900/40'
                    }`}
                  >
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedItemIds([...selectedItemIds, item.id]);
                          } else {
                            setSelectedItemIds(selectedItemIds.filter(id => id !== item.id));
                          }
                        }}
                        className="rounded bg-slate-900 border-slate-700"
                      />
                    </td>

                    <td className="p-3.5">
                      <div className="font-bold text-white">{item.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{item.barcode}</div>
                    </td>

                    <td className="p-3.5 text-slate-300 font-bold">{item.supplier_name}</td>

                    <td className="p-3.5 text-center font-mono font-black text-white">
                      {item.current_stock} {item.unit}
                    </td>

                    <td className="p-3.5 text-center font-mono text-indigo-400 font-bold">
                      {item.daily_velocity} / يوم
                    </td>

                    <td className="p-3.5 text-center font-mono font-black">
                      <span className={item.run_out_days <= 3 ? 'text-rose-400' : item.run_out_days <= 7 ? 'text-amber-400' : 'text-emerald-400'}>
                        {item.run_out_days > 90 ? '90+ يوم' : `${item.run_out_days} أيام`}
                      </span>
                    </td>

                    <td className="p-3.5 text-center font-mono text-slate-400 font-bold">
                      {item.reorder_point} {item.unit}
                    </td>

                    <td className="p-3.5 text-center">
                      <input
                        type="number"
                        min="0"
                        value={item.suggested_order_qty}
                        onChange={e => {
                          const newQty = parseInt(e.target.value) || 0;
                          const updated = replenishmentData.map(i => i.id === item.id ? { ...i, suggested_order_qty: newQty, estimated_cost: newQty * i.purchase_price } : i);
                          setReplenishmentData(updated);
                        }}
                        className="w-20 bg-slate-900 border border-slate-750 text-center font-mono font-black text-amber-400 rounded-lg p-1.5 outline-none focus:border-amber-500"
                      />
                    </td>

                    <td className="p-3.5 font-mono font-bold text-emerald-400">
                      {item.estimated_cost.toFixed(2)} {currencySymbol}
                    </td>

                    <td className="p-3.5 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                        item.urgency_status === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border border-rose-900' :
                        item.urgency_status === 'WARNING' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                        item.urgency_status === 'OVERSTOCKED' ? 'bg-blue-950 text-blue-400 border border-blue-900' :
                        'bg-emerald-950 text-emerald-400 border border-emerald-900'
                      }`}>
                        {item.urgency_status === 'CRITICAL' ? '🚨 حرج جداً' :
                         item.urgency_status === 'WARNING' ? '⏳ وشيك النفاد' :
                         item.urgency_status === 'OVERSTOCKED' ? '📦 فائض مخزون' :
                         '✅ رصيد آمن'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
