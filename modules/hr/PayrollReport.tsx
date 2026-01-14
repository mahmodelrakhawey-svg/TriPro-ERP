import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { FileText, Printer, Search, Loader2, Receipt } from 'lucide-react';

const PayrollReport = () => {
  const { settings, currentUser } = useAccounting();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [payrollSummary, setPayrollSummary] = useState<any>(null);

  const fetchPayrollData = async () => {
    setLoading(true);
    try {
      // 1. جلب بيانات المسير الرئيسي للشهر والسنة المحددين
      // تعديل: استخدام select بدلاً من single للتعامل مع احتمالية وجود أكثر من سجل
      const { data: payrollsList, error: payrollError } = await supabase
        .from('payrolls')
        .select('*')
        .eq('payroll_month', selectedMonth)
        .eq('payroll_year', selectedYear);

      if (payrollError) throw payrollError;

      if (payrollsList && payrollsList.length > 0) {
        // دمج البيانات للعرض (في حال وجود دفعات متعددة لنفس الشهر)
        const summary = payrollsList.reduce((acc, curr) => ({
            ...curr,
            total_gross_salary: acc.total_gross_salary + curr.total_gross_salary,
            total_additions: acc.total_additions + curr.total_additions,
            total_deductions: acc.total_deductions + curr.total_deductions,
            total_net_salary: acc.total_net_salary + curr.total_net_salary,
        }), { total_gross_salary: 0, total_additions: 0, total_deductions: 0, total_net_salary: 0 });

        setPayrollSummary(summary);
        const payrollIds = payrollsList.map(p => p.id);
        
        // 2. جلب تفاصيل الرواتب للموظفين
        const { data: items, error: itemsError } = await supabase
          .from('payroll_items')
          .select('*, employees(full_name, position)')
          .in('payroll_id', payrollIds);

        if (itemsError) throw itemsError;
        setPayrollData(items || []);
      } else {
        setPayrollSummary(null);
        setPayrollData([]);
      }
    } catch (error: any) {
      console.error('Error fetching payroll report:', error);
      alert('حدث خطأ أثناء جلب التقرير: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, [selectedMonth, selectedYear]);

  const handlePrintSlip = (item: any) => {
    const printWindow = window.open('', '_blank', 'width=600,height=600');
    if (printWindow) {
        printWindow.document.write(`
            <html dir="rtl">
            <head>
                <title>قسيمة راتب - ${item.employees?.full_name}</title>
                <style>
                    body{font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding:40px; text-align:right;} 
                    .header{text-align:center; margin-bottom:30px; border-bottom:2px solid #eee; padding-bottom:20px;}
                    .row{display:flex;justify-content:space-between;border-bottom:1px solid #f0f0f0;padding:12px 0;}
                    .total{font-weight:bold;font-size:1.2em;background:#f9f9f9;padding:15px;margin-top:20px;border-radius:8px;}
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>${settings.companyName}</h2>
                    <h3>قسيمة راتب شهر ${selectedMonth} / ${selectedYear}</h3>
                    <p>الموظف: <strong>${item.employees?.full_name}</strong> (${item.employees?.position || '-'})</p>
                </div>
                <div class="row"><span>الراتب الأساسي:</span><span>${item.gross_salary.toLocaleString()}</span></div>
                <div class="row"><span>الإضافي والمكافآت:</span><span>${item.additions.toLocaleString()}</span></div>
                <div class="row"><span>الخصومات والجزاءات:</span><span>${item.other_deductions.toLocaleString()}</span></div>
                <div class="row"><span>خصم السلف:</span><span>${item.advances_deducted.toLocaleString()}</span></div>
                <div class="row total"><span>صافي الراتب المستحق:</span><span>${item.net_salary.toLocaleString()}</span></div>
                <div style="margin-top:50px; text-align:center; font-size:0.8em; color:#666;">تم استخراج هذه القسيمة آلياً من النظام</div>
                <script>window.onload = function() { window.print(); }</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
  };

  // حماية الصفحة من مستخدم الديمو
  if (currentUser?.role === 'demo') {
      return (
          <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <FileText size={64} className="mb-4 text-slate-300" />
              <h2 className="text-xl font-bold text-slate-700">كشف الرواتب محجوب</h2>
              <p className="text-sm mt-2">التقارير المالية الخاصة بالموظفين غير متاحة في النسخة التجريبية.</p>
          </div>
      );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="text-blue-600" /> كشف رواتب الموظفين
        </h2>
        <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700">
            <Printer size={18} /> طباعة الكشف
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-end gap-4 print:hidden">
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">عن شهر</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="w-full border rounded-lg p-2">
                  {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
              </select>
          </div>
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">سنة</label>
              <input type="number" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full border rounded-lg p-2" />
          </div>
          <div className="flex-1">
             <button onClick={fetchPayrollData} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-100 flex items-center gap-2">
                <Search size={18} /> عرض التقرير
             </button>
          </div>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-none">
        <div className="text-center mb-8 hidden print:block">
            <h1 className="text-2xl font-bold text-slate-900">{settings.companyName}</h1>
            <h2 className="text-xl text-slate-600 mt-2">كشف رواتب شهر {selectedMonth} / {selectedYear}</h2>
        </div>

        {loading ? (
            <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
        ) : payrollSummary ? (
            <>
                <table className="w-full text-right border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-y-2 border-slate-200">
                        <tr>
                            <th className="p-3 border-b">الموظف</th>
                            <th className="p-3 border-b">الراتب الأساسي</th>
                            <th className="p-3 border-b text-emerald-700">إضافي (+)</th>
                            <th className="p-3 border-b text-red-700">خصومات (-)</th>
                            <th className="p-3 border-b text-red-700">سلف (-)</th>
                            <th className="p-3 border-b">صافي الراتب</th>
                            <th className="p-3 border-b print:hidden">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {payrollData.map((item) => (
                            <tr key={item.id}>
                                <td className="p-3 font-bold">{item.employees?.full_name} <span className="text-xs font-normal text-slate-500 block">{item.employees?.position}</span></td>
                                <td className="p-3">{item.gross_salary.toLocaleString()}</td>
                                <td className="p-3 text-emerald-600">{item.additions.toLocaleString()}</td>
                                <td className="p-3 text-red-600">{item.other_deductions.toLocaleString()}</td>
                                <td className="p-3 text-red-600">{item.advances_deducted.toLocaleString()}</td>
                                <td className="p-3 font-bold text-slate-900 bg-slate-50">{item.net_salary.toLocaleString()}</td>
                                <td className="p-3 print:hidden">
                                    <button onClick={() => handlePrintSlip(item)} className="text-slate-400 hover:text-blue-600 p-1" title="طباعة قسيمة">
                                        <Receipt size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                        <tr>
                            <td className="p-3">الإجمالي</td>
                            <td className="p-3">{payrollSummary.total_gross_salary.toLocaleString()}</td>
                            <td className="p-3 text-emerald-700">{payrollSummary.total_additions.toLocaleString()}</td>
                            <td className="p-3 text-red-700" colSpan={2}>{payrollSummary.total_deductions.toLocaleString()}</td>
                            <td className="p-3 text-lg">{payrollSummary.total_net_salary.toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>
                
                <div className="mt-12 flex justify-between text-center print:flex hidden">
                    <div>
                        <p className="font-bold text-slate-600 mb-8">المحاسب</p>
                        <p>..................</p>
                    </div>
                    <div>
                        <p className="font-bold text-slate-600 mb-8">المدير المالي</p>
                        <p>..................</p>
                    </div>
                    <div>
                        <p className="font-bold text-slate-600 mb-8">المدير العام</p>
                        <p>..................</p>
                    </div>
                </div>
            </>
        ) : (
            <div className="py-12 text-center text-slate-400 border-2 border-dashed rounded-lg">
                لا توجد بيانات رواتب مسجلة لهذا الشهر
            </div>
        )}
      </div>
    </div>
  );
};

export default PayrollReport;
