import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { History, Printer, Download, Loader2, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

const CustomerAgingReport = () => {
  const { currentUser } = useAccounting();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setReportData([
            { id: 'd1', name: 'شركة الأفق للتجارة', balance: 45000, range0_30: 15000, range31_60: 10000, range61_90: 5000, range90_plus: 15000 },
            { id: 'd2', name: 'مؤسسة النور', balance: 12500, range0_30: 12500, range31_60: 0, range61_90: 0, range90_plus: 0 },
            { id: 'd3', name: 'سوبر ماركت البركة', balance: 8200, range0_30: 2000, range31_60: 6200, range61_90: 0, range90_plus: 0 }
        ]);
        setLoading(false);
        return;
    }

    try {
      // 1. جلب العملاء
      const { data: customers } = await supabase.from('customers').select('id, name').is('deleted_at', null);
      
      // 2. جلب الفواتير غير المدفوعة بالكامل
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, customer_id, invoice_number, invoice_date, total_amount, paid_amount')
        .neq('status', 'paid')
        .neq('status', 'draft');

      if (!customers || !invoices) return;

      const today = new Date();
      const agingData = customers.map(customer => {
        const customerInvoices = invoices.filter(inv => inv.customer_id === customer.id);
        let balance = 0;
        let range0_30 = 0;
        let range31_60 = 0;
        let range61_90 = 0;
        let range90_plus = 0;

        customerInvoices.forEach(inv => {
          const remaining = inv.total_amount - (inv.paid_amount || 0);
          if (remaining <= 0) return;

          balance += remaining;
          const invoiceDate = new Date(inv.invoice_date);
          const diffTime = Math.abs(today.getTime() - invoiceDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

          if (diffDays <= 30) range0_30 += remaining;
          else if (diffDays <= 60) range31_60 += remaining;
          else if (diffDays <= 90) range61_90 += remaining;
          else range90_plus += remaining;
        });

        return {
          id: customer.id,
          name: customer.name,
          balance,
          range0_30,
          range31_60,
          range61_90,
          range90_plus
        };
      }).filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance);

      setReportData(agingData);
    } catch (error) {
      console.error("Error fetching aging report:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const data = [
      ['تقرير أعمار ديون العملاء'],
      ['تاريخ التقرير:', new Date().toLocaleDateString('ar-EG')],
      [],
      ['العميل', 'إجمالي الرصيد', '0-30 يوم', '31-60 يوم', '61-90 يوم', '+90 يوم'],
      ...reportData.map(item => [
        item.name,
        item.balance,
        item.range0_30,
        item.range31_60,
        item.range61_90,
        item.range90_plus
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Aging");
    XLSX.writeFile(wb, `Customer_Aging_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-blue-600" /> أعمار ديون العملاء
          </h2>
          <p className="text-slate-500">تحليل المديونيات المستحقة حسب فترات التأخير</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b border-slate-200">
            <tr>
              <th className="p-4">العميل</th>
              <th className="p-4 text-center">إجمالي الرصيد</th>
              <th className="p-4 text-center text-emerald-600">0-30 يوم</th>
              <th className="p-4 text-center text-blue-600">31-60 يوم</th>
              <th className="p-4 text-center text-amber-600">61-90 يوم</th>
              <th className="p-4 text-center text-red-600">+90 يوم</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
               <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr>
            ) : reportData.length === 0 ? (
               <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد ديون مستحقة.</td></tr>
            ) : (
              reportData.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-800">{item.name}</td>
                  <td className="p-4 text-center font-black text-slate-900">{item.balance.toLocaleString()}</td>
                  <td className="p-4 text-center font-mono text-emerald-600 bg-emerald-50/30">{item.range0_30.toLocaleString()}</td>
                  <td className="p-4 text-center font-mono text-blue-600 bg-blue-50/30">{item.range31_60.toLocaleString()}</td>
                  <td className="p-4 text-center font-mono text-amber-600 bg-amber-50/30">{item.range61_90.toLocaleString()}</td>
                  <td className="p-4 text-center font-mono text-red-600 bg-red-50/30 font-bold">{item.range90_plus.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
            <tr>
                <td className="p-4">الإجمالي الكلي</td>
                <td className="p-4 text-center">{reportData.reduce((s, i) => s + i.balance, 0).toLocaleString()}</td>
                <td className="p-4 text-center text-emerald-700">{reportData.reduce((s, i) => s + i.range0_30, 0).toLocaleString()}</td>
                <td className="p-4 text-center text-blue-700">{reportData.reduce((s, i) => s + i.range31_60, 0).toLocaleString()}</td>
                <td className="p-4 text-center text-amber-700">{reportData.reduce((s, i) => s + i.range61_90, 0).toLocaleString()}</td>
                <td className="p-4 text-center text-red-700">{reportData.reduce((s, i) => s + i.range90_plus, 0).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default CustomerAgingReport;