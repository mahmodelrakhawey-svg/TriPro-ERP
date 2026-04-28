import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting as useOrg } from '@/context/AccountingContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  Factory, Activity, AlertOctagon, ClipboardCheck, 
  TrendingUp, Package, Users, Clock 
} from 'lucide-react';

const ManufacturingDashboard = () => {
  const { organization } = useOrg();
  const orgId = organization?.id;
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
      setLoading(false);
    };

    fetchDashboardData();
  }, [orgId]);

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
    </div>
  );
};

export default ManufacturingDashboard;