import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { 
  AlertTriangle, Search, Filter, Download, RefreshCw, 
  Calendar, History, TrendingUp, Target, Box, Loader2, FileSpreadsheet 
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface MfgAlertRecord {
  id: string;
  created_at: string;
  alert_type: string;
  title: string;
  message: string;
  actual_value: number;
  threshold_value: number;
  order_number?: string;
  product_name?: string;
}

const ManufacturingAlertsLog: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<MfgAlertRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    fetchAlerts();
  }, [filterType]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('mfg_alerts_log')
        .select(`
          *,
          order:mfg_production_orders(order_number, product:products(name))
        `)
        .order('created_at', { ascending: false });

      if (filterType !== 'all') {
        query = query.eq('alert_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;

      const formatted = (data || []).map(a => ({
        ...a,
        order_number: a.order?.order_number,
        product_name: a.order?.product?.name
      }));

      setAlerts(formatted);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(alerts.map(a => ({
      'التاريخ': new Date(a.created_at).toLocaleString('ar-EG'),
      'رقم الأمر': a.order_number,
      'المنتج': a.product_name,
      'نوع التنبيه': a.title,
      'التفاصيل': a.message,
      'القيمة الفعلية': a.actual_value,
      'القيمة المعيارية': a.threshold_value,
      'نسبة التجاوز': (((a.actual_value - a.threshold_value) / a.threshold_value) * 100).toFixed(1) + '%'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mfg Alerts History");
    XLSX.writeFile(wb, `Mfg_Alerts_History_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredAlerts = alerts.filter(a => 
    a.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <History className="text-indigo-600 w-8 h-8" />
            سجل التنبيهات الصناعية التاريخي
          </h1>
          <p className="text-slate-500 mt-1">تتبع كافة تجاوزات التكاليف والكفاءة المكتشفة من رادار المصنع</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="بحث بالأمر أو المنتج..."
              className="pr-10 pl-4 py-2 bg-white border rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="bg-white border rounded-xl px-4 py-2 font-bold text-slate-600 outline-none shadow-sm"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="all">كل الأنواع</option>
            <option value="cost_overrun">تجاوز تكاليف</option>
            <option value="efficiency_drop">انخفاض كفاءة</option>
            <option value="variance_critical">انحراف خامات حرج</option>
          </select>
          <button onClick={exportToExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all">
            <FileSpreadsheet size={18} /> تصدير Excel
          </button>
          <button onClick={fetchAlerts} className="bg-white p-2 rounded-xl border hover:bg-slate-50">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-600" size={40} /></div>
        ) : filteredAlerts.length === 0 ? (
          <div className="p-20 text-center text-slate-400 italic">لا توجد تنبيهات مسجلة حالياً</div>
        ) : (
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b text-slate-500 text-xs font-black uppercase">
              <tr>
                <th className="px-6 py-4">التاريخ</th>
                <th className="px-6 py-4">أمر الإنتاج</th>
                <th className="px-6 py-4">نوع الحدث</th>
                <th className="px-6 py-4">التحليل الرقمي</th>
                <th className="px-6 py-4">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredAlerts.map(alert => (
                <tr key={alert.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      <span className="text-xs font-mono font-bold text-slate-500">{new Date(alert.created_at).toLocaleString('ar-EG')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full block w-fit mb-1">#{alert.order_number}</span>
                    <div className="font-bold text-slate-800">{alert.product_name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-red-50 rounded-lg text-red-600"><AlertTriangle size={16} /></div>
                      <div>
                        <div className="text-sm font-black text-slate-700">{alert.title}</div>
                        <div className="text-xs text-red-500 font-medium">{alert.message}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-slate-400 flex items-center gap-1"><Target size={12}/> معياري: {alert.threshold_value?.toLocaleString()}</span>
                        <span className="text-red-600 font-bold flex items-center gap-1"><TrendingUp size={12}/> فعلي: {alert.actual_value?.toLocaleString()}</span>
                      </div>
                      <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-red-500" 
                          style={{ width: `${Math.min((alert.actual_value / alert.threshold_value) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-left">
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-red-100 text-red-700 uppercase tracking-tighter">
                      تم الرصد آلياً
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ManufacturingAlertsLog;