import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  DriverDelivery,
  DriverSettlement,
  DeliveryDriver,
  driverDispatchService
} from '../../../../services/driverDispatchService';
import {
  Truck,
  Plus,
  DollarSign,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  User,
  RotateCcw,
  CheckCheck,
  RefreshCw,
  Search,
  Calendar,
  Layers,
  Banknote,
  Users,
  Trash2,
  UserPlus,
  Database,
  Copy,
  Check,
  X
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export const DriverDispatchManager: React.FC = () => {
  const { currentUser, accounts } = useAccounting();
  const { showToast } = useToast();

  const [deliveries, setDeliveries] = useState<DriverDelivery[]>([]);
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'deliveries' | 'settlements'>('deliveries');

  // Modals state
  const [selectedDriverForSettlement, setSelectedDriverForSettlement] = useState<string | null>(null);
  const [settlementCashReceived, setSettlementCashReceived] = useState<number>(0);
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [clearingAccountId, setClearingAccountId] = useState<string>('');
  const [settling, setSettling] = useState(false);

  // SQL Schema Modal
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  // New assignment modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [driverNameInput, setDriverNameInput] = useState('');
  const [driverPhoneInput, setDriverPhoneInput] = useState('');
  const [saveNewDriverCheck, setSaveNewDriverCheck] = useState(true);

  // Drivers Directory Modal
  const [isDriversModalOpen, setIsDriversModalOpen] = useState(false);
  const [newDriverForm, setNewDriverForm] = useState({
    name: '',
    phone: '',
    vehicle_type: 'موتوسيكل'
  });
  const [savingDriver, setSavingDriver] = useState(false);

  const fetchDispatchData = async () => {
    setLoading(true);
    try {
      const [delvs, sets, drvs, ordersRes] = await Promise.all([
        driverDispatchService.getDeliveries(currentUser?.organization_id || undefined),
        driverDispatchService.getSettlements(currentUser?.organization_id || undefined),
        driverDispatchService.getDrivers(currentUser?.organization_id || undefined),
        supabase
          .from('orders')
          .select('id, order_number, grand_total, customer_id, notes, status, delivery_orders(*), customers(name, phone, address)')
          .eq('order_type', 'DELIVERY')
          .in('status', ['PAID', 'PENDING_PAYMENT', 'PREPARING', 'READY', 'SERVED', 'CONFIRMED'])
          .order('created_at', { ascending: false })
      ]);

      setDeliveries(delvs);
      setSettlements(sets);
      setDrivers(drvs);
      if (ordersRes.data) {
        setPendingOrders(ordersRes.data);
      }
    } catch (e: any) {
      console.warn('Dispatch load notice:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatchData();
  }, []);

  // Accounts setup
  useEffect(() => {
    if (accounts.length > 0) {
      const cAcc = accounts.find(a => a.name.includes('خزينة') || a.name.includes('صندوق') || a.name.includes('نقدية') || a.code === '1101');
      if (cAcc && !cashAccountId) setCashAccountId(cAcc.id);

      const clrAcc = accounts.find(a => a.name.includes('توصيل') || a.name.includes('وسيط') || a.name.includes('عملاء') || a.code === '1103');
      if (clrAcc && !clearingAccountId) setClearingAccountId(clrAcc.id || cAcc?.id || '');
    }
  }, [accounts]);

  // Group deliveries by driver
  const driverBalances = useMemo(() => {
    const map: Record<string, { driverName: string; pendingDeliveries: DriverDelivery[]; totalCodPending: number }> = {};

    deliveries
      .filter(d => !d.is_settled && d.order_status !== 'PAID' && d.order_status !== 'COMPLETED' && !d.is_prepaid && Number(d.cod_amount) > 0 && d.status !== 'CANCELLED')
      .forEach(d => {
        const name = d.driver_name || 'سائق غير محدد';
        if (!map[name]) {
          map[name] = { driverName: name, pendingDeliveries: [], totalCodPending: 0 };
        }
        map[name].pendingDeliveries.push(d);
        map[name].totalCodPending += Number(d.cod_amount || 0);
      });

    return Object.values(map);
  }, [deliveries]);

  const handleUpdateDeliveryStatus = async (id: string, status: DriverDelivery['status']) => {
    await driverDispatchService.updateDeliveryStatus(id, status);
    showToast('تم تحديث حالة طلب التوصيل ✅', 'success');
    fetchDispatchData();
  };

  const handleQuickSettleDelivery = async (deliveryId: string, orderId?: string) => {
    try {
      await driverDispatchService.settleDeliveryDirectly(deliveryId, orderId);
      showToast('تمت تسوية عهدة هذا الطلب واعتباره مسدداً بنجاح ✅', 'success');
      fetchDispatchData();
    } catch (e: any) {
      showToast('خطأ أثناء التسوية: ' + e.message, 'error');
    }
  };

  const handleOpenSettlement = (driverName: string, expectedCod: number) => {
    setSelectedDriverForSettlement(driverName);
    setSettlementCashReceived(expectedCod);
  };

  const handleExecuteSettlement = async () => {
    if (!selectedDriverForSettlement) return;
    const driverData = driverBalances.find(d => d.driverName === selectedDriverForSettlement);
    if (!driverData) return;

    setSettling(true);
    try {
      const res = await driverDispatchService.settleDriverShift({
        driverName: selectedDriverForSettlement,
        deliveryIds: driverData.pendingDeliveries.map(d => d.id),
        totalCodExpected: driverData.totalCodPending,
        cashReceived: Number(settlementCashReceived),
        organizationId: currentUser?.organization_id || '',
        cashAccountId,
        clearingAccountId,
        userId: currentUser?.id
      });

      if (res.success) {
        showToast('تم إقفال وتسوية وردية السائق بنجاح وتوليد القيد المحاسبي 💰', 'success');
        setSelectedDriverForSettlement(null);
        fetchDispatchData();
      } else {
        showToast('خطأ: ' + res.error, 'error');
      }
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setSettling(false);
    }
  };

  const handleSelectSavedDriver = (drvId: string) => {
    setSelectedDriverId(drvId);
    if (drvId) {
      const found = drivers.find(d => d.id === drvId);
      if (found) {
        setDriverNameInput(found.name);
        setDriverPhoneInput(found.phone || '');
      }
    } else {
      setDriverNameInput('');
      setDriverPhoneInput('');
    }
  };

  const handleAssignOrder = async () => {
    if (!selectedOrderId || !driverNameInput.trim()) {
      showToast('يرجى اختيار الطلب وإدخال اسم السائق', 'warning');
      return;
    }

    const ord = pendingOrders.find(o => o.id === selectedOrderId);
    if (!ord) return;

    const isOrderAlreadyPaid = ord.status === 'PAID' || ord.status === 'COMPLETED';

    const customerName =
      ord.customers?.name ||
      ord.delivery_orders?.[0]?.customer_name ||
      (ord.notes?.includes('منصة') ? ord.notes.replace('طلب منصة توصيل:', '').trim() : undefined) ||
      'عميل توصيل';
    const customerPhone =
      ord.customers?.phone ||
      ord.delivery_orders?.[0]?.customer_phone ||
      '';
    const customerAddress =
      ord.customers?.address ||
      ord.delivery_orders?.[0]?.delivery_address ||
      '';

    try {
      // حفظ السائق في الدليل إذا كان جديداً وتم تفعيل خيار الحفظ
      if (saveNewDriverCheck && !selectedDriverId && driverNameInput.trim()) {
        const isExisting = drivers.some(d => d.name.trim().toLowerCase() === driverNameInput.trim().toLowerCase());
        if (!isExisting) {
          await driverDispatchService.saveDriver(
            {
              name: driverNameInput.trim(),
              phone: driverPhoneInput.trim(),
              vehicle_type: 'موتوسيكل'
            },
            currentUser?.organization_id || undefined
          );
        }
      }

      const assignedRecord = await driverDispatchService.assignDriver({
        orderId: ord.id,
        orderNumber: ord.order_number || `ORD-${ord.id.slice(0, 5)}`,
        customerName,
        customerPhone,
        customerAddress,
        driverId: selectedDriverId || undefined,
        driverName: driverNameInput.trim(),
        driverPhone: driverPhoneInput.trim(),
        codAmount: isOrderAlreadyPaid ? 0 : Number(ord.grand_total || 0),
        isPrepaid: isOrderAlreadyPaid,
        organizationId: currentUser?.organization_id || undefined
      });

      setDeliveries(prev => [
        assignedRecord,
        ...prev.filter(d => d.order_id !== assignedRecord.order_id && d.id !== assignedRecord.id)
      ]);

      showToast(
        isOrderAlreadyPaid
          ? 'تم تعيين الطلب مع السائق كطلب مسدد مسبقاً (عهدة 0 ج) 🛵✅'
          : 'تم تعيين وإرسال الطلب مع السائق بنجاح 🛵',
        'success'
      );
      setIsAssignModalOpen(false);
      setSelectedOrderId('');
      setSelectedDriverId('');
      setDriverNameInput('');
      setDriverPhoneInput('');
      await fetchDispatchData();
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    }
  };

  const handleSaveDriver = async () => {
    if (!newDriverForm.name.trim()) {
      showToast('يرجى إدخال اسم السائق / الكابتن', 'warning');
      return;
    }
    setSavingDriver(true);
    try {
      await driverDispatchService.saveDriver(
        {
          name: newDriverForm.name.trim(),
          phone: newDriverForm.phone.trim(),
          vehicle_type: newDriverForm.vehicle_type
        },
        currentUser?.organization_id || undefined
      );
      showToast('تمت إضافة السائق إلى الدليل بنجاح 🛵', 'success');
      setNewDriverForm({ name: '', phone: '', vehicle_type: 'موتوسيكل' });
      const updatedDrivers = await driverDispatchService.getDrivers(currentUser?.organization_id || undefined);
      setDrivers(updatedDrivers);
    } catch (e: any) {
      showToast('خطأ أثناء حفظ السائق: ' + e.message, 'error');
    } finally {
      setSavingDriver(false);
    }
  };

  const handleDeleteDriver = async (driverId: string, driverName: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف السائق "${driverName}" من دليل الكباتن؟`)) {
      return;
    }
    try {
      await driverDispatchService.deleteDriver(driverId, currentUser?.organization_id || undefined);
      showToast('تم حذف السائق بنجاح 🗑️', 'success');
      const updatedDrivers = await driverDispatchService.getDrivers(currentUser?.organization_id || undefined);
      setDrivers(updatedDrivers);
      if (selectedDriverId === driverId) {
        setSelectedDriverId('');
        setDriverNameInput('');
        setDriverPhoneInput('');
      }
    } catch (e: any) {
      showToast('خطأ أثناء الحذف: ' + e.message, 'error');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-600 to-orange-600 rounded-2xl text-white shadow-md">
            <Truck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              لوحة كباتن التوصيل والعهد النقدية (Driver Dispatch & COD)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              تتبع خروج وعودة السائقين، مبالغ الدفع عند الاستلام المعلقة، وإقفال وردية الكابتن مع القيود المحاسبية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSqlModalOpen(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
            title="فحص وإعداد جداول قاعدة البيانات Supabase"
          >
            <Database className="w-4 h-4 text-indigo-600" /> إعداد قاعدة البيانات SQL
          </button>
          <button
            onClick={() => setIsDriversModalOpen(true)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Users className="w-4 h-4 text-slate-600" /> دليل كباتن التوصيل ({drivers.length})
          </button>
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/20 transition"
          >
            <Plus className="w-4 h-4" /> تعيين طلب لسائق
          </button>
        </div>
      </div>

      {/* Driver Pending Balances Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-amber-600" />
          العهد النقدية المعلقة مع كباتن التوصيل حالياً ({driverBalances.length} كابتن)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {driverBalances.map(drv => (
            <div
              key={drv.driverName}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{drv.driverName}</h4>
                    <span className="text-xs text-slate-400 font-medium">
                      {drv.pendingDeliveries.length} طلبات قيد التوصيل
                    </span>
                  </div>
                </div>

                <div className="text-left font-mono">
                  <span className="text-[10px] text-slate-400 block">إجمالي العهدة (COD)</span>
                  <span className="text-lg font-black text-rose-600">
                    {drv.totalCodPending.toFixed(2)} ج
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <span className="text-xs text-slate-500">بانتظار توريد النقدية</span>
                <button
                  onClick={() => handleOpenSettlement(drv.driverName, drv.totalCodPending)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition"
                >
                  <Banknote className="w-3.5 h-3.5" /> تسوية الوردية
                </button>
              </div>
            </div>
          ))}

          {driverBalances.length === 0 && (
            <div className="col-span-full bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">لا توجد عهد نقدية معلقة مع الكباتن حالياً</p>
              <p className="text-[11px] text-slate-400">كافة الطلبات إما مسددة مسبقاً أو تم إقفال وتسوية عهدتها</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('deliveries')}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'deliveries'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Truck className="w-4 h-4" /> طلبات التوصيل الجارية ({deliveries.length})
        </button>
        <button
          onClick={() => setActiveTab('settlements')}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'settlements'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="w-4 h-4" /> سجل التسويات والإقفالات المحاسبية ({settlements.length})
        </button>
      </div>

      {/* Tab: Deliveries */}
      {activeTab === 'deliveries' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="p-3.5">رقم الطلب</th>
                  <th className="p-3.5">بيانات العميل</th>
                  <th className="p-3.5">السائق / الكابتن</th>
                  <th className="p-3.5 text-center">المبلغ المطلوب (COD)</th>
                  <th className="p-3.5 text-center">حالة التوصيل</th>
                  <th className="p-3.5 text-center">وقت الخروج</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map(delv => (
                  <tr key={delv.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5">
                      <span className="font-bold text-slate-800 block">#{delv.order_number}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{delv.id.slice(0, 8)}</span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-bold text-slate-700 block">{delv.customer_name || 'عميل توصيل'}</span>
                      {delv.customer_phone && (
                        <span className="text-[11px] text-slate-500 block font-mono">📞 {delv.customer_phone}</span>
                      )}
                      {delv.customer_address && (
                        <span className="text-[10px] text-slate-400 block truncate max-w-xs">📍 {delv.customer_address}</span>
                      )}
                    </td>

                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                          {delv.driver_name?.charAt(0) || 'س'}
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 block">{delv.driver_name}</span>
                          {delv.driver_phone && (
                            <span className="text-[10px] text-slate-400 block font-mono">{delv.driver_phone}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5 text-center">
                      {delv.is_prepaid || delv.order_status === 'PAID' || delv.is_settled ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          مسدد مسبقاً (0 ج)
                        </span>
                      ) : (
                        <span className="font-black text-rose-600 font-mono text-sm">
                          {Number(delv.cod_amount || 0).toFixed(2)} ج
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          delv.status === 'DELIVERED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : delv.status === 'DISPATCHED'
                            ? 'bg-sky-100 text-sky-800'
                            : delv.status === 'RETURNED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {delv.status === 'DELIVERED'
                          ? 'تم التسليم للعميل 🏠'
                          : delv.status === 'DISPATCHED'
                          ? 'في الطريق 🛵'
                          : delv.status === 'RETURNED'
                          ? 'مرتجع / ملغي ❌'
                          : 'تم التعيين 📋'}
                      </span>
                    </td>

                    <td className="p-3.5 text-center text-slate-400 text-[11px] font-mono">
                      {delv.dispatched_at
                        ? formatDistanceToNow(new Date(delv.dispatched_at), { addSuffix: true, locale: ar })
                        : '-'}
                    </td>

                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {delv.status !== 'DELIVERED' && (
                          <button
                            onClick={() => handleUpdateDeliveryStatus(delv.id, 'DELIVERED')}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold transition"
                            title="تأكيد تسليم الطلب للعميل"
                          >
                            تسليم
                          </button>
                        )}
                        {!delv.is_settled && (
                          <button
                            onClick={() => handleQuickSettleDelivery(delv.id, delv.order_id)}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-bold transition"
                            title="تحصيل وتسوية عهدة هذا الطلب"
                          >
                            تحصيل
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {deliveries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      لا توجد طلبات توصيل مسجلة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Settlements */}
      {activeTab === 'settlements' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="p-3.5">رقم التسوية</th>
                  <th className="p-3.5">اسم السائق</th>
                  <th className="p-3.5 text-center">تاريخ الإقفال</th>
                  <th className="p-3.5 text-center">عدد الطلبات</th>
                  <th className="p-3.5 text-center">العهدة المتوقعة</th>
                  <th className="p-3.5 text-center">النقدية المستلمة</th>
                  <th className="p-3.5 text-center">الفارق / العجز</th>
                  <th className="p-3.5 text-center">القيد المحاسبي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 font-bold font-mono text-slate-800">{s.settlement_number}</td>
                    <td className="p-3.5 font-bold text-slate-700">{s.driver_name}</td>
                    <td className="p-3.5 text-center font-mono text-slate-500">{s.settlement_date}</td>
                    <td className="p-3.5 text-center font-bold">{s.total_orders_count}</td>
                    <td className="p-3.5 text-center font-mono text-slate-600 font-bold">{Number(s.total_cod_expected || 0).toFixed(2)} ج</td>
                    <td className="p-3.5 text-center font-mono text-emerald-600 font-bold">{Number(s.total_cash_received || 0).toFixed(2)} ج</td>
                    <td className="p-3.5 text-center font-mono">
                      {Number(s.difference_amount || 0) === 0 ? (
                        <span className="text-slate-400">0.00 ج</span>
                      ) : Number(s.difference_amount) < 0 ? (
                        <span className="text-rose-600 font-bold">{Number(s.difference_amount).toFixed(2)} ج (عجز)</span>
                      ) : (
                        <span className="text-emerald-600 font-bold">+{Number(s.difference_amount).toFixed(2)} ج (زيادة)</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {s.journal_entry_id ? 'قيد مرحل ✅' : 'مسجل'}
                      </span>
                    </td>
                  </tr>
                ))}
                {settlements.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      لا توجد تسويات سابقة مسجلة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drivers Directory Modal */}
      {isDriversModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden space-y-4 p-6">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-600" />
                دليل كباتن وسائقي التوصيل ({drivers.length})
              </h3>
              <button onClick={() => setIsDriversModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add New Driver Form */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-amber-600" /> إضافة كابتن / سائق جديد
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="اسم السائق (مثال: كابتن محمود)"
                  value={newDriverForm.name}
                  onChange={e => setNewDriverForm({ ...newDriverForm, name: e.target.value })}
                  className="border border-slate-300 rounded-lg p-2 text-xs outline-none bg-white"
                />
                <input
                  type="tel"
                  placeholder="رقم الموبايل (010xxxxxxxx)"
                  value={newDriverForm.phone}
                  onChange={e => setNewDriverForm({ ...newDriverForm, phone: e.target.value })}
                  className="border border-slate-300 rounded-lg p-2 text-xs outline-none bg-white"
                />
                <div className="flex gap-2">
                  <select
                    value={newDriverForm.vehicle_type}
                    onChange={e => setNewDriverForm({ ...newDriverForm, vehicle_type: e.target.value })}
                    className="border border-slate-300 rounded-lg p-2 text-xs outline-none bg-white flex-1"
                  >
                    <option value="موتوسيكل">موتوسيكل 🛵</option>
                    <option value="سكوتر">سكوتر 🛴</option>
                    <option value="سيارة">سيارة 🚗</option>
                    <option value="عجلة">عجلة 🚲</option>
                  </select>
                  <button
                    onClick={handleSaveDriver}
                    disabled={savingDriver}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow transition"
                  >
                    {savingDriver ? '...' : 'حفظ'}
                  </button>
                </div>
              </div>
            </div>

            {/* Drivers List Table */}
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                  <tr>
                    <th className="p-3">اسم الكابتن</th>
                    <th className="p-3">رقم الهاتف</th>
                    <th className="p-3 text-center">المركبة</th>
                    <th className="p-3 text-center w-12">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drivers.map(drv => (
                    <tr key={drv.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-800">{drv.name}</td>
                      <td className="p-3 font-mono text-slate-600">{drv.phone || '-'}</td>
                      <td className="p-3 text-center text-slate-500">{drv.vehicle_type || 'موتوسيكل'}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDeleteDriver(drv.id, drv.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                          title="حذف السائق"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {drivers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400">
                        لا يوجد كباتن مسجلون حالياً. استخدم النموذج أعلاه لإضافة أول سائق.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t pt-3 flex justify-end">
              <button
                onClick={() => setIsDriversModalOpen(false)}
                className="px-5 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Order Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-600" />
                تعيين طلب توصيل لسائق
              </h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اختر طلب التوصيل <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedOrderId}
                  onChange={e => setSelectedOrderId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- اختر من الطلبات الجاهزة للتوصيل --</option>
                  {pendingOrders
                    .filter(o => !deliveries.some(d => d.order_id === o.id && d.status !== 'CANCELLED'))
                    .map(o => {
                      const custName = o.customers?.name || o.delivery_orders?.[0]?.customer_name || (o.notes?.includes('منصة') ? o.notes.replace('طلب منصة توصيل:', '').trim() : 'عميل توصيل');
                      const isPaid = o.status === 'PAID' || o.status === 'COMPLETED';
                      const statusBadge = isPaid
                        ? '💵 مسدد مسبقاً (COD: 0 ج)'
                        : o.status === 'SERVED'
                        ? '🍽️ جاهز ومسلّم'
                        : o.status === 'READY'
                        ? '🍳 جاهز بالمطبخ'
                        : '⏳ جاري التحضير';
                      return (
                        <option key={o.id} value={o.id}>
                          #{o.order_number || o.id.slice(0, 5)} - {custName} ({Number(o.grand_total || 0).toFixed(2)} ج) [{statusBadge}]
                        </option>
                      );
                    })}
                </select>
                {(() => {
                  const selectedOrder = pendingOrders.find(o => o.id === selectedOrderId);
                  const isSelectedPaid = selectedOrder?.status === 'PAID' || selectedOrder?.status === 'COMPLETED';
                  if (isSelectedPaid) {
                    return (
                      <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>
                          <strong>تنبيه مالي:</strong> هذا الطلب مسدد مسبقاً لدى الكاشير. لن يتم تسجيل أي عهدة نقدية على الكابتن (مبلغ التحصيل 0.00 ج)، فقط توصيل الطلب للعميل.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Driver Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اختر الكابتن من الدليل المسجل
                </label>
                <select
                  value={selectedDriverId}
                  onChange={e => handleSelectSavedDriver(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold outline-none bg-white text-slate-800 mb-2 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- اختر كابتن مسجل مسبقاً (أو اكتب اسماً يدوياً بالأسفل) --</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.phone ? `(${d.phone})` : ''} - {d.vehicle_type || 'موتوسيكل'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم السائق <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={driverNameInput}
                    onChange={e => {
                      setDriverNameInput(e.target.value);
                      if (selectedDriverId) setSelectedDriverId('');
                    }}
                    placeholder="مثال: الكابتن محمود"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم هاتف السائق</label>
                  <input
                    type="tel"
                    value={driverPhoneInput}
                    onChange={e => setDriverPhoneInput(e.target.value)}
                    placeholder="010xxxxxxxx"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  />
                </div>
              </div>

              {!selectedDriverId && (
                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                    <input
                      type="checkbox"
                      checked={saveNewDriverCheck}
                      onChange={e => setSaveNewDriverCheck(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300"
                    />
                    <span className="font-bold text-[11px]">حفظ هذا السائق تلقائياً في الدليل لاختياره بسهولة المرات القادمة</span>
                  </label>
                </div>
              )}
            </div>

            <div className="border-t pt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600"
              >
                إلغاء
              </button>
              <button
                onClick={handleAssignOrder}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow"
              >
                <Truck className="w-4 h-4" /> إرسال الطلب مع السائق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settlement Modal */}
      {selectedDriverForSettlement && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden space-y-4 p-6">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-600" />
                إقفال وتسوية عهدة السائق
              </h3>
              <button onClick={() => setSelectedDriverForSettlement(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px]">اسم الكابتن</span>
                <span className="font-bold text-sm text-slate-800">{selectedDriverForSettlement}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المبلغ النقدي المستلم فعلياً من الكابتن (ج.م)
                </label>
                <input
                  type="number"
                  step="1"
                  value={settlementCashReceived}
                  onChange={e => setSettlementCashReceived(parseFloat(e.target.value) || 0)}
                  className="w-full text-xl font-bold font-mono text-emerald-600 border rounded-xl p-2.5 text-center outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">حساب الخزينة (المدين)</label>
                  <select
                    value={cashAccountId}
                    onChange={e => setCashAccountId(e.target.value)}
                    className="w-full border rounded-lg p-1.5 text-xs outline-none bg-white"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">حساب التوصيل (الدائن)</label>
                  <select
                    value={clearingAccountId}
                    onChange={e => setClearingAccountId(e.target.value)}
                    className="w-full border rounded-lg p-1.5 text-xs outline-none bg-white"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 flex justify-end gap-2">
              <button
                onClick={() => setSelectedDriverForSettlement(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600"
              >
                إلغاء
              </button>
              <button
                onClick={handleExecuteSettlement}
                disabled={settling}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow"
              >
                <CheckCircle2 className="w-4 h-4" />
                {settling ? 'جاري التسوية...' : 'تأكيد استلام النقدية وإقفال الوردية'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Setup Modal */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden space-y-4 p-6 text-right">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2 text-indigo-700">
                <Database className="w-5 h-5" />
                <h3 className="font-black text-base text-slate-800">إعداد وتحديث جداول قاعدة بيانات كباتن التوصيل (Supabase SQL)</h3>
              </div>
              <button onClick={() => setIsSqlModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              إذا ظهر لك خطأ <code className="bg-slate-100 text-rose-600 font-mono px-1 rounded">409 Conflict</code> أو رغبت في مزامنة جدول كباتن التوصيل والعهد النقدية مع سحابة Supabase، انسخ الكود التالي وشغّله في <strong>Supabase SQL Editor</strong>:
            </p>

            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-[11px] font-mono overflow-x-auto max-h-72 text-left dir-ltr">
{`-- TriPro ERP: Fix Driver Deliveries & Directory
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    vehicle_type TEXT DEFAULT 'موتوسيكل',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'driver_deliveries_driver_id_fkey'
    ) THEN
        ALTER TABLE driver_deliveries DROP CONSTRAINT driver_deliveries_driver_id_fkey;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS driver_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    order_id UUID NOT NULL,
    driver_id UUID,
    driver_name VARCHAR(255) NOT NULL,
    driver_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ASSIGNED',
    cod_amount NUMERIC(15, 2) DEFAULT 0.00,
    is_settled BOOLEAN DEFAULT FALSE,
    settlement_id UUID,
    dispatched_at TIMESTAMPTZ DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    settlement_number VARCHAR(100) NOT NULL UNIQUE,
    driver_id UUID,
    driver_name VARCHAR(255) NOT NULL,
    settlement_date DATE DEFAULT CURRENT_DATE,
    total_orders_count INT DEFAULT 0,
    total_cod_expected NUMERIC(15, 2) DEFAULT 0.00,
    total_cash_received NUMERIC(15, 2) DEFAULT 0.00,
    difference_amount NUMERIC(15, 2) DEFAULT 0.00,
    journal_entry_id UUID,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_driver_deliv ON driver_deliveries;
CREATE POLICY allow_all_driver_deliv ON driver_deliveries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_driver_settle ON driver_settlements;
CREATE POLICY allow_all_driver_settle ON driver_settlements FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS delivery_drivers_org_policy ON delivery_drivers;
CREATE POLICY delivery_drivers_org_policy ON delivery_drivers FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.delivery_drivers TO authenticated, anon;
GRANT ALL ON public.driver_deliveries TO authenticated, anon;
GRANT ALL ON public.driver_settlements TO authenticated, anon;`}
              </pre>

              <button
                onClick={() => {
                  const sql = `-- TriPro ERP: Fix Driver Deliveries & Directory
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    vehicle_type TEXT DEFAULT 'موتوسيكل',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'driver_deliveries_driver_id_fkey'
    ) THEN
        ALTER TABLE driver_deliveries DROP CONSTRAINT driver_deliveries_driver_id_fkey;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS driver_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    order_id UUID NOT NULL,
    driver_id UUID,
    driver_name VARCHAR(255) NOT NULL,
    driver_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ASSIGNED',
    cod_amount NUMERIC(15, 2) DEFAULT 0.00,
    is_settled BOOLEAN DEFAULT FALSE,
    settlement_id UUID,
    dispatched_at TIMESTAMPTZ DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    settlement_number VARCHAR(100) NOT NULL UNIQUE,
    driver_id UUID,
    driver_name VARCHAR(255) NOT NULL,
    settlement_date DATE DEFAULT CURRENT_DATE,
    total_orders_count INT DEFAULT 0,
    total_cod_expected NUMERIC(15, 2) DEFAULT 0.00,
    total_cash_received NUMERIC(15, 2) DEFAULT 0.00,
    difference_amount NUMERIC(15, 2) DEFAULT 0.00,
    journal_entry_id UUID,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_driver_deliv ON driver_deliveries;
CREATE POLICY allow_all_driver_deliv ON driver_deliveries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_driver_settle ON driver_settlements;
CREATE POLICY allow_all_driver_settle ON driver_settlements FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS delivery_drivers_org_policy ON delivery_drivers;
CREATE POLICY delivery_drivers_org_policy ON delivery_drivers FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.delivery_drivers TO authenticated, anon;
GRANT ALL ON public.driver_deliveries TO authenticated, anon;
GRANT ALL ON public.driver_settlements TO authenticated, anon;`;
                  navigator.clipboard.writeText(sql);
                  setSqlCopied(true);
                  showToast('تم نسخ كود SQL بنجاح 📋', 'success');
                  setTimeout(() => setSqlCopied(false), 3000);
                }}
                className="absolute top-3 right-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow"
              >
                {sqlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {sqlCopied ? 'تم النسخ!' : 'نسخ كود SQL'}
              </button>
            </div>

            <div className="border-t pt-3 flex justify-end">
              <button
                onClick={() => setIsSqlModalOpen(false)}
                className="px-5 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default DriverDispatchManager;
