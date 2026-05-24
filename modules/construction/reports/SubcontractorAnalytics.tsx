import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { Users, Star, Clock, DollarSign, Loader2, RefreshCw, Briefcase } from 'lucide-react';

interface SubcontractorPerformance {
  subcontractor_id: string;
  name: string;
  specialty: string;
  total_billings: number;
  avg_quality: number;
  avg_timeliness: number;
  total_work_value: number;
}

const SubcontractorAnalytics: React.FC = () => {
  const { organization } = useAccounting();
  const [performanceData, setPerformanceData] = useState<SubcontractorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (organization?.id) {
      fetchPerformanceData();
    }
  }, [organization?.id]);

  const fetchPerformanceData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_subcontractor_performance')
        .select('*')
        .eq('organization_id', organization?.id)
        .order('total_work_value', { ascending: false });

      if (error) throw error;
      setPerformanceData(data || []);
    } catch (error: any) {
      showToast('فشل تحميل بيانات أداء مقاولي الباطن: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-emerald-600';
    if (score >= 3) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="text-purple-600" />
            تحليلات أداء مقاولي الباطن
          </h1>
          <p className="text-gray-500 mt-1">تقييم شامل لجودة العمل والالتزام الزمني للمقاولين</p>
        </div>
        <button
          onClick={fetchPerformanceData}
          className="bg-white border p-2 rounded-lg hover:bg-slate-50"
          title="تحديث البيانات"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin h-12 w-12 text-purple-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {performanceData.map((sub) => (
            <div key={sub.subcontractor_id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                    <Briefcase size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{sub.name}</h3>
                    <p className="text-sm text-gray-500">{sub.specialty || 'غير محدد'}</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-500">
                  {sub.total_billings} مستخلص
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center border-t border-gray-100 pt-4 mt-4">
                <div>
                  <span className="text-xs text-gray-400 block mb-1">متوسط الجودة</span>
                  <div className={`font-bold text-lg ${getScoreColor(sub.avg_quality)} flex items-center justify-center gap-1`}>
                    <Star size={16} /> {sub.avg_quality || 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block mb-1">متوسط الالتزام الزمني</span>
                  <div className={`font-bold text-lg ${getScoreColor(sub.avg_timeliness)} flex items-center justify-center gap-1`}>
                    <Clock size={16} /> {sub.avg_timeliness || 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block mb-1">إجمالي قيمة الأعمال</span>
                  <div className="font-bold text-lg text-blue-600 flex items-center justify-center gap-1">
                    <DollarSign size={16} /> {sub.total_work_value.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {performanceData.length === 0 && (
            <div className="lg:col-span-2 bg-white rounded-3xl p-16 text-center border-2 border-dashed border-gray-100">
              <Users size={48} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-500 font-medium">لا توجد بيانات أداء لمقاولي الباطن بعد</p>
              <p className="text-gray-400 text-sm mt-2">تأكد من اعتماد مستخلصات مقاولي الباطن وتسجيل درجات التقييم.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SubcontractorAnalytics;