import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting as useOrg } from '@/context/AccountingContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AlertTriangle, TrendingDown, TrendingUp, Filter, FileBarChart, Download, Search } from 'lucide-react';

interface VarianceData {
  order_number: string;
  product_name: string;
  material_name: string;
  standard_quantity: number;
  actual_quantity: number;
  variance_percentage: number;
}

const BOMVarianceReport = () => {
  const { organization } = useOrg();
  const orgId = organization?.id;
  const [data, setData] = useState<VarianceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchVariance = async () => {
      if (!orgId) return;
      const { data: result, error } = await supabase
        .from('v_mfg_bom_variance')
        .select('*')
        .eq('organization_id', orgId);
      
      if (!error) setData(result || []);
      setLoading(false);
    };
    fetchVariance();
  }, [orgId]);

  // فلترة البيانات بناءً على رقم الطلب أو المنتج
  const filteredData = React.useMemo(() => {
    return data.filter(row => 
      row.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.product_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  // دالة تصدير البيانات إلى ملف Excel (CSV)
  const handleExport = () => {
    const headers = ["أمر الإنتاج", "المنتج", "المادة الخام", "الكمية المعيارية", "الكمية الفعلية", "نسبة الانحراف"];
    const csvRows = filteredData.map(row => [
      row.order_number,
      row.product_name,
      row.material_name,
      row.standard_quantity,
      row.actual_quantity,
      `${row.variance_percentage}%`
    ]);
    
    const csvContent = [headers, ...csvRows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `تقرير_انحراف_المواد_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) return <div className="p-10 text-center">جاري تحليل بيانات الانحراف...</div>;

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileBarChart className="text-blue-600" />
            تقرير تحليل انحراف المواد (BOM Variance)
          </h1>
          <p className="text-gray-500 text-sm">مقارنة الاستهلاك المعياري مع الواقع الفعلي للإنتاج</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute right-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="بحث برقم الأمر أو المنتج..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
            />
          </div>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm font-bold text-sm"
          >
            <Download size={18} />
            تصدير
          </button>
        </div>
      </div>

      {/* الرسم البياني لتحليل الهدر */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-sm font-bold text-gray-400 uppercase mb-4 tracking-wider">نسبة الانحراف حسب المادة (%)</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis type="number" unit="%" />
              <YAxis dataKey="material_name" type="category" width={100} tick={{fontSize: 12}} />
              <Tooltip cursor={{fill: '#f8fafc'}} />
              <ReferenceLine x={0} stroke="#000" />
              <Bar dataKey="variance_percentage" name="نسبة الانحراف" radius={[0, 4, 4, 0]}>
                {filteredData.map((entry, index) => (
                  <rect key={`cell-${index}`} fill={entry.variance_percentage > 5 ? '#ef4444' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* جدول البيانات التفصيلي */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 text-sm font-bold text-gray-600">أمر الإنتاج</th>
              <th className="p-4 text-sm font-bold text-gray-600">المادة الخام</th>
              <th className="p-4 text-sm font-bold text-gray-600 text-center">المعياري</th>
              <th className="p-4 text-sm font-bold text-gray-600 text-center">الفعلي</th>
              <th className="p-4 text-sm font-bold text-gray-600 text-center">الانحراف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredData.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 font-mono text-xs">{row.order_number}</td>
                <td className="p-4 font-medium">{row.material_name}</td>
                <td className="p-4 text-center text-gray-500">{row.standard_quantity}</td>
                <td className="p-4 text-center font-bold text-gray-700">{row.actual_quantity}</td>
                <td className="p-4 text-center">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                    row.variance_percentage > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                  }`}>
                    {row.variance_percentage > 0 ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
                    {Math.abs(row.variance_percentage)}%
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

export default BOMVarianceReport;