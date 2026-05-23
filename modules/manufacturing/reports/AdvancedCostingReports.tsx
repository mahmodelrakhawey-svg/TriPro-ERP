import { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { Loader2, PieChart, BarChart2, ClipboardList, Info, Gavel, CheckCircle } from 'lucide-react';

const AdvancedCostingReports = ({ orderId }: { orderId: string }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [qtyReport, setQtyReport] = useState<any>(null);
  const [eqReport, setEqReport] = useState<any>(null);
  const [costRecon, setCostRecon] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [qtyRes, eqRes, reconRes] = await Promise.all([
        supabase.from('v_mfg_production_quantity_report').select('*').eq('organization_id', (await supabase.auth.getSession()).data.session?.user.user_metadata.org_id).limit(1).maybeSingle(),
        supabase.from('v_mfg_equivalent_units').select('*').eq('order_id', orderId).maybeSingle(),
        supabase.from('v_mfg_cost_reconciliation_report').select('*').eq('order_id', orderId).maybeSingle()
      ]);
      
      setQtyReport(qtyRes.data);
      setEqReport(eqRes.data);
      setCostRecon(reconRes.data);
      setLoading(false);
    };
    fetchData();
  }, [orderId]);

  const handlePostSettlement = async () => {
    if (!window.confirm('هل تريد ترحيل قيد تسوية انحراف التكاليف للأستاذ العام؟')) return;
    try {
      const { data, error } = await supabase.rpc('mfg_post_wip_gl_settlement', { p_order_id: orderId });
      if (error) throw error;
      showToast('تم ترحيل قيد التسوية بنجاح ✅', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-purple-600" size={40} /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* 📊 1. تقرير كمية الإنتاج (Flow of Units) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center gap-2">
          <ClipboardList className="text-blue-600" size={20} />
          <h3 className="font-bold text-slate-800">تقرير كمية الإنتاج (Physical Flow)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 divide-x divide-x-reverse text-center">
          <div className="p-4">
            <p className="text-xs text-slate-500 font-bold mb-1">وحدات بدأ عليها التشغيل</p>
            <p className="text-2xl font-black text-slate-800">{qtyReport?.units_started || 0}</p>
          </div>
          <div className="p-4 bg-emerald-50/30">
            <p className="text-xs text-emerald-600 font-bold mb-1">وحدات تامة ومحولة</p>
            <p className="text-2xl font-black text-emerald-700">{qtyReport?.units_completed || 0}</p>
          </div>
          <div className="p-4 bg-amber-50/30">
            <p className="text-xs text-amber-600 font-bold mb-1">وحدات تحت التشغيل (WIP)</p>
            <p className="text-2xl font-black text-amber-700">{qtyReport?.units_in_wip || 0}</p>
          </div>
          <div className="p-4 bg-red-50/30">
            <p className="text-xs text-red-600 font-bold mb-1">تالف (مسموح / غير مسموح)</p>
            <p className="text-2xl font-black text-red-700">
              {qtyReport?.normal_scrap || 0} / {qtyReport?.abnormal_scrap || 0}
            </p>
          </div>
        </div>
      </div>

      {/* 📊 2. تقرير الإنتاج المعادل (Equivalent Units) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center gap-2">
          <BarChart2 className="text-purple-600" size={20} />
          <h3 className="font-bold text-slate-800">تقرير الإنتاج المعادل (Equivalent Units)</h3>
        </div>
        <div className="p-6">
            <div className="flex gap-12 items-center justify-around">
                <div className="text-center">
                    <div className="relative inline-flex items-center justify-center">
                        <svg className="w-24 h-24 text-slate-100 fill-current"><circle cx="48" cy="48" r="40"/></svg>
                        <span className="absolute text-xl font-black text-purple-700">{eqReport?.total_material_eq_units || 0}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-600">وحدات معادلة - مواد</p>
                </div>
                <div className="text-center">
                    <div className="relative inline-flex items-center justify-center">
                        <svg className="w-24 h-24 text-slate-100 fill-current"><circle cx="48" cy="48" r="40"/></svg>
                        <span className="absolute text-xl font-black text-indigo-700">{eqReport?.total_conversion_eq_units || 0}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-600">وحدات معادلة - تشكيل</p>
                </div>
            </div>
        </div>
      </div>

      {/* 📊 3. تقرير المحاسبة على التكاليف (Cost Reconciliation) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-800 p-4 border-b border-slate-700 flex items-center gap-2">
          <PieChart className="text-yellow-400" size={20} />
          <h3 className="font-bold text-white">تقرير المحاسبة على تكاليف الإنتاج (Step 5)</h3>
          <button onClick={handlePostSettlement} className="mr-auto bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1 transition-colors">
            <Gavel size={14} /> ترحيل تسوية الأستاذ العام
          </button>
        </div>
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-100 text-slate-600 font-bold">
                <tr>
                    <th className="p-4">بيان توزيع التكلفة</th>
                    <th className="p-4 text-center">المبلغ الإجمالي</th>
                    <th className="p-4 text-center">النسبة</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                <tr>
                    <td className="p-4 font-bold text-slate-700">تكلفة الإنتاج التام والمحول للمخازن</td>
                    <td className="p-4 text-center font-mono font-bold text-emerald-600">
                        {costRecon?.cost_assigned_to_finished_goods?.toLocaleString()}
                    </td>
                    <td className="p-4 text-center text-xs text-slate-400">
                        {((costRecon?.cost_assigned_to_finished_goods / costRecon?.total_to_account_for) * 100 || 0).toFixed(1)}%
                    </td>
                </tr>
                <tr>
                    <td className="p-4 font-bold text-slate-700">تكلفة الإنتاج تحت التشغيل آخر الفترة (WIP)</td>
                    <td className="p-4 text-center font-mono font-bold text-amber-600">
                        {costRecon?.cost_assigned_to_wip?.toLocaleString()}
                    </td>
                    <td className="p-4 text-center text-xs text-slate-400">
                        {((costRecon?.cost_assigned_to_wip / costRecon?.total_to_account_for) * 100 || 0).toFixed(1)}%
                    </td>
                </tr>
                <tr>
                    <td className="p-4 font-bold text-slate-700">خسائر التالف غير المسموح به (تحميل على الفترة)</td>
                    <td className="p-4 text-center font-mono font-bold text-red-600">
                        {costRecon?.cost_assigned_to_abnormal_scrap?.toLocaleString()}
                    </td>
                    <td className="p-4 text-center text-xs text-slate-400">
                        {((costRecon?.cost_assigned_to_abnormal_scrap / costRecon?.total_to_account_for) * 100 || 0).toFixed(1)}%
                    </td>
                </tr>
            </tbody>
            <tfoot className="bg-slate-900 text-white font-black">
                <tr>
                    <td className="p-4">إجمالي التكاليف المحاسب عليها</td>
                    <td className="p-4 text-center font-mono text-lg text-yellow-400">
                        {costRecon?.total_to_account_for?.toLocaleString()}
                    </td>
                    <td className="p-4 text-center">100%</td>
                </tr>
            </tfoot>
        </table>
      </div>

      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
          <Info className="text-blue-600 mt-1" size={18} />
          <div className="text-xs text-blue-800 leading-relaxed">
              <p className="font-bold mb-1">شرح لمدير التكاليف:</p>
              <p>• تم تحميل تكلفة **التالف المسموح** آلياً على الوحدات السليمة عبر زيادة نصيب الوحدة المعادلة من التكلفة.</p>
              <p>• قيمة **الخردة المستردة** ({costRecon?.total_salvage_recovery || 0}) تم خصمها من إجمالي التكاليف قبل التوزيع.</p>
          </div>
      </div>
    </div>
  );
};

export default AdvancedCostingReports;