import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { ArrowRight, FileText, Loader2, Download, DollarSign, Calendar, Users, BarChart3, Image as ImageIcon, Flag, Briefcase } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface ProjectComprehensiveReportProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

const ProjectComprehensiveReport: React.FC<ProjectComprehensiveReportProps> = ({ projectId, projectName, onBack }) => {
  const { organization } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (organization?.id) {
      fetchReportData();
    }
  }, [projectId, organization?.id]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Project Details
      const { data: projectDetails, error: projectError } = await supabase
        .from('projects')
        .select('*, customers(name)')
        .eq('id', projectId)
        .single();
      if (projectError) throw projectError;

      // 2. Fetch Financial Summary (Profitability)
      const { data: profitability, error: profitabilityError } = await supabase
        .from('v_project_profitability')
        .select('*')
        .eq('project_id', projectId)
        .single();
      if (profitabilityError) console.error("Error fetching profitability:", profitabilityError);

      // 3. Fetch EVM Metrics
      const { data: evmMetrics, error: evmError } = await supabase.rpc('get_project_evm_metrics', { p_project_id: projectId });
      if (evmError) console.error("Error fetching EVM metrics:", evmError);

      // 4. Fetch Milestones
      const { data: milestones, error: milestonesError } = await supabase
        .from('project_milestones')
        .select('*')
        .eq('project_id', projectId)
        .order('expected_start_date', { ascending: true });
      if (milestonesError) console.error("Error fetching milestones:", milestonesError);

      // 5. Fetch Latest Daily Reports (e.g., last 3 with images)
      const { data: dailyReports, error: dailyReportsError } = await supabase
        .from('project_daily_reports')
        .select('report_date, work_description, site_images')
        .eq('project_id', projectId)
        .not('site_images', 'is', null)
        .order('report_date', { ascending: false })
        .limit(3);
      if (dailyReportsError) console.error("Error fetching daily reports:", dailyReportsError);

      // 6. Fetch Subcontractor Performance (for this project's subcontractors)
      // جلب معرفات مقاولي الباطن المرتبطين بالمشروع أولاً
      const { data: contractSubs } = await supabase
        .from('subcontractor_contracts')
        .select('subcontractor_id')
        .eq('project_id', projectId);
      
      const subIds = contractSubs?.map(c => c.subcontractor_id) || [];

      let subPerformance = [];
      if (subIds.length > 0) {
        const { data: perf, error: subPerformanceError } = await supabase
          .from('v_subcontractor_performance')
          .select('*')
          .in('subcontractor_id', subIds);
        if (subPerformanceError) console.error("Error fetching subcontractor performance:", subPerformanceError);
        subPerformance = perf || [];
      }

      setReportData({
        project: projectDetails,
        profitability: profitability,
        evm: evmMetrics,
        milestones: milestones,
        dailyReports: dailyReports,
        subPerformance: subPerformance,
      });

    } catch (error: any) {
      showToast('فشل جلب بيانات التقرير: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportToPdf = async () => {
    setIsExporting(true);
    if (!reportRef.current) {
      showToast('فشل في العثور على محتوى التقرير.', 'error');
      setIsExporting(false);
      return;
    }

    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`تقرير_المشروع_الشامل_${projectName}_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('تم تصدير التقرير بنجاح ✅', 'success');
    } catch (error: any) {
      showToast('خطأ في تصدير التقرير: ' + error.message, 'error');
      console.error("PDF Export Error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin h-12 w-12 text-blue-600" />
      </div>
    );
  }

  if (!reportData || !reportData.project) {
    return (
      <div className="text-center p-8 bg-white rounded-xl shadow-sm">
        <p className="text-red-500">فشل في تحميل بيانات المشروع.</p>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:underline">العودة</button>
      </div>
    );
  }

  const { project, profitability, evm, milestones, dailyReports, subPerformance } = reportData;

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <ArrowRight size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <FileText className="text-blue-600" />
              تقرير المشروع الشامل: {projectName}
            </h1>
            <p className="text-gray-500 mt-1">نظرة عامة متكاملة على أداء المشروع</p>
          </div>
        </div>
        <button
          onClick={exportToPdf}
          disabled={isExporting}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-100"
        >
          {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
          تصدير PDF
        </button>
      </div>

      <div ref={reportRef} className="bg-white p-8 rounded-xl shadow-lg space-y-8 print:p-0 print:shadow-none print:rounded-none">
        <div className="text-center border-b pb-4 mb-6">
          <h2 className="text-3xl font-black text-gray-800 mb-2">تقرير المشروع الشامل</h2>
          <h3 className="text-xl font-bold text-blue-600">{projectName}</h3>
          <p className="text-gray-600">العميل: {project.customers?.name || 'غير محدد'} | تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
        </div>

        {/* Financial Summary */}
        <div className="space-y-4">
          <h4 className="text-xl font-bold text-gray-800 flex items-center gap-2"><DollarSign className="text-green-600" /> الملخص المالي</h4>
          {profitability && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg">
              <div className="text-center"><p className="text-sm text-gray-500">قيمة العقد</p><p className="font-bold text-lg">{project.contract_value?.toLocaleString()} ج.م</p></div>
              <div className="text-center"><p className="text-sm text-gray-500">إجمالي الإيرادات</p><p className="font-bold text-lg text-green-700">{profitability.total_revenue?.toLocaleString()} ج.م</p></div>
              <div className="text-center"><p className="text-sm text-gray-500">إجمالي التكاليف</p><p className="font-bold text-lg text-red-700">{profitability.total_actual_costs?.toLocaleString()} ج.م</p></div>
              <div className="text-center"><p className="text-sm text-gray-500">صافي الربح</p><p className={`font-bold text-lg ${profitability.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{profitability.net_profit?.toLocaleString()} ج.م</p></div>
            </div>
          )}
          {evm && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-blue-50 p-4 rounded-lg">
              <div className="text-center"><p className="text-sm text-blue-700">CPI</p><p className="font-bold text-lg">{evm.cpi}</p></div>
              <div className="text-center"><p className="text-sm text-blue-700">SPI</p><p className="font-bold text-lg">{evm.spi}</p></div>
              <div className="text-center"><p className="text-sm text-blue-700">حالة التكلفة</p><p className="font-bold text-lg">{evm.cost_status}</p></div>
              <div className="text-center"><p className="text-sm text-blue-700">حالة الجدول</p><p className="font-bold text-lg">{evm.schedule_status}</p></div>
            </div>
          )}
        </div>

        {/* Milestones */}
        <div className="space-y-4">
          <h4 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Flag className="text-orange-600" /> المراحل الزمنية</h4>
          {milestones && milestones.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 text-sm font-bold uppercase text-right">
                    <th className="py-2 px-4 border-b">المرحلة</th>
                    <th className="py-2 px-4 border-b">البدء المتوقع</th>
                    <th className="py-2 px-4 border-b">الانتهاء المتوقع</th>
                    <th className="py-2 px-4 border-b">التقدم %</th>
                    <th className="py-2 px-4 border-b">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m: any) => (
                    <tr key={m.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="py-2 px-4">{m.title}</td>
                      <td className="py-2 px-4">{m.expected_start_date}</td>
                      <td className="py-2 px-4">{m.expected_end_date}</td>
                      <td className="py-2 px-4">{m.progress_percentage}%</td>
                      <td className="py-2 px-4">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">لا توجد مراحل زمنية مسجلة.</p>
          )}
        </div>

        {/* Latest Site Images */}
        <div className="space-y-4">
          <h4 className="text-xl font-bold text-gray-800 flex items-center gap-2"><ImageIcon className="text-purple-600" /> صور الموقع الأخيرة</h4>
          {dailyReports && dailyReports.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dailyReports.map((report: any, idx: number) => report.site_images && report.site_images[0] && (
                <div key={idx} className="bg-gray-100 rounded-lg overflow-hidden shadow-sm">
                  <img src={report.site_images[0]} alt="Site" className="w-full h-48 object-cover" />
                  <div className="p-3">
                    <p className="text-xs text-gray-500">{report.report_date}</p>
                    <p className="text-sm font-medium text-gray-700 truncate">{report.work_description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">لا توجد صور موقع حديثة.</p>
          )}
        </div>

        {/* Subcontractor Performance */}
        <div className="space-y-4">
          <h4 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Briefcase className="text-teal-600" /> أداء مقاولي الباطن</h4>
          {subPerformance && subPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 text-sm font-bold uppercase text-right">
                    <th className="py-2 px-4 border-b">المقاول</th>
                    <th className="py-2 px-4 border-b">التخصص</th>
                    <th className="py-2 px-4 border-b">متوسط الجودة</th>
                    <th className="py-2 px-4 border-b">متوسط الالتزام</th>
                  </tr>
                </thead>
                <tbody>
                  {subPerformance.map((sub: any) => (
                    <tr key={sub.subcontractor_id} className="border-b border-gray-100 last:border-b-0">
                      <td className="py-2 px-4">{sub.name}</td>
                      <td className="py-2 px-4">{sub.specialty}</td>
                      <td className="py-2 px-4">{sub.avg_quality || 'N/A'}</td>
                      <td className="py-2 px-4">{sub.avg_timeliness || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">لا توجد بيانات أداء لمقاولي الباطن.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectComprehensiveReport;