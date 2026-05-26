import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { 
  BarChart3, TrendingUp, AlertTriangle, CheckCircle, 
  Clock, DollarSign, Target, ArrowRight, Loader2, Info,
  ChevronLeft, LayoutDashboard, HeartPulse, PackageSearch, ChevronDown, ChevronUp,
  Building2, Printer, FileDown // ✅ إضافة الاستيراد المفقود لإصلاح خطأ TS2304
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, Cell, ComposedChart, Line, AreaChart, Area
} from 'recharts';
import ProjectExecutiveReport from '../reports/ProjectExecutiveReport';
import ProjectHealthGauges from './ProjectHealthGauges'; // Import the new gauges
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/** 🏗️ تعريف أنواع البيانات لضمان دقة البرمجة (Type Safety) **/
interface ProjectMetrics {
  bac: number;
  actual_cost: number;
  earned_value: number;
  planned_value: number;
}

interface ProjectForecast {
  forecast_final_cost_eac: number;
  expected_variance_vac: number;
  forecast_status: string;
}

interface ProjectPerformance {
  project_id: string;
  project_name: string;
  status: string;
  health: number;
  spi: number;
  cpi: number;
  schedule_status: string;
  cost_status: string;
  metrics: ProjectMetrics;
  forecast: ProjectForecast;
  sCurve: any[];
  cashFlow: {
    remaining_budget: number;
    estimated_monthly_need: number;
    projection_3_months: number;
    confidence_score: string;
  };
}

