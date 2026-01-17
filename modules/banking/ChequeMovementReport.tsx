import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { FileText, Printer, Download, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

const ChequeMovementReport = () => {
  const { cheques, settings } = useAccounting();
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredCheques = useMemo(() => {
    return cheques.filter(c => {
      const date = c.due_date || c.created_at; // استخدام تاريخ الاستحقاق أو الإنشاء
      const matchDate = date >= startDate && date <= endDate;
      const matchType = typeFilter === 'all' || c.type === typeFilter;
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchDate && matchType && matchStatus;
    }).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [cheques, startDate, endDate, typeFilter, statusFilter]);

  const totals = useMemo(() => {
    return filteredCheques.reduce((acc, curr) => {
      if (curr.type === 'incoming') acc.incoming += curr.amount;
      else acc.outgoing += curr.amount;
      return acc;
    }, { incoming: 0, outgoing: 0 });
  }, [filteredCheques]);

  const handleExportExcel = () => {
    const data = filteredCheques.map(c => ({
      'رقم الشيك': c.cheque_number,
      'تاريخ الاستحقاق': c.due_date,
      'النوع': c.type === 'incoming' ? 'وارد (قبض)' : 'صادر (دفع)',
      'الطرف': c.party_name,
      'البنك': c.bank_name,
      'المبلغ': c.amount,
      'الحالة': c.status,
      'ملاحظات': c.notes || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cheques");
    XLSX.writeFile(wb, `Cheque_Movement_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
         <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-indigo-600" /> تقرير حركة الشيكات
            </h2>
            <p className="text-slate-500">متابعة الشيكات الواردة والصادرة وحالاتها</p>
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

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 print:hidden grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ (استحقاق)</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ (استحقاق)</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
          </div>
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">النوع</label>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="w-full border rounded-lg p-2">
                  <option value="all">الكل</option>
                  <option value="incoming">وارد (قبض)</option>
                  <option value="outgoing">صادر (دفع)</option>
              </select>
          </div>
          <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">الحالة</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full border rounded-lg p-2">
                  <option value="all">الكل</option>
                  <option value="received">في الحافظة (وارد)</option>
                  <option value="issued">صادر (لم يصرف)</option>
                  <option value="collected">تم التحصيل</option>
                  <option value="cashed">تم الصرف</option>
                  <option value="rejected">مرفوض/مرتجع</option>
              </select>
          </div>
      </div>

      {/* Report Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="hidden print:block">
              <ReportHeader title="تقرير حركة الشيكات" subtitle={`الفترة من ${startDate} إلى ${endDate}`} />
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100">
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                  <p className="text-xs font-bold text-indigo-600 uppercase">إجمالي الشيكات</p>
                  <p className="text-2xl font-black text-indigo-900">{filteredCheques.length}</p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600 uppercase">إجمالي الوارد</p>
                  <p className="text-2xl font-black text-emerald-900">{totals.incoming.toLocaleString()} <span className="text-sm">{settings.currency}</span></p>
              </div>
              <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                  <p className="text-xs font-bold text-red-600 uppercase">إجمالي الصادر</p>
                  <p className="text-2xl font-black text-red-900">{totals.outgoing.toLocaleString()} <span className="text-sm">{settings.currency}</span></p>
              </div>
          </div>

          <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                      <th className="p-4">رقم الشيك</th>
                      <th className="p-4">تاريخ الاستحقاق</th>
                      <th className="p-4">النوع</th>
                      <th className="p-4">الطرف (عميل/مورد)</th>
                      <th className="p-4">البنك</th>
                      <th className="p-4 text-center">المبلغ</th>
                      <th className="p-4 text-center">الحالة</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {filteredCheques.map((cheque) => (
                      <tr key={cheque.id} className="hover:bg-slate-50">
                          <td className="p-4 font-mono font-bold text-slate-700">{cheque.cheque_number}</td>
                          <td className="p-4">{cheque.due_date}</td>
                          <td className="p-4">
                              {cheque.type === 'incoming' ? 
                                <span className="flex items-center gap-1 text-emerald-600 font-bold"><ArrowDownLeft size={14}/> وارد</span> : 
                                <span className="flex items-center gap-1 text-red-600 font-bold"><ArrowUpRight size={14}/> صادر</span>
                              }
                          </td>
                          <td className="p-4 font-medium">{cheque.party_name}</td>
                          <td className="p-4 text-slate-500">{cheque.bank_name}</td>
                          <td className="p-4 text-center font-black text-slate-800">{cheque.amount.toLocaleString()}</td>
                          <td className="p-4 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  cheque.status === 'cashed' || cheque.status === 'collected' ? 'bg-emerald-100 text-emerald-700' : 
                                  cheque.status === 'rejected' ? 'bg-red-100 text-red-700' : 
                                  'bg-amber-100 text-amber-700'
                              }`}>
                                  {cheque.status === 'issued' ? 'صادر' : 
                                   cheque.status === 'received' ? 'في الحافظة' :
                                   cheque.status === 'cashed' ? 'تم الصرف' : 
                                   cheque.status === 'collected' ? 'تم التحصيل' : cheque.status}
                              </span>
                          </td>
                      </tr>
                  ))}
                  {filteredCheques.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد شيكات في هذه الفترة</td></tr>
                  )}
              </tbody>
          </table>
      </div>
    </div>
  );
};

export default ChequeMovementReport;