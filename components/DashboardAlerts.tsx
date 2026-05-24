import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ArrowRight, ShieldAlert, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';

export const DashboardAlerts = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        // جلب المشاريع النشطة التي تعاني من انحراف في التكاليف (CPI < 1)
        const { data, error } = await supabase
          .from('v_project_performance_dashboard')
          .select('*')
          .lt('cpi', 0.9); // إنذار مبكر عند انخفاض الكفاءة تحت 90%

        if (error) throw error;
        setAlerts(data || []);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') console.error('Error fetching dashboard alerts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
  }, []);

  if (loading || alerts.length === 0) return null;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-500 mb-6">
      {alerts.map((alert) => (
        <div key={alert.project_id} className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between shadow-sm group hover:shadow-md transition-all">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 text-red-600 rounded-xl animate-pulse">
              <ShieldAlert size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">إنذار ميزانية</span>
                <h4 className="text-sm font-black text-red-900">{alert.project_name}</h4>
              </div>
              <p className="text-xs text-red-700 mt-1 font-medium">
                مؤشر أداء التكلفة (CPI): <span className="font-mono font-black">{alert.cpi}</span> - 
                المشروع يحقق إنجازاً بقيمة <span className="font-black">{(alert.cpi * 100).toFixed(0)}%</span> فقط مقابل كل جنيه يتم صرفه.
              </p>
            </div>
          </div>
          <Link 
            to="/construction/analytics" 
            className="flex items-center gap-2 text-xs font-black text-red-700 bg-white border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition-all shadow-sm"
          >
            عرض التحليل العميق <ArrowRight size={14} />
          </Link>
        </div>
      ))}
    </div>
  );
};