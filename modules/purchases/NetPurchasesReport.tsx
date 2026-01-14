import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { BarChart2, Calendar, Filter, Loader2, Printer, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

const NetPurchasesReport = () => {
  const { currentUser } = useAccounting();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState<any[]>([]);

  const fetchReport = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setReportData([
            { id: 'd1', name: 'شركة التوريدات العالمية', totalPurchases: 150000, totalReturns: 5000, netPurchases: 145000 },
            { id: 'd2', name: 'مصنع الجودة', totalPurchases: 85000, totalReturns: 0, netPurchases: 85000 },
            { id: 'd3', name: 'مؤسسة التقنية', totalPurchases: 42000, totalReturns: 2000, netPurchases: 40000 }
        ]);
        setLoading(false);
        return;
    }

    try {
      // 1. جلب الموردين
      const { data: suppliers, error: suppError } = await supabase
        .from('suppliers')
        .select('id, name')
        .is('deleted_at', null);
      
      if (suppError) throw suppError;

      // 2. جلب فواتير المشتريات المرحلة
      const { data: invoices, error: invError } = await supabase
        .from('purchase_invoices')
        .select('supplier_id, total_amount, tax_amount')
        .eq('status', 'posted')
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate);

      if (invError) throw invError;

      // 3. جلب مرتجعات المشتريات المرحلة
      const { data: returns, error: retError } = await supabase
        .from('purchase_returns')
        .select('supplier_id, total_amount, tax_amount')
        .eq('status', 'posted')
        .gte('return_date', startDate)
        .lte('return_date', endDate);

      if (retError) throw retError;

      // 4. تجميع البيانات
      const supplierMap: Record<string, any> = {};

      // تهيئة الخريطة
      suppliers?.forEach(s => {
        supplierMap[s.id] = {
          id: s.id,
          name: s.name,
          totalPurchases: 0,
          totalReturns: 0,
          netPurchases: 0
        };
      });

      // جمع المشتريات
      invoices?.forEach(inv => {
        if (supplierMap[inv.supplier_id]) {
          supplierMap[inv.supplier_id].totalPurchases += Number(inv.total_amount);
        }
      });

      // جمع المرتجعات
      returns?.forEach(ret => {
        if (supplierMap[ret.supplier_id]) {
          supplierMap[ret.supplier_id].totalReturns += Number(ret.total_amount);
        }
      });

      // حساب الصافي وتحويله لمصفوفة
      const data = Object.values(supplierMap).map((s: any) => ({
        ...s,
        netPurchases: s.totalPurchases - s.totalReturns
      })).filter((s: any) => s.totalPurchases > 0 || s.totalReturns > 0) // استبعاد الموردين بدون حركة
      .sort((a: any, b: any) => b.netPurchases - a.netPurchases);

      setReportData(data);

    } catch (error: any) {
      console.error('Error fetching report:', error);
      alert('حدث خطأ أثناء جلب البيانات: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handleExportExcel = () => {
    const data = [
      ['تقرير صافي المشتريات للموردين'],
      ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
      [],
      ['المورد', 'إجمالي المشتريات', 'إجمالي المرتجعات', 'صافي المشتريات'],
      ...reportData.map(item => [
        item.name,
        item.totalPurchases,
        item.totalReturns,
        item.netPurchases
      ]),
      [],
      ['الإجمالي', 
       reportData.reduce((sum, i) => sum + i.totalPurchases, 0),
       reportData.reduce((sum, i) => sum + i.totalReturns, 0),
       reportData.reduce((sum, i) => sum + i.netPurchases, 0)
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Net Purchases");
    XLSX.writeFile(wb, `Net_Purchases_${startDate}_${endDate}.xlsx`);
  };

  const totals = reportData.reduce((acc, item) => ({
    purchases: acc.purchases + item.totalPurchases,
    returns: acc.returns + item.totalReturns,
    net: acc.net + item.netPurchases
  }), { purchases: 0, returns: 0, net: 0 });

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart2 className="text-blue-600" /> تقرير صافي المشتريات
          </h2>
          <p className="text-slate-500">تحليل المشتريات والمرتجعات لكل مورد خلال فترة محددة</p>
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

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 no-print">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <button onClick={fetchReport} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2">
          {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />}
          تحديث
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b border-slate-200">
            <tr>
              <th className="p-4">المورد</th>
              <th className="p-4 text-center">إجمالي المشتريات</th>
              <th className="p-4 text-center">إجمالي المرتجعات</th>
              <th className="p-4 text-center">صافي المشتريات</th>
              <th className="p-4 text-center">نسبة المرتجع</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
               <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr>
            ) : reportData.length === 0 ? (
               <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد بيانات خلال هذه الفترة.</td></tr>
            ) : (
              reportData.map((item) => {
                const returnRate = item.totalPurchases > 0 ? (item.totalReturns / item.totalPurchases) * 100 : 0;
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-800">{item.name}</td>
                    <td className="p-4 text-center font-mono text-blue-600">{item.totalPurchases.toLocaleString()}</td>
                    <td className="p-4 text-center font-mono text-red-600">{item.totalReturns.toLocaleString()}</td>
                    <td className="p-4 text-center font-mono font-bold text-emerald-600">{item.netPurchases.toLocaleString()}</td>
                    <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${returnRate > 10 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                            {returnRate.toFixed(1)}%
                        </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
            <tr>
                <td className="p-4">الإجمالي الكلي</td>
                <td className="p-4 text-center text-blue-700">{totals.purchases.toLocaleString()}</td>
                <td className="p-4 text-center text-red-700">{totals.returns.toLocaleString()}</td>
                <td className="p-4 text-center text-emerald-700 text-lg">{totals.net.toLocaleString()}</td>
                <td className="p-4 text-center">
                    {(totals.purchases > 0 ? (totals.returns / totals.purchases * 100) : 0).toFixed(1)}%
                </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default NetPurchasesReport;