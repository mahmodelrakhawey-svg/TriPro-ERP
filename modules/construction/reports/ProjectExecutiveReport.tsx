import React from 'react';
import { Building2, FileCheck, TrendingUp, DollarSign, Target, Calendar, MapPin, User } from 'lucide-react';

interface Props {
  project: any;
  settings: any;
}

/** ðŸ—ï¸ ØªØµÙ…ÙŠÙ… ØªÙ‚Ø±ÙŠØ± Ø§Ø­ØªØ±Ø§ÙÙŠ Ù„Ù„Ù…Ù‚Ø§ÙˆÙ„Ø§Øª (A4 Print Optimized) **/
const ProjectExecutiveReport: React.FC<Props> = ({ project, settings }) => {
  const date = new Date().toLocaleDateString('ar-EG');
  const safeSettings = settings || {};
  const earnedVal = project?.metrics?.earned_value || 0;
  const bacVal = project?.metrics?.bac || 0;
  const completionRate = bacVal > 0 ? ((earnedVal / bacVal) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-white p-10 font-sans text-right print:p-0" dir="rtl" id="project-report-content" style={{ width: '800px', margin: '0 auto', boxSizing: 'border-box' }}>
      {/* Header - Ø§Ù„Ù‡ÙŠØ¯Ø± Ø§Ù„Ø±Ø³Ù…ÙŠ */}
      <div className="flex justify-between items-start border-b-4 border-slate-800 pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">{safeSettings.companyName || 'Ø´Ø±ÙƒØ© Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„Ø§Øª'}</h1>
          <p className="text-sm text-slate-500 flex items-center gap-2"><MapPin size={14}/> {safeSettings.address || 'Ø§Ù„Ù…Ù‚Ø± Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ'}</p>
          <p className="text-sm text-slate-500 font-bold mt-1">Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ø¶Ø±ÙŠØ¨ÙŠ: {safeSettings.taxNumber || 'ØºÙŠØ± Ù…ØªÙˆÙØ±'}</p>
        </div>
        <div className="text-left">
          {safeSettings.logoUrl && <img src={safeSettings.logoUrl} alt="Logo" crossOrigin="anonymous" className="h-24 w-auto object-contain mb-2" />}
          <div className="text-[10px] font-black bg-slate-100 px-3 py-1 rounded-full uppercase tracking-tighter">ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù…ÙˆÙ‚Ù Ø§Ù„ØªÙ†ÙÙŠØ°ÙŠ ÙˆØ§Ù„Ù…Ø§Ù„ÙŠ</div>
        </div>
      </div>

      {/* Project Basic Info - Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ */}
      <div className="grid grid-cols-2 gap-8 mb-10 bg-slate-50 p-6 rounded-3xl border border-slate-100">
        <div className="space-y-3">
          <h2 className="text-2xl font-black text-blue-900">{project?.project_name || 'Ù…Ø´Ø±ÙˆØ¹ ØºÙŠØ± Ù…Ø³Ù…Ù‰'}</h2>
          <p className="text-sm text-slate-600 font-medium">Ø§Ù„Ø¹Ù…ÙŠÙ„: <span className="text-slate-900 font-bold">{project?.customer_name || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'}</span></p>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1"><Calendar size={14}/> Ø§Ù„Ø¨Ø¯Ø¡: {project?.start_date || '...'}</span>
            <span className="flex items-center gap-1"><Calendar size={14}/> Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡: {project?.end_date || '...'}</span>
          </div>
        </div>
        <div className="text-left flex flex-col justify-center">
          <div className="text-sm text-slate-400 font-black uppercase mb-1">Ù‚ÙŠÙ…Ø© Ø§Ù„ØªØ¹Ø§Ù‚Ø¯ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ©</div>
          <div className="text-3xl font-black text-slate-800">{(project?.metrics?.bac || 0).toLocaleString()} <span className="text-sm font-normal">{safeSettings.currency || 'Ø±.Ø³'}</span></div>
        </div>
      </div>

      {/* EVM Dashboard - Ù…Ø¤Ø´Ø±Ø§Øª Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…ÙƒØªØ³Ø¨Ø© */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <ScoreCard label="Ù…Ø¤Ø´Ø± Ø§Ù„Ø£Ø¯Ø§Ø¡ Ø§Ù„Ø²Ù…Ù†ÙŠ (SPI)" value={project?.spi ?? '-'} status={(project?.spi || 0) >= 1 ? 'good' : 'bad'} />
        <ScoreCard label="Ù…Ø¤Ø´Ø± Ø£Ø¯Ø§Ø¡ Ø§Ù„ØªÙƒØ§Ù„ÙŠÙ (CPI)" value={project?.cpi ?? '-'} status={(project?.cpi || 0) >= 1 ? 'good' : 'bad'} />
        <ScoreCard label="Ù†Ø³Ø¨Ø© Ø§Ù„Ø¥Ù†Ø¬Ø§Ø² Ø§Ù„Ù…Ø§Ù„ÙŠ" value={`${completionRate}%`} status="neutral" />
        <ScoreCard label="Ù…Ø¤Ø´Ø± ØµØ­Ø© Ø§Ù„Ù…Ø´Ø±ÙˆØ¹" value={`${project?.health ?? 0}%`} status={(project?.health || 0) > 80 ? 'good' : (project?.health || 0) > 60 ? 'warning' : 'bad'} />
      </div>

      {/* Financial Summary Table - Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ù…Ù„Ø®Øµ Ø§Ù„Ù…Ø§Ù„ÙŠ */}
      <div className="mb-10">
        <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
          <FileCheck className="text-blue-600" /> ØªÙØµÙŠÙ„ Ø§Ù„Ù…ÙˆÙ‚Ù Ø§Ù„Ù…Ø§Ù„ÙŠ (EVM Metrics)
        </h3>
        <table className="w-full text-right border-collapse rounded-2xl overflow-hidden shadow-sm border border-slate-200">
          <thead className="bg-slate-800 text-white text-xs font-bold uppercase">
            <tr>
              <th className="p-4 border-l border-slate-700">Ø§Ù„Ø¨ÙŠØ§Ù†</th>
              <th className="p-4 border-l border-slate-700 text-center">Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…Ø®Ø·Ø·Ø© (PV)</th>
              <th className="p-4 border-l border-slate-700 text-center">Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…ÙƒØªØ³Ø¨Ø© (EV)</th>
              <th className="p-4 text-center">Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„ÙØ¹Ù„ÙŠØ© (AC)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            <tr>
              <td className="p-4 font-bold text-slate-700 bg-slate-50">Ø§Ù„Ø£Ø¹Ù…Ø§Ù„ Ø§Ù„Ù…Ù†Ø¬Ø²Ø©</td>
              <td className="p-4 text-center font-mono">{(project.metrics?.planned_value || 0).toLocaleString()}</td>
              <td className="p-4 text-center font-mono font-black text-blue-600">{(project.metrics?.earned_value || 0).toLocaleString()}</td>
              <td className="p-4 text-center font-mono font-black text-amber-600">{(project.metrics?.actual_cost || 0).toLocaleString()}</td>
            </tr>
            <tr className="bg-slate-50/50">
              <td className="p-4 font-bold text-slate-700">ØªÙˆÙ‚Ø¹Ø§Øª Ø¹Ù†Ø¯ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ (EAC)</td>
              <td colSpan={3} className="p-4 text-center font-black text-lg">
                {(project?.forecast?.forecast_final_cost_eac || 0).toLocaleString()} {safeSettings.currency || 'Ø±.Ø³'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cash Flow Forecast - ØªÙˆÙ‚Ø¹Ø§Øª Ø§Ù„Ø³ÙŠÙˆÙ„Ø© */}
      <div className="grid grid-cols-2 gap-8 mb-10">
        <div className="p-6 rounded-3xl bg-blue-50 border border-blue-100">
          <h4 className="text-sm font-black text-blue-900 mb-2 flex items-center gap-2"><DollarSign size={16}/> Ø§Ù„Ø§Ø­ØªÙŠØ§Ø¬ Ø§Ù„Ù†Ù‚Ø¯ÙŠ Ø§Ù„Ù…ØªÙˆÙ‚Ø¹ (90 ÙŠÙˆÙ…Ø§Ù‹)</h4>
          <p className="text-2xl font-black text-blue-700">{(project?.cashFlow?.projection_3_months || 0).toLocaleString()} <span className="text-xs font-normal">{safeSettings.currency || 'Ø±.Ø³'}</span></p>
          <p className="text-[10px] text-blue-500 font-bold mt-2 italic">* ÙŠØ¹ØªÙ…Ø¯ Ù‡Ø°Ø§ Ø§Ù„ØªÙ†Ø¨Ø¤ Ø¹Ù„Ù‰ Ù…Ø¹Ø¯Ù„ Ø§Ù„ØµØ±Ù ÙˆØ§Ù„Ø¥Ù†Ø¬Ø§Ø² Ø§Ù„Ø­Ø§Ù„ÙŠ ÙÙŠ Ø§Ù„Ù…ÙˆÙ‚Ø¹.</p>
        </div>
        <div className="p-6 rounded-3xl bg-slate-900 text-white">
          <h4 className="text-sm font-black mb-2 opacity-60">Ø§Ù„Ø§Ù†Ø­Ø±Ø§Ù Ø§Ù„Ù…ØªÙˆÙ‚Ø¹ (VAC)</h4>
          <div className={`text-2xl font-black ${(project?.forecast?.expected_variance_vac || 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {(project?.forecast?.expected_variance_vac || 0).toLocaleString()} {safeSettings.currency || 'Ø±.Ø³'}
          </div>
          <p className="text-xs font-medium mt-1">{project?.forecast?.forecast_status || 'Ù…Ø³ØªÙ‚Ø±'}</p>
        </div>
      </div>

      {/* Signatures - Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯Ø§Øª */}
      <div className="mt-20 pt-10 border-t-2 border-slate-100 grid grid-cols-3 text-center text-sm font-bold text-slate-400">
        <div className="space-y-12">
          <p>Ø§Ù„Ù…ÙƒØªØ¨ Ø§Ù„ÙÙ†ÙŠ</p>
          <p className="border-t border-slate-200 w-32 mx-auto pt-2">Ø§Ù„ØªÙˆÙ‚ÙŠØ¹</p>
        </div>
        <div className="space-y-12">
          <p>Ø§Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠ</p>
          <p className="border-t border-slate-200 w-32 mx-auto pt-2">Ø§Ù„ØªÙˆÙ‚ÙŠØ¹</p>
        </div>
        <div className="space-y-12">
          <p>Ø§Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ø¹Ø§Ù…</p>
          <p className="border-t border-slate-200 w-32 mx-auto pt-2">Ø§Ù„ØªÙˆÙ‚ÙŠØ¹</p>
        </div>
      </div>

      {/* Footer - Ø§Ù„ØªØ°ÙŠÙŠÙ„ */}
      <div className="fixed bottom-6 right-10 left-10 flex justify-between text-[10px] font-black text-slate-300 uppercase border-t border-slate-50 pt-4 print:relative print:mt-10">
        <span>Ù†Ø¸Ø§Ù… TriPro ERP - Ù…Ø¯ÙŠÙˆÙ„ Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„Ø§Øª Ø§Ù„Ù…ØªÙ‚Ø¯Ù…</span>
        <span>ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¥ØµØ¯Ø§Ø±: {date}</span>
        <span>ØµÙØ­Ø© 1 Ù…Ù† 1</span>
      </div>
    </div>
  );
};

const ScoreCard = ({ label, value, status }: { label: string, value: string | number, status: 'good' | 'bad' | 'warning' | 'neutral' }) => {
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
