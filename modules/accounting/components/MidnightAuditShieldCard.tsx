import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  ArrowRightLeft, 
  Clock, 
  Sparkles,
  Layers,
  Search
} from 'lucide-react';
import { auditDaemonService, SystemAuditReport } from '../../../services/auditDaemonService';
import { toast } from 'react-hot-toast';

export interface MidnightAuditShieldCardProps {
  organizationId: string;
  onNavigateToJournal?: () => void;
}

export const MidnightAuditShieldCard: React.FC<MidnightAuditShieldCardProps> = ({ 
  organizationId,
  onNavigateToJournal 
}) => {
  const [report, setReport] = useState<SystemAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const handleInspectUnbalanced = () => {
    if (onNavigateToJournal) {
      onNavigateToJournal();
      return;
    }
    try {
      sessionStorage.setItem('tripro_initial_filter_status', 'unbalanced');
      window.location.hash = '#/general-journal';
    } catch (_) {}
  };

  const fetchAudit = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const rep = await auditDaemonService.runSystemAudit(organizationId);
      setReport(rep);
    } catch (err) {
      toast.error('تعذر إجراء فحص النزاهة: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [organizationId]);

  const handleAutoReconcile = async () => {
    if (!window.confirm('هل ترغب في تشغيل المعالجة الرقابية الشاملة لإعادة مطابقة الأرصدة وتصحيح الفروقات المحاسبية؟')) {
      return;
    }
    setReconciling(true);
    try {
      const res = await auditDaemonService.triggerAutoReconciliation(organizationId);
      if (res.success) {
        toast.success(res.message);
        await fetchAudit();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(err.message || 'حدث خطأ أثناء المعالجة');
    } finally {
      setReconciling(false);
    }
  };

  const isHealthy = report?.overallStatus === 'passed';
  const hasWarning = report?.overallStatus === 'warning';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-6 transition-all hover:shadow-md">
      {/* Top Banner */}
      <div className={`px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b ${
        isHealthy 
          ? 'bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white border-emerald-100' 
          : hasWarning 
            ? 'bg-gradient-to-r from-amber-50 via-orange-50/50 to-white border-amber-100'
            : 'bg-gradient-to-r from-rose-50 via-red-50/50 to-white border-rose-100'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold shadow-xs ${
            isHealthy 
              ? 'bg-emerald-600 text-white' 
              : hasWarning 
                ? 'bg-amber-500 text-white' 
                : 'bg-rose-600 text-white'
          }`}>
            {isHealthy ? <ShieldCheck size={26} /> : <ShieldAlert size={26} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-800">
                درع النزاهة والتدقيق المحاسبي الليلي (Midnight Integrity Shield)
              </h3>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                isHealthy 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : hasWarning 
                    ? 'bg-amber-100 text-amber-800' 
                    : 'bg-rose-100 text-rose-800'
              }`}>
                {isHealthy ? '4/4 أركان متطابقة تماماً' : hasWarning ? 'تنبيه: يوجد فروقات طفيفة' : 'تحذير: عدم توازن في الأستاذ'}
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Clock size={13} className="text-slate-400" />
              <span>فحص آلي منتظم لمطابقة الأستاذ العام مع سجلات العملاء والموردين والمخزون</span>
              {report?.timestamp && (
                <span className="font-mono text-slate-400">
                  • آخر فحص: {new Date(report.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {hasWarning && (
            <button
              onClick={handleAutoReconcile}
              disabled={reconciling}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              {reconciling ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>معالجة وتصحيح الفروقات آلياً</span>
            </button>
          )}

          <button
            onClick={fetchAudit}
            disabled={loading}
            className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-blue-600" : "text-slate-500"} />
            <span>{loading ? 'جاري التدقيق...' : 'فحص تدقيق فوري'}</span>
          </button>
        </div>
      </div>

      {/* 4 Pillars Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(report?.checks || []).map((check) => {
          const isPassed = check.status === 'passed';
          return (
            <div 
              key={check.id}
              className={`p-4 rounded-xl border transition-all ${
                isPassed 
                  ? 'bg-slate-50/60 border-slate-200/80' 
                  : 'bg-amber-50/40 border-amber-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-600 line-clamp-1">{check.title}</span>
                {isPassed ? (
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                )}
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>القيمة الدفترية:</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {check.expected.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>قيمة السجل/الأستاذ:</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {check.actual.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/60 font-bold">
                  <span className="text-slate-600">الفارق:</span>
                  <span className={`font-mono ${isPassed ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {check.variance === 0 ? '0.00 ج.م (مطابق تماماً)' : `${check.variance.toFixed(2)} ج.م`}
                  </span>
                </div>
              </div>

              <div className={`mt-2.5 text-[10px] leading-tight px-2 py-1 rounded ${
                isPassed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100/70 text-amber-800'
              }`}>
                {check.notes}
              </div>

              {check.id === 'pillar-gl' && !isPassed && (
                <button
                  onClick={handleInspectUnbalanced}
                  className="mt-2 w-full text-center text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  title="الانتقال فوراً لدفتر اليومية العامة وتحديد القيود غير المتوازنة"
                >
                  <Search size={13} />
                  <span>تحديد القيود غير المتوازنة باليومية</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MidnightAuditShieldCard;
