import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { 
  Layers, Plus, Search, Edit, Trash2, Box, Package, 
  Printer, ArrowDownToLine, ArrowUpFromLine, CheckCircle, 
  AlertCircle, RefreshCw, X, Check, Database, Copy, 
  QrCode, Grid, Warehouse as WarehouseIcon, Snowflake, Zap, Shield
} from 'lucide-react';
import { WarehouseBin, BinStockAllocation, BinType, Product } from '../../types';
import WmsLocationService from '../../services/wmsLocationService';
import { useToast } from '../../context/ToastContext';
import { QRCodeSVG } from 'qrcode.react';

export const BinLocationManager: React.FC = () => {
  const { warehouses, products, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [bins, setBins] = useState<WarehouseBin[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Modals
  const [isBinModalOpen, setIsBinModalOpen] = useState(false);
  const [editingBinId, setEditingBinId] = useState<string | null>(null);
  const [savingBin, setSavingBin] = useState(false);

  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [activeBinForAlloc, setActiveBinForAlloc] = useState<WarehouseBin | null>(null);
  const [savingAlloc, setSavingAlloc] = useState(false);

  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [activeBinForBarcode, setActiveBinForBarcode] = useState<WarehouseBin | null>(null);

  const [sqlModalOpen, setSqlModalOpen] = useState(false);

  // Form State for Bin
  const [binFormData, setBinFormData] = useState<Partial<WarehouseBin>>({
    bin_code: '',
    bin_name: '',
    barcode: '',
    zone_name: 'Zone A',
    aisle: 'A1',
    rack: 'R1',
    shelf: 'S1',
    bin_number: 'B1',
    bin_type: 'storage',
    max_capacity_qty: 1000,
    max_weight_kg: 500,
    is_active: true,
    notes: '',
  });

  // Form State for Put-away Allocation
  const [allocFormData, setAllocFormData] = useState({
    product_id: '',
    quantity: 1,
    batch_number: '',
    expiry_date: '',
  });

  const orgId = (currentUser as any)?.organization_id || '';

  // تحديد المستودع الافتراضي
  useEffect(() => {
    if (warehouses.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [warehouses]);

  // جلب المواقع التخزينية
  const fetchBins = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await WmsLocationService.getBinsByWarehouse(orgId, selectedWarehouseId || undefined);
      setBins(data);
    } catch (err: any) {
      showToast('تعذر تحميل المواقع التخزينية: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBins();
  }, [orgId, selectedWarehouseId]);

  // قائمة المناطق الفريدة
  const uniqueZones = useMemo(() => {
    const set = new Set(bins.map(b => b.zone_name).filter(Boolean));
    return Array.from(set);
  }, [bins]);

  // تصفية المواقع
  const filteredBins = useMemo(() => {
    return bins.filter(b => {
      const matchSearch = 
        b.bin_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.bin_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.zone_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.allocated_items?.some(it => it.product_name?.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchZone = zoneFilter === 'all' || b.zone_name === zoneFilter;
      const matchType = typeFilter === 'all' || b.bin_type === typeFilter;
      return matchSearch && matchZone && matchType;
    });
  }, [bins, searchTerm, zoneFilter, typeFilter]);

  // إحصائيات لوحة التحكم
  const kpis = useMemo(() => {
    const totalBins = bins.length;
    const totalAllocatedItems = bins.reduce((sum, b) => sum + (b.allocated_items?.length || 0), 0);
    const totalQuantity = bins.reduce((sum, b) => sum + (b.current_qty || 0), 0);
    const coldStorageCount = bins.filter(b => b.bin_type === 'cold_storage').length;
    
    let totalCap = 0;
    bins.forEach(b => { totalCap += Number(b.max_capacity_qty) || 1000; });
    const avgOccupancy = totalCap > 0 ? Math.round((totalQuantity / totalCap) * 100) : 0;

    return { totalBins, totalAllocatedItems, totalQuantity, coldStorageCount, avgOccupancy };
  }, [bins]);

  // فتح نافذة إنشاء موقع جديد
  const handleOpenCreateBin = () => {
    setEditingBinId(null);
    const zone = uniqueZones.length > 0 ? uniqueZones[0] : 'Zone A';
    setBinFormData({
      bin_code: `${zone.replace(/\s+/g, '')}-A1-R1-S1-B1`.toUpperCase(),
      bin_name: `رف ${zone} - A1/R1`,
      barcode: '',
      zone_name: zone,
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      bin_number: 'B1',
      bin_type: 'storage',
      max_capacity_qty: 1000,
      max_weight_kg: 500,
      is_active: true,
      notes: '',
    });
    setIsBinModalOpen(true);
  };

  // فتح نافذة تعديل
  const handleOpenEditBin = (bin: WarehouseBin) => {
    setEditingBinId(bin.id);
    setBinFormData({
      bin_code: bin.bin_code,
      bin_name: bin.bin_name,
      barcode: bin.barcode,
      zone_name: bin.zone_name,
      aisle: bin.aisle,
      rack: bin.rack,
      shelf: bin.shelf,
      bin_number: bin.bin_number,
      bin_type: bin.bin_type,
      max_capacity_qty: bin.max_capacity_qty,
      max_weight_kg: bin.max_weight_kg,
      is_active: bin.is_active,
      notes: bin.notes,
    });
    setIsBinModalOpen(true);
  };

  // حفظ الموقع
  const handleSaveBin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId) {
      showToast('يرجى اختيار المستودع', 'warning');
      return;
    }

    setSavingBin(true);
    try {
      const selectedWh = warehouses.find(w => w.id === selectedWarehouseId);
      const payload = {
        ...binFormData,
        warehouse_id: selectedWarehouseId,
        warehouse_name: selectedWh?.name,
      };

      if (editingBinId) {
        await WmsLocationService.updateBin(editingBinId, payload);
        showToast('تم تحديث بيانات الموقع التخزيني بنجاح', 'success');
      } else {
        await WmsLocationService.createBin(payload, orgId);
        showToast('تم إنشاء الموقع التخزيني وتوليد الباركود بنجاح', 'success');
      }
      setIsBinModalOpen(false);
      fetchBins();
    } catch (err: any) {
      showToast(err.message || 'فشل حفظ الموقع', 'error');
    } finally {
      setSavingBin(false);
    }
  };

  // حذف موقع
  const handleDeleteBin = async (bin: WarehouseBin) => {
    if ((bin.current_qty || 0) > 0) {
      showToast('لا يمكن حذف موقع تخزيني يحتوي على بضاعة مسكنة', 'warning');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف الموقع ${bin.bin_code}؟`)) return;

    try {
      await WmsLocationService.deleteBin(bin.id);
      showToast('تم حذف الموقع التخزيني بنجاح', 'success');
      fetchBins();
    } catch (err: any) {
      showToast(err.message || 'فشل الحذف', 'error');
    }
  };

  // فتح نافذة تسكين بضاعة
  const handleOpenPutAway = (bin: WarehouseBin) => {
    setActiveBinForAlloc(bin);
    setAllocFormData({
      product_id: products.length > 0 ? products[0].id : '',
      quantity: 10,
      batch_number: `BATCH-${Date.now().toString().slice(-4)}`,
      expiry_date: '',
    });
    setIsAllocateModalOpen(true);
  };

  // حفظ التسكين
  const handleSaveAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBinForAlloc || !allocFormData.product_id) return;

    setSavingAlloc(true);
    try {
      const prod = products.find(p => p.id === allocFormData.product_id);
      await WmsLocationService.allocateStockToBin(
        orgId,
        selectedWarehouseId,
        activeBinForAlloc.id,
        allocFormData.product_id,
        prod?.name || 'صنف',
        Number(allocFormData.quantity),
        allocFormData.batch_number,
        allocFormData.expiry_date
      );
      showToast(`تم تسكين ${allocFormData.quantity} وحدة في الرف ${activeBinForAlloc.bin_code} بنجاح`, 'success');
      setIsAllocateModalOpen(false);
      fetchBins();
    } catch (err: any) {
      showToast(err.message || 'فشل التسكين', 'error');
    } finally {
      setSavingAlloc(false);
    }
  };

  // فتح نافذة الباركود
  const handleOpenBarcode = (bin: WarehouseBin) => {
    setActiveBinForBarcode(bin);
    setBarcodeModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Layers className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">إدارة المواقع والرفوف التخزينية (WMS)</h1>
              <p className="text-sm text-slate-500 font-medium">هيكلة المستودع على مستوى المناطق والرفوف (Bins & Shelves)، تسكين الأصناف وتتبع نسب الإشغال والباركود</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setSqlModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all"
            title="عرض كود SQL لإنشاء جداول الـ WMS في Supabase"
          >
            <Database className="w-4 h-4" />
            تهيئة SQL
          </button>

          <button
            onClick={fetchBins}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <button
            onClick={handleOpenCreateBin}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-indigo-200"
          >
            <Plus className="w-4 h-4" />
            موقع تخزيني / رف جديد
          </button>
        </div>
      </div>

      {/* Warehouse Selector & KPIs */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <WarehouseIcon className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-slate-700">المستودع النشط:</span>
            <select
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-400 font-medium">
            إجمالي الرفوف المسجلة: <strong className="text-slate-700">{bins.length}</strong> موقع
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-bold text-slate-500">إجمالي الرفوف والخانات</p>
            <h4 className="text-xl font-black text-slate-800 mt-1">{kpis.totalBins} <span className="text-xs font-normal text-slate-400">موقع</span></h4>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-bold text-slate-500">الأصناف المسكنة في الرفوف</p>
            <h4 className="text-xl font-black text-indigo-600 mt-1">{kpis.totalAllocatedItems} <span className="text-xs font-normal text-slate-400">صنف مسكن</span></h4>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-bold text-slate-500">إجمالي الكميات المسكنة</p>
            <h4 className="text-xl font-black text-emerald-600 mt-1">{kpis.totalQuantity.toLocaleString()} <span className="text-xs font-normal text-slate-400">وحدة</span></h4>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-bold text-slate-500">متوسط نسبة إشغال الرفوف</p>
            <h4 className="text-xl font-black text-amber-600 mt-1">{kpis.avgOccupancy}%</h4>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
          <input
            type="text"
            placeholder="بحث برمز الرف، المنطقة، أو الصنف المسكن..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <select
            value={zoneFilter}
            onChange={e => setZoneFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700"
          >
            <option value="all">جميع المناطق (Zones)</option>
            {uniqueZones.map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700"
          >
            <option value="all">جميع أنواع التخزين</option>
            <option value="storage">تخزين عام</option>
            <option value="cold_storage">تبريد / ثلاجة</option>
            <option value="fast_moving">سريع الحركة (Picking)</option>
            <option value="receiving">استقبال</option>
            <option value="shipping">شحن</option>
          </select>
        </div>
      </div>

      {/* Visual Bins Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full text-center p-12 text-slate-400 font-bold">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
            جارِ تحميل خريطة المواقع التخزينية...
          </div>
        ) : filteredBins.length === 0 ? (
          <div className="col-span-full text-center p-12 bg-white rounded-2xl border border-slate-100">
            <Box className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">لا توجد مواقع تخزينية مطابقة</h3>
            <p className="text-xs text-slate-400 mt-1">ابدأ بإضافة مناطق وأرفف وخانات لتنظيم المستودع</p>
            <button
              onClick={handleOpenCreateBin}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm"
            >
              + إضافة أول رف
            </button>
          </div>
        ) : (
          filteredBins.map(bin => {
            const occPct = bin.occupancy_pct || 0;
            const isFull = occPct >= 90;

            return (
              <div key={bin.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 hover:shadow-md transition-all">
                {/* Bin Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                        {bin.bin_code}
                      </span>
                      {bin.bin_type === 'cold_storage' && (
                        <span className="p-1 bg-blue-50 text-blue-600 rounded-md" title="موقع تبريد">
                          <Snowflake className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {bin.bin_type === 'fast_moving' && (
                        <span className="p-1 bg-amber-50 text-amber-600 rounded-md" title="سريع الحركة">
                          <Zap className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm mt-1.5">{bin.bin_name}</h3>
                    <p className="text-xs text-slate-400">
                      منطقة: <strong>{bin.zone_name}</strong> • ممر: {bin.aisle} • رف: {bin.shelf} • خانة: {bin.bin_number}
                    </p>
                  </div>

                  <button
                    onClick={() => handleOpenBarcode(bin)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
                    title="عرض وطباعة باركود الرف"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>

                {/* Capacity Progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-500">نسبة الإشغال:</span>
                    <span className={isFull ? 'text-rose-600' : 'text-slate-700'}>
                      {bin.current_qty || 0} / {bin.max_capacity_qty || 1000} وحدة ({occPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        occPct >= 90 ? 'bg-rose-500' : occPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${occPct}%` }}
                    />
                  </div>
                </div>

                {/* Allocated Items List */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span className="flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-indigo-500" />
                      الأصناف المسكنة ({bin.allocated_items?.length || 0})
                    </span>
                    <button
                      onClick={() => handleOpenPutAway(bin)}
                      className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                    >
                      + تسكين صنف
                    </button>
                  </div>

                  {bin.allocated_items && bin.allocated_items.length > 0 ? (
                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                      {bin.allocated_items.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200/60 shadow-2xs">
                          <span className="font-bold text-slate-800 truncate max-w-[140px]">{it.product_name || 'صنف'}</span>
                          <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                            {it.quantity} وحدة
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 text-center py-2">الرف فارغ حالياً ومتاح للتخزين</p>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <button
                    onClick={() => handleOpenPutAway(bin)}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold transition-all flex items-center gap-1"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    تسكين بضاعة
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditBin(bin)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                      title="تعديل"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteBin(bin)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================================== */}
      {/* Modal: Create / Edit Bin */}
      {/* ============================================================================== */}
      {isBinModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">{editingBinId ? 'تعديل موقع تخزيني' : 'إضافة موقع تخزيني ورف جديد'}</h2>
                  <p className="text-xs text-slate-400">تحديد إحداثيات الرف، السعة القصوى، ونوع التخزين</p>
                </div>
              </div>
              <button
                onClick={() => setIsBinModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBin} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رمز الموقع (Bin Code) *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: Z1-A01-R02-S03-B01"
                    value={binFormData.bin_code}
                    onChange={e => setBinFormData(prev => ({ ...prev, bin_code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الوصفي *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: رف المنظفات أ-1"
                    value={binFormData.bin_name}
                    onChange={e => setBinFormData(prev => ({ ...prev, bin_name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المنطقة (Zone) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Zone A"
                    value={binFormData.zone_name}
                    onChange={e => setBinFormData(prev => ({ ...prev, zone_name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الممر (Aisle)</label>
                  <input
                    type="text"
                    placeholder="A1"
                    value={binFormData.aisle}
                    onChange={e => setBinFormData(prev => ({ ...prev, aisle: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">العمود / الاستاند (Rack)</label>
                  <input
                    type="text"
                    placeholder="R1"
                    value={binFormData.rack}
                    onChange={e => setBinFormData(prev => ({ ...prev, rack: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرف (Shelf)</label>
                  <input
                    type="text"
                    placeholder="S1"
                    value={binFormData.shelf}
                    onChange={e => setBinFormData(prev => ({ ...prev, shelf: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الموقع التخزيني</label>
                  <select
                    value={binFormData.bin_type}
                    onChange={e => setBinFormData(prev => ({ ...prev, bin_type: e.target.value as BinType }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  >
                    <option value="storage">تخزين عام</option>
                    <option value="cold_storage">تبريد / ثلاجة</option>
                    <option value="fast_moving">سريع الحركة (Picking)</option>
                    <option value="receiving">استقبال وفحص</option>
                    <option value="shipping">شحن وتحميل</option>
                    <option value="quarantine">حجر صحي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">أقصى سعة استيعابية (وحدة)</label>
                  <input
                    type="number"
                    min={1}
                    value={binFormData.max_capacity_qty}
                    onChange={e => setBinFormData(prev => ({ ...prev, max_capacity_qty: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBinModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingBin}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {savingBin ? 'جارِ الحفظ...' : editingBinId ? 'تحديث الموقع' : 'إنشاء الموقع'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: Put-away Stock Allocation */}
      {/* ============================================================================== */}
      {isAllocateModalOpen && activeBinForAlloc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 text-white rounded-xl">
                  <ArrowDownToLine className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">تسكين بضاعة في الرف {activeBinForAlloc.bin_code}</h2>
                  <p className="text-xs text-indigo-100">{activeBinForAlloc.bin_name} • منطقة: {activeBinForAlloc.zone_name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsAllocateModalOpen(false)}
                className="p-2 text-indigo-100 hover:text-white rounded-xl hover:bg-indigo-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAllocation} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اختر الصنف المراد تسكينه *</label>
                <select
                  required
                  value={allocFormData.product_id}
                  onChange={e => setAllocFormData(prev => ({ ...prev, product_id: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                >
                  <option value="">-- اختر الصنف --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} {p.sku ? `(SKU: ${p.sku})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الكمية المسكنة *</label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    required
                    value={allocFormData.quantity}
                    onChange={e => setAllocFormData(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-center"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم التشغيلة / الدفعة (Batch)</label>
                  <input
                    type="text"
                    placeholder="BATCH-001"
                    value={allocFormData.batch_number}
                    onChange={e => setAllocFormData(prev => ({ ...prev, batch_number: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الصلاحية (اختياري)</label>
                  <input
                    type="date"
                    value={allocFormData.expiry_date}
                    onChange={e => setAllocFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAllocateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingAlloc}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {savingAlloc ? 'جارِ التسكين...' : 'تأكيد التسكين'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: Barcode Label & Print */}
      {/* ============================================================================== */}
      {barcodeModalOpen && activeBinForBarcode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">بطاقة باركود الرف التخزيني</h3>
              </div>
              <button
                onClick={() => setBarcodeModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4 print:p-0">
              <div className="border-2 border-dashed border-slate-300 p-6 rounded-2xl bg-white space-y-3">
                <div className="text-xs font-bold text-slate-400">نظام إدارة المستودعات TriPro WMS</div>
                <div className="flex justify-center my-2">
                  <QRCodeSVG
                    value={activeBinForBarcode.barcode || activeBinForBarcode.bin_code}
                    size={140}
                    level="H"
                  />
                </div>
                <div className="font-mono text-xl font-black text-slate-900 tracking-wider">
                  {activeBinForBarcode.bin_code}
                </div>
                <div className="text-xs font-bold text-indigo-700 bg-indigo-50 py-1 rounded-lg">
                  {activeBinForBarcode.bin_name}
                </div>
                <div className="text-[11px] text-slate-400">
                  منطقة: {activeBinForBarcode.zone_name} • ممر: {activeBinForBarcode.aisle} • رف: {activeBinForBarcode.shelf}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setBarcodeModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة البطاقة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: SQL Migration */}
      {/* ============================================================================== */}
      {sqlModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">كود SQL لإنشاء جداول الـ WMS في Supabase</h2>
                  <p className="text-xs text-slate-400">انسخ الكود وشغّله في Supabase SQL Editor لتفعيل المزامنة السحابية للرفوف</p>
                </div>
              </div>
              <button
                onClick={() => setSqlModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <pre className="p-4 bg-slate-900 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto max-h-60 leading-relaxed" dir="ltr">
{`CREATE TABLE IF NOT EXISTS warehouse_bins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    bin_code VARCHAR(100) NOT NULL,
    bin_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(100),
    zone_name VARCHAR(100) NOT NULL DEFAULT 'Zone A',
    aisle VARCHAR(50) DEFAULT 'A1',
    rack VARCHAR(50) DEFAULT 'R1',
    shelf VARCHAR(50) DEFAULT 'S1',
    bin_number VARCHAR(50) DEFAULT 'B1',
    bin_type VARCHAR(50) NOT NULL DEFAULT 'storage',
    max_capacity_qty NUMERIC(15, 2) DEFAULT 1000.00,
    max_weight_kg NUMERIC(15, 2) DEFAULT 500.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bin_stock_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    bin_id UUID NOT NULL REFERENCES warehouse_bins(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 0.00,
    batch_number VARCHAR(100) DEFAULT NULL,
    expiry_date DATE DEFAULT NULL,
    last_putaway_at TIMESTAMPTZ DEFAULT NOW(),
    last_picked_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`}
              </pre>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setSqlModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
              <button
                onClick={() => {
                  const sql = `CREATE TABLE IF NOT EXISTS warehouse_bins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    bin_code VARCHAR(100) NOT NULL,
    bin_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(100),
    zone_name VARCHAR(100) NOT NULL DEFAULT 'Zone A',
    aisle VARCHAR(50) DEFAULT 'A1',
    rack VARCHAR(50) DEFAULT 'R1',
    shelf VARCHAR(50) DEFAULT 'S1',
    bin_number VARCHAR(50) DEFAULT 'B1',
    bin_type VARCHAR(50) NOT NULL DEFAULT 'storage',
    max_capacity_qty NUMERIC(15, 2) DEFAULT 1000.00,
    max_weight_kg NUMERIC(15, 2) DEFAULT 500.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bin_stock_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    bin_id UUID NOT NULL REFERENCES warehouse_bins(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    quantity NUMERIC(15, 4) NOT NULL DEFAULT 0.00,
    batch_number VARCHAR(100) DEFAULT NULL,
    expiry_date DATE DEFAULT NULL,
    last_putaway_at TIMESTAMPTZ DEFAULT NOW(),
    last_picked_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
                  navigator.clipboard.writeText(sql);
                  showToast('تم نسخ كود SQL لـ WMS بنجاح إلى الحافظة 📋', 'success');
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                نسخ كود SQL للحافظة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BinLocationManager;
