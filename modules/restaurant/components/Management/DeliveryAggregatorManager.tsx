import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  AggregatorOrder,
  AggregatorChannel,
  deliveryAggregatorService,
  DEFAULT_AGGREGATOR_CHANNELS
} from '../../../../services/deliveryAggregatorService';
import {
  ShoppingBag,
  Plus,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  DollarSign,
  Layers,
  Sparkles,
  Zap,
  Truck,
  RefreshCw,
  Sliders,
  Play,
  CheckCheck,
  X,
  Radio,
  Settings2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export const DeliveryAggregatorManager: React.FC = () => {
  const { currentUser, products, accounts } = useAccounting();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<AggregatorOrder[]>([]);
  const [channels, setChannels] = useState<AggregatorChannel[]>([]);
  const [activeTab, setActiveTab] = useState<'live' | 'channels'>('live');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedChannelForConfig, setSelectedChannelForConfig] = useState<AggregatorChannel | null>(null);
  const [showAccountsConfig, setShowAccountsConfig] = useState(false);

  // فلترة الحسابات الفرعية القابلة للترحيل المباشر (استبعاد الحسابات الرئيسية والمجموعات)
  const leafAccounts = useMemo(() => {
    const list = accounts.filter(a => {
      if ((a as any).is_parent === true || (a as any).is_group === true || a.type === 'parent') return false;
      const hasChildren = accounts.some(other => (other as any).parent_id === a.id);
      return !hasChildren;
    });
    return list.length > 0 ? list : accounts;
  }, [accounts]);

  // Accounts
  const [receivableAccountId, setReceivableAccountId] = useState<string>('');
  const [salesAccountId, setSalesAccountId] = useState<string>('');
  const [commissionExpenseAccountId, setCommissionExpenseAccountId] = useState<string>('');

  useEffect(() => {
    setChannels(deliveryAggregatorService.getChannels());
    setOrders(deliveryAggregatorService.getOrders(currentUser?.organization_id || undefined));

    if (leafAccounts.length > 0) {
      const recAcc = leafAccounts.find(a => a.name.includes('مدين') || a.name.includes('عملاء') || a.name.includes('توصيل') || a.code?.startsWith('1103') || a.type === 'asset');
      if (recAcc && !receivableAccountId) setReceivableAccountId(recAcc.id);

      const salesAcc = leafAccounts.find(a => a.name.includes('مبيعات') || a.name.includes('إيراد') || a.code?.startsWith('4101') || a.type === 'revenue');
      if (salesAcc && !salesAccountId) setSalesAccountId(salesAcc.id);

      const expAcc = leafAccounts.find(a => a.name.includes('تسويق') || a.name.includes('عمولة') || a.name.includes('مصاريف') || a.code?.startsWith('52') || a.type === 'expense');
      if (expAcc && !commissionExpenseAccountId) setCommissionExpenseAccountId(expAcc.id);
    }
  }, [leafAccounts, currentUser]);

  const refreshData = () => {
    setChannels(deliveryAggregatorService.getChannels());
    setOrders(deliveryAggregatorService.getOrders(currentUser?.organization_id || undefined));
  };

  const handleSimulateOrder = () => {
    const randomChannel = channels[Math.floor(Math.random() * channels.length)] || DEFAULT_AGGREGATOR_CHANNELS[0];
    const manufacturedProds = products.filter(p => p.product_type === 'MANUFACTURED' || p.product_type === 'STOCK');
    const prod1 = manufacturedProds[0] || { id: 'p1', name: 'برجر لحم فاخر', sales_price: 120 };
    const prod2 = manufacturedProds[1] || { id: 'p2', name: 'بطاطس مقلية وصوص', sales_price: 45 };

    const items = [
      {
        product_id: prod1.id,
        name: prod1.name,
        quantity: 2,
        unit_price: Number(prod1.sales_price || 120),
        total_price: Number(prod1.sales_price || 120) * 2,
        notes: 'بدون بصل مع كاتشب زيادة'
      },
      {
        product_id: prod2.id,
        name: prod2.name,
        quantity: 1,
        unit_price: Number(prod2.sales_price || 45),
        total_price: Number(prod2.sales_price || 45),
        notes: ''
      }
    ];

    const subtotal = items.reduce((acc, it) => acc + it.total_price, 0);

    const newOrd = deliveryAggregatorService.receiveIncomingOrder({
      organization_id: currentUser?.organization_id || null,
      channel_code: randomChannel.code,
      channel_name: randomChannel.name,
      customer_name: 'عميل المنصة (أحمد سعيد)',
      customer_phone: '01012345678',
      customer_address: 'شارع النصر - عمارة 14 - الدور 3',
      items,
      subtotal,
      gross_total: subtotal,
      commission_pct: randomChannel.commission_pct,
      driver_name: `كابتن ${randomChannel.name.split(' ')[0]}`,
      driver_phone: '01188776655'
    });

    showToast(`تم استقبال طلب جديد من منصة ${randomChannel.name}! 🔔`, 'info');
    refreshData();
  };

  const handleAcceptOrder = async (orderId: string) => {
    try {
      const res = await deliveryAggregatorService.acceptAndRouteOrder({
        aggregatorOrderId: orderId,
        organizationId: currentUser?.organization_id || '',
        receivableAccountId,
        salesAccountId,
        commissionExpenseAccountId,
        userId: currentUser?.id
      });

      if (res.success) {
        showToast('تم قبول الطلب وتوجيهه للمطبخ والقيود المحاسبية بنجاح 🚀', 'success');
        refreshData();
      } else {
        showToast('خطأ: ' + res.error, 'error');
      }
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    }
  };

  const handleSaveChannelCommission = (channel: AggregatorChannel, newCommission: number) => {
    const updated: AggregatorChannel = { ...channel, commission_pct: newCommission };
    deliveryAggregatorService.saveChannel(updated);
    showToast('تم تحديث نسبة عمولة المنصة بنجاح ✅', 'success');
    setIsConfigModalOpen(false);
    refreshData();
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl text-white shadow-md">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-800">بوابة منصات التوصيل (Delivery Aggregators)</h2>
              <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-600 animate-pulse" /> Live Gateway
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              استقبال موحد لطلبات تطبيقات التوصيل (هنقرستيشن، جاهز، طلبات، ديليفرو، نون) مع احتساب عمولة المنصات والقيود المحاسبية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSimulateOrder}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20 transition"
          >
            <Play className="w-4 h-4 fill-white" /> محاكاة استقبال طلب خارجي 🔔
          </button>

          <button onClick={refreshData} className="p-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Aggregator Channels Overview Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {channels.map(ch => (
          <div
            key={ch.id}
            onClick={() => {
              setSelectedChannelForConfig(ch);
              setIsConfigModalOpen(true);
            }}
            className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-400 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: ch.color }} />
              <div>
                <span className="font-bold text-xs text-slate-800 block">{ch.name.split('(')[0]}</span>
                <span className="text-[11px] text-slate-400 font-mono">عمولة: {ch.commission_pct}%</span>
              </div>
            </div>
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
          </div>
        ))}
      </div>

      {/* Accounts Mapping Bar for Journal Entries */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
        <button
          onClick={() => setShowAccountsConfig(!showAccountsConfig)}
          className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 flex justify-between items-center font-bold text-slate-700 transition"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-orange-600" />
            <span>إعدادات وتوجيه الحسابات المحاسبية لعمولات ومبيعات المنصات (Accounting Mapping)</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <span>{showAccountsConfig ? 'إخفاء' : 'تخصيص الحسابات'}</span>
            {showAccountsConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAccountsConfig && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
            <div>
              <label className="block text-slate-600 font-bold mb-1">حساب مستحقات المنصة (المدينون):</label>
              <select
                value={receivableAccountId}
                onChange={e => setReceivableAccountId(e.target.value)}
                className="w-full border rounded-xl p-2 text-xs font-mono outline-none focus:ring-1 focus:ring-orange-500 bg-white"
              >
                {leafAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">حساب إيرادات المبيعات (الدائن):</label>
              <select
                value={salesAccountId}
                onChange={e => setSalesAccountId(e.target.value)}
                className="w-full border rounded-xl p-2 text-xs font-mono outline-none focus:ring-1 focus:ring-orange-500 bg-white"
              >
                {leafAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">حساب مصروف عمولة المنصة (المدين):</label>
              <select
                value={commissionExpenseAccountId}
                onChange={e => setCommissionExpenseAccountId(e.target.value)}
                className="w-full border rounded-xl p-2 text-xs font-mono outline-none focus:ring-1 focus:ring-orange-500 bg-white"
              >
                {leafAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('live')}
          className={`px-5 py-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'live' ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Zap className="w-4 h-4" /> رادار الطلبات الواردة ({orders.length})
        </button>
      </div>

      {/* Orders Grid */}
      {orders.length === 0 ? (
        <div className="p-16 bg-white rounded-3xl border border-slate-200 text-center space-y-3">
          <ShoppingBag className="w-16 h-16 text-slate-300 mx-auto stroke-1" />
          <h3 className="text-base font-bold text-slate-700">بوابة المنصات جاهزة لاستقبال الطلبات</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            اضغط على زر "محاكاة استقبال طلب خارجي" لتجربة تدفق الطلبات من طلبات أو جاهز أو هنقرستيشن وتوجيهها للمطبخ
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {orders.map(ord => {
            const isPending = ord.status === 'PENDING_ACCEPTANCE';

            return (
              <div
                key={ord.id}
                className={`bg-white rounded-2xl border flex flex-col justify-between shadow-sm overflow-hidden transition-all ${
                  isPending ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-slate-200'
                }`}
              >
                {/* Header */}
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-orange-100 text-orange-800">
                      {ord.channel_name}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-700">{ord.external_order_id}</span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    {formatDistanceToNow(new Date(ord.created_at), { addSuffix: true, locale: ar })}
                  </span>
                </div>

                {/* Items List */}
                <div className="p-4 space-y-2.5 flex-1">
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-slate-800 flex items-center gap-1">
                      <span>{ord.customer_name}</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="line-clamp-1">{ord.customer_address}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-2 space-y-1.5">
                    {ord.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-700">
                          {it.quantity}x {it.name}
                        </span>
                        <span className="font-bold text-slate-900 font-mono">{it.total_price} ج</span>
                      </div>
                    ))}
                  </div>

                  {/* Financial Breakdown */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] space-y-1 mt-3">
                    <div className="flex justify-between text-slate-600">
                      <span>إجمالي الفاتورة:</span>
                      <span className="font-bold font-mono">{ord.gross_total.toFixed(2)} ج</span>
                    </div>
                    <div className="flex justify-between text-rose-600 font-semibold">
                      <span>عمولة المنصة ({ord.commission_pct}%):</span>
                      <span className="font-mono">-{ord.commission_amount.toFixed(2)} ج</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-black border-t pt-1">
                      <span>صافي المستحق للمطعم:</span>
                      <span className="font-mono">{ord.net_payout.toFixed(2)} ج</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                      isPending ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isPending ? 'بانتظار الموافقة 🔔' : 'تم القبول والتحضير بالمطبخ 🍳'}
                  </span>

                  {isPending && (
                    <button
                      onClick={() => handleAcceptOrder(ord.id)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                    >
                      <CheckCheck className="w-4 h-4" /> قبول وإرسال للمطبخ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Channel Configuration Modal */}
      {isConfigModalOpen && selectedChannelForConfig && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden space-y-4 p-6">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-orange-600" />
                إعدادات عمولة: {selectedChannelForConfig.name}
              </h3>
              <button onClick={() => setIsConfigModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نسبة العمولة المقتطعة من المنصة (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    defaultValue={selectedChannelForConfig.commission_pct}
                    id="channelCommInput"
                    className="w-28 text-xl font-bold border border-slate-300 rounded-xl p-2.5 text-center outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <span className="font-bold text-slate-500">% من إجمالي المبيعات</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  const val = parseFloat((document.getElementById('channelCommInput') as HTMLInputElement)?.value) || 15;
                  handleSaveChannelCommission(selectedChannelForConfig, val);
                }}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow"
              >
                <CheckCircle2 className="w-4 h-4" /> حفظ الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default DeliveryAggregatorManager;
