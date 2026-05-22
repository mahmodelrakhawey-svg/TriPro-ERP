import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  Search, TrendingUp, TrendingDown, Layers, DollarSign, 
  Package, Users, Factory, ArrowLeft, Filter
} from 'lucide-react';

interface UnitCostAnatomy {
  order_id: string;
  order_number: string;
  product_name: string;
  material_unit_cost: number;
  labor_unit_cost: number;
  overhead_unit_cost: number;
  total_actual_unit_cost: number;
  standard_unit_cost: number;
}

export const UnitCostDrillDown: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UnitCostAnatomy[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<UnitCostAnatomy | null>(null);

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b']; // Indigo, Emerald, Amber

  useEffect(() => {
    fetchUnitCosts();
  }, []);

  const fetchUnitCosts = async () => {
    setLoading(true);
    try {
      const { data: anatomyData, error } = await supabase
        .from('v_mfg_unit_cost_anatomy')
        .select('*');

      if (error) throw error;
      setData(anatomyData || []);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredData = data.filter(item => 
    item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.order_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // تحضير بيانات الرسم البياني الدائري للمنتج المختار
  const getPieData = (order: UnitCostAnatomy) => [
    { name: 'خامات مباشرة', value: order.material_unit_cost },
    { name: 'أجور فعلية', value: order.labor_unit_cost },
    { name: 'أعباء محملة', value: order.overhead_unit_cost },
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Layers className="w-8 h-8 text-indigo-600" />
            تشريح تكلفة الوحدة (Unit Cost Anatomy)
          </h1>
          <p className="text-gray-500 mt-1">تحليل معمق لعناصر التكلفة الفعلية ومقارنتها بالمعياري</p>
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Search className="w-5 h-5 absolute right-3 top-3 text-gray-400" />
            <input 
              type="text"
              placeholder="ابحث برقم الأمر أو المنتج..."
              className="pr-10 pl-4 py-2.5 bg-white border rounded-xl w-64 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* القائمة اليسرى: قائمة الأوامر */}
        <div className="lg:col-span-1 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
          {loading ? (
            <div className="bg-white p-8 rounded-2xl border text-center text-gray-400 italic">جاري جلب البيانات...</div>
          ) : filteredData.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border text-center text-gray-400 italic">لا توجد سجلات مطابقة</div>
          ) : (
            filteredData.map(item => (
              <div 
                key={item.order_id}
                onClick={() => setSelectedOrder(item)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-md ${selectedOrder?.order_id === item.order_id ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-white'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                    #{item.order_number}
                  </span>
                  <div className={`flex items-center gap-1 text-xs font-bold ${item.total_actual_unit_cost <= item.standard_unit_cost ? 'text-green-600' : 'text-red-600'}`}>
                    {item.total_actual_unit_cost <= item.standard_unit_cost ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                    {Math.abs(((item.total_actual_unit_cost - item.standard_unit_cost) / item.standard_unit_cost) * 100).toFixed(1)}%
                  </div>
                </div>
                <h4 className="font-bold text-gray-900 truncate">{item.product_name}</h4>
                <div className="mt-3 flex justify-between items-end text-sm">
                  <div className="text-gray-500 text-xs uppercase font-bold tracking-widest">التكلفة الفعلية</div>
                  <div className="font-black text-indigo-600 text-lg">{item.total_actual_unit_cost.toLocaleString()} <span className="text-[10px]">ج.م</span></div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* الجزء الأيمن: لوحة التشريح (Drill-Down Panel) */}
        <div className="lg:col-span-2">
          {!selectedOrder ? (
            <div className="bg-white rounded-3xl border-2 border-dashed h-full flex flex-col items-center justify-center text-gray-400 p-12 text-center">
              <ArrowLeft className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-medium text-lg">يرجى اختيار أمر إنتاج من القائمة الجانبية<br/>لعرض تشريح التكلفة التفصيلي</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border shadow-sm overflow-hidden animate-in fade-in slide-in-from-left-4">
              <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                <div>
                  <h3 className="font-black text-xl text-gray-900">{selectedOrder.product_name}</h3>
                  <p className="text-sm text-gray-500">تفاصيل تكلفة القطعة الواحدة للطلب {selectedOrder.order_number}</p>
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">الحالة المالية</p>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full ${selectedOrder.total_actual_unit_cost <= selectedOrder.standard_unit_cost ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {selectedOrder.total_actual_unit_cost <= selectedOrder.standard_unit_cost ? 'وفر في التكلفة' : 'تجاوز معياري'}
                  </span>
                </div>
              </div>

              <div className="p-8">
                {/* كروت المقارنة السريعة */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-indigo-200">
                    <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider mb-1">التكلفة الفعلية النهائية</p>
                    <h2 className="text-3xl font-black">{selectedOrder.total_actual_unit_cost.toLocaleString()} <small className="text-sm font-normal opacity-70">ج.م</small></h2>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border shadow-sm">
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">التكلفة المعيارية (المستهدفة)</p>
                    <h2 className="text-3xl font-black text-gray-800">{selectedOrder.standard_unit_cost.toLocaleString()} <small className="text-sm font-normal opacity-40">ج.م</small></h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* الرسم الدائري لتوزيع العناصر */}
                  <div>
                    <h5 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                      <Filter className="w-4 h-4 text-indigo-500" />
                      تكوين التكلفة (Cost Mix)
                    </h5>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={getPieData(selectedOrder)}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {getPieData(selectedOrder).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                          <Legend verticalAlign="bottom" />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* تفصيل بالأرقام (The Anatomy Table) */}
                  <div className="space-y-4">
                    <h5 className="font-bold text-gray-700 mb-4">التشريح الرقمي (Numeric Breakdown)</h5>
                    <BreakdownRow icon={<Package className="text-indigo-500" />} label="خامات مباشرة" value={selectedOrder.material_unit_cost} color="indigo" />
                    <BreakdownRow icon={<Users className="text-emerald-500" />} label="أجور فعلية (HR)" value={selectedOrder.labor_unit_cost} color="emerald" />
                    <BreakdownRow icon={<Factory className="text-amber-500" />} label="أعباء صناعية" value={selectedOrder.overhead_unit_cost} color="amber" />
                    <div className="pt-4 mt-4 border-t border-dashed">
                      <div className="flex justify-between items-center px-2">
                        <span className="font-black text-gray-900">إجمالي تكلفة القطعة</span>
                        <span className="font-black text-gray-900 text-xl">{selectedOrder.total_actual_unit_cost.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* تحليل الانحراف الصافي */}
                <div className="mt-8 p-5 rounded-2xl bg-gray-50 border border-gray-100">
                  <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">تحليل تباين الربحية (Profitability Gap)</h5>
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-12 rounded-full ${selectedOrder.total_actual_unit_cost <= selectedOrder.standard_unit_cost ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">
                        {selectedOrder.total_actual_unit_cost <= selectedOrder.standard_unit_cost 
                          ? `تم تحقيق وفر قدره ${(selectedOrder.standard_unit_cost - selectedOrder.total_actual_unit_cost).toLocaleString()} ج.م عن التكلفة المستهدفة.`
                          : `يوجد انحراف سلبي قدره ${(selectedOrder.total_actual_unit_cost - selectedOrder.standard_unit_cost).toLocaleString()} ج.م للوحدة.`
                        }
                      </p>
                      <p className="text-xs text-gray-500 mt-1">يعتمد هذا التحليل على الربط المباشر بين ساعات العمل الفعلية من مديول HR واستهلاك الخامات الميداني.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BreakdownRow = ({ icon, label, value, color }: any) => (
  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:border-gray-200 transition-colors">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-${color}-50`}>{icon}</div>
      <span className="text-sm font-medium text-gray-600">{label}</span>
    </div>
    <span className="font-bold text-gray-900">{value.toLocaleString()} <small className="text-[10px] text-gray-400">ج.م</small></span>
  </div>
);

export default UnitCostDrillDown;