import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { BarChart3, Clock, Download, Filter, Loader2, Utensils } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as XLSX from 'xlsx';

const RestaurantSalesReport = () => {
  const { settings } = useAccounting();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('quantity, unit_price, created_at, products(name)')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (error) throw error;
      setReportData(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const topSellingItems = useMemo(() => {
    const itemMap = new Map<string, { quantity: number; revenue: number }>();
    reportData.forEach(item => {
      const name = item.products.name;
      const current = itemMap.get(name) || { quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += item.quantity * item.unit_price;
      itemMap.set(name, current);
    });
    return Array.from(itemMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [reportData]);

  const peakHours = useMemo(() => {
    const hourMap = new Array(24).fill(0).map((_, i) => ({ hour: `${i}:00`, sales: 0 }));
    reportData.forEach(item => {
      const hour = new Date(item.created_at).getHours();
      hourMap[hour].sales += item.quantity * item.unit_price;
    });
    return hourMap;
  }, [reportData]);

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(topSellingItems);
    XLSX.utils.book_append_sheet(wb, ws1, "الأصناف الأكثر مبيعاً");
    const ws2 = XLSX.utils.json_to_sheet(peakHours);
    XLSX.utils.book_append_sheet(wb, ws2, "ساعات الذروة");
    XLSX.writeFile(wb, "Restaurant_Sales_Report.xlsx");
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Utensils className="text-blue-600" /> تقرير مبيعات المطعم
          </h2>
          <p className="text-slate-500">تحليل أداء الأصناف وساعات الذروة</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm">
          <Download size={16} /> تصدير Excel
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-end gap-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <button onClick={fetchData} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold h-[42px] flex items-center gap-2">
          {loading ? <Loader2 className="animate-spin" /> : <Filter />} تحديث
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <BarChart3 size={20} className="text-slate-400" /> الأصناف الأكثر مبيعاً (حسب الإيراد)
          </h3>
          <div className="h-96 w-full" dir="ltr">
            {loading ? <Loader2 className="animate-spin mx-auto mt-16" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSellingItems} layout="vertical" margin={{ right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()} ${settings.currency}`} />
                  <Legend />
                  <Bar dataKey="revenue" name="الإيراد" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Clock size={20} className="text-slate-400" /> تحليل ساعات الذروة
          </h3>
          <div className="h-96 w-full" dir="ltr">
            {loading ? <Loader2 className="animate-spin mx-auto mt-16" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakHours}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `${value.toLocaleString()} ${settings.currency}`} />
                  <Legend />
                  <Bar dataKey="sales" name="المبيعات" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RestaurantSalesReport;