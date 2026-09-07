import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart
} from 'recharts';
import { supabase } from '../supabaseClient';
import { Loader2, TrendingUp } from 'lucide-react';

interface SCurveData {
  month: string;
  cumulative_planned: number;
  cumulative_actual: number;
  cumulative_earned: number;
}

interface Props {
  projectId: string;
}

const ProjectSCurveChart: React.FC<Props> = ({ projectId }) => {
  const [data, setData] = useState<SCurveData[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSCurveData = async () => {
      try {
        setLoading(true);
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_project_s_curve_data', {
          p_project_id: projectId
        });
        const { data: healthData, error: healthError } = await supabase.rpc('get_project_health_score', {
          p_project_id: projectId
        });

        if (rpcError) throw rpcError;
        if (healthError) throw healthError;
        setData(rpcData || []);
        setHealthScore(healthData || 0);
      } catch (err: any) {
        console.error('Error fetching S-Curve:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (projectId) fetchSCurveData();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-50 rounded-xl border border-dashed border-slate-300">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
        <p className="text-slate-500 font-medium">جاري تحليل منحنيات الأداء...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
        خطأ في تحميل البيانات: {error}
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-slate-800">تحليل منحنى S-Curve</h3>
        {healthScore !== null && (
          <div 
            className={`
              px-3 py-1 rounded-full text-xs font-black flex items-center gap-1
              ${healthScore >= 70 ? 'bg-emerald-100 text-emerald-700' : 
                healthScore >= 40 ? 'bg-amber-100 text-amber-700' : 
                'bg-red-100 text-red-700'}
            `}
          >
            صحة المشروع: {healthScore}%
          </div>
        )}
      </div>

      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="month" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 12 }}
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickFormatter={(value) => `${value.toLocaleString()}`}
            />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              formatter={(value: number) => [value.toLocaleString(), '']}
            />
            <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
            
            <Line type="monotone" dataKey="cumulative_planned" name="المخطط (PV)" stroke="#3b82f6" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="cumulative_earned" name="المكتسب (EV)" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="cumulative_actual" name="الفعلي (AC)" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-4 text-xs text-slate-400 text-center italic">توضح الرسوم البيانية التراكمية مدى الالتزام بالميزانية والجدول الزمني للمشروع</p>
    </div>
  );
};

export default ProjectSCurveChart;