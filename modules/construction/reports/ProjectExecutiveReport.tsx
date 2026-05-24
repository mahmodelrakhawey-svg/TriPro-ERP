import React from 'react';
import { Building2, FileCheck, TrendingUp, DollarSign, Target, Calendar, MapPin, User } from 'lucide-react';

interface Props {
  project: any;
  settings: any;
}

/** 🏗️ تصميم تقرير احترافي للمقاولات (A4 Print Optimized) **/
const ProjectExecutiveReport: React.FC<Props> = ({ project, settings }) => {
  const date = new Date().toLocaleDateString('ar-EG');

  return (
    <div className="bg-white p-10 font-sans text-right print:p-0" dir="rtl" id="project-report-content">
      {/* Header - الهيدر الرسمي */}
      <div className="flex justify-between items-start border-b-4 border-slate-800 pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">{settings.companyName}</h1>
          <p className="text-sm text-slate-500 flex items-center gap-2"><MapPin size={14}/> {settings.address}</p>
          <p className="text-sm text-slate-500 font-bold mt-1">الرقم الضريبي: {settings.taxNumber}</p>
        </div>
        <div className="text-left">
          {settings.logoUrl && <img src={settings.logoUrl} alt="Logo" className="h-24 w-auto object-contain mb-2" />}
          <div className="text-[10px] font-black bg-slate-100 px-3 py-1 rounded-full uppercase tracking-tighter">تقرير الموقف التنفيذي والمالي</div>
        </div>
      </div>

      {/* Project Basic Info - معلومات المشروع */}
      <div className="grid grid-cols-2 gap-8 mb-10 bg-slate-50 p-6 rounded-3xl border border-slate-100">
        <div className="space-y-3">
          <h2 className="text-2xl font-black text-blue-900">{project.project_name}</h2>
          <p className="text-sm text-slate-600 font-medium">العميل: <span className="text-slate-900 font-bold">{project.customer_name || 'غير محدد'}</span></p>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1"><Calendar size={14}/> البدء: {project.start_date || '...'}</span>
            <span className="flex items-center gap-1"><Calendar size={14}/> الانتهاء: {project.end_date || '...'}</span>
          </div>
        </div>
        <div className="text-left flex flex-col justify-center">
          <div className="text-sm text-slate-400 font-black uppercase mb-1">قيمة التعاقد الإجمالية</div>
          <div className="text-3xl font-black text-slate-800">{(project.metrics?.bac || 0).toLocaleString()} <span className="text-sm font-normal">{settings.currency}</span></div>
        </div>
      </div>

      {/* EVM Dashboard - مؤشرات القيمة المكتسبة */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <ScoreCard label="مؤشر الأداء الزمني (SPI)" value={project.spi} status={project.spi >= 1 ? 'good' : 'bad'} />
        <ScoreCard label="مؤشر أداء التكاليف (CPI)" value={project.cpi} status={project.cpi >= 1 ? 'good' : 'bad'} />
        <ScoreCard label="نسبة الإنجاز المالي" value={`${((project.metrics?.earned_value / project.metrics?.bac) * 100).toFixed(1)}%`} status="neutral" />
        <ScoreCard label="مؤشر صحة المشروع" value={`${project.health}%`} status={project.health > 80 ? 'good' : project.health > 60 ? 'warning' : 'bad'} />
      </div>

      {/* Financial Summary Table - جدول الملخص المالي */}
      <div className="mb-10">
        <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
          <FileCheck className="text-blue-600" /> تفصيل الموقف المالي (EVM Metrics)
        </h3>
        <table className="w-full text-right border-collapse rounded-2xl overflow-hidden shadow-sm border border-slate-200">
          <thead className="bg-slate-800 text-white text-xs font-bold uppercase">
            <tr>
              <th className="p-4 border-l border-slate-700">البيان</th>
              <th className="p-4 border-l border-slate-700 text-center">القيمة المخططة (PV)</th>
              <th className="p-4 border-l border-slate-700 text-center">القيمة المكتسبة (EV)</th>
              <th className="p-4 text-center">التكلفة الفعلية (AC)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            <tr>
              <td className="p-4 font-bold text-slate-700 bg-slate-50">الأعمال المنجزة</td>
              <td className="p-4 text-center font-mono">{(project.metrics?.planned_value || 0).toLocaleString()}</td>
              <td className="p-4 text-center font-mono font-black text-blue-600">{(project.metrics?.earned_value || 0).toLocaleString()}</td>
              <td className="p-4 text-center font-mono font-black text-amber-600">{(project.metrics?.actual_cost || 0).toLocaleString()}</td>
            </tr>
            <tr className="bg-slate-50/50">
              <td className="p-4 font-bold text-slate-700">توقعات عند الإغلاق (EAC)</td>
              <td colSpan={3} className="p-4 text-center font-black text-lg">
                {(project.forecast?.forecast_final_cost_eac || 0).toLocaleString()} {settings.currency}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cash Flow Forecast - توقعات السيولة */}
      <div className="grid grid-cols-2 gap-8 mb-10">
        <div className="p-6 rounded-3xl bg-blue-50 border border-blue-100">
          <h4 className="text-sm font-black text-blue-900 mb-2 flex items-center gap-2"><DollarSign size={16}/> الاحتياج النقدي المتوقع (90 يوماً)</h4>
          <p className="text-2xl font-black text-blue-700">{(project.cashFlow?.projection_3_months || 0).toLocaleString()} <span className="text-xs font-normal">{settings.currency}</span></p>
          <p className="text-[10px] text-blue-500 font-bold mt-2 italic">* يعتمد هذا التنبؤ على معدل الصرف والإنجاز الحالي في الموقع.</p>
        </div>
        <div className="p-6 rounded-3xl bg-slate-900 text-white">
          <h4 className="text-sm font-black mb-2 opacity-60">الانحراف المتوقع (VAC)</h4>
          <div className={`text-2xl font-black ${project.forecast?.expected_variance_vac < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {(project.forecast?.expected_variance_vac || 0).toLocaleString()} {settings.currency}
          </div>
          <p className="text-xs font-medium mt-1">{project.forecast?.forecast_status}</p>
        </div>
      </div>

      {/* Signatures - الاعتمادات */}
      <div className="mt-20 pt-10 border-t-2 border-slate-100 grid grid-cols-3 text-center text-sm font-bold text-slate-400">
        <div className="space-y-12">
          <p>المكتب الفني</p>
          <p className="border-t border-slate-200 w-32 mx-auto pt-2">التوقيع</p>
        </div>
        <div className="space-y-12">
          <p>المدير المالي</p>
          <p className="border-t border-slate-200 w-32 mx-auto pt-2">التوقيع</p>
        </div>
        <div className="space-y-12">
          <p>المدير العام</p>
          <p className="border-t border-slate-200 w-32 mx-auto pt-2">التوقيع</p>
        </div>
      </div>

      {/* Footer - التذييل */}
      <div className="fixed bottom-6 right-10 left-10 flex justify-between text-[10px] font-black text-slate-300 uppercase border-t border-slate-50 pt-4 print:relative print:mt-10">
        <span>نظام TriPro ERP - مديول المقاولات المتقدم</span>
        <span>تاريخ الإصدار: {date}</span>
        <span>صفحة 1 من 1</span>
      </div>
    </div>
  );
};

const ScoreCard = ({ label, value, status }: { label: string, value: any, status: 'good' | 'bad' | 'warning' | 'neutral' }) => {
  const colors = {
    good: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    bad: 'text-red-600 bg-red-50 border-red-100',
    warning: 'text-amber-600 bg-amber-50 border-amber-100',
    neutral: 'text-blue-600 bg-blue-50 border-blue-100'
  };
  return (
    <div className={`p-4 rounded-2xl border text-center ${colors[status]}`}>
      <p className="text-[9px] font-black uppercase mb-1 opacity-70">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
};

export default ProjectExecutiveReport;