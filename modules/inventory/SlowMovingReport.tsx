import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { PackageX, Download, Printer, Loader2, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

type SlowProduct = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  cost: number;
  salesInPeriod: number;
};

const SlowMovingReport = () => {
  const { currentUser } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<SlowProduct[]>([]);
  // افتراضياً نفحص آخر 90 يوم
  const [startDate, setStartDate] = useState(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [threshold, setThreshold] = useState(0); // عرض الأصناف التي مبيعاتها <= هذا الرقم

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, threshold]);

  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setReportData([
            { id: 'ds1', name: 'شاشة قديمة', sku: 'OLD-SCR-01', stock: 5, cost: 500, salesInPeriod: 0 },
            { id: 'ds2', name: 'كيبورد ميكانيكي', sku: 'MECH-KBD-02', stock: 12, cost: 300, salesInPeriod: 1 },
        ]);
        setLoading(false);
        return;
    }

    try {
      // 1. جلب جميع الأصناف التي لها رصيد بالمخزون
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, sku, stock, purchase_price')
        .gt('stock', 0); // نهتم فقط بما هو موجود بالمخزون

      if (prodError) throw prodError;

      // 2. جلب المبيعات خلال الفترة المحددة
      const { data: sales, error: salesError } = await supabase
        .from('invoice_items')
        .select('product_id, quantity, invoices!inner(invoice_date)')
        .gte('invoices.invoice_date', startDate)
        .lte('invoices.invoice_date', endDate);

      if (salesError) throw salesError;

      // 3. تجميع المبيعات لكل صنف
      const salesMap: Record<string, number> = {};
      sales?.forEach((item: any) => {
          salesMap[item.product_id] = (salesMap[item.product_id] || 0) + item.quantity;
      });

      // 4. تصفية الأصناف الراكدة
      const slowMoving: SlowProduct[] = [];
      
      products?.forEach((p: any) => {
          const qtySold = salesMap[p.id] || 0;
          // إذا كانت الكمية المباعة أقل من أو تساوي الحد المسموح به
          if (qtySold <= threshold) {
              slowMoving.push({
                  id: p.id,
                  name: p.name,
                  sku: p.sku || '-',
                  stock: p.stock,
                  cost: p.purchase_price,
                  salesInPeriod: qtySold
              });
          }
      });

      // ترتيب حسب الرصيد (الأكثر تكدساً أولاً)
      setReportData(slowMoving.sort((a, b) => b.stock - a.stock));

    } catch (error: any) {
      console.error('Error fetching slow moving items:', error);
      showToast('حدث خطأ أثناء جلب البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const data = reportData.map(p => ({
        'اسم الصنف': p.name,
        'الكود (SKU)': p.sku,
        'الرصيد الحالي': p.stock,
        'سعر التكلفة': p.cost,
        'إجمالي قيمة المخزون الراكد': p.stock * p.cost,
        'المبيعات خلال الفترة': p.salesInPeriod
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Slow Moving Items");
    XLSX.writeFile(wb, `Slow_Moving_Items_${startDate}_to_${endDate}.xlsx`);
  };

  const totalStagnantValue = reportData.reduce((sum, p) => sum + (p.stock * p.cost), 0);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <PackageX className="text-red-600" /> تقرير الأصناف الراكدة
            </h2>
            <p className="text-slate-500">الأصناف المتوفرة بالمخزون ذات حركة مبيعات ضعيفة أو معدومة</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={reportData.length === 0} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm disabled:opacity-50">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-red-500"
                />
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-red-500"
                />
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">حد الركود (الكمية المباعة &le;)</label>
                <input 
                    type="number" 
                    min="0"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-red-500"
                />
            </div>
        </div>
        <div className="mt-4 flex justify-end">
            <button 
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 bg-red-600 text-white px-8 py-2.5 rounded-lg hover:bg-red-700 font-bold shadow-md disabled:opacity-50 transition-all"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />}
                تحديث التقرير
            </button>
        </div>
      </div>

      {/* ترويسة الطباعة */}
      <div className="hidden print:block text-center mb-8 border-b-2 border-slate-800 pb-4">
          <h1 className="text-3xl font-bold mb-2">تقرير الأصناف الراكدة</h1>
          <p className="text-sm text-slate-500 mt-2">عن الفترة من {startDate} إلى {endDate} (مبيعات &le; {threshold})</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                    <th className="p-4 w-16 text-center">#</th>
                    <th className="p-4">اسم الصنف</th>
                    <th className="p-4">الكود (SKU)</th>
                    <th className="p-4 text-center">الرصيد الحالي</th>
                    <th className="p-4 text-center">المبيعات (في الفترة)</th>
                    <th className="p-4 text-center">قيمة المخزون الراكد</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {reportData.map((product, index) => (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-center font-bold text-slate-400">{index + 1}</td>
                        <td className="p-4 font-bold text-slate-800">{product.name}</td>
                        <td className="p-4 font-mono text-slate-500">{product.sku}</td>
                        <td className="p-4 text-center font-bold text-blue-600 bg-blue-50/30">
                            {product.stock.toLocaleString()}
                        </td>
                        <td className="p-4 text-center font-bold text-slate-600">
                            {product.salesInPeriod}
                        </td>
                        <td className="p-4 text-center font-black text-red-600 bg-red-50/30">
                            {(product.stock * product.cost).toLocaleString()}
                        </td>
                    </tr>
                ))}

                {reportData.length === 0 && !loading && (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد أصناف راكدة حسب المعايير المختارة</td></tr>
                )}
            </tbody>
            <tfoot className="bg-slate-50 font-bold text-lg border-t border-slate-200">
                <tr>
                    <td colSpan={5} className="p-4 text-left text-slate-600">إجمالي قيمة المخزون الراكد:</td>
                    <td className="p-4 text-center text-red-700 font-black text-xl">{totalStagnantValue.toLocaleString()}</td>
                </tr>
            </tfoot>
        </table>
      </div>
    </div>
  );
};

export default SlowMovingReport;
