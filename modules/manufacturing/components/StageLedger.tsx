import { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { Loader2, Table, Printer, DollarSign, Package, Users, Activity } from 'lucide-react';

interface StageCost {
  stage_name: string;
  material_cost: number;
  labor_cost: number;
  overhead_cost: number;
  total_stage_cost: number;
}

const StageLedger = ({ orderId, orderNumber }: { orderId: string, orderNumber: string }) => {
  const [data, setData] = useState<StageCost[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchLedger = async () => {
      try {
        const { data, error } = await supabase.rpc('mfg_get_stage_cost_ledger', { p_order_id: orderId });
        if (error) throw error;
        setData(data || []);
      } catch (error: any) {
        showToast('خطأ في جلب كشف حساب المرحلة: ' + error.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchLedger();
  }, [orderId]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-600" /></div>;

  const grandTotal = data.reduce((acc, curr) => acc + curr.total_stage_cost, 0);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center no-print">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Table className="text-blue-600" size={20} />
          كشف حساب مراحل الإنتاج - {orderNumber}
        </h3>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 text-sm font-bold">
          <Printer size={16} /> طباعة التقرير
        </button>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="p-3 border">المرحلة الإنتاجية</th>
              <th className="p-3 border text-center"><Package size={14} className="inline ml-1" /> تكلفة المواد</th>
              <th className="p-3 border text-center"><Users size={14} className="inline ml-1" /> الأجور المباشرة</th>
              <th className="p-3 border text-center"><Activity size={14} className="inline ml-1" /> مصاريف صناعية محملة</th>
              <th className="p-3 border text-center font-bold bg-blue-50 text-blue-800">إجمالي المرحلة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 border font-bold text-slate-800">{row.stage_name}</td>
                <td className="p-3 border text-center font-mono">{row.material_cost.toLocaleString()}</td>
                <td className="p-3 border text-center font-mono">{row.labor_cost.toLocaleString()}</td>
                <td className="p-3 border text-center font-mono">{row.overhead_cost.toLocaleString()}</td>
                <td className="p-3 border text-center font-mono font-bold bg-blue-50/30 text-blue-900">{row.total_stage_cost.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-800 text-white font-bold">
              <td className="p-4 border">إجمالي تكلفة الأمر (WIP)</td>
              <td className="p-4 border text-center font-mono">{data.reduce((a, b) => a + b.material_cost, 0).toLocaleString()}</td>
              <td className="p-4 border text-center font-mono">{data.reduce((a, b) => a + b.labor_cost, 0).toLocaleString()}</td>
              <td className="p-4 border text-center font-mono">{data.reduce((a, b) => a + b.overhead_cost, 0).toLocaleString()}</td>
              <td className="p-4 border text-center font-mono text-xl text-yellow-400 bg-slate-900">
                {grandTotal.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="p-4 bg-yellow-50 text-xs text-slate-600 border-t border-yellow-100 italic no-print">
        * ملاحظة: المصاريف الصناعية المحملة تُحسب آلياً بناءً على الزمن المعياري للمرحلة ومعدل التحميل لمركز العمل.
      </div>
    </div>
  );
};

export default StageLedger;