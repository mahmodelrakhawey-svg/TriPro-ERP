import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Printer, Download, Ban } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

const ReturnedChequesReport = () => {
  const { cheques, settings } = useAccounting();
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const filteredCheques = useMemo(() => {
    return cheques.filter(c => {
      const date = c.due_date; 
      const matchDate = date >= startDate && date <= endDate;
      const matchStatus = c.status === 'rejected';
      return matchDate && matchStatus;
    }).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [cheques, startDate, endDate]);

  const totalAmount = useMemo(() => {
    return filteredCheques.reduce((sum, curr) => sum + curr.amount, 0);
  }, [filteredCheques]);

  const handleExportExcel = () => {
    const data = filteredCheques.map(c => ({
      'رقم الشيك': c.cheque_number,
      'تاريخ الاستحقاق': c.due_date,
      'النوع': c.type === 'incoming' ? 'وارد (قبض)' : 'صادر (دفع)',
      'الطرف': c.party_name,
      'البنك': c.bank_name,
      'المبلغ': c.amount,
      'ملاحظات': c.notes || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Returned Cheques");
    XLSX.writeFile(wb, `Returned_Cheques_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
         <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Ban className="text-red-600" /> تقرير الشيكات المرتجعة
            </h2>
            <p className="text-slate-500">قائمة الشيكات التي تم رفضها أو إرجاعها من البنك</p>
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

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 print:hidden flex items-end gap-4">
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ (استحقاق)</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ (استحقاق)</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="hidden print:block">
              <ReportHeader title="تقرير الشيكات المرتجعة" subtitle={`الفترة من ${startDate} إلى ${endDate}`} />
          </div>

          <div className="p-6 border-b border-slate-100 bg-red-50">
              <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-red-800">إجمالي الشيكات المرتجعة</p>
                  <p className="text-2xl font-black text-red-900">{totalAmount.toLocaleString()} <span className="text-sm">{settings.currency}</span></p>
              </div>
          </div>

          <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                      <th className="p-4">رقم الشيك</th>
                      <th className="p-4">تاريخ الاستحقاق</th>
                      <th className="p-4">النوع</th>
                      <th className="p-4">الطرف</th>
                      <th className="p-4">البنك</th>
                      <th className="p-4 text-center">المبلغ</th>
                      <th className="p-4">ملاحظات</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {filteredCheques.map((cheque) => (
                      <tr key={cheque.id} className="hover:bg-slate-50">
                          <td className="p-4 font-mono font-bold text-slate-700">{cheque.cheque_number}</td>
                          <td className="p-4">{cheque.due_date}</td>
                          <td className="p-4">
                              {cheque.type === 'incoming' ? 'وارد' : 'صادر'}
                          </td>
                          <td className="p-4 font-medium">{cheque.party_name}</td>
                          <td className="p-4 text-slate-500">{cheque.bank_name}</td>
                          <td className="p-4 text-center font-black text-red-600">{cheque.amount.toLocaleString()}</td>
                          <td className="p-4 text-slate-500 max-w-xs truncate">{cheque.notes}</td>
                      </tr>
                  ))}
                  {filteredCheques.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد شيكات مرتجعة في هذه الفترة</td></tr>
                  )}
              </tbody>
          </table>
      </div>
    </div>
  );
};

export default ReturnedChequesReport;