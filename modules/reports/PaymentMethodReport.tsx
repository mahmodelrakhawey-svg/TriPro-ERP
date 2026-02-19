import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { BarChart3, Filter, Loader2, Printer, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

const PaymentMethodReport = () => {
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState<any[]>([]);

  const paymentMethods = {
    cash: 'نقدي',
    cheque: 'شيك',
    transfer: 'تحويل بنكي',
    card: 'شبكة/بطاقة',
    other: 'أخرى'
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      // 1. Fetch receipts
      const { data: receipts, error: receiptsError } = await supabase
        .from('receipt_vouchers')
        .select('payment_method, amount')
        .gte('receipt_date', startDate)
        .lte('receipt_date', endDate);
      
      if (receiptsError) throw receiptsError;

      // 2. Fetch payments
      const { data: payments, error: paymentsError } = await supabase
        .from('payment_vouchers')
        .select('payment_method, amount')
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      if (paymentsError) throw paymentsError;

      // 3. Aggregate data
      const aggregatedData: { [key: string]: { method: string, totalIn: number, totalOut: number, net: number } } = {};

      Object.keys(paymentMethods).forEach(key => {
        aggregatedData[key] = {
          method: paymentMethods[key as keyof typeof paymentMethods],
          totalIn: 0,
          totalOut: 0,
          net: 0
        };
      });

      receipts?.forEach(r => {
        const method = r.payment_method || 'other';
        if (aggregatedData[method]) {
          aggregatedData[method].totalIn += r.amount;
        }
      });

      payments?.forEach(p => {
        const method = p.payment_method || 'other';
        if (aggregatedData[method]) {
          aggregatedData[method].totalOut += p.amount;
        }
      });

      const finalData = Object.values(aggregatedData).map(d => ({
        ...d,
        net: d.totalIn - d.totalOut
      })).filter(d => d.totalIn > 0 || d.totalOut > 0);

      setReportData(finalData);

    } catch (error: any) {
      console.error('Error fetching report:', error);
      console.error('حدث خطأ أثناء جلب البيانات: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handleExportExcel = () => {
    const data = [
      ['تقرير المقبوضات والمدفوعات حسب طريقة الدفع'],
      ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
      [],
      ['طريقة الدفع', 'إجمالي المقبوضات', 'إجمالي المدفوعات', 'الصافي'],
      ...reportData.map(item => [
        item.method,
        item.totalIn,
        item.totalOut,
        item.net
      ]),
      [],
      ['الإجمالي', 
       reportData.reduce((sum, i) => sum + i.totalIn, 0),
       reportData.reduce((sum, i) => sum + i.totalOut, 0),
       reportData.reduce((sum, i) => sum + i.net, 0)
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payment Methods");
    XLSX.writeFile(wb, `Payment_Methods_Report_${startDate}_${endDate}.xlsx`);
  };

  const totals = reportData.reduce((acc, item) => ({
    in: acc.in + item.totalIn,
    out: acc.out + item.totalOut,
    net: acc.net + item.net
  }), { in: 0, out: 0, net: 0 });

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-indigo-600" /> تقرير طرق الدفع
          </h2>
          <p className="text-slate-500">تحليل المقبوضات والمدفوعات لكل طريقة دفع خلال فترة محددة</p>
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
        <button onClick={fetchReport} disabled={loading} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 font-bold flex items-center gap-2">
          {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />}
          تحديث
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b border-slate-200">
            <tr>
              <th className="p-4">طريقة الدفع</th>
              <th className="p-4 text-center">إجمالي المقبوضات</th>
              <th className="p-4 text-center">إجمالي المدفوعات</th>
              <th className="p-4 text-center">الصافي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
               <tr><td colSpan={4} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-indigo-600" /></td></tr>
            ) : reportData.length === 0 ? (
               <tr><td colSpan={4} className="p-8 text-center text-slate-400">لا توجد بيانات خلال هذه الفترة.</td></tr>
            ) : (
              reportData.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-800">{item.method}</td>
                    <td className="p-4 text-center font-mono text-emerald-600">{item.totalIn.toLocaleString()}</td>
                    <td className="p-4 text-center font-mono text-red-600">{item.totalOut.toLocaleString()}</td>
                    <td className={`p-4 text-center font-mono font-bold ${item.net >= 0 ? 'text-slate-800' : 'text-red-700'}`}>{item.net.toLocaleString()}</td>
                  </tr>
                ))
            )}
          </tbody>
          <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
            <tr>
                <td className="p-4">الإجمالي الكلي</td>
                <td className="p-4 text-center text-emerald-700">{totals.in.toLocaleString()}</td>
                <td className="p-4 text-center text-red-700">{totals.out.toLocaleString()}</td>
                <td className={`p-4 text-center text-lg ${totals.net >= 0 ? 'text-slate-900' : 'text-red-800'}`}>{totals.net.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default PaymentMethodReport;