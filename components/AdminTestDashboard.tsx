import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient'; 
import { 
  CheckCircle2, 
  XCircle, 
  Activity, 
  Clock, 
  ChevronLeft, 
  AlertCircle,
  BarChart3,
  RefreshCw
} from 'lucide-react';

interface TestResult {
  id: string;
  test_date: string;
  test_name: string;
  status: 'SUCCESS' | 'FAILURE';
  summary: string;
  details: any;
}

const AdminTestDashboard: React.FC = () => {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState<TestResult | null>(null);

  const fetchTests = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_admin_test_summary', { p_limit: 20 });
    if (error) {
      console.error('Error fetching test results:', error);
    } else {
      setTests(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const stats = {
    total: tests.length,
    success: tests.filter(t => t.status === 'SUCCESS').length,
    failed: tests.filter(t => t.status === 'FAILURE').length,
    lastRun: tests[0]?.test_date
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl text-right font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Activity className="text-indigo-600" />
            لوحة مراقبة صحة النظام
          </h1>
          <p className="text-gray-500 text-sm mt-1">نتائج الاختبارات الدورية وتكامل العمليات</p>
        </div>
        <button 
          onClick={fetchTests}
          className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50 transition-all text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث البيانات
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="إجمالي الاختبارات" value={stats.total} icon={<BarChart3 />} color="indigo" />
        <StatCard title="عمليات ناجحة" value={stats.success} icon={<CheckCircle2 />} color="green" />
        <StatCard title="إخفاقات" value={stats.failed} icon={<XCircle />} color="red" />
        <StatCard title="آخر فحص" value={stats.lastRun ? new Date(stats.lastRun).toLocaleTimeString('ar-EG') : '---'} icon={<Clock />} color="blue" />
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-600 font-bold">
            <tr>
              <th className="px-6 py-4 text-right font-semibold">التاريخ</th>
              <th className="px-6 py-4 text-right font-semibold">اسم الاختبار</th>
              <th className="px-6 py-4 text-right font-semibold">الحالة</th>
              <th className="px-6 py-4 text-right font-semibold">الملخص</th>
              <th className="px-6 py-4 text-right font-semibold">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="py-20 text-center text-gray-400">جاري تحميل النتائج...</td></tr>
            ) : tests.map((test) => (
              <tr key={test.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                  {new Date(test.test_date).toLocaleString('ar-EG')}
                </td>
                <td className="px-6 py-4 font-bold text-gray-700">{test.test_name}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    test.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {test.status === 'SUCCESS' ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}
                    {test.status === 'SUCCESS' ? 'ناجح' : 'فاشل'}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 max-w-xs truncate">{test.summary}</td>
                <td className="px-6 py-4 text-left">
                  <button 
                    onClick={() => setSelectedTest(test)}
                    className="text-indigo-600 hover:text-indigo-800 font-bold text-xs"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
            <div className={`p-6 text-white flex justify-between items-center ${
              selectedTest.status === 'SUCCESS' ? 'bg-green-600' : 'bg-red-600'
            }`}>
              <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                <AlertCircle />
                تفاصيل الاختبار: {selectedTest.test_name}
              </h3>
              <button onClick={() => setSelectedTest(null)} className="hover:bg-white/20 p-1 rounded">
                <ChevronLeft className="rotate-180" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-6">
                <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase">خلاصة النتيجة</h4>
                <p className="text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100 italic">
                  "{selectedTest.summary}"
                </p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase">البيانات التقنية (JSON)</h4>
                <pre className="bg-gray-900 text-green-400 p-4 rounded-xl text-xs font-mono ltr text-left overflow-x-auto shadow-inner">
                  {JSON.stringify(selectedTest.details, null, 2)}
                </pre>
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t flex justify-end">
              <button 
                onClick={() => setSelectedTest(null)}
                className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-gray-100 transition-colors"
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
const StatCard = ({ title, value, icon, color }: any) => {
  const colorMap: any = {
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    green: 'text-green-600 bg-green-50 border-green-100',
    red: 'text-red-600 bg-red-50 border-red-100',
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
  };
  
  return (
    <div className={`p-4 rounded-xl border bg-white shadow-sm flex items-center gap-4`}>
      <div className={`p-3 rounded-lg ${colorMap[color]}`}>
        {React.cloneElement(icon, { size: 24 })}
      </div>
      <div>
        <p className="text-gray-500 text-xs font-medium">{title}</p>
        <p className="text-xl font-black text-gray-800">{value}</p>
      </div>
    </div>
  );
};

export default AdminTestDashboard;