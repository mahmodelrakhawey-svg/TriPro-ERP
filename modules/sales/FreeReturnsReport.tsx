import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { FileText, Printer, Loader2, Download, Filter, AlertCircle, Search, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const FreeReturnsReport = () => {
  const { currentUser, warehouses } = useAccounting();
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let selectStr = '*, customers(name), warehouses(name), invoices(invoice_number)';
      if (customerSearch.trim()) {
          selectStr = '*, customers!inner(name), warehouses(name), invoices(invoice_number)';
      }

      let query = supabase
        .from('sales_returns')
        .select(selectStr)
        .gte('return_date', startDate)
        .lte('return_date', endDate)
        .neq('status', 'draft');

      if (customerSearch.trim()) {
        query = query.ilike('customers.name', `%${customerSearch.trim()}%`);
      }

      if (!showAll) {
        query = query.is('original_invoice_id', null);
      }

      if (selectedWarehouseId) {
        query = query.eq('warehouse_id', selectedWarehouseId);
      }

      const { data, error } = await query.order('return_date', { ascending: false });

      if (error) throw error;
      setReturns(data || []);
    } catch (error: any) {
      console.error('Error fetching free returns:', error);
      alert('حدث خطأ أثناء جلب البيانات: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, selectedWarehouseId, showAll]);

  const handleExportExcel = () => {
    const title = showAll ? 'تقرير شامل للمرتجعات (الحرة والمرتبطة)' : 'تقرير المرتجعات الحرة (بدون فاتورة أصلية)';
    const data = [
      [title],
      ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
      [],
      ['رقم المرتجع', 'التاريخ', 'العميل', 'المستودع', 'رقم الفاتورة الأصلية', 'الإجمالي', 'الضريبة', 'الملاحظات'],
      ...returns.map(r => [
        r.return_number,
        r.return_date,
        r.customers?.name || 'عميل غير معروف',
        r.warehouses?.name || '-',
        r.invoices?.invoice_number || '-',
        r.total_amount,
        r.tax_amount,
        r.notes
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Free Returns");
    XLSX.writeFile(wb, `Free_Returns_${startDate}.xlsx`);
  };

  const handleExportPDF = async () => {
    const element = document.getElementById('report-content');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Free_Returns_${startDate}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('حدث خطأ أثناء تصدير PDF');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-red-600" /> تقرير المرتجعات الحرة
          </h2>
          <p className="text-slate-500 text-sm">عرض مرتجعات المبيعات التي تمت بدون الربط بفاتورة أصلية</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
            <Printer size={18} /> طباعة
          </button>
          <button onClick={handleExportPDF} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
            <FileDown size={18} /> تصدير PDF
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
            <Download size={18} /> تصدير Excel
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
        <div className="w-full md:w-auto">
          <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div className="w-full md:w-auto">
          <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div className="w-full md:w-auto min-w-[200px]">
          <label className="block text-sm font-bold text-slate-700 mb-1">بحث عن عميل</label>
          <div className="relative">
            <input 
                type="text" 
                value={customerSearch} 
                onChange={e => setCustomerSearch(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && fetchReport()}
                placeholder="اسم العميل..."
                className="w-full border rounded-lg p-2 pl-8" 
            />
            <Search className="absolute left-2.5 top-2.5 text-slate-400" size={16} />
          </div>
        </div>
        <div className="w-full md:w-auto min-w-[200px]">
          <label className="block text-sm font-bold text-slate-700 mb-1">المستودع</label>
          <select value={selectedWarehouseId} onChange={e => setSelectedWarehouseId(e.target.value)} className="w-full border rounded-lg p-2">
            <option value="">كل المستودعات</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="flex items-center h-[42px] bg-slate-50 px-3 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
            <input 
                type="checkbox" 
                id="showAll" 
                checked={showAll} 
                onChange={e => setShowAll(e.target.checked)} 
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300 cursor-pointer"
            />
            <label htmlFor="showAll" className="mr-2 text-sm font-bold text-slate-700 cursor-pointer select-none">عرض الكل</label>
        </div>
        <button onClick={fetchReport} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold h-[42px] flex items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Filter size={18} />}
            عرض
        </button>
      </div>

      <div id="report-content" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <ReportHeader title={showAll ? "تقرير شامل للمرتجعات" : "تقرير المرتجعات الحرة"} subtitle={`الفترة من ${startDate} إلى ${endDate}`} />
        
        {loading ? (
            <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
        ) : returns.length === 0 ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
                <AlertCircle size={32} className="text-slate-300" />
                لا توجد مرتجعات حرة في هذه الفترة
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                            <th className="p-3">رقم المرتجع</th>
                            <th className="p-3">التاريخ</th>
                            <th className="p-3">العميل</th>
                            <th className="p-3">المستودع</th>
                            <th className="p-3">رقم الفاتورة الأصلية</th>
                            <th className="p-3 text-center">الإجمالي</th>
                            <th className="p-3 text-center">الضريبة</th>
                            <th className="p-3">ملاحظات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {returns.map((ret, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-3 font-mono font-bold text-blue-600">{ret.return_number}</td>
                                <td className="p-3 whitespace-nowrap">{ret.return_date}</td>
                                <td className="p-3 font-bold">{ret.customers?.name || 'عميل غير معروف'}</td>
                                <td className="p-3 text-slate-500">{ret.warehouses?.name}</td>
                                <td className="p-3 font-mono text-slate-600">{ret.invoices?.invoice_number || '-'}</td>
                                <td className="p-3 text-center font-bold text-slate-800">{ret.total_amount.toLocaleString()}</td>
                                <td className="p-3 text-center text-slate-500">{ret.tax_amount.toLocaleString()}</td>
                                <td className="p-3 text-slate-500 text-xs max-w-xs truncate" title={ret.notes}>{ret.notes || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                        <tr>
                            <td colSpan={5} className="p-3 text-left">الإجمالي:</td>
                            <td className="p-3 text-center text-slate-900 text-lg">
                                {returns.reduce((sum, r) => sum + r.total_amount, 0).toLocaleString()}
                            </td>
                            <td colSpan={2}></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        )}
      </div>
    </div>
  );
};

export default FreeReturnsReport;