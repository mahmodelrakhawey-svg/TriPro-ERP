import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Utensils, Download, Calendar, Loader2, BarChart2, TrendingUp, Award, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ReportHeader from '../../components/ReportHeader';

interface ModifierStat {
  name: string;
  count: number;
  revenue: number;
}

const RestaurantSalesReport = () => {
  const { currentUser, settings } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [modifierStats, setModifierStats] = useState<ModifierStat[]>([]);

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const fetchData = async () => {
    setLoading(true);
    try {
      if (currentUser?.role === 'demo') {
        setModifierStats([
          { name: 'زيادة جبنة', count: 145, revenue: 725 },
          { name: 'حجم عائلي', count: 82, revenue: 1230 },
          { name: 'إضافة صوص', count: 210, revenue: 420 },
          { name: 'بدون بصل', count: 65, revenue: 0 },
          { name: 'درجة استواء متوسطة', count: 40, revenue: 0 },
        ]);
        return;
      }

      // جلب بنود الفواتير التي تحتوي على إضافات (تم تخزينها كـ JSON في عمود modifiers)
      const { data, error } = await supabase
        .from('invoice_items')
        .select('modifiers, invoices!inner(invoice_date, status)')
        .gte('invoices.invoice_date', startDate)
        .lte('invoices.invoice_date', endDate)
        .neq('invoices.status', 'draft')
        .not('modifiers', 'is', null);

      if (error) throw error;

      const stats: Record<string, ModifierStat> = {};

      data?.forEach((item: any) => {
        const mods = item.modifiers;
        if (Array.isArray(mods)) {
          mods.forEach((mod: any) => {
            if (!stats[mod.name]) {
              stats[mod.name] = { name: mod.name, count: 0, revenue: 0 };
            }
            stats[mod.name].count += 1;
            stats[mod.name].revenue += (Number(mod.price) || 0);
          });
        }
      });

      const sortedStats = Object.values(stats).sort((a, b) => b.count - a.count);
      setModifierStats(sortedStats);

    } catch (err: any) {
      showToast('فشل تحميل التقرير: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const exportToExcel = () => {
    const data = modifierStats.map(s => ({
      'الإضافة': s.name,
      'عدد المرات': s.count,
      'إجمالي الإيراد': s.revenue
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "إحصائيات الإضافات");
    XLSX.writeFile(wb, `Restaurant_Modifiers_Report_${startDate}.xlsx`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 no-print">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Utensils className="text-blue-600" /> تقرير مبيعات المطعم - الإضافات
          </h1>
          <p className="text-slate-500">تحليل الإضافات (Modifiers) الأكثر طلباً وتأثيرها على الإيرادات</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-sm transition-all">
            <Download size={18} /> تصدير Excel
          </button>
          <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-700 shadow-sm">
            <Calendar size={18} /> طباعة التقرير
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end no-print">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={fetchData} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-2">
          <Filter size={18} /> تحديث البيانات
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* الرسم البياني لتوزيع الإضافات */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <TrendingUp className="text-indigo-500" size={20} /> توزيع الطلب على الإضافات (أفضل 10)
          </h3>
          <div className="h-80" dir="ltr">
            {loading ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-blue-600" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modifierStats.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{fontSize: 12}} />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [value, 'عدد مرات الطلب']}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {modifierStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* قائمة الترتيب التفصيلية */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Award className="text-amber-500" size={20} /> الإضافات الأكثر طلباً
          </h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {modifierStats.map((stat, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold ${index < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                    {index + 1}
                  </span>
                  <span className="font-bold text-slate-700 text-sm">{stat.name}</span>
                </div>
                <div className="text-left">
                  <div className="text-sm font-black text-blue-600">{stat.count}</div>
                  <div className="text-[10px] text-slate-400">{stat.revenue.toLocaleString()} {settings.currency}</div>
                </div>
              </div>
            ))}
            {modifierStats.length === 0 && !loading && (
              <p className="text-center text-slate-400 py-10 text-sm">لا توجد بيانات إضافات لهذه الفترة</p>
            )}
          </div>
        </div>
      </div>

      {/* ترويسة التقرير للطباعة الرسمية */}
      <div className="hidden print:block">
        <ReportHeader title="تقرير إحصائيات إضافات المطعم" subtitle={`للفترة من ${startDate} إلى ${endDate}`} />
      </div>
    </div>
  );
};

export default RestaurantSalesReport;