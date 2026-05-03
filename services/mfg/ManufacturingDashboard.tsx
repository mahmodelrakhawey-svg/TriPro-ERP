import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import { useToast } from '@/context/ToastContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  Factory, Activity, AlertOctagon, ClipboardCheck, CheckCircle2, RefreshCcw, Trash2,
  TrendingUp, Package, Users, Clock, Loader2, ArrowRight, List, CheckCircle
} from 'lucide-react';

const ManufacturingDashboard = () => {
  const { organization, finalizeProductionOrder } = useAccounting();
  const { showToast } = useToast();
  const orgId = organization?.id;
  const [orders, setOrders] = useState<any[]>([]);
  const [finishingId, setFinishingId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    activeOrders: 0,
    avgEfficiency: 0,
    highVarianceCount: 0,
    pendingQC: 0
  });
  const [efficiencyData, setEfficiencyData] = useState([]);
  const [loading, setLoading] = useState(true);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!orgId) return;
      
      // 1. جلب ملخص الطلبات النشطة
      const { count: activeCount } = await supabase
        .from('mfg_production_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress')
        .eq('organization_id', orgId);

      // 2. جلب كفاءة مراكز العمل
      const { data: effData } = await supabase
        .from('v_mfg_work_center_efficiency')
        .select('*')
        .eq('organization_id', orgId);

      // جلب أوامر الإنتاج الجارية
      const { data: ordersData, error: ordersError } = await supabase
        .from('v_mfg_dashboard')
        .select('*')
        .eq('organization_id', orgId)
        .neq('status', 'completed') 
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error("خطأ في جلب بيانات الأوامر:", ordersError.message, ordersError.details);
        showToast('فشل تحميل قائمة أوامر الإنتاج: ' + ordersError.message, 'error');
      }

      // 3. جلب عدد الانحرافات العالية (>10%)
      const { count: varianceCount } = await supabase
        .from('v_mfg_bom_variance')
        .select('*', { count: 'exact', head: true })
        .gt('variance_percentage', 10)
        .eq('organization_id', orgId);

      // 4. جلب مهام الجودة المعلقة
      const { count: qcCount } = await supabase
        .from('mfg_order_progress')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .is('qc_verified', null)
        .eq('organization_id', orgId);

      const avgEff = effData?.length 
        ? Math.round(effData.reduce((acc, curr) => acc + curr.efficiency_percentage, 0) / effData.length) 
        : 0;

      setStats({
        activeOrders: activeCount || 0,
        avgEfficiency: avgEff,
        highVarianceCount: varianceCount || 0,
        pendingQC: qcCount || 0
      });
      setEfficiencyData(effData || []);
      setOrders(ordersData || []);
      setLoading(false);
    };

    fetchDashboardData();
  }, [orgId]);

  // دالة الإغلاق الذكية الجديدة
  const handleFinalizeOrder = async (id: string, status: 'completed' | 'rework' | 'rejected') => {
    const statusText = status === 'completed' ? 'اعتماد ونجاح' : status === 'rework' ? 'إعادة تشغيل' : 'رفض (هالك)';
    const notes = status !== 'completed' ? window.prompt(`سبب الـ ${statusText}:`) : 'مطابق للمواصفات';
    
    if (status !== 'completed' && notes === null) return;

    setFinishingId(id);
    try {
      const { error } = await supabase.rpc('mfg_finalize_order', {
        p_order_id: id,
        p_final_status: status,
        p_qc_notes: notes
      });

      if (error) throw error;

      showToast(
        status === 'completed' ? 'تم إغلاق الأمر وترحيله للمخزن التام' :
        status === 'rework' ? 'تمت إعادة الأمر لخط الإنتاج للإصلاح' :
        'تم إغلاق الأمر وترحيل التكلفة كخسارة هالك',
        'success'
      );

      // تحديث القائمة بحذف الأمر المغلق
      setOrders(prev => prev.filter(o => o.order_id !== id));
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setFinishingId(null);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, suffix = "" }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900">{value}{suffix}</h3>
      </div>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="text-white" size={24} />
      </div>
    </div>
  );

  if (loading) return <div className="p-10 text-center animate-pulse">جاري بناء لوحة القيادة...</div>;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Activity className="text-blue-600" />
          لوحة المؤشرات الصناعية الموحدة
        </h1>
        <div className="text-sm text-gray-500 bg-white px-4 py-2 rounded-full border border-gray-200">
          تحديث تلقائي: {new Date().toLocaleTimeString('ar-EG')}
        </div>
      </div>

      {/* Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="أوامر نشطة" value={stats.activeOrders} icon={Factory} color="bg-blue-500" />
        <StatCard title="متوسط الكفاءة" value={stats.avgEfficiency} suffix="%" icon={TrendingUp} color="bg-emerald-500" />
        <StatCard title="انحرافات حرجة" value={stats.highVarianceCount} icon={AlertOctagon} color="bg-red-500" />
        <StatCard title="بانتظار الجودة" value={stats.pendingQC} icon={ClipboardCheck} color="bg-purple-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart: Work Center Efficiency */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold mb-6 text-gray-800">أداء مراكز العمل</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={efficiencyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="work_center_name" tick={{fontSize: 12}} />
                <YAxis unit="%" />
                <Tooltip />
                <Bar dataKey="efficiency_percentage" radius={[4, 4, 0, 0]} name="الكفاءة">
                  {efficiencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.efficiency_percentage < 70 ? '#ef4444' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart: QC Performance (Mockup for visualization) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold mb-6 text-gray-800">معدلات نجاح الجودة</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'مقبول', value: 85 },
                    { name: 'مرفوض', value: 10 },
                    { name: 'تحتاج معالجة', value: 5 }
                  ]}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {efficiencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 text-xs font-medium">
               <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded" /> مقبول</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded" /> مرفوض</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-500 rounded" /> معالجة</div>
            </div>
          </div>
        </div>
      </div>

      {/* جدول إدارة الأوامر والترحيل المحاسبي */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Package size={20} className="text-blue-600" /> متابعة وإغلاق أوامر الإنتاج
          </h2>
        </div>
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-400 font-bold border-b">
              <th className="p-4">رقم الأمر</th>
              <th className="p-4">المنتج</th>
              <th className="p-4 text-center">الكمية</th>
              <th className="p-4 text-center">الإنجاز</th>
              <th className="p-4 text-center">الحالة</th>
              <th className="p-4 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orders.map((order) => {
              const isMerged = order.order_number?.startsWith('MFG-MERGED-');
              const isAuto = order.order_number?.startsWith('MFG-AUTO-');
              const isSalesLinked = isMerged || isAuto;

              return (
              <tr key={order.order_id} className={`hover:bg-gray-50 transition-colors ${isSalesLinked ? 'bg-indigo-50/30' : ''}`}>
                <td className="p-4">
                  <div className="flex flex-col">
                    <span className="font-mono font-bold text-blue-600">{order.order_number}</span>
                    {isMerged && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded mt-1 w-fit font-bold">دفعة مجمعة</span>}
                    {isAuto && <span className="text-[9px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded mt-1 w-fit font-bold">طلب مبيعات</span>}
                  </div>
                </td>
                <td className="p-4">
                  <div className="font-bold text-slate-800">{order.product_name}</div>
                  {order.batch_number && <div className="text-[10px] text-slate-400 mt-0.5">المرجع: {order.batch_number}</div>}
                </td>
                <td className="p-4 text-center">{order.quantity_to_produce}</td>
                <td className="p-4 text-center">
                  <div className="w-24 bg-gray-100 h-2 rounded-full mx-auto overflow-hidden">
                    <div className="bg-emerald-500 h-full transition-all" style={{ width: `${order.completion_percentage}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400">{order.completion_percentage}%</span>
                </td>
                <td className="p-4 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${order.status === 'in_progress' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                    {order.status === 'in_progress' ? 'قيد التنفيذ' : 'مسودة'}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {order.status === 'completed' && (
                      <button
                        onClick={() => {
                          window.location.hash = `#/mfg/genealogy?search=${order.order_number}`;
                        }}
                        className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold hover:bg-blue-100 transition-all border border-blue-100"
                        title="عرض الأرقام التسلسلية المنتجة"
                      >
                        <List size={14} /> تتبع السيريالات
                      </button>
                    )}
                    {order.can_finalize || order.status === 'in_progress' ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleFinalizeOrder(order.order_id, 'completed')}
                          disabled={finishingId === order.order_id}
                          className="flex items-center gap-1 bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-50"
                          title="اعتماد نهائي"
                        >
                          {finishingId === order.order_id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />} اعتماد
                        </button>
                        <button
                          onClick={() => handleFinalizeOrder(order.order_id, 'rework')}
                          disabled={finishingId === order.order_id}
                          className="flex items-center gap-1 bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-amber-600 disabled:opacity-50"
                          title="إعادة للإنتاج"
                        >
                          <RefreshCcw size={10} /> إصلاح
                        </button>
                        <button
                          onClick={() => handleFinalizeOrder(order.order_id, 'rejected')}
                          disabled={finishingId === order.order_id}
                          className="flex items-center gap-1 bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-red-700 disabled:opacity-50"
                          title="إغلاق كهالك"
                        >
                          <Trash2 size={10} /> هالك
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded animate-pulse">
                        بانتظار العمل/QC
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ManufacturingDashboard;