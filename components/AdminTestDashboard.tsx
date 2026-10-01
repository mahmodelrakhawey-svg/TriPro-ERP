import { logger } from '../utils/logger';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient'; 
import { 
  CheckCircle2, 
  XCircle, 
  Activity, 
  Clock, 
  ChevronLeft, 
  AlertCircle,
  BarChart3,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

interface TestResult {
  id: string;
  test_date: string;
  test_name: string;
  status: 'SUCCESS' | 'FAILURE' | 'INFO';
  summary: string;
  details: any;
}

const EVENT_LABELS: Record<string, string> = {
  DOCUMENT_AUDIT: '🛡️ فحص وتدقيق الوثائق والقيود',
  journal_entries_deleted: '🗑️ رصد حذف قيود اليومية',
  LOGIN: '🔑 تسجيل دخول مستخدم',
  LOGOUT: '🚪 تسجيل خروج مستخدم',
  BACKUP_CREATED: '💾 أخذ نسخة احتياطية',
  INVENTORY_CHECK: '📦 فحص توازن المخزون',
};

const AdminTestDashboard: React.FC = () => {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState<TestResult | null>(null);

  const fetchTests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_test_summary', { p_limit: 50 });
      if (!error && Array.isArray(data)) {
        const normalized: TestResult[] = data.map((item: Record<string, any>) => {
          const isFailed = item.result === 'FAILED';
          const isInfo = item.result === 'INFO';
          return {
            id: item.id || String(Math.random()),
            test_date: item.created_at || item.test_date || new Date().toISOString(),
            test_name: item.test_name || 'فحص أمني',
            status: isFailed ? 'FAILURE' : isInfo ? 'INFO' : 'SUCCESS',
            summary: item.details || item.summary || 'سجل تدقيق أمني تلقائي للنظام',
            details: item.details || item
          };
        });
        setTests(normalized);
      } else {
        // محاولة احتياطية من security_logs مباشرة
        const { data: secLogs } = await supabase
          .from('security_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30);

        if (secLogs && secLogs.length > 0) {
          const normalized: TestResult[] = secLogs.map((s: Record<string, any>) => ({
            id: s.id,
            test_date: s.created_at,
            test_name: s.event_type || 'إجراء أمني',
            status: s.severity === 'high' ? 'FAILURE' : 'INFO',
            summary: s.description || s.details?.action || 'سجل نشاط أمني مسجل',
            details: s.details || s
          }));
          setTests(normalized);
        }
      }
    } catch (err) {
      logger.warn('Error fetching test results:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const stats = {
    total: tests.length,
    success: tests.filter(t => t.status === 'SUCCESS' || t.status === 'INFO').length,
    failed: tests.filter(t => t.status === 'FAILURE').length,
    lastRun: tests[0]?.test_date
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl text-right font-sans" dir="rtl">
      {/* 💡 بطاقة توجيهية لمركز الرقابة الحديث */}
      <div className="mb-6 bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shrink-0 shadow-sm">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 className="font-black text-sm text-indigo-950">
              تم تطوير الجيل الجديد: مركز الرقابة والحوكمة ومطابقة الأركان الأربعة
            </h3>
            <p className="text-xs text-indigo-700 mt-0.5">
              هذه الشاشة مخصصة لعرض السجلات التقنية (Raw Event Logs). للمتابعة المحاسبية ومطابقة الأركان الأربعة وفحص القيود تفصيلياً:
            </p>
          </div>
        </div>
        <Link
          to="/admin/audit-logs"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shrink-0 transition-all shadow-sm active:scale-95"
        >
          الانتقال لمركز الحوكمة المالي ⟵
        </Link>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Activity className="text-indigo-600" />
            سجل العمليات والأحداث الأمنية للنظام
          </h1>
          <p className="text-gray-500 text-sm mt-1">سجل مراجعة الأحداث التقنية ومراقبة العمليات الخلفية</p>
        </div>
        <button 
          onClick={fetchTests}
          disabled={loading}
          className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50 transition-all text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث البيانات
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="إجمالي السجلات" value={stats.total} icon={<BarChart3 />} color="indigo" />
        <StatCard title="عمليات معتمدة وناجحة" value={stats.success} icon={<CheckCircle2 />} color="green" />
        <StatCard title="أخطاء مسجلة" value={stats.failed} icon={<XCircle />} color="red" />
        <StatCard 
          title="آخر تسجيل" 
          value={stats.lastRun && !isNaN(new Date(stats.lastRun).getTime()) 
            ? new Date(stats.lastRun).toLocaleTimeString('ar-EG') 
            : '---'} 
          icon={<Clock />} 
          color="blue" 
        />
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-600 font-bold">
            <tr>
              <th className="px-6 py-4 text-right font-semibold">التاريخ والتوقيت</th>
              <th className="px-6 py-4 text-right font-semibold">نوع الحدث / الإجراء</th>
              <th className="px-6 py-4 text-right font-semibold">الحالة</th>
              <th className="px-6 py-4 text-right font-semibold">الملخص والبيان</th>
              <th className="px-6 py-4 text-center font-semibold">التفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="py-20 text-center text-gray-400">جاري تحميل النتائج...</td></tr>
            ) : tests.length === 0 ? (
              <tr><td colSpan={5} className="py-20 text-center text-gray-400">لا توجد سجلات أخطاء أو أحداث مسجلة</td></tr>
            ) : tests.map((test) => (
              <tr key={test.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-mono text-xs">
                  {test.test_date && !isNaN(new Date(test.test_date).getTime())
                    ? new Date(test.test_date).toLocaleString('ar-EG')
                    : '-'}
                </td>
                <td className="px-6 py-4 font-bold text-gray-700">
                  {EVENT_LABELS[test.test_name] || test.test_name}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    test.status === 'SUCCESS' 
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                      : test.status === 'INFO'
                      ? 'bg-sky-100 text-sky-700 border border-sky-200'
                      : 'bg-rose-100 text-rose-700 border border-rose-200'
                  }`}>
                    {test.status === 'SUCCESS' ? <CheckCircle2 size={13}/> :
                     test.status === 'INFO' ? <ShieldCheck size={13}/> :
                     <XCircle size={13}/>}
                    {test.status === 'SUCCESS' ? 'ناجح' :
                     test.status === 'INFO' ? 'إجراء معتمد (INFO)' :
                     'فاشل'}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 max-w-xs truncate text-xs">{test.summary}</td>
                <td className="px-6 py-4 text-center">
                  <button 
                    onClick={() => setSelectedTest(test)}
                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all"
                  >
                    عرض التفاصيل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedTest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedTest(null)}>
          <div 
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className={`p-6 text-white flex justify-between items-center ${
              selectedTest.status === 'SUCCESS' ? 'bg-emerald-600' :
              selectedTest.status === 'INFO' ? 'bg-sky-600' :
              'bg-rose-600'
            }`}>
              <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                <AlertCircle size={20} />
                تفاصيل الحدث: {EVENT_LABELS[selectedTest.test_name] || selectedTest.test_name}
              </h3>
              <button onClick={() => setSelectedTest(null)} className="hover:bg-white/20 p-1.5 rounded-lg text-white">
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <h4 className="text-xs font-bold text-gray-500 mb-1.5 uppercase">خلاصة النتيجة والبيان</h4>
                <p className="text-gray-700 bg-gray-50 p-3.5 rounded-xl border border-gray-100 text-xs">
                  {selectedTest.summary}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-500 mb-1.5 uppercase">البيانات التقنية (JSON Payload)</h4>
                <pre className="bg-gray-900 text-emerald-400 p-4 rounded-xl text-xs font-mono ltr text-left overflow-x-auto shadow-inner max-h-60">
                  {typeof selectedTest.details === 'object' 
                    ? JSON.stringify(selectedTest.details, null, 2) 
                    : String(selectedTest.details)}
                </pre>
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t flex justify-end">
              <button 
                onClick={() => setSelectedTest(null)}
                className="px-6 py-2 bg-white border border-gray-300 rounded-xl text-gray-700 text-xs font-bold hover:bg-gray-100 transition-colors"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* مكون بطاقة الإحصائيات الفرعي */
const StatCard = ({ title, value, icon, color }: { title: string; value: string | number; icon: React.ReactElement; color: string }) => {
  const colorMap: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    green: 'text-green-600 bg-green-50 border-green-100',
    red: 'text-red-600 bg-red-50 border-red-100',
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
  };
  
  return (
    <div className="p-4 rounded-xl border bg-white shadow-sm flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colorMap[color]}`}>
        {React.cloneElement(icon, { size: 22 })}
      </div>
      <div>
        <p className="text-gray-500 text-xs font-medium">{title}</p>
        <p className="text-xl font-black text-gray-800">{value}</p>
      </div>
    </div>
  );
};

export default AdminTestDashboard;