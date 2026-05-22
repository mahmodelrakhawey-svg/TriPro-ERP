import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { Loader2, TrendingDown, TrendingUp, Minus, Calculator, Info } from 'lucide-react';

interface StageVariance {
  stage_name: string;
  actual_material: number;
  standard_material: number;
  material_variance: number;
  actual_labor: number;
  standard_labor: number;
  labor_variance: number;
  actual_overhead: number;
  standard_overhead: number;
  overhead_variance: number;
  total_actual: number;
  total_standard: number;
  total_variance: number;
}

const StageVarianceReport = ({ orderId }: { orderId: string }) => {
  const [data, setData] = useState<StageVariance[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchVariance = async () => {
      try {
        const { data, error } = await supabase.rpc('mfg_get_stage_variance_report', { p_order_id: orderId });
        if (error) throw error;
        setData(data || []);
      } catch (error: any) {
        showToast('خطأ في حساب الانحرافات: ' + error.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchVariance();
  }, [orderId]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-purple-600" /></div>;

  const renderVariance = (val: number) => {
    if (val === 0) return <span className="text-slate-400 flex items-center gap-1 justify-center"><Minus size={12}/> 0</span>;
    const isFavorable = val < 0;
    return (
      <span className={`flex items-center gap-1 justify-center font-bold ${isFavorable ? 'text-emerald-600' : 'text-red-600'}`}>
        {isFavorable ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
        {Math.abs(val).toLocaleString()}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center gap-2">
        <Calculator className="text-purple-600" size={20} />
        <h3 className="text-lg font-bold text-slate-800">تحليل انحرافات التكاليف الفعلية vs المعيارية</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className="p-3 border-b border-l row-span-2">المرحلة</th>
              <th colSpan={3} className="p-2 border-b border-l text-center bg-blue-50/50">تكلفة المواد</th>
              <th colSpan={3} className="p-2 border-b border-l text-center bg-amber-50/50">الأجور المباشرة</th>
              <th colSpan={3} className="p-2 border-b text-center bg-purple-50/50">الإجمالي الكلي</th>
            </tr>
            <tr className="bg-slate-50 text-[10px] text-slate-500">
              <th className="p-2 border-b border-l text-center">معياري</th>
              <th className="p-2 border-b border-l text-center">فعلي</th>
              <th className="p-2 border-b border-l text-center">الانحراف</th>
              <th className="p-2 border-b border-l text-center">معياري</th>
              <th className="p-2 border-b border-l text-center">فعلي</th>
              <th className="p-2 border-b border-l text-center">الانحراف</th>
              <th className="p-2 border-b border-l text-center font-bold">معياري</th>
              <th className="p-2 border-b border-l text-center font-bold">فعلي</th>
              <th className="p-2 border-b text-center font-bold">الفرق</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 border-b last:border-0 transition-colors">
                <td className="p-3 border-l font-bold text-slate-700">{row.stage_name}</td>
                <td className="p-2 border-l text-center font-mono">{row.standard_material.toLocaleString()}</td>
                <td className="p-2 border-l text-center font-mono">{row.actual_material.toLocaleString()}</td>
                <td className="p-2 border-l text-center">{renderVariance(row.material_variance)}</td>
                <td className="p-2 border-l text-center font-mono">{row.standard_labor.toLocaleString()}</td>
                <td className="p-2 border-l text-center font-mono">{row.actual_labor.toLocaleString()}</td>
                <td className="p-2 border-l text-center">{renderVariance(row.labor_variance)}</td>
                <td className="p-2 border-l text-center font-mono font-bold">{row.total_standard.toLocaleString()}</td>
                <td className="p-2 border-l text-center font-mono font-bold">{row.total_actual.toLocaleString()}</td>
                <td className="p-2 text-center">{renderVariance(row.total_variance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-blue-50 border-t border-blue-100 flex items-start gap-3">
        <Info className="text-blue-600 mt-1" size={16} />
        <div className="text-xs text-blue-800 leading-relaxed">
          <p className="font-bold mb-1">كيفية قراءة التقرير:</p>
          <p>• القيمة باللون <span className="text-emerald-600 font-bold">الأخضر</span> تعني انحرافاً ملائماً (صرفنا أقل من المعيار).</p>
          <p>• القيمة باللون <span className="text-red-600 font-bold">الأحمر</span> تعني انحرافاً غير ملائم (تجاوزنا التكلفة المخططة).</p>
        </div>
      </div>
    </div>
  );
};

export default StageVarianceReport;