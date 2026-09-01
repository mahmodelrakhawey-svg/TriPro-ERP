import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { 
  Truck, Plus, Search, CheckCircle, Clock, AlertTriangle, 
  ArrowRightLeft, Package, MapPin, Calendar, User, Phone, 
  Printer, RefreshCw, X, Check, Database, Copy, FileText, ChevronDown, 
  ShieldCheck, ShieldAlert, ArrowDownToLine
} from 'lucide-react';
import { InTransitTransfer, InTransitTransferItem, TransferType, InTransitStatus, WarehouseBin } from '../../types';
import StockTransferService from '../../services/stockTransferService';
import WmsLocationService from '../../services/wmsLocationService';
import { useToast } from '../../context/ToastContext';

export const InTransitTransfersManager: React.FC = () => {
  const { warehouses, products, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [transfers, setTransfers] = useState<InTransitTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [savingTransfer, setSavingTransfer] = useState(false);

  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [activeTransferToReceive, setActiveTransferToReceive] = useState<InTransitTransfer | null>(null);
  const [receiveItemInputs, setReceiveItemInputs] = useState<{ [productId: string]: { received_qty: number; to_bin_id: string } }>({});
  const [receiptNotes, setReceiptNotes] = useState('');
  const [savingReceipt, setSavingReceipt] = useState(false);

  const [availableBinsDest, setAvailableBinsDest] = useState<WarehouseBin[]>([]);
  const [availableBinsSrc, setAvailableBinsSrc] = useState<WarehouseBin[]>([]);

  const [sqlModalOpen, setSqlModalOpen] = useState(false);

  // Form State for Creation
  const [formData, setFormData] = useState<Partial<InTransitTransfer>>({
    transfer_number: '',
    transfer_date: new Date().toISOString().split('T')[0],
    from_warehouse_id: '',
    to_warehouse_id: '',
    transfer_type: 'in_transit',
    carrier_name: '',
    driver_name: '',
    driver_phone: '',
    vehicle_number: '',
    tracking_number: '',
    estimated_arrival: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
  });

  const [items, setItems] = useState<InTransitTransferItem[]>([]);

  const orgId = (currentUser as any)?.organization_id || '';
  const userId = currentUser?.id || '';

  // جلب التحويلات
  const fetchTransfers = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await StockTransferService.getTransfers(orgId, {
        status: statusFilter,
        transferType: typeFilter,
      });
      setTransfers(data);
    } catch (err: any) {
      showToast('تعذر تحميل الشحنات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, [orgId, statusFilter, typeFilter]);

  // جلب رفوف المستودعات عند فتح النموذج
  useEffect(() => {
    if (formData.from_warehouse_id && orgId) {
      WmsLocationService.getBinsByWarehouse(orgId, formData.from_warehouse_id).then(setAvailableBinsSrc);
    }
    if (formData.to_warehouse_id && orgId) {
      WmsLocationService.getBinsByWarehouse(orgId, formData.to_warehouse_id).then(setAvailableBinsDest);
    }
  }, [formData.from_warehouse_id, formData.to_warehouse_id, orgId]);

  // تصفية الشحنات
  const filteredTransfers = useMemo(() => {
    return transfers.filter(t => {
      const matchSearch = 
        t.transfer_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.driver_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.carrier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.tracking_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.from_warehouse_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.to_warehouse_name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = statusFilter === 'all' || t.in_transit_status === statusFilter;
      const matchType = typeFilter === 'all' || t.transfer_type === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [transfers, searchTerm, statusFilter, typeFilter]);

  // إحصائيات لوحة التحكم
  const kpis = useMemo(() => {
    const inTransitCount = transfers.filter(t => t.in_transit_status === 'in_transit').length;
    const deliveredCount = transfers.filter(t => t.in_transit_status === 'received_full' || t.in_transit_status === 'partially_received').length;
    const varianceCount = transfers.filter(t => t.in_transit_status === 'partially_received').length;
    
    let inTransitTotalQty = 0;
    transfers.filter(t => t.in_transit_status === 'in_transit').forEach(t => {
      (t.items || []).forEach(it => {
        inTransitTotalQty += Number(it.dispatched_qty || it.quantity) || 0;
      });
    });

    return { inTransitCount, deliveredCount, varianceCount, inTransitTotalQty };
  }, [transfers]);

  // فتح نافذة إنشاء شحنة جديدة
  const handleOpenCreate = () => {
    const fromWh = warehouses.length > 0 ? warehouses[0].id : '';
    const toWh = warehouses.length > 1 ? warehouses[1].id : warehouses.length > 0 ? warehouses[0].id : '';

    setFormData({
      transfer_number: `TRN-${Date.now().toString().slice(-6)}`,
      transfer_date: new Date().toISOString().split('T')[0],
      from_warehouse_id: fromWh,
      to_warehouse_id: toWh,
      transfer_type: 'in_transit',
      carrier_name: 'أسطول النقل الداخلي',
      driver_name: '',
      driver_phone: '',
      vehicle_number: '',
      tracking_number: `TRK-${Date.now().toString().slice(-5)}`,
      estimated_arrival: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: '',
    });

    setItems([
      {
        product_id: products.length > 0 ? products[0].id : '',
        product_name: products.length > 0 ? products[0].name : '',
        quantity: 50,
      }
    ]);

    setIsCreateModalOpen(true);
  };

  // إضافة سطر صنف
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        product_id: products.length > 0 ? products[0].id : '',
        product_name: products.length > 0 ? products[0].name : '',
        quantity: 10,
      }
    ]);
  };

  const handleItemChange = (index: number, field: keyof InTransitTransferItem, val: any) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: val };
    if (field === 'product_id') {
      const prod = products.find(p => p.id === val);
      if (prod) item.product_name = prod.name;
    }
    newItems[index] = item;
    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // حفظ الشحنة
  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.from_warehouse_id || !formData.to_warehouse_id) {
      showToast('يرجى اختيار المستودع المصدر ومستودع الوجهة', 'warning');
      return;
    }
    if (formData.from_warehouse_id === formData.to_warehouse_id) {
      showToast('لا يمكن التحويل لنفس المستودع', 'warning');
      return;
    }
    if (items.length === 0) {
      showToast('يرجى إضافة صنف واحد على الأقل للشحنة', 'warning');
      return;
    }

    setSavingTransfer(true);
    try {
      const fromWh = warehouses.find(w => w.id === formData.from_warehouse_id);
      const toWh = warehouses.find(w => w.id === formData.to_warehouse_id);

      const payload = {
        ...formData,
        from_warehouse_name: fromWh?.name,
        to_warehouse_name: toWh?.name,
      };

      const res = await StockTransferService.createTransfer(payload, items, orgId, userId);
      if (!res.success) throw new Error(res.error);

      showToast(`تم إنشاء شحنة التحويل #${res.data?.transfer_number} وبدء مرحلة النقل بنجاح 🚚`, 'success');
      setIsCreateModalOpen(false);
      fetchTransfers();
    } catch (err: any) {
      showToast(err.message || 'فشل إنشاء الشحنة', 'error');
    } finally {
      setSavingTransfer(false);
    }
  };

  // فتح نافذة الاستلام والفحص
  const handleOpenReceive = async (transfer: InTransitTransfer) => {
    setActiveTransferToReceive(transfer);
    setReceiptNotes('');

    // جلب رفوف مستودع الوجهة
    if (transfer.to_warehouse_id && orgId) {
      const destBins = await WmsLocationService.getBinsByWarehouse(orgId, transfer.to_warehouse_id);
      setAvailableBinsDest(destBins);
    }

    const initialInputs: { [productId: string]: { received_qty: number; to_bin_id: string } } = {};
    (transfer.items || []).forEach(it => {
      initialInputs[it.product_id] = {
        received_qty: Number(it.dispatched_qty || it.quantity) || 0,
        to_bin_id: it.to_bin_id || '',
      };
    });
    setReceiveItemInputs(initialInputs);
    setIsReceiveModalOpen(true);
  };

  // تأكيد الاستلام
  const handleConfirmReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTransferToReceive) return;

    setSavingReceipt(true);
    try {
      const receivedItemsPayload = Object.keys(receiveItemInputs).map(prodId => ({
        product_id: prodId,
        received_qty: Number(receiveItemInputs[prodId].received_qty) || 0,
        to_bin_id: receiveItemInputs[prodId].to_bin_id || undefined,
      }));

      const res = await StockTransferService.receiveTransfer(
        activeTransferToReceive.id,
        receivedItemsPayload,
        receiptNotes,
        userId
      );

      if (!res.success) throw new Error(res.error);

      showToast(`تم تأكيد استلام الشحنة #${activeTransferToReceive.transfer_number} وتحديث المخزون بنجاح ✅`, 'success');
      setIsReceiveModalOpen(false);
      fetchTransfers();
    } catch (err: any) {
      showToast(err.message || 'فشل تأكيد الاستلام', 'error');
    } finally {
      setSavingReceipt(false);
    }
  };

  const getStatusBadge = (status: InTransitStatus) => {
    switch (status) {
      case 'in_transit':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
            <Truck className="w-3.5 h-3.5 animate-bounce" /> بضاعة بالطريق
          </span>
        );
      case 'received_full':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> مستلم بالكامل
          </span>
        );
      case 'partially_received':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-rose-100 text-rose-800 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> مستلم جزئياً (عجز)
          </span>
        );
      case 'pending_dispatch':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> بانتظار الشحن
          </span>
        );
      default:
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">بضاعة بالطريق والتحويل بين المستودعات</h1>
              <p className="text-sm text-slate-500 font-medium">دورة تحويل متقدمة ثنائية المراحل (صرف ⬅️ بضاعة بالطريق ⬅️ فحص واستلام في الوجهة) ومعالجة العجز</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setSqlModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all"
            title="عرض كود SQL لتهيئة جداول التحويل في Supabase"
          >
            <Database className="w-4 h-4" />
            تهيئة SQL
          </button>

          <button
            onClick={fetchTransfers}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>

          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-amber-200"
          >
            <Plus className="w-4 h-4" />
            شحنة تحويل جديدة (In-Transit)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">شحنات جارية بالطريق</p>
            <h3 className="text-2xl font-black text-amber-600 mt-1">{kpis.inTransitCount} <span className="text-xs text-slate-400 font-normal">شحنة</span></h3>
            <p className="text-[11px] text-amber-600 mt-1">بانتظار وصولها واستلامها بالفروع</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي الكميات بالطريق</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{kpis.inTransitTotalQty.toLocaleString()} <span className="text-xs text-slate-400 font-normal">وحدة</span></h3>
            <p className="text-[11px] text-slate-400 mt-1">مسجلة بحساب بضاعة بالطريق</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">شحنات تم استلامها بالكامل</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{kpis.deliveredCount} <span className="text-xs text-slate-400 font-normal">شحنة</span></h3>
            <p className="text-[11px] text-emerald-600 mt-1">تم إيداعها بالمستودعات المستلمة</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">شحنات بها فروقات وعجز</p>
            <h3 className="text-2xl font-black text-rose-600 mt-1">{kpis.varianceCount} <span className="text-xs text-slate-400 font-normal">شحنة</span></h3>
            <p className="text-[11px] text-slate-400 mt-1">تم تسجيل هدر / عجز نقل</p>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
          <input
            type="text"
            placeholder="بحث برقم الشحنة، السائق، الناقل، أو المستودع..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700"
          >
            <option value="all">جميع حالات الشحن</option>
            <option value="in_transit">بضاعة بالطريق فقط</option>
            <option value="received_full">مستلم بالكامل</option>
            <option value="partially_received">مستلم جزئياً (عجز)</option>
            <option value="pending_dispatch">بانتظار الشحن</option>
          </select>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700"
          >
            <option value="all">جميع أنواع التحويل</option>
            <option value="in_transit">تحويل مع بضاعة بالطريق (Two-Step)</option>
            <option value="direct">تحويل مباشر (Direct One-Step)</option>
          </select>
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center p-12 text-slate-400 font-bold">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-600 mx-auto mb-3" />
            جارِ تحميل سجل الشحنات والتحويلات...
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="text-center p-12">
            <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">لا توجد شحنات تحويل مسجلة</h3>
            <p className="text-xs text-slate-400 mt-1">ابدأ بإنشاء شحنة تحويل بضاعة بالطريق بين الفروع والمستودعات</p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm"
            >
              + إنشاء أول شحنة
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black text-slate-500">
                  <th className="p-4">رقم الشحنة والتاريخ</th>
                  <th className="p-4">مسار التحويل</th>
                  <th className="p-4">الناقل والسائق</th>
                  <th className="p-4">الأصناف والكميات</th>
                  <th className="p-4">حالة الشحنة</th>
                  <th className="p-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredTransfers.map(tr => {
                  const totalQty = (tr.items || []).reduce((sum, it) => sum + (Number(it.dispatched_qty || it.quantity) || 0), 0);
                  const canReceive = tr.in_transit_status === 'in_transit';

                  return (
                    <tr key={tr.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-4">
                        <span className="font-mono font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs">
                          #{tr.transfer_number}
                        </span>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{tr.transfer_date}</span>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                          <span className="px-2 py-1 bg-slate-100 rounded-lg">{tr.from_warehouse_name || 'المستودع المصدر'}</span>
                          <span className="text-amber-600 font-bold">⬅️</span>
                          <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg">{tr.to_warehouse_name || 'مستودع الوجهة'}</span>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="text-xs font-bold text-slate-700">
                          {tr.carrier_name || 'أسطول الشركة'}
                        </div>
                        {tr.driver_name && (
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{tr.driver_name} {tr.vehicle_number ? `(${tr.vehicle_number})` : ''}</span>
                          </div>
                        )}
                      </td>

                      <td className="p-4">
                        <div className="font-bold text-slate-800">
                          {totalQty.toLocaleString()} <span className="text-xs text-slate-400 font-normal">وحدة</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {tr.items?.length || 0} صنف
                        </div>
                      </td>

                      <td className="p-4">
                        {getStatusBadge(tr.in_transit_status)}
                      </td>

                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {canReceive && (
                            <button
                              onClick={() => handleOpenReceive(tr)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                            >
                              <ArrowDownToLine className="w-3.5 h-3.5" />
                              فحص واستلام
                            </button>
                          )}

                          <button
                            onClick={() => window.print()}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all"
                            title="طباعة بوليصة الشحن"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================================== */}
      {/* Modal: Create In-Transit Transfer */}
      {/* ============================================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">إنشاء شحنة تحويل بضاعة بالطريق (In-Transit)</h2>
                  <p className="text-xs text-slate-400">صرف البضاعة من المستودع المصدر وتكليف الناقل بمرحلة النقل</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المستودع المصدر (الصرف) *</label>
                  <select
                    required
                    value={formData.from_warehouse_id}
                    onChange={e => setFormData(prev => ({ ...prev, from_warehouse_id: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  >
                    <option value="">-- اختر المستودع المصدر --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مستودع الوجهة (الاستلام) *</label>
                  <select
                    required
                    value={formData.to_warehouse_id}
                    onChange={e => setFormData(prev => ({ ...prev, to_warehouse_id: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  >
                    <option value="">-- اختر مستودع الوجهة --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">شركة الشحن / الناقل</label>
                  <input
                    type="text"
                    placeholder="أسطول النقل الداخلي"
                    value={formData.carrier_name || ''}
                    onChange={e => setFormData(prev => ({ ...prev, carrier_name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم السائق ورقم الهاتف</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="اسم السائق"
                      value={formData.driver_name || ''}
                      onChange={e => setFormData(prev => ({ ...prev, driver_name: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                    />
                    <input
                      type="text"
                      placeholder="رقم الهاتف"
                      value={formData.driver_phone || ''}
                      onChange={e => setFormData(prev => ({ ...prev, driver_phone: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم لوحة المركبة</label>
                  <input
                    type="text"
                    placeholder="مثال: أ ب ج 1234"
                    value={formData.vehicle_number || ''}
                    onChange={e => setFormData(prev => ({ ...prev, vehicle_number: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الوصول المتوقع</label>
                  <input
                    type="date"
                    value={formData.estimated_arrival || ''}
                    onChange={e => setFormData(prev => ({ ...prev, estimated_arrival: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800">الأصناف المشحونة والكميات</h3>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-bold"
                  >
                    + إضافة صنف
                  </button>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr>
                        <th className="p-3">الصنف</th>
                        <th className="p-3 w-28">الكمية المشحونة</th>
                        <th className="p-3 w-40">من رف (مستودع المصدر)</th>
                        <th className="p-3 w-12 text-center">إلغاء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2">
                            <select
                              required
                              value={item.product_id}
                              onChange={e => handleItemChange(idx, 'product_id', e.target.value)}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                            >
                              <option value="">-- اختر الصنف --</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name} {p.sku ? `(SKU: ${p.sku})` : ''}</option>
                              ))}
                            </select>
                          </td>

                          <td className="p-2">
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              required
                              value={item.quantity}
                              onChange={e => handleItemChange(idx, 'quantity', Number(e.target.value))}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-center font-bold"
                            />
                          </td>

                          <td className="p-2">
                            <select
                              value={item.from_bin_id || ''}
                              onChange={e => handleItemChange(idx, 'from_bin_id', e.target.value)}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                            >
                              <option value="">-- الموقع العام --</option>
                              {availableBinsSrc.map(b => (
                                <option key={b.id} value={b.id}>{b.bin_code} ({b.bin_name})</option>
                              ))}
                            </select>
                          </td>

                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              disabled={items.length === 1}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingTransfer}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  <Truck className="w-4 h-4" />
                  {savingTransfer ? 'جارِ الصرف والشحن...' : 'تأكيد الصرف والشحن بالطريق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* Modal: Receive & Quality Check */}
      {/* ============================================================================== */}
      {isReceiveModalOpen && activeTransferToReceive && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            <div className="p-6 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 text-white rounded-xl">
                  <ArrowDownToLine className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">فحص واستلام الشحنة #{activeTransferToReceive.transfer_number}</h2>
                  <p className="text-xs text-emerald-100">مطابقة الكميات المشحونة مع المستلمة وتسكينها في رفوف مستودع الوجهة</p>
                </div>
              </div>
              <button
                onClick={() => setIsReceiveModalOpen(false)}
                className="p-2 text-emerald-100 hover:text-white rounded-xl hover:bg-emerald-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReceipt} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                <span>المصدر: <strong>{activeTransferToReceive.from_warehouse_name}</strong></span>
                <span>الوجهة: <strong className="text-indigo-700">{activeTransferToReceive.to_warehouse_name}</strong></span>
                <span>الناقل: <strong>{activeTransferToReceive.carrier_name || 'أسطول الشركة'}</strong></span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">الصنف</th>
                      <th className="p-3 w-24 text-center">المشحون</th>
                      <th className="p-3 w-28 text-center">المستلم الفعلي *</th>
                      <th className="p-3 w-20 text-center">الفارق</th>
                      <th className="p-3 w-36">إيداع في الرف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(activeTransferToReceive.items || []).map(it => {
                      const input = receiveItemInputs[it.product_id] || { received_qty: it.dispatched_qty || it.quantity, to_bin_id: '' };
                      const dispQty = Number(it.dispatched_qty || it.quantity) || 0;
                      const recQty = Number(input.received_qty) || 0;
                      const diff = dispQty - recQty;

                      return (
                        <tr key={it.product_id} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-800">
                            {it.product_name || 'صنف'}
                          </td>

                          <td className="p-3 text-center font-bold font-mono">
                            {dispQty}
                          </td>

                          <td className="p-3">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              required
                              value={input.received_qty}
                              onChange={e => {
                                setReceiveItemInputs(prev => ({
                                  ...prev,
                                  [it.product_id]: { ...prev[it.product_id], received_qty: Number(e.target.value) }
                                }));
                              }}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-center font-bold"
                            />
                          </td>

                          <td className="p-3 text-center font-bold">
                            {diff === 0 ? (
                              <span className="text-emerald-600">مطابق</span>
                            ) : diff > 0 ? (
                              <span className="text-rose-600">عجز: {diff}</span>
                            ) : (
                              <span className="text-blue-600">زيادة: {Math.abs(diff)}</span>
                            )}
                          </td>

                          <td className="p-3">
                            <select
                              value={input.to_bin_id || ''}
                              onChange={e => {
                                setReceiveItemInputs(prev => ({
                                  ...prev,
                                  [it.product_id]: { ...prev[it.product_id], to_bin_id: e.target.value }
                                }));
                              }}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px]"
                            >
                              <option value="">-- الموقع العام --</option>
                              {availableBinsDest.map(b => (
                                <option key={b.id} value={b.id}>{b.bin_code} ({b.bin_name})</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفحص والاستلام (تقرير الفروقات)</label>
                <textarea
                  rows={2}
                  placeholder="ملاحظات حول حالة الطرود، أي تلف أو فقد أثناء النقل..."
                  value={receiptNotes}
                  onChange={e => setReceiptNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsReceiveModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingReceipt}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {savingReceipt ? 'جارِ الإيداع والتسوية...' : 'تأكيد الاستلام وإيداع المخزون'}
                </button>
              </div>
            </form>
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
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">كود SQL لإنشاء جداول التحويلات بالطريق</h2>
                  <p className="text-xs text-slate-400">انسخ الكود وشغّله في Supabase SQL Editor للمزامنة السحابية</p>
                </div>
              </div>
              <button
                onClick={() => setSqlModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <pre className="p-4 bg-slate-900 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto max-h-60 leading-relaxed" dir="ltr">
{`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(30) DEFAULT 'direct';
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS in_transit_status VARCHAR(30) DEFAULT 'delivered';
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(50) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(50) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS estimated_arrival DATE DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_by UUID DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS receipt_notes TEXT DEFAULT NULL;

ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS dispatched_qty NUMERIC(15, 4) DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC(15, 4) DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS variance_qty NUMERIC(15, 4) DEFAULT 0.00;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS from_bin_id UUID DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS to_bin_id UUID DEFAULT NULL;`}
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
                  const sql = `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(30) DEFAULT 'direct';
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS in_transit_status VARCHAR(30) DEFAULT 'delivered';
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(50) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(50) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100) DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS estimated_arrival DATE DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_by UUID DEFAULT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS receipt_notes TEXT DEFAULT NULL;

ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS dispatched_qty NUMERIC(15, 4) DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS received_qty NUMERIC(15, 4) DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS variance_qty NUMERIC(15, 4) DEFAULT 0.00;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS from_bin_id UUID DEFAULT NULL;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS to_bin_id UUID DEFAULT NULL;`;
                  navigator.clipboard.writeText(sql);
                  showToast('تم نسخ كود SQL للشحنات بنجاح إلى الحافظة 📋', 'success');
                }}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
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

export default InTransitTransfersManager;
