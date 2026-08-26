import React, { useMemo } from 'react';
import { ButcheringOrder } from '../../../../services/butcheringYieldService';
import {
  TrendingUp,
  Scale,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ChefHat,
  BarChart3,
  PieChart,
  Layers,
  ArrowUpRight
} from 'lucide-react';

interface YieldAnalyticsReportProps {
  orders: ButcheringOrder[];
}

export const YieldAnalyticsReport: React.FC<YieldAnalyticsReportProps> = ({ orders }) => {
  // تجميع الإحصائيات الإجمالية
  const stats = useMemo(() => {
    let totalInputKg = 0;
    let totalOutputKg = 0;
    let totalNetCost = 0;
    let totalShrinkageKg = 0;

    const cutsMap: { [name: string]: { weight: number; cost: number; count: number } } = {};
    const butcherMap: { [name: string]: { ordersCount: number; inputKg: number; outputKg: number } } = {};

    orders.forEach(o => {
      totalInputKg += Number(o.input_weight || 0);
      totalOutputKg += Number(o.total_output_weight || 0);
      totalNetCost += Number(o.total_net_cost || 0);
      totalShrinkageKg += Number(o.shrinkage_weight || 0);

      const bName = o.butcher_name || 'غير محدد';
      if (!butcherMap[bName]) {
        butcherMap[bName] = { ordersCount: 0, inputKg: 0, outputKg: 0 };
      }
      butcherMap[bName].ordersCount += 1;
      butcherMap[bName].inputKg += Number(o.input_weight || 0);
      butcherMap[bName].outputKg += Number(o.total_output_weight || 0);

      (o.items || []).forEach(it => {
        if (!cutsMap[it.output_name]) {
          cutsMap[it.output_name] = { weight: 0, cost: 0, count: 0 };
        }
        cutsMap[it.output_name].weight += Number(it.actual_weight || 0);
        cutsMap[it.output_name].cost += Number(it.total_allocated_cost || 0);
        cutsMap[it.output_name].count += 1;
      });
    });

    const avgYieldPct = totalInputKg > 0 ? (totalOutputKg / totalInputKg) * 100 : 0;
    const avgShrinkagePct = totalInputKg > 0 ? (totalShrinkageKg / totalInputKg) * 100 : 0;
    const avgCostPerProcessedKg = totalOutputKg > 0 ? totalNetCost / totalOutputKg : 0;

    const topCuts = Object.entries(cutsMap)
      .map(([name, data]) => ({
        name,
        totalWeight: data.weight,
        totalCost: data.cost,
        avgCostPerKg: data.weight > 0 ? data.cost / data.weight : 0,
        pctOfTotal: totalOutputKg > 0 ? (data.weight / totalOutputKg) * 100 : 0
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight);

    const butcherRankings = Object.entries(butcherMap)
      .map(([name, data]) => ({
        name,
        ordersCount: data.ordersCount,
        inputKg: data.inputKg,
        outputKg: data.outputKg,
        yieldPct: data.inputKg > 0 ? (data.outputKg / data.inputKg) * 100 : 0,
        shrinkagePct: data.inputKg > 0 ? ((data.inputKg - data.outputKg) / data.inputKg) * 100 : 0
      }))
      .sort((a, b) => b.yieldPct - a.yieldPct);

    return {
      totalOrders: orders.length,
      totalInputKg,
      totalOutputKg,
      totalNetCost,
      totalShrinkageKg,
      avgYieldPct,
      avgShrinkagePct,
      avgCostPerProcessedKg,
      topCuts,
      butcherRankings
    };
  }, [orders]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold block">إجمالي الذبائح المشفاة</span>
            <span className="text-2xl font-black text-slate-900">
              {stats.totalInputKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}{' '}
              <span className="text-xs font-normal text-slate-400">كجم</span>
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold block mt-0.5">
              صافي المخرجات: {stats.totalOutputKg.toFixed(1)} كجم
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold block">متوسط كفاءة الاستخراج</span>
            <span className="text-2xl font-black text-emerald-700">
              {stats.avgYieldPct.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              المعدل القياسي: 95.0%
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold block">متوسط الفاقد والهالك</span>
            <span className="text-2xl font-black text-amber-700">
              {stats.avgShrinkagePct.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              إجمالي الهالك: {stats.totalShrinkageKg.toFixed(1)} كجم
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold block">متوسط تكلفة الكيلو المجهز</span>
            <span className="text-2xl font-black text-indigo-900">
              {stats.avgCostPerProcessedKg.toFixed(1)}{' '}
              <span className="text-xs font-normal text-slate-400">ج/كجم</span>
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              إجمالي القيمة: {stats.totalNetCost.toLocaleString()} ج
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Top Cuts & Butcher Efficiency */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Cuts Extracted */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-rose-600" />
              <h4 className="font-bold text-slate-800 text-sm">
                تحليل القطعيات المستخرجة والنسب المئوية
              </h4>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {stats.topCuts.length} أصناف ناتجة
            </span>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stats.topCuts.map((cut, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    {cut.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600 font-bold">{cut.totalWeight.toFixed(1)} كجم</span>
                    <span className="text-indigo-600 font-bold">{cut.avgCostPerKg.toFixed(1)} ج/كجم</span>
                    <span className="text-slate-400 font-mono w-10 text-left">
                      {cut.pctOfTotal.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, cut.pctOfTotal * 2.5)}%` }}
                  />
                </div>
              </div>
            ))}

            {stats.topCuts.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">
                لا توجد بيانات قطعيات بعد
              </div>
            )}
          </div>
        </div>

        {/* Butcher / Kitchen Staff Efficiency */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <div className="flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-indigo-600" />
              <h4 className="font-bold text-slate-800 text-sm">
                مؤشرات أداء الجزارين والشيفات (Butcher KPIs)
              </h4>
            </div>
            <span className="text-xs text-slate-400 font-medium">حسب نسبة الاستخراج</span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">الشيف / الجزار</th>
                  <th className="p-3 text-center">أوامر التشفية</th>
                  <th className="p-3 text-center">الوزن المشغّل</th>
                  <th className="p-3 text-center">نسبة الاستخراج</th>
                  <th className="p-3 text-center">معدل الفاقد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.butcherRankings.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-800 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                        {idx + 1}
                      </div>
                      {b.name}
                    </td>
                    <td className="p-3 text-center text-slate-600 font-bold">{b.ordersCount}</td>
                    <td className="p-3 text-center text-slate-800 font-bold">
                      {b.inputKg.toFixed(1)} كجم
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          b.yieldPct >= 95
                            ? 'bg-emerald-100 text-emerald-800'
                            : b.yieldPct >= 92
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {b.yieldPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-center text-slate-500 font-bold">
                      {b.shrinkagePct.toFixed(1)}%
                    </td>
                  </tr>
                ))}

                {stats.butcherRankings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      لا توجد بيانات أداء حتى الآن
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
