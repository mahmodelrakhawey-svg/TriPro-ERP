import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  DriverDelivery,
  DriverSettlement,
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
  X
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export const DriverDispatchManager: React.FC = () => {
  const { currentUser, accounts } = useAccounting();
  const { showToast } = useToast();

  const [deliveries, setDeliveries] = useState<DriverDelivery[]>([]);
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'deliveries' | 'settlements'>('deliveries');

  // Modals state
  const [selectedDriverForSettlement, setSelectedDriverForSettlement] = useState<string | null>(null);
  const [settlementCashReceived, setSettlementCashReceived] = useState<number>(0);
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [clearingAccountId, setClearingAccountId] = useState<string>('');
  const [settling, setSettling] = useState(false);

  // New assignment modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [driverNameInput, setDriverNameInput] = useState('');
  const [driverPhoneInput, setDriverPhoneInput] = useState('');

  const fetchDispatchData = async () => {
    setLoading(true);
    try {
      const [delvs, sets, ordersRes] = await Promise.all([
        driverDispatchService.getDeliveries(currentUser?.organization_id || undefined),
        driverDispatchService.getSettlements(currentUser?.organization_id || undefined),
        supabase
          .from('orders')
          .select('id, order_number, grand_total, customer_id, customers(name, phone, address)')
          .eq('order_type', 'DELIVERY')
          .in('status', ['PAID', 'PENDING_PAYMENT', 'PREPARING', 'READY'])
          .order('created_at', { ascending: false })
      ]);

      setDeliveries(delvs);
      setSettlements(sets);
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
      .filter(d => !d.is_settled && d.status !== 'CANCELLED')
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

  const handleAssignOrder = async () => {
    if (!selectedOrderId || !driverNameInput.trim()) {
      showToast('يرجى اختيار الطلب وإدخال اسم السائق', 'warning');
      return;
    }

    const ord = pendingOrders.find(o => o.id === selectedOrderId);
    if (!ord) return;

    try {
      await driverDispatchService.assignDriver({
        orderId: ord.id,
        orderNumber: ord.order_number || `ORD-${ord.id.slice(0, 5)}`,
        customerName: ord.customers?.name,
        customerPhone: ord.customers?.phone,
        customerAddress: ord.customers?.address,
        driverName: driverNameInput.trim(),
        driverPhone: driverPhoneInput.trim(),
        codAmount: Number(ord.grand_total || 0),
        organizationId: currentUser?.organization_id || undefined
      });

      showToast('تم تعيين وإرسال الطلب مع السائق بنجاح 🛵', 'success');
      setIsAssignModalOpen(false);
      setSelectedOrderId('');
      setDriverNameInput('');
      fetchDispatchData();
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
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

        <div className="flex items-center gap-3">
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
                    <h4 className="font-extrabold text-slate-800">{drv.driverName}</h4>
                    <span className="text-xs text-slate-400">
                      {drv.pendingDeliveries.length} طلبات في العهدة
                    </span>
                  </div>
                </div>

                <div className="text-left">
                  <span className="text-xs text-slate-500 block">المبلغ المعلق</span>
                  <span className="text-xl font-black text-amber-600 font-mono">
                    {drv.totalCodPending.toLocaleString()} ج
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleOpenSettlement(drv.driverName, drv.totalCodPending)}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm"
              >
                <Banknote className="w-4 h-4 text-amber-400" />
                إقفال وتسوية العهدة واستلام النقدية
              </button>
            </div>
          ))}

          {driverBalances.length === 0 && (
            <div className="col-span-3 p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
              لا توجد عهد نقدية معلقة مع السائقين حالياً ✅
            </div>
          )}
        </div>
      </div>

      {/* Tabs: Deliveries vs Settlements */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('deliveries')}
          className={`px-5 py-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'deliveries'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Truck className="w-4 h-4" /> طلبات التوصيل الجارية ({deliveries.length})
        </button>

        <button
          onClick={() => setActiveTab('settlements')}
          className={`px-5 py-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'settlements'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CheckCheck className="w-4 h-4" /> سجل التسويات المقفلة ({settlements.length})
        </button>
      </div>

      {/* Deliveries Table */}
      {activeTab === 'deliveries' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم الطلب</th>
                  <th className="p-3.5">العميل والعنوان</th>
                  <th className="p-3.5">الكابتن / السائق</th>
                  <th className="p-3.5 text-center">المبلغ المطلوب (COD)</th>
                  <th className="p-3.5 text-center">حالة التوصيل</th>
                  <th className="p-3.5 text-center">حالة العهدة</th>
                  <th className="p-3.5 text-center">تحديث الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 font-bold font-mono text-amber-700">#{d.order_number}</td>
                    <td className="p-3.5">
                      <span className="font-bold text-slate-800 block">{d.customer_name || 'عميل'}</span>
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {d.customer_address || 'توصيل خارجي'}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-700">
                      {d.driver_name}
                      {d.driver_phone && (
                        <span className="text-[11px] text-slate-400 block font-normal">{d.driver_phone}</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center font-extrabold text-slate-900 font-mono">
                      {Number(d.cod_amount).toFixed(2)} ج
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                          d.status === 'DELIVERED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : d.status === 'DISPATCHED'
                            ? 'bg-blue-100 text-blue-800'
                            : d.status === 'RETURNED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {d.status === 'DELIVERED'
                          ? 'تم التسليم للعميل'
                          : d.status === 'DISPATCHED'
                          ? 'في الطريق مع السائق'
                          : d.status === 'RETURNED'
                          ? 'مرتجع / ملغي'
                          : 'تم التعيين'}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      {d.is_settled ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                          تمت التسوية
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                          معلق بالعهدة
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {d.status !== 'DELIVERED' && (
                          <button
                            onClick={() => handleUpdateDeliveryStatus(d.id, 'DELIVERED')}
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold"
                          >
                            تم التسليم
                          </button>
                        )}
                        {d.status !== 'RETURNED' && (
                          <button
                            onClick={() => handleUpdateDeliveryStatus(d.id, 'RETURNED')}
                            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[11px] font-bold"
                          >
                            مرتجع
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settlements Table */}
      {activeTab === 'settlements' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم التسوية</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">اسم السائق</th>
                  <th className="p-3.5 text-center">عدد الطلبات</th>
                  <th className="p-3.5 text-center">المبلغ المستحق</th>
                  <th className="p-3.5 text-center">المبلغ المستلم فعلياً</th>
                  <th className="p-3.5 text-center">الفارق</th>
                  <th className="p-3.5 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 font-bold font-mono text-indigo-700">{s.settlement_number}</td>
                    <td className="p-3.5 text-slate-600">{s.settlement_date}</td>
                    <td className="p-3.5 font-bold text-slate-800">{s.driver_name}</td>
                    <td className="p-3.5 text-center font-bold">{s.total_orders_count} طلب</td>
                    <td className="p-3.5 text-center font-bold text-slate-700">
                      {Number(s.total_cod_expected).toFixed(2)} ج
                    </td>
                    <td className="p-3.5 text-center font-black text-emerald-700">
                      {Number(s.total_cash_received).toFixed(2)} ج
                    </td>
                    <td className="p-3.5 text-center font-bold">
                      {Number(s.difference_amount) === 0 ? (
                        <span className="text-slate-400">0.00</span>
                      ) : (
                        <span className="text-red-600">{Number(s.difference_amount).toFixed(2)} ج</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold text-[10px]">
                        مكتملة ومرحلة
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Driver Settlement Modal */}
      {selectedDriverForSettlement && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-amber-600" />
                إقفال وتسوية وردية الكابتن: {selectedDriverForSettlement}
              </h3>
              <button onClick={() => setSelectedDriverForSettlement(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <span className="text-slate-600 block">إجمالي المبالغ النقدية المتوقعة من الطلبات:</span>
                <span className="text-2xl font-black text-amber-700">
                  {driverBalances
                    .find(d => d.driverName === selectedDriverForSettlement)
                    ?.totalCodPending.toLocaleString()}{' '}
                  ج.م
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المبلغ المستلم نقداً في الخزينة <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="1"
                  value={settlementCashReceived}
                  onChange={e => setSettlementCashReceived(parseFloat(e.target.value) || 0)}
                  className="w-full text-xl font-bold border border-slate-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب الخزينة (مدين)</label>
                  <select
                    value={cashAccountId}
                    onChange={e => setCashAccountId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب مبيعات التوصيل (دائن)</label>
                  <select
                    value={clearingAccountId}
                    onChange={e => setClearingAccountId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
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
                  <option value="">-- اختر من الطلبات الجاهزة --</option>
                  {pendingOrders.map(o => (
                    <option key={o.id} value={o.id}>
                      #{o.order_number || o.id.slice(0, 5)} - {o.customers?.name || 'عميل'} ({o.grand_total} ج)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم السائق / الكابتن <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={driverNameInput}
                  onChange={e => setDriverNameInput(e.target.value)}
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
    </div>
  );
};
export default DriverDispatchManager;
