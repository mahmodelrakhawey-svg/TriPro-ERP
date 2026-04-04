import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { BarChart2, TrendingUp, CheckCircle, Loader2, Filter, Download, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';

const ProductionCostAnalysis = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    if (startDate > endDate) {
        showToast('تاريخ البداية يجب أن يكون قبل تاريخ النهاية', 'warning');
        return;
    }
    setLoading(true);
    try {
       const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (!userOrgId) return;     

      // استدعاء الدالة البرمجية الجديدة للحصول على تحليل جاهز
      const { data, error } = await supabase.rpc('get_manufacturing_analysis', {
          p_org_id: userOrgId,
          p_start_date: startDate,
          p_end_date: endDate
      });

      if (error) {
          console.error("Error in manufacturing analysis RPC:", error);
          throw error;
      }

      // تحويل البيانات من snake_case (SQL) إلى camelCase (JS)
      const analysisData = data.map((item: any) => ({
          id: item.id,
          orderNumber: item.order_number,
          productName: item.product_name,
          quantity: item.quantity,
          date: item.end_date,
          standardCost: Number(item.standard_cost),
          actualCost: Number(item.actual_cost),
          materialVariance: Number(item.material_variance),
          wastageQty: Number(item.wastage_qty),
          variance: Number(item.variance),
          variancePercent: Number(item.variance_percent),
          status: Math.abs(item.variance_percent) < 1 ? 'match' : (item.variance > 0 ? 'over' : 'under')
      }));

      setReportData(analysisData);

    } catch (error) {
      console.error('Error fetching production analysis:', error);
      showToast('حدث خطأ أثناء جلب البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const data = [
      ['تقرير تحليل تكاليف الإنتاج'],
      ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
      [],
      ['رقم الأمر', 'المنتج', 'الكمية', 'التكلفة المعيارية', 'التكلفة الفعلية', 'انحراف المواد (الهالك)', 'إجمالي الانحراف', 'نسبة الانحراف'],
      ...reportData.map(item => [
        item.orderNumber,
        item.productName,
        item.quantity,
        item.standardCost,
        item.actualCost,
        item.materialVariance,
        item.variance,
        `${item.variancePercent.toFixed(2)}%`
      ])
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cost Analysis");
    XLSX.writeFile(wb, "ProductionCostAnalysis.xlsx");
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <BarChart2 className="text-purple-600" /> تحليل تكاليف الإنتاج
            </h2>
            <p className="text-slate-500">مقارنة التكلفة المعيارية بالتكلفة الفعلية وتحديد الانحرافات</p>
        </div>
        <div className="flex gap-2">
            <button onClick={exportToExcel} disabled={reportData.length === 0} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm disabled:opacity-50">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 no-print">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <button onClick={fetchData} disabled={loading} className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 font-bold flex items-center gap-2">
          {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />}
          تحديث التقرير
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-700 font-bold text-sm">
                <tr>
              <th className="p-4">رقم الأمر</th>
              <th className="p-4">المنتج (الكمية)</th>
              <th className="p-4 text-center">التكلفة المعيارية</th>
              <th className="p-4 text-center">التكلفة الفعلية</th>
              <th className="p-4 text-center">انحراف المواد (الهالك)</th>
              <th className="p-4 text-center">إجمالي الانحراف</th>
              <th className="p-4 text-center">الحالة</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-orange-600" /></td></tr>
                ) : reportData.length > 0 ? (
                    reportData.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                            <td className="p-4 font-mono text-slate-600">{item.orderNumber || '-'}</td>
                            <td className="p-4 font-bold text-slate-800">{item.productName} <span className="text-xs text-slate-400">({item.quantity})</span></td>
                            <td className="p-4 text-center font-mono text-blue-600">{item.standardCost.toLocaleString()}</td>
                            <td className="p-4 text-center font-mono text-purple-600">{item.actualCost.toLocaleString()}</td>
                            <td className={`p-4 text-center font-mono ${item.materialVariance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                              {item.materialVariance > 0 ? '+' : ''}{item.materialVariance.toLocaleString()} 
                              {item.wastageQty > 0 && <span className="text-[10px] block text-slate-400">(هالك: {item.wastageQty})</span>}
                            </td>
                            <td className={`p-4 text-center font-mono font-bold ${item.variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {item.variance > 0 ? '+' : ''}{item.variance.toLocaleString()}
                            </td>
                            <td className="p-4 text-center">
                  {item.status === 'over' && <span className="flex items-center justify-center gap-1 text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded-full"><TrendingUp size={14} /> تجاوز</span>}
                  {item.status === 'under' && <span className="flex items-center justify-center gap-1 text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded-full"><TrendingUp size={14} className="rotate-180" /> توفير</span>}
                  {item.status === 'match' && <span className="flex items-center justify-center gap-1 text-slate-500 text-xs font-bold bg-slate-100 px-2 py-1 rounded-full"><CheckCircle size={14} /> مطابق</span>}
                            </td>
                        </tr>
                    ))
                ) : (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد أوامر إنتاج مكتملة في هذه الفترة.</td></tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductionCostAnalysis;