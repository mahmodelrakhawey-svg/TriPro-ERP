import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting as useOrg } from '@/context/AccountingContext';
import { useToast } from '@/context/ToastContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ComposedChart, Line } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, FileSpreadsheet, Loader2, PieChart } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ProfitabilityData {
  order_number: string;
  product_name: string;
  qty: number;
  sales_value: number;
  actual_labor: number;
  actual_material: number;
  total_actual_cost: number;
  net_profit: number;
  margin_percentage: number;
}

const ProductionProfitabilityReport = () => {
  const { organization } = useOrg();
  const { showToast } = useToast();
  const orgId = organization?.id;
  const [data, setData] = useState<ProfitabilityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!orgId) return;
      const { data: results, error } = await supabase
        .from('v_mfg_order_profitability')
        .select('*')
        .eq('organization_id', orgId);
      
      if (error) {
        showToast('خطأ في جلب بيانات الربحية', 'error');
      } else {
        setData(results || []);
      }
      setLoading(false);
    };
    fetchData();
  }, [orgId]);

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Profitability");
    XLSX.writeFile(wb, `MFG_Profitability_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></div>;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <TrendingUp className="text-emerald-600" />
            ربحية أوامر الإنتاج (Order Profitability)
          </h1>
          <p className="text-gray-500 text-sm">مقارنة التكلفة الفعلية (مواد + عمالة) مع قيمة المبيعات والربح المحقق</p>
        </div>
        <button onClick={exportToExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-shadow">
          <FileSpreadsheet size={18} /> تصدير Excel
        </button>
      </div>

      {/* الرسوم البيانية */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-sm font-bold text-gray-400 uppercase mb-6">تحليل التكلفة مقابل الإيراد</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="order_number" tick={{fontSize: 10}} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total_actual_cost" name="التكلفة الفعلية" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sales_value" name="قيمة المبيعات" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="margin_percentage" name="هامش الربح %" stroke="#ef4444" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* الجدول التفصيلي */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-gray-50 border-b">
            <tr className="text-xs text-gray-500 font-bold">
              <th className="p-4">أمر الإنتاج</th>
              <th className="p-4">المنتج</th>
              <th className="p-4 text-center">تكلفة المواد</th>
              <th className="p-4 text-center">تكلفة العمالة</th>
              <th className="p-4 text-center">إجمالي التكلفة</th>
              <th className="p-4 text-center">القيمة البيعية</th>
              <th className="p-4 text-center">صافي الربح</th>
              <th className="p-4 text-center">الهامش %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors text-sm">
                <td className="p-4 font-mono font-bold text-blue-600">{row.order_number}</td>
                <td className="p-4">{row.product_name} <span className="text-xs text-gray-400">(x{row.qty})</span></td>
                <td className="p-4 text-center">{row.actual_material.toLocaleString()}</td>
                <td className="p-4 text-center">{row.actual_labor.toLocaleString()}</td>
                <td className="p-4 text-center font-bold">{row.total_actual_cost.toLocaleString()}</td>
                <td className="p-4 text-center text-emerald-600 font-bold">{row.sales_value.toLocaleString()}</td>
                <td className={`p-4 text-center font-black ${row.net_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {row.net_profit.toLocaleString()}
                </td>
                <td className="p-4 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-black ${
                    row.margin_percentage > 20 ? 'bg-emerald-100 text-emerald-700' : 
                    row.margin_percentage > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {row.margin_percentage}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductionProfitabilityReport;