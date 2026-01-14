import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { BarChart2, TrendingUp, AlertTriangle, CheckCircle, Loader2, Filter, Download, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';

const ProductionCostAnalysis = () => {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. جلب أوامر التشغيل المكتملة
      // ملاحظة: نفترض وجود جدول work_orders وجدول work_order_costs كما تم إنشاؤه في manufacturing_upgrade.sql
      // إذا لم يتم تفعيل تلك الجداول بعد، سيعود التقرير فارغاً أو بخطأ، لذا يجب التأكد من تشغيل ملف SQL الخاص بالتصنيع.
      
      const { data: workOrders, error } = await supabase
        .from('work_orders')
        .select(`
            id, order_number, quantity, start_date, end_date, status,
            product:products(id, name, bom:bill_of_materials!product_id(raw_material_id, quantity_required))
        `)
        .eq('status', 'completed') // فقط الأوامر المكتملة
        .gte('end_date', startDate)
        .lte('end_date', endDate);

      if (error) {
          console.warn("Work orders table might not exist yet or query error:", error);
          setReportData([]); // Fallback to empty if table doesn't exist
          setLoading(false);
          return;
      }

      if (!workOrders || workOrders.length === 0) {
          setReportData([]);
          setLoading(false);
          return;
      }

      const analysisData = await Promise.all(workOrders.map(async (order: any) => {
          // أ. حساب التكلفة المعيارية (Standard Cost)
          // = (كمية المواد في BOM * سعر الشراء الحالي للمادة) * كمية الأمر
          let standardMaterialCost = 0;
          if (order.product?.bom) {
              for (const bomItem of order.product.bom) {
                  const { data: rawMaterial } = await supabase
                      .from('products')
                      .select('purchase_price, cost')
                      .eq('id', bomItem.raw_material_id)
                      .single();
                  
                  const price = rawMaterial?.cost || rawMaterial?.purchase_price || 0;
                  standardMaterialCost += (bomItem.quantity_required * price);
              }
          }
          const totalStandardCost = standardMaterialCost * order.quantity;

          // ب. حساب التكلفة الفعلية (Actual Cost)
          // 1. تكلفة المواد المنصرفة فعلياً (من حركات المخزون المرتبطة بأمر التشغيل - إن وجدت)
          // للتبسيط حالياً، سنفترض أن المواد صرفت حسب المعياري، ولكن سنضيف التكاليف الإضافية المسجلة
          
          // 2. التكاليف الإضافية المسجلة (عمالة، كهرباء، إلخ)
          const { data: additionalCosts } = await supabase
              .from('work_order_costs')
              .select('amount')
              .eq('work_order_id', order.id);
          
          const totalAdditionalCost = additionalCosts?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
          
          // التكلفة الفعلية = تكلفة المواد (المعيارية مؤقتاً) + التكاليف الإضافية الفعلية
          // في نظام متقدم، يجب جلب كميات الصرف الفعلية من stock_movements
          const totalActualCost = totalStandardCost + totalAdditionalCost;

          const variance = totalActualCost - totalStandardCost;
          const variancePercent = totalStandardCost > 0 ? (variance / totalStandardCost) * 100 : 0;

          return {
              id: order.id,
              orderNumber: order.order_number,
              productName: order.product?.name,
              quantity: order.quantity,
              date: order.end_date,
              standardCost: totalStandardCost,
              actualCost: totalActualCost,
              variance: variance,
              variancePercent: variancePercent,
              status: Math.abs(variancePercent) < 1 ? 'match' : (variance > 0 ? 'over' : 'under')
          };
      }));

      setReportData(analysisData);

    } catch (error) {
      console.error('Error fetching production analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const data = [
      ['تقرير تحليل تكاليف الإنتاج'],
      ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
      [],
      ['رقم الأمر', 'المنتج', 'الكمية', 'التكلفة المعيارية', 'التكلفة الفعلية', 'الانحراف', 'نسبة الانحراف'],
      ...reportData.map(item => [
        item.orderNumber,
        item.productName,
        item.quantity,
        item.standardCost,
        item.actualCost,
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
              <th className="p-4 text-center">الانحراف</th>
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