const ConstructionDashboard = () => {
  const [projects, setProjects] = useState<ProjectPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [materialVariances, setMaterialVariances] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const { settings } = useAccounting();
  const { showToast } = useToast();

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // جلب المشاريع مع مؤشرات الأداء من الرؤية التي أنشأناها
      const { data, error } = await supabase
        .from('v_project_performance_dashboard')
        .select('*');

      if (error) throw error;

      // جلب التوقعات المالية لكل مشروع
      const projectsWithForecasts = await Promise.all((data || []).map(async (p: any) => {
        // 🛡️ صمام أمان: التأكد من أن project_id صالح قبل استدعاء RPC
        if (!p.project_id || typeof p.project_id !== 'string' || p.project_id.length !== 36) {
          console.warn(`Skipping RPC calls for invalid project_id: ${p.project_id} for project ${p.project_name}`);
          return { ...p, forecast: null, health: 0, sCurve: [], cashFlow: null } as ProjectPerformance;
        }

        const { data: forecast, error: forecastError } = await supabase.rpc('mfg_predict_project_completion_cost', { p_project_id: p.project_id });
        if (forecastError) console.error(`Error fetching forecast for ${p.project_name}:`, forecastError);

        const { data: health, error: healthError } = await supabase.rpc('get_project_health_score', { p_project_id: p.project_id });
        if (healthError) console.error(`Error fetching health for ${p.project_name}:`, healthError);

        const { data: sCurve, error: sCurveError } = await supabase.rpc('get_project_s_curve_data', { p_project_id: p.project_id });
        if (sCurveError) console.error(`Error fetching S-Curve for ${p.project_name}:`, sCurveError);

        const { data: cashFlow, error: cashFlowError } = await supabase.rpc('get_project_cash_flow_projection', { p_project_id: p.project_id });
        if (cashFlowError) console.error(`Error fetching cash flow for ${p.project_name}:`, cashFlowError);

        return {
          ...p,
          forecast: forecast || null,
          health: health || 0,
          sCurve: sCurve || [],
          cashFlow: cashFlow || null
        } as ProjectPerformance;
      }));

      setProjects(projectsWithForecasts);

      // جلب انحرافات المواد لكافة المشاريع
      const { data: varianceData } = await supabase.from('v_project_quantity_variance').select('*');
      setMaterialVariances(varianceData || []);

    } catch (err: any) {
      showToast('فشل تحميل تحليلات المقاولات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  // التأكد من فتح المشروع المطلوب عند الانتقال من قائمة المشاريع
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const targetId = searchParams.get('projectId');
    if (targetId && projects.length > 0) setExpandedProject(targetId);
  }, [projects]);

  const exportProjectPDF = async (project: ProjectPerformance) => {
    setIsExporting(true);
    try {
      // ملاحظة: سنقوم برندر التقرير في الخلفية مؤقتاً للتصدير
      const reportElement = document.getElementById('report-container');
      if (!reportElement) throw new Error("فشل العثور على محرك التقرير");
      
      const canvas = await html2canvas(reportElement, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const width = pdf.internal.pageSize.getWidth();
      const height = (canvas.height * width) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, width, height);
      pdf.save(`Executive_Report_${project.project_name}_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('تم توليد التقرير الفاخر بنجاح ✅', 'success');
    } catch (err: any) {
      showToast('خطأ في تصدير PDF: ' + err.message, 'error');
    } finally { setIsExporting(false); }
  };

  if (loading) return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="space-y-8 animate-in fade-in pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <LayoutDashboard className="text-blue-600" /> تحليلات أداء المشاريع (EVM)
          </h1>
          <p className="text-slate-500">مراقبة القيمة المكتسبة والتوقعات المالية للمشاريع الإنشائية</p>
        </div>
        <button onClick={fetchDashboardData} className="bg-white border p-2 rounded-lg hover:bg-slate-50"><Clock size={20} className="text-slate-400" /></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {projects.map((proj) => (
          <div key={proj.project_id} className={`bg-white rounded-3xl shadow-sm border transition-all overflow-hidden ${expandedProject === proj.project_id ? 'ring-2 ring-blue-500 shadow-xl lg:col-span-2' : 'border-slate-200 hover:shadow-lg'}`}>
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white ${proj.health > 80 ? 'bg-emerald-500' : proj.health > 60 ? 'bg-amber-500' : 'bg-red-500'}`}>
                    {proj.health}%
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-xl font-black text-slate-800">{proj.project_name}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 w-fit ${proj.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>
                      {proj.status === 'active' ? 'مشروع نشط' : proj.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                    <button 
                      onClick={() => exportProjectPDF(proj)}
                      disabled={isExporting}
                      className="p-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2 text-[10px] font-bold"
                      title="تصدير تقرير فاخر للعميل"
                    >
                      {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                      تصدير التقرير
                    </button>
                    {/* Replacing badges with Gauges for a professional look */}
                    <div className="hidden md:block">
                       <ProjectHealthGauges cpi={proj.cpi} spi={proj.spi} />
                    </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Show gauges on mobile inside the content area */}
              <div className="md:hidden mb-6">
                <ProjectHealthGauges cpi={proj.cpi} spi={proj.spi} />
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                <MetricItem label="الميزانية (BAC)" value={proj.metrics.bac} color="text-slate-600" />
                <MetricItem label="المنجز (EV)" value={proj.metrics.earned_value} color="text-blue-600" />
                <MetricItem label="الفعلي (AC)" value={proj.metrics.actual_cost} color="text-amber-600" />
              </div>

              {/* محاكي السيولة النقدية */}
              {proj.cashFlow && (
                <div className="mb-6 grid grid-cols-2 gap-4">
                  <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-[10px] font-black text-blue-600 mb-1">الاحتياج الشهري المتوقع</p>
                    <p className="text-sm font-black text-slate-800">{proj.cashFlow.estimated_monthly_need.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <p className="text-[10px] font-black text-indigo-600 mb-1">احتياج 90 يوم (تنبؤ)</p>
                    <p className="text-sm font-black text-slate-800">{proj.cashFlow.projection_3_months.toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* التنبؤ المالي */}
              {proj.forecast && (
                <div className={`p-4 rounded-2xl border mb-6 ${proj.forecast.expected_variance_vac < 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Target size={16} className={proj.forecast.expected_variance_vac < 0 ? 'text-red-500' : 'text-emerald-500'} />
                      <span className="text-xs font-black text-slate-700">التنبؤ بالتكلفة النهائية (EAC)</span>
                    </div>
                    <span className="font-mono font-bold text-slate-800">{proj.forecast.forecast_final_cost_eac.toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 mt-1">
                    {proj.forecast.forecast_status}
                  </p>
                </div>
              )}
              {/* منحنى S-Curve للمشروع المختار */}
              {expandedProject === proj.project_id && proj.sCurve && (
                <div className="mt-8 border-t pt-8 animate-in zoom-in-95">
                  <h4 className="text-sm font-black text-slate-700 mb-6 flex items-center gap-2">
                    <TrendingUp size={18} className="text-blue-600" /> تحليل الاتجاه التراكمي (S-Curve)
                  </h4>
                  <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={proj.sCurve}>
                        <defs>
                          <linearGradient id="colorEV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                          <linearGradient id="colorAC" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                        </defs>
                        <XAxis dataKey="month" tick={{fontSize: 10}} />
                        <YAxis tick={{fontSize: 10}} />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="cumulative_earned" name="المنجز التراكمي" stroke="#3b82f6" fillOpacity={1} fill="url(#colorEV)" strokeWidth={3} />
                        <Area type="monotone" dataKey="cumulative_actual" name="الفعلي التراكمي" stroke="#f59e0b" fillOpacity={1} fill="url(#colorAC)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* جدول انحراف المواد التفصيلي */}
                  <div className="mt-8">
                    <h4 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2">
                      <PackageSearch size={18} className="text-orange-600" /> 
                      مقارنة المخطط بالمنفذ (Material Audit)
                      {materialVariances.some(v => v.project_name === proj.project_name && v.consumption_pct > 100) && (
                        <span className="bg-red-100 text-red-600 text-[9px] px-2 py-0.5 rounded-full animate-pulse">
                          تنبيه: تجاوز ميزانية خامات!
                        </span>
                      )}
                    </h4>
                    <div className="bg-slate-50 rounded-2xl overflow-hidden border">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-100 font-bold">
                          <tr><th className="p-3">المادة</th><th className="p-3">المخطط</th><th className="p-3">المنصرف</th><th className="p-3">الانحراف</th><th className="p-3">النسبة</th></tr>
                        </thead>
                        <tbody>
                          {materialVariances.filter(v => v.project_name === proj.project_name).map((mv, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-3 font-bold">{mv.material_name}</td>
                              <td className="p-3 text-slate-500">{mv.planned_qty.toLocaleString()} {mv.unit}</td>
                              <td className="p-3 font-bold">{mv.actual_issued_qty.toLocaleString()} {mv.unit}</td>
                              <td className={`p-3 font-bold ${mv.variance_qty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{mv.variance_qty}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-1 rounded-lg font-black text-[10px] ${mv.consumption_pct > 100 ? 'bg-red-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{mv.consumption_pct}%</span>
                                  {mv.consumption_pct > 90 && mv.consumption_pct <= 100 && (
                                    <span title="اقترب من نفاذ ميزانية البند"><AlertTriangle size={12} className="text-amber-500 animate-pulse" /></span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* رسم بياني مصغر للأداء */}
              <div className="h-40 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'المخطط', val: proj.metrics.planned_value },
                    { name: 'المنجز', val: proj.metrics.earned_value },
                    { name: 'الفعلي', val: proj.metrics.actual_cost }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                    <XAxis dataKey="name" tick={{fontSize: 10}} />
                    <Tooltip />
                    <Bar dataKey="val" radius={[4, 4, 0, 0]}>
                      <Cell fill="#94a3b8" />
                      <Cell fill="#3b82f6" />
                      <Cell fill="#f59e0b" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-t flex justify-between items-center">
               <div className="flex items-center gap-1">
                  <HeartPulse size={14} className="text-slate-400" />
                  <span className="text-[10px] font-black">{proj.cost_status} | {proj.schedule_status}</span>
               </div>
               <button 
                onClick={() => setExpandedProject(expandedProject === proj.project_id ? null : proj.project_id)}
                className="text-blue-600 text-xs font-black flex items-center gap-1 hover:underline"
               >
                  {expandedProject === proj.project_id ? 'إغلاق التفاصيل' : 'عرض التحليل العميق'} 
                  {expandedProject === proj.project_id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
               </button>
            </div>
          </div>
        ))}
      </div>

      {/* 🔮 المحرك السري: حاوية التقارير المخفية المستخدمة في التصدير */}
      <div className="hidden">
        <div id="report-container">
          {projects.map(p => expandedProject === p.project_id && <ProjectExecutiveReport key={p.project_id} project={p} settings={settings} />)}
        </div>
      </div>

      {projects.length === 0 && (
        <div className="bg-white p-20 rounded-[40px] text-center border-2 border-dashed border-slate-200">
          <Building2 size={64} className="mx-auto text-slate-200 mb-4" />
          <h3 className="text-xl font-bold text-slate-400">لا توجد مشاريع نشطة حالياً لتحليل أدائها</h3>
        </div>
      )}
    </div>
  );
};

const IndicatorBadge = ({ label, value }: { label: string, value: number }) => (
  <div className="text-center px-3 py-1 bg-white border rounded-xl shadow-sm">
    <p className="text-[9px] font-black text-slate-400 uppercase">{label}</p>
    <p className={`text-sm font-black ${value >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>{value}</p>
  </div>
);

const MetricItem = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className="text-right">
    <p className="text-[9px] font-bold text-slate-400 mb-1">{label}</p>
    <p className={`text-sm font-black ${color}`}>{value.toLocaleString()}</p>
  </div>
);

export default ConstructionDashboard;