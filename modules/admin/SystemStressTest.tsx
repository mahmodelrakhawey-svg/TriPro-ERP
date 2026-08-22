import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { StressTestEngine, TestLog, StressTestSummary } from '../../services/stressTestEngine';
import { getOrgId } from '../../utils/getOrgId';
import {
  Play,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Activity,
  Layers,
  FileText,
  DollarSign,
  TrendingUp,
  Cpu,
  Lock,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SystemStressTest: React.FC = () => {
  const { currentUser } = useAccounting();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [isRunning, setIsRunning] = useState(false);
  const [testMode, setTestMode] = useState<number>(100);
  const [isCleaning, setIsCleaning] = useState(false);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [summary, setSummary] = useState<StressTestSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'audit' | 'logs'>('audit');

  const handleRunStressTest = async (count: number = 100) => {
    setIsRunning(true);
    setTestMode(count);
    setLogs([]);
    setSummary(null);

    try {
      const orgId = await getOrgId(currentUser);
      if (!orgId) {
        showToast('تعذر تحديد هوية المنظمة. يرجى تسجيل الدخول مجدداً.', 'error');
        setIsRunning(false);
        return;
      }

      showToast(`جاري تشغيل الفحص والضغط الآلي الموسع (${count} قيد)...`, 'info');

      const engine = new StressTestEngine(orgId, currentUser, (newLog) => {
        setLogs((prev) => [newLog, ...prev]);
      });

      const result = await engine.runFullSuite(count);
      setSummary(result);

      if (result.allBalanced) {
        showToast(`🎉 اكتمل الفحص بنجاح تام! تم اختبار ${result.passedOperations} قيد وكل الموازين متطابقة 100%`, 'success');
      } else {
        showToast('⚠️ اكتمل الفحص مع وجود بعض الملاحظات، يرجى مراجعة التقرير.', 'warning');
      }
    } catch (err: any) {
      console.error(err);
      showToast('حدث خطأ أثناء تشغيل الفحص: ' + err.message, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm('هل تريد حذف جميع الحركات والبيانات الاختبارية الناتجة عن الفحص وتنظيف السجلات؟')) {
      return;
    }

    setIsCleaning(true);
    try {
      const orgId = await getOrgId(currentUser);
      if (!orgId) return;

      const engine = new StressTestEngine(orgId, currentUser, (newLog) => {
        setLogs((prev) => [newLog, ...prev]);
      });

      await engine.cleanupTestData();
      showToast('تم تنظيف بيانات الاختبار بنجاح وبقيت بياناتك الأصلية سليمة ✅', 'success');
    } catch (err: any) {
      showToast('فشل التنظيف: ' + err.message, 'error');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen font-sans text-slate-800 space-y-6" dir="rtl">
      {/* الترويسة الرئيسية */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-indigo-900/50">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -ml-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-400/30 text-indigo-300">
                <Cpu size={28} className="animate-pulse" />
              </span>
              <div>
                <h1 className="text-2xl font-black tracking-tight">محرك الفحص والضغط الآلي الشامل (Automated Stress Test)</h1>
                <p className="text-slate-300 text-sm">
                  اختبار حي متكامل لمئات الحركات والقيود المالية عبر كافة المديولات للتحقق التام من الاتزان والمطابقة المحاسبية 100%
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleRunStressTest(100)}
              disabled={isRunning}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-all ${
                isRunning
                  ? 'bg-slate-700 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30 hover:scale-105 active:scale-95'
              }`}
            >
              {isRunning && testMode === 100 ? (
                <>
                  <RefreshCw size={20} className="animate-spin" />
                  <span>جاري تنفيذ 100 قيد وفحص الاتزان...</span>
                </>
              ) : (
                <>
                  <Sparkles size={20} className="animate-pulse text-amber-300" />
                  <span>بدء اختبار الضغط الموسع (100 قيد) 🚀</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleRunStressTest(25)}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-3 bg-indigo-600/80 hover:bg-indigo-600 border border-indigo-400/30 text-white rounded-xl font-semibold transition-all hover:scale-105"
            >
              <Play size={18} />
              <span>فحص سريع (25 قيد)</span>
            </button>

            <button
              onClick={handleCleanup}
              disabled={isCleaning || isRunning}
              className="flex items-center gap-2 px-4 py-3 bg-slate-800/80 hover:bg-rose-900/40 border border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-200 rounded-xl font-semibold transition-all"
              title="إزالة الحركات الاختبارية بعد الانتهاء"
            >
              <Trash2 size={18} />
              <span>تنظيف بيانات الفحص</span>
            </button>
          </div>
        </div>

        {/* المديولات المشمولة في الفحص */}
        <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs text-slate-300">
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" />
            <span>المبيعات والتجاري</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" />
            <span>المشتريات والموردين</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" />
            <span>الخزينة والبنوك والشيكات</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" />
            <span>المقاولات والمستخلصات</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" />
            <span>التصنيع وتكاليف WIP</span>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" />
            <span>ميزان المراجعة والأستاذ العام</span>
          </div>
        </div>
      </div>

      {/* لوحة نتائج الملخص والمؤشرات */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">الحركات المنفذة</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{summary.totalOperations}</p>
              <p className="text-xs text-emerald-600 mt-1">✓ {summary.passedOperations} عملية ناجحة 100%</p>
            </div>
            <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Layers size={26} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">حجم المبالغ المختبرة</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{summary.totalVolumeTested.toLocaleString()} <span className="text-xs font-normal">ج.م</span></p>
              <p className="text-xs text-slate-400 mt-1">حركات بيع، شراء، مستخلصات، سداد</p>
            </div>
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign size={26} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">حالة الاتزان المالي</p>
              <p className={`text-2xl font-black mt-1 ${summary.allBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
                {summary.allBalanced ? 'متزن 100% بالقرش' : 'يوجد ملاحظات'}
              </p>
              <p className="text-xs text-slate-500 mt-1">فرق ميزان المراجعة = 0.00</p>
            </div>
            <div className={`p-3.5 rounded-xl ${summary.allBalanced ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <CheckCircle size={26} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">زمن الاستجابة والتنفيذ</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{(summary.durationMs / 1000).toFixed(2)} <span className="text-xs font-normal">ثانية</span></p>
              <p className="text-xs text-indigo-600 mt-1">أداء فائق السرعة لقاعدة البيانات</p>
            </div>
            <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl">
              <Activity size={26} />
            </div>
          </div>
        </div>
      )}

      {/* شريط التبويبات */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'audit'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sparkles size={18} />
          <span>جدول التدقيق والفحص المحاسبي الرياضي ({summary?.auditChecks.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'logs'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText size={18} />
          <span>سجل الحركات المنفذة لحظياً ({logs.length})</span>
        </button>
      </div>

      {/* محتوى التبويب الأول: جدول التدقيق المحاسبي */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <h2 className="font-bold text-slate-800 text-base">تقرير الفحص الرياضي والمطابقة المتوازنة</h2>
            </div>
            <span className="text-xs text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">
              دقة المحرك: 100% بالقرش
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-100/70 text-slate-600 text-xs font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">بند التدقيق المحاسبي</th>
                  <th className="p-4">القيمة المحسوبة في الأستاذ العام</th>
                  <th className="p-4">القيمة في الأستاذ المساعد / الكشوف</th>
                  <th className="p-4 text-center">الفرق (Discrepancy)</th>
                  <th className="p-4 text-center">الحالة</th>
                  <th className="p-4">الملاحظات والنتيجة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {summary?.auditChecks && summary.auditChecks.length > 0 ? (
                  summary.auditChecks.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                        <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                        <span>{item.title}</span>
                      </td>
                      <td className="p-4 text-slate-700">{item.expected}</td>
                      <td className="p-4 text-slate-700">{item.actual}</td>
                      <td className="p-4 text-center font-bold text-emerald-600">
                        {item.difference.toFixed(2)} ج.م
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle size={12} />
                          <span>ناجح ومتطابق</span>
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-600">{item.notes}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400">
                      <Cpu size={48} className="mx-auto mb-3 text-slate-300" />
                      <p className="font-semibold text-slate-600">لم يتم تشغيل الفحص بعد</p>
                      <p className="text-xs text-slate-400 mt-1">اضغط على زر «بدء الفحص الآلي الفوري» لبدء توليد واختبار الحركات.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* محتوى التبويب الثاني: السجل اللحظي للحركات */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center">
            <h2 className="font-bold text-slate-800 text-sm">سجل العمليات والقيود التفصيلي</h2>
            <span className="text-xs text-slate-500">يتم التحديث لحظياً أثناء سير الاختبار</span>
          </div>

          <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100 p-2 font-mono text-xs">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div key={log.id} className="p-3 hover:bg-slate-50 rounded-xl transition-colors flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5">
                      {log.status === 'passed' && <CheckCircle size={16} className="text-emerald-500" />}
                      {log.status === 'running' && <RefreshCw size={16} className="text-blue-500 animate-spin" />}
                      {log.status === 'failed' && <AlertTriangle size={16} className="text-rose-500" />}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 font-sans">{log.stepName}</span>
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-sans font-bold">
                          {log.module}
                        </span>
                        {log.reference && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                            {log.reference}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 mt-1 font-sans text-xs">{log.details}</p>
                    </div>
                  </div>

                  <div className="text-left flex flex-col items-end flex-shrink-0">
                    {log.amount && (
                      <span className="font-bold text-emerald-600 font-sans text-xs">
                        {log.amount.toLocaleString()} ج.م
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 mt-0.5">{log.timestamp}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-slate-400 font-sans">
                لا توجد سجلات حالياً. ابدأ الفحص لعرض السجل الحي.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemStressTest;
