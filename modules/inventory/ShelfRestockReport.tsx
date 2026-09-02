import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Package, Search, Download, LayoutGrid, AlertTriangle, ArrowUpCircle, CheckCircle2, RefreshCw, MapPin } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ShelfItem {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  min_stock_level: number;
  shelf_location: string | null;
  bin_name?: string | null;
  zone_name?: string | null;
  aisle_name?: string | null;
  brand: string | null;
  category_name: string | null;
  image_url: string | null;
  sales_price: number;
  purchase_price: number;
  shortage: number;
}

interface AisleGroup {
  aisle: string;
  items: ShelfItem[];
  totalShortage: number;
  criticalCount: number;
}

export default function ShelfRestockReport() {
  const { currentUser, currentSelectedOrgId } = useAccounting() as any;
  const { showToast } = useToast();
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'low' | 'empty'>('all');
  const [selectedAisle, setSelectedAisle] = useState<string>('all');
  const orgId = currentSelectedOrgId || currentUser?.organization_id;

  const loadItems = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. جلب المنتجات النشطة
      const { data: prodsData, error: pErr } = await supabase
        .from('products')
        .select('id, name, sku, barcode, stock, min_stock_level, shelf_location, brand, image_url, sales_price, purchase_price, item_categories(name)')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .in('product_type', ['STOCK', 'MANUFACTURED']);

      if (pErr) throw pErr;

      // 2. جلب مواقع وخانات الرفوف (WMS Bins)
      const { data: binsData } = await supabase
        .from('warehouse_bins')
        .select('id, bin_code, bin_name, zone_name, aisle, rack, shelf, warehouse_id')
        .eq('organization_id', orgId);

      // 3. جلب تسكينات الأصناف على الرفوف (Bin Allocations)
      const { data: allocsData } = await supabase
        .from('bin_stock_allocations')
        .select('*')
        .eq('organization_id', orgId);

      const prodsMap = new Map<string, any>((prodsData || []).map(p => [p.id, p]));
      const binsMap = new Map<string, any>((binsData || []).map(b => [b.id, b]));

      const mapped: ShelfItem[] = [];
      const handledProductIds = new Set<string>();

      // 4. إدراج الأصناف المسكنة في الرفوف (WMS)
      if (allocsData && allocsData.length > 0) {
        allocsData.forEach((alloc: any) => {
          const product = prodsMap.get(alloc.product_id);
          const bin = binsMap.get(alloc.bin_id);
          if (product) {
            handledProductIds.add(product.id);
            const allocatedQty = Number(alloc.quantity) || 0;
            const minStock = Number(product.min_stock_level) || 0;
            const binCode = bin?.bin_code || 'رف غير محدد';
            const aisleLabel = bin?.aisle ? `ممر ${bin.aisle}` : (bin?.zone_name || 'المنطقة A');

            mapped.push({
              id: `${alloc.id || alloc.bin_id}-${product.id}`,
              name: product.name,
              sku: product.sku,
              barcode: product.barcode,
              stock: allocatedQty,
              min_stock_level: minStock,
              shelf_location: binCode,
              bin_name: bin?.bin_name,
              zone_name: bin?.zone_name,
              aisle_name: aisleLabel,
              brand: product.brand,
              category_name: product.item_categories?.name || null,
              image_url: product.image_url,
              sales_price: Number(product.sales_price || 0),
              purchase_price: Number(product.purchase_price || 0),
              shortage: Math.max(0, minStock - allocatedQty),
            });
          }
        });
      }

      // 5. إدراج أي منتجات لها موقع رف يدوي سابق
      (prodsData || []).forEach((p: any) => {
        if (p.shelf_location && !handledProductIds.has(p.id)) {
          const stockQty = Number(p.stock || 0);
          const minStock = Number(p.min_stock_level) || 0;
          mapped.push({
            id: p.id,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            stock: stockQty,
            min_stock_level: minStock,
            shelf_location: p.shelf_location,
            bin_name: p.shelf_location,
            zone_name: 'Zone A',
            aisle_name: p.shelf_location.split('-')[0].toUpperCase(),
            brand: p.brand,
            category_name: p.item_categories?.name || null,
            image_url: p.image_url,
            sales_price: Number(p.sales_price || 0),
            purchase_price: Number(p.purchase_price || 0),
            shortage: Math.max(0, minStock - stockQty),
          });
        }
      });

      setItems(mapped);
    } catch (e: any) {
      showToast('فشل تحميل بيانات الرفوف: ' + e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, [orgId]);

  const filtered = items.filter(item => {
    const matchSearch = !searchTerm ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.shelf_location || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.bin_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.brand || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchMode =
      filterMode === 'all' ? true :
      filterMode === 'empty' ? item.stock === 0 :
      item.stock > 0 && item.stock < item.min_stock_level;
    const matchAisle = selectedAisle === 'all' ? true : 
      (item.aisle_name === selectedAisle || (item.shelf_location || '').startsWith(selectedAisle));
    return matchSearch && matchMode && matchAisle;
  });

  const aisleMap = new Map<string, ShelfItem[]>();
  filtered.forEach(item => {
    const aisle = item.aisle_name || (item.shelf_location || 'بدون رف').split('-')[0].toUpperCase();
    if (!aisleMap.has(aisle)) aisleMap.set(aisle, []);
    aisleMap.get(aisle)!.push(item);
  });
  const aisleGroups: AisleGroup[] = [];
  aisleMap.forEach((aisleItems, aisle) => {
    aisleGroups.push({
      aisle,
      items: aisleItems.sort((a, b) => (a.shelf_location || '').localeCompare(b.shelf_location || '')),
      totalShortage: aisleItems.reduce((s, i) => s + i.shortage, 0),
      criticalCount: aisleItems.filter(i => i.stock === 0).length,
    });
  });
  aisleGroups.sort((a, b) => a.aisle.localeCompare(b.aisle));

  const allAisles = [...new Set(items.map(i => i.aisle_name || (i.shelf_location || '').split('-')[0].toUpperCase()))].sort();
  const emptyCount = items.filter(i => i.stock === 0).length;
  const lowCount = items.filter(i => i.stock > 0 && i.stock < i.min_stock_level).length;
  const totalShortage = items.reduce((s, i) => s + i.shortage, 0);

  const handleExport = () => {
    const rows = filtered.map(item => ({
      'موقع الرف': item.shelf_location || '',
      'اسم الصنف': item.name,
      'الكود (SKU)': item.sku || '',
      'الباركود': item.barcode || '',
      'العلامة التجارية': item.brand || '',
      'التصنيف': item.category_name || '',
      'الرصيد الحالي': item.stock,
      'الحد الأدنى': item.min_stock_level,
      'النقص (للتعبئة)': item.shortage,
      'الحالة': item.stock === 0 ? 'فارغ' : item.shortage > 0 ? 'منخفض' : 'كافٍ',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قائمة إعادة التخزين');
    XLSX.writeFile(wb, 'shelf_restock.xlsx');
    showToast('تم تصدير القائمة بنجاح', 'success');
  };

  const statusBadge = (item: ShelfItem) => {
    if (item.stock === 0) {
      return <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full border border-red-200">فارغ ❌</span>;
    }
    if (item.shortage > 0) {
      return <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">منخفض ⚠️</span>;
    }
    return <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full border border-emerald-200">كافٍ ✅</span>;
  };

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <MapPin className="text-indigo-600" size={24} />
            تقرير إعادة التخزين حسب الرف والممر
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">الأصناف مرتبة حسب موقع الرف — لاستخدام موظفي التخزين</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadItems} className="flex items-center gap-1 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-slate-200">
            <RefreshCw size={14} /> تحديث
          </button>
          <button onClick={handleExport} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700">
            <Download size={14} /> تصدير Excel
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-3 text-center shadow-sm">
          <div className="text-2xl font-black text-slate-800">{items.length}</div>
          <div className="text-xs text-slate-500 mt-1">إجمالي الأصناف بالرفوف</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-3 text-center shadow-sm">
          <div className="text-2xl font-black text-red-700">{emptyCount}</div>
          <div className="text-xs text-red-500 mt-1">رفوف فارغة تماماً</div>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 text-center shadow-sm">
          <div className="text-2xl font-black text-amber-700">{lowCount}</div>
          <div className="text-xs text-amber-500 mt-1">رفوف منخفضة المخزون</div>
        </div>
        <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-3 text-center shadow-sm">
          <div className="text-2xl font-black text-indigo-700">{totalShortage}</div>
          <div className="text-xs text-indigo-500 mt-1">إجمالي الوحدات المطلوبة</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="ابحث باسم الصنف أو الرف أو الكود..."
            className="w-full border rounded-lg pr-8 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'empty', 'low'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                filterMode === mode
                  ? mode === 'all' ? 'bg-slate-700 text-white' : mode === 'empty' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mode === 'all' ? 'الكل' : mode === 'empty' ? 'فارغة' : 'منخفضة'}
            </button>
          ))}
        </div>
        <select
          value={selectedAisle}
          onChange={e => setSelectedAisle(e.target.value)}
          className="border rounded-lg py-2 px-3 text-sm bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
        >
          <option value="all">كل الممرات</option>
          {allAisles.map(a => (
            <option key={a} value={a}>ممر {a}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-indigo-500" size={32} />
          <span className="mr-3 text-slate-500 font-bold">جاري تحميل بيانات الرفوف...</span>
        </div>
      ) : aisleGroups.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <LayoutGrid size={48} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-bold">لا توجد أصناف لها موقع رف محدد</p>
          <p className="text-slate-400 text-sm mt-1">قم بتسكين الأصناف على الرفوف عبر شاشة (إدارة المواقع والرفوف التخزينية WMS) لتظهر هنا فورياً ومباشرة.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {aisleGroups.map(group => (
            <div key={group.aisle} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* Aisle Header */}
              <div className={`px-4 py-3 flex items-center justify-between ${group.criticalCount > 0 ? 'bg-red-50 border-b border-red-100' : 'bg-indigo-50 border-b border-indigo-100'}`}>
                <div className="flex items-center gap-3">
                  <div className={`px-3 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm ${group.criticalCount > 0 ? 'bg-red-500' : 'bg-indigo-600'}`}>
                    {group.aisle}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">{group.aisle.startsWith('ممر') ? group.aisle : `ممر ${group.aisle}`}</h3>
                    <p className="text-xs text-slate-500">{group.items.length} صنف مسكّن</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  {group.criticalCount > 0 && (
                    <span className="bg-red-100 text-red-700 font-bold text-xs px-2 py-1 rounded-lg border border-red-200 flex items-center gap-1">
                      <AlertTriangle size={12} /> {group.criticalCount} فارغة
                    </span>
                  )}
                  {group.totalShortage > 0 && (
                    <span className="bg-amber-100 text-amber-700 font-bold text-xs px-2 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                      <ArrowUpCircle size={12} /> {group.totalShortage} وحدة
                    </span>
                  )}
                  {group.totalShortage === 0 && (
                    <span className="bg-emerald-100 text-emerald-700 font-bold text-xs px-2 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 size={12} /> كامل
                    </span>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="py-2 px-4 text-right font-bold text-slate-600 text-xs">الصنف</th>
                      <th className="py-2 px-4 text-right font-bold text-slate-600 text-xs">الرف</th>
                      <th className="py-2 px-4 text-right font-bold text-slate-600 text-xs">العلامة</th>
                      <th className="py-2 px-4 text-center font-bold text-slate-600 text-xs">الرصيد</th>
                      <th className="py-2 px-4 text-center font-bold text-slate-600 text-xs">الحد الأدنى</th>
                      <th className="py-2 px-4 text-center font-bold text-red-600 text-xs">النقص</th>
                      <th className="py-2 px-4 text-center font-bold text-slate-600 text-xs">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.items.map(item => (
                      <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.stock === 0 ? 'bg-red-50/50' : ''}`}>
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-8 h-8 rounded-lg object-cover border" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                <Package size={14} className="text-slate-400" />
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-slate-800 text-xs">{item.name}</div>
                              {item.sku && <div className="text-[10px] text-slate-400 font-mono">{item.sku}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-4">
                          <span className="font-mono font-bold text-indigo-600 text-xs bg-indigo-50 px-2 py-0.5 rounded">
                            {item.shelf_location}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-xs text-slate-600">{item.brand || '—'}</td>
                        <td className="py-2 px-4 text-center">
                          <span className={`font-black text-sm ${item.stock === 0 ? 'text-red-600' : item.shortage > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {item.stock}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-center text-xs text-slate-500">{item.min_stock_level}</td>
                        <td className="py-2 px-4 text-center">
                          {item.shortage > 0
                            ? <span className="font-black text-red-600">{item.shortage}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="py-2 px-4 text-center">{statusBadge(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